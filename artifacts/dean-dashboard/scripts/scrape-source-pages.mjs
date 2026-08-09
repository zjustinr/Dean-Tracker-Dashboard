// Every dean/subdean record in src/data already carries a `sourceUrl` (the
// page ETL researchers cited when the record was built) — often the
// person's own faculty/bio page. Rather than guessing a leadership-office
// URL and fuzzy-matching against it, fetch each STILL-MISSING record's own
// sourceUrl directly and look for their headshot there. Many sourceUrls are
// shared department directory/contact pages, so we dedupe by URL first.
// Covers both primary deans and subdeans (vice/associate/assistant/interim)
// — any role is eligible once it has a sourceUrl and no photo yet.
//
//   node scripts/scrape-source-pages.mjs <out.json> [--limit N] [--offset N]
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SRC, PHOTOS_PATH, UA, photoKey, extractImgs, matchByName } from "./photo-lib.mjs";

const [outFile, ...rest] = process.argv.slice(2);
if (!outFile) { console.error("usage: scrape-source-pages.mjs <out.json> [--limit N] [--offset N]"); process.exit(1); }
const limitIdx = rest.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(rest[limitIdx + 1], 10) : Infinity;
const offsetIdx = rest.indexOf("--offset");
const offset = offsetIdx >= 0 ? parseInt(rest[offsetIdx + 1], 10) : 0;

const photos = JSON.parse(readFileSync(PHOTOS_PATH, "utf8"));
const files = readdirSync(SRC).filter((f) => /deans.*\.json$/.test(f) && !/schools/.test(f) && f !== "dean-photos.json");
const missing = [];
for (const f of files) {
  const arr = JSON.parse(readFileSync(join(SRC, f), "utf8"));
  if (!Array.isArray(arr)) continue;
  for (const r of arr) {
    if ((r.roleType !== "subdean" && r.roleType !== "dean") || !r.dean || !r.university || !r.sourceUrl) continue;
    if (!/^https?:\/\//.test(r.sourceUrl)) continue;
    if (photos[photoKey(r.dean, r.university)]) continue;
    missing.push({ dean: r.dean, university: r.university, sourceUrl: r.sourceUrl });
  }
}

const byUrl = new Map();
for (const r of missing) {
  if (!byUrl.has(r.sourceUrl)) byUrl.set(r.sourceUrl, []);
  byUrl.get(r.sourceUrl).push(r);
}
let urls = [...byUrl.keys()];
urls = urls.slice(offset, offset + limit);

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const DELAY_MS = parseInt(process.env.SCRAPE_DELAY_MS || "500", 10);

const results = [];
const report = { fetched: 0, fetchFailed: [], matchedByName: 0, pagesProcessed: 0 };
for (const url of urls) {
  const candidates = byUrl.get(url);
  if (report.pagesProcessed > 0) await sleep(DELAY_MS);
  report.pagesProcessed++;
  let html;
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
    report.fetched++;
    if (!r.ok) { report.fetchFailed.push(`${url}: HTTP ${r.status}`); continue; }
    html = await r.text();
  } catch (e) { report.fetchFailed.push(`${url}: ${e.message}`); continue; }

  const imgs = extractImgs(html, url);
  const claimed = new Set();
  for (const img of imgs) {
    const cand = matchByName(img, candidates.filter((c) => !claimed.has(c)));
    if (!cand) continue;
    claimed.add(cand);
    results.push({ dean: cand.dean, university: cand.university, imageUrl: img.src, pageUrl: url });
    report.matchedByName++;
  }
  // NOTE: a "single candidate + single content image" fallback was tried
  // and dropped — on a sample it mostly grabbed department logos/crests
  // (e.g. a "Block S" athletics logo, a footer graphic), not headshots.
  // Name-based matching only, to keep precision high.
}

writeFileSync(outFile, JSON.stringify(results, null, 2));
console.log(`pages: ${report.pagesProcessed}, fetched ok: ${report.fetched}, matched by name: ${report.matchedByName}`);
if (report.fetchFailed.length) console.log(`fetch failures (${report.fetchFailed.length}):\n` + report.fetchFailed.slice(0, 30).map((s) => "  " + s).join("\n"));
console.log(`-> ${outFile}`);
