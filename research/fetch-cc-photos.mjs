/**
 * Portraits for the sitting leaders of the 200 largest community colleges.
 *
 *   node research/fetch-cc-photos.mjs [--limit N] [--all] [--concurrency N]
 *
 * WHY THIS DOUBLES AS NAME VERIFICATION
 * -------------------------------------
 * The leader names in the universe files come from the IPEDS directory's
 * `chief_admin_name`, which lags and is wrong at some colleges (Broward's is
 * recorded as a Chief Data Officer). They ship as `leaderNameUnverified` for
 * exactly that reason.
 *
 * `matchByName` only accepts an image whose alt text, filename or surrounding
 * markup carries that person's first AND last name. So a hit is not just a
 * portrait -- it is the college's own site saying this person holds this seat.
 * A miss is not evidence the name is wrong (plenty of sites use background-image
 * CSS, or a JS-rendered card), which is why the manifest records the reason
 * rather than a verdict.
 *
 * Photos land in the normal place -- public/deans/ plus dean-photos.json, keyed
 * "<name lower>|<university lower>" -- so they are already in position when the
 * index is registered. Extra keys are inert to the app until then.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  UA, extractImgs, matchByName, loadPhotos, savePhotos, photoKey, downloadAndRecordPhoto,
} from "../artifacts/dean-dashboard/scripts/photo-lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(`--${n}`);

const CONCURRENCY = Number(arg("concurrency", 8));
const LIMIT = Number(arg("limit", 0));

// Leadership-page paths to try when the homepage yields no usable link. Ordered
// by how often they hit; community colleges are far more uniform here than
// universities are, but "Chancellor" appears wherever the college is a district.
const PATHS = [
  "/president", "/about/president", "/office-of-the-president", "/about/office-of-the-president",
  "/chancellor", "/about/chancellor", "/leadership", "/about/leadership",
  "/administration", "/about/administration", "/about-us/leadership", "/about/presidents-office",
];
const LINK_RE = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi;
const LEAD_RE = /\b(president|chancellor|leadership|administration)\b/i;
const SKIP_RE = /\b(search|news|calendar|scholarship|award|student government|club|login)\b/i;

const get = async (url, ms = 15000) => {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(ms),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return { html: await r.text(), url: r.url };
};

/** Candidate leadership pages for a college, best first. */
async function leadershipPages(home) {
  const out = [];
  try {
    const { html, url } = await get(home);
    let m;
    while ((m = LINK_RE.exec(html))) {
      const [, href, text] = m;
      const label = text.replace(/<[^>]+>/g, " ");
      if (!LEAD_RE.test(label) && !LEAD_RE.test(href)) continue;
      if (SKIP_RE.test(label)) continue;
      try { out.push(new URL(href, url).href); } catch { /* malformed href */ }
    }
    // Prefer a link that names the office over a generic "about" landing page.
    out.sort((a, b) => (/president|chancellor/i.test(b) ? 1 : 0) - (/president|chancellor/i.test(a) ? 1 : 0));
    for (const p of PATHS) { try { out.push(new URL(p, url).href); } catch { /* bad base */ } }
  } catch {
    for (const p of PATHS) { try { out.push(new URL(p, home).href); } catch { /* bad base */ } }
  }
  return [...new Set(out)].slice(0, 6);
}

async function photoFor(college, photos) {
  const dean = college.leaderNameUnverified;
  const university = college.name;
  if (!dean) return { status: "skip", reason: "no-leader-name" };
  if (photos[photoKey(dean, university)]) return { status: "unchanged", reason: "already-have" };

  let home = (college.website || "").trim();
  if (!home) return { status: "fail", reason: "no-website" };
  if (!/^https?:\/\//i.test(home)) home = `https://${home}`;

  const pages = await leadershipPages(home);
  if (!pages.length) return { status: "fail", reason: "no-candidate-pages" };

  for (const page of pages) {
    let html;
    try { ({ html } = await get(page)); } catch { continue; }
    const img = extractImgs(html, page).find((i) => matchByName(i, [{ dean, university }]));
    if (!img) continue;
    const res = await downloadAndRecordPhoto({ dean, university, imageUrl: img.src, pageUrl: page, photos });
    if (String(res).startsWith("fail")) return { status: "fail", reason: res, pageUrl: page, imageUrl: img.src };
    return { status: "ok", reason: res, pageUrl: page, imageUrl: img.src, nameConfirmedOnSite: true };
  }
  return { status: "fail", reason: "no-name-match", triedPages: pages.length };
}

const file = has("all") ? "universe_communitycollege_all.json" : "universe_communitycollege.json";
const universe = JSON.parse(readFileSync(join(HERE, "universe", file), "utf8"));
let colleges = universe.institutions;
if (LIMIT) colleges = colleges.slice(0, LIMIT);

const photos = loadPhotos();
const manifest = [];
let done = 0;

// Fixed-size worker pool: colleges are independent, and a shared cursor keeps
// slow sites from stalling a whole batch the way chunked Promise.all does.
let cursor = 0;
async function worker() {
  while (cursor < colleges.length) {
    const c = colleges[cursor++];
    let r;
    try { r = await photoFor(c, photos); }
    catch (e) { r = { status: "fail", reason: `threw:${e.message}` }; }
    manifest.push({ rank: c.rank, university: c.name, state: c.state, dean: c.leaderNameUnverified, ...r });
    if (++done % 20 === 0) console.error(`  ${done}/${colleges.length}`);
  }
}
console.error(`fetching portraits for ${colleges.length} colleges (concurrency ${CONCURRENCY})...`);
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

savePhotos(photos);
manifest.sort((a, b) => a.rank - b.rank);
writeFileSync(
  join(HERE, "universe", "cc-photo-manifest.json"),
  JSON.stringify({
    generated: universe.generated,
    note:
      "One row per college. status ok = a portrait was downloaded AND the college's own " +
      "site carries that leader's name next to it, which also confirms the IPEDS name. " +
      "A miss is not evidence the name is wrong -- many sites use CSS background images " +
      "or render leadership cards in JS, neither of which this pass can read.",
    counts: manifest.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {}),
    colleges: manifest,
  }, null, 1) + "\n"
);

const counts = manifest.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
console.error(`\n${JSON.stringify(counts)}`);
const reasons = manifest.filter((r) => r.status === "fail").reduce((a, r) => ((a[r.reason] = (a[r.reason] || 0) + 1), a), {});
console.error(`fail reasons: ${JSON.stringify(reasons)}`);
