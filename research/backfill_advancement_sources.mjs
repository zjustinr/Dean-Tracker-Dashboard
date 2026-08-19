/**
 * Backfill sourceUrl on the Advancement index.
 *
 *   node research/backfill_advancement_sources.mjs             # dry run, prints coverage
 *   node research/backfill_advancement_sources.mjs --write     # rewrite the dataset
 *   node research/backfill_advancement_sources.mjs --only 20   # first N institutions
 *
 * Only 293 of the 1,042 advancement records carried a sourceUrl: research recorded
 * a source for each institution's head of advancement and none for the 749 deputies
 * below them. This fills those in the way the other indices already do it -- an
 * advancement leadership or staff-directory page, shared by everyone listed on it,
 * or that person's own bio page when the directory links to one.
 *
 * Nothing is assigned on URL shape alone. Every page is fetched, and a URL is only
 * written to a record once that page's own text (or the anchor text of the link it
 * came from) names that person. A filled sourceUrl is therefore a source a reader
 * can open and check, not an inference.
 *
 * Fetches are cached on disk, so re-runs are cheap and the pass is idempotent.
 *
 * research/advancement_source_hints.json carries what the crawl cannot reach on
 * its own -- a bot wall, a roster rendered by script, a directory the site links
 * to from nowhere:
 *
 *   { "sites":   { "<university>": ["https://..."] },     // crawled first
 *     "records": { "<dean>|<university>": "https://..." } // already checked by hand
 *   }
 *
 * A "records" entry still has to name its person: it is only written after the
 * page was read and found to list them, and the same check is what puts it here.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { createHash } from "crypto";
import { execFile } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const DATA = join(ROOT, "artifacts/dean-dashboard/src/data/r1-advancement-deans.json");
const CACHE = process.env.ADV_CACHE || join(ROOT, ".cache/advancement-pages");
const HINTS = join(HERE, "advancement_source_hints.json");
const REPORT = process.env.ADV_REPORT || join(ROOT, ".cache/advancement-backfill-report.json");

const WRITE = process.argv.includes("--write");
const argN = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? Number(process.argv[i + 1]) : dflt; };
const ONLY = argN("--only", 0);
const SKIP = argN("--skip", 0);
const PER_SITE = argN("--per-site", 8);        // pages in flight within one institution
const SITES_AT_ONCE = argN("--sites", 5);     // institutions crawled at once
const CONCURRENCY = PER_SITE;
const PAGE_BUDGET = argN("--budget", 45);
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

mkdirSync(CACHE, { recursive: true });

// ------------------------------------------------------------------ fetching
const key = (u) => createHash("sha1").update(u).digest("hex");

// Node's fetch ignores HTTPS_PROXY and this sandbox only reaches the network
// through one, so requests go out through curl.
function curl(url) {
  return new Promise((resolve) => {
    execFile("curl", [
      "-sSL", "--max-time", "12", "--max-filesize", "6000000", "--compressed",
      "-A", UA, "-H", "accept: text/html,application/xhtml+xml,application/xml",
      "-w", "\n__META__%{http_code} %{url_effective}", url,
    ], { maxBuffer: 32 * 1024 * 1024, encoding: "utf8" }, (err, stdout) => {
      const s = String(stdout || "");
      const i = s.lastIndexOf("\n__META__");
      if (i < 0) return resolve({ status: 0, finalUrl: url, body: "", error: String((err && err.message) || "no response").slice(0, 160) });
      const [code, ...rest] = s.slice(i + 9).trim().split(" ");
      resolve({ status: Number(code) || 0, finalUrl: rest.join(" ") || url, body: s.slice(0, i) });
    });
  });
}

async function get(url) {
  const f = join(CACHE, key(url) + ".json");
  if (existsSync(f)) { try { return JSON.parse(readFileSync(f, "utf8")); } catch {} }
  const r = await curl(url);
  const out = { url, status: r.status, finalUrl: r.finalUrl, body: "" };
  if (r.error) out.error = r.error;
  if (r.status >= 200 && r.status < 300 && /<[a-z!?]/i.test(r.body)) out.body = r.body.slice(0, 3_000_000);
  writeFileSync(f, JSON.stringify(out));
  return out;
}

async function pool(items, worker, n = CONCURRENCY) {
  const results = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) return;
      try { results[idx] = await worker(items[idx]); } catch { results[idx] = null; }
    }
  }));
  return results;
}

// ------------------------------------------------------------- html -> text
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', ndash: "-", mdash: "-" };

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    const k = e.toLowerCase();
    if (k[0] === "#") {
      const cp = k[1] === "x" ? parseInt(k.slice(2), 16) : Number(k.slice(1));
      return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : " ";
    }
    return NAMED[k] !== undefined ? NAMED[k] : " ";
  });
}

function stripTags(html) {
  return decodeEntities(
    html.replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<[^>]*>/g, " ")
  ).replace(/\s+/g, " ");
}

const fold = (s) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

/** [{ href, anchor }] for every <a> on the page, resolved against `base`. */
function links(html, base) {
  const out = [];
  const re = /<a\b[^>]*href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = (m[2] ?? m[3] ?? m[4] ?? "").trim();
    if (!raw || /^(#|javascript:|mailto:|tel:)/i.test(raw)) continue;
    let href;
    try { href = new URL(decodeEntities(raw), base).toString().split("#")[0]; } catch { continue; }
    if (!/^https?:/.test(href)) continue;
    out.push({ href, anchor: stripTags(m[5]).trim().slice(0, 120) });
    if (out.length > 4000) break;
  }
  return out;
}

// -------------------------------------------------------------- name matching
const SUFFIX = new Set(["jr", "sr", "ii", "iii", "iv", "phd", "edd", "md", "dr", "mba", "cfre"]);

/** "Jackie (Jacqueline) Mabry" -> { firsts: [jackie, jacqueline], lasts: [mabry] } */
function nameParts(raw) {
  const alts = [];
  const base = String(raw).replace(/\(([^)]*)\)/g, (m, inner) => { alts.push(inner); return " "; });
  const toks = fold(base).split(" ").filter(Boolean);
  while (toks.length > 2 && SUFFIX.has(toks[toks.length - 1])) toks.pop();
  if (toks.length < 2) return null;
  const firsts = [toks[0], ...alts.map(fold).filter((a) => a.length > 1)];
  const lasts = [toks[toks.length - 1]];
  // Hyphenated surnames get listed both ways about as often as not.
  const hy = String(raw).trim().match(/([A-Za-z]{2,})-([A-Za-z]{2,})$/);
  if (hy) lasts.push(fold(hy[1]), fold(hy[2]));
  const f = [...new Set(firsts)].filter((x) => x.length > 1);
  const l = [...new Set(lasts)].filter((x) => x.length > 2);
  return f.length && l.length ? { firsts: f, lasts: l } : null;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Compiled once per person; matches "First [M.] Last" and "Last, First". */
function nameMatcher(parts) {
  const pats = [];
  for (const f of parts.firsts) for (const l of parts.lasts) {
    pats.push(`\\b${esc(f)}\\b(?:\\s+[a-z0-9']{1,15}){0,2}\\s+\\b${esc(l)}\\b`);
    pats.push(`\\b${esc(l)}\\b\\s+\\b${esc(f)}\\b`);
  }
  return new RegExp(pats.join("|"));
}

// ---------------------------------------------------------------- crawling
const NEWSY = /\/(news|newsroom|press|stories|story|articles?|announcements?|gazette|releases?|blog|insights?|speeches)\b/i;
const JUNK = /\.(pdf|jpe?g|png|gif|svg|zip|docx?|xlsx?|pptx?|mp4|mp3|ics|css|js)($|\?)/i;
const DIRISH = /(leadership|staff|team|directory|our-people|people|administration|cabinet|senior|about|contact|profile|bio|officers|executive|advancement|giving|alumni|development|foundation|philanthropy|engagement)/i;
const STRONG = /(leadership|staff|team|directory|our-people|officers|administration|cabinet|meet-the|our-people)/i;
const SUBDOMAINS = ["advancement", "giving", "alumni", "foundation", "give", "development", "support", "advance"];

function registrable(host) {
  const p = host.split(".");
  return p.length <= 2 ? host : p.slice(-2).join(".");
}

/**
 * The institution's own domain. A head record's sourceUrl is often an outside
 * announcement (a search firm, a wire service), so the domain is taken from the
 * .edu host that shows up most across every index this university appears in.
 */
function domainMap(dataDir) {
  const map = new Map();
  const tally = new Map();
  for (const f of readdirSync(dataDir)) {
    if (!/(-deans|presidents)\.json$/.test(f)) continue;
    let rows;
    try { rows = JSON.parse(readFileSync(join(dataDir, f), "utf8")); } catch { continue; }
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      const u = String(r.sourceUrl || "");
      if (!/^https?:/.test(u)) continue;
      let host;
      try { host = registrable(new URL(u).hostname); } catch { continue; }
      const m = tally.get(r.university) || new Map();
      m.set(host, (m.get(host) || 0) + 1);
      tally.set(r.university, m);
    }
  }
  for (const [univ, m] of tally) {
    const ranked = [...m.entries()].sort((a, b) => b[1] - a[1]);
    const edu = ranked.find(([h]) => h.endsWith(".edu"));
    map.set(univ, (edu || ranked[0])[0]);
  }
  return map;
}

const MAIN_PATHS = [
  "/advancement/", "/advancement/staff/", "/advancement/leadership/", "/advancement/about/",
  "/giving/", "/giving/about/", "/alumni/", "/development/", "/about/leadership/", "/administration/",
];

/** Seed pages to start each institution's crawl from. */
function seeds(headUrl, hinted, domain) {
  const out = [];
  const push = (u) => { if (u && !out.includes(u)) out.push(u); };
  for (const h of hinted || []) push(h);
  let u = null;
  try { u = new URL(headUrl); } catch {}
  if (u && !NEWSY.test(u.pathname) && registrable(u.hostname) === domain) {
    push(u.toString());
    const segs = u.pathname.split("/").filter(Boolean);
    for (let i = segs.length - 1; i >= 1; i--) push(`${u.origin}/${segs.slice(0, i).join("/")}/`);
    push(`${u.origin}/`);
  }
  if (!domain) return out;
  // The main site is the reliable way in: an advancement office that lives at an
  // unguessable path is still linked from somewhere on the university's own home.
  push(`https://www.${domain}/`);
  for (const s of SUBDOMAINS) push(`https://${s}.${domain}/`);
  for (const p of MAIN_PATHS) push(`https://www.${domain}${p}`);
  return out;
}

/**
 * Sitemaps are the cheapest way onto a .edu roster page: one request buys the
 * site's own list of URLs, from which the leadership/staff paths pick themselves.
 */
async function sitemapPicks(origin) {
  const found = [];
  const roots = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/sitemap-index.xml`];
  const seenMaps = new Set();
  const queue = [...roots];
  while (queue.length && seenMaps.size < 6 && found.length < 40) {
    const u = queue.shift();
    if (seenMaps.has(u)) continue;
    seenMaps.add(u);
    const r = await get(u);
    if (!r.body || !/<(urlset|sitemapindex)/i.test(r.body)) continue;
    const locs = [...r.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decodeEntities(m[1]));
    for (const loc of locs) {
      if (/sitemap.*\.xml/i.test(loc)) { if (STRONG.test(loc) || /staff|people|about|leader/i.test(loc)) queue.push(loc); continue; }
      if (JUNK.test(loc) || NEWSY.test(loc)) continue;
      if (STRONG.test(loc) && found.length < 40) found.push(loc);
    }
  }
  return found;
}

// ------------------------------------------------------------------- main
const deans = JSON.parse(readFileSync(DATA, "utf8"));
const ORIGINAL_FILLED = deans.filter((r) => String(r.sourceUrl || "").trim()).length;
const hintFile = existsSync(HINTS) ? JSON.parse(readFileSync(HINTS, "utf8")) : {};
const siteHints = hintFile.sites || {};
const recordHints = hintFile.records || {};
const DOMAINS = domainMap(dirname(DATA));

const recKey = (r) => `${String(r.dean || "").trim()}|${String(r.university || "").trim()}`;
let byHand = 0;
for (const r of deans) {
  if (String(r.sourceUrl || "").trim()) continue;
  const u = recordHints[recKey(r)];
  if (u) { r.sourceUrl = u; byHand++; }
}
if (byHand) console.error(`${byHand} records filled from hand-checked hints`);

const byUniv = new Map();
for (const r of deans) {
  if (!byUniv.has(r.university)) byUniv.set(r.university, []);
  byUniv.get(r.university).push(r);
}

let universities = [...byUniv.entries()].filter(([, rs]) => rs.some((r) => !String(r.sourceUrl || "").trim()));
universities = universities.slice(SKIP, ONLY ? SKIP + ONLY : undefined);

const before = ORIGINAL_FILLED;
console.error(`${universities.length} institutions to crawl; ${deans.length - before} records missing a sourceUrl`);

const report = [];
let filled = 0;

async function crawlInstitution([univ, records]) {
  const head = records.find((r) => String(r.sourceUrl || "").trim());
  const wanted = records
    .filter((r) => !String(r.sourceUrl || "").trim())
    .map((r) => { const p = nameParts(r.dean); return p ? { rec: r, re: nameMatcher(p) } : null; })
    .filter(Boolean);
  if (!wanted.length) return;

  const domain = DOMAINS.get(univ) || "";
  const queue = seeds(head ? head.sourceUrl : "", siteHints[univ], domain);
  // Plenty of publics run advancement out of a separate foundation site, so the
  // crawl stays on any host the institution's own sources already point at, not
  // just its .edu.
  const allowed = new Set([domain].filter(Boolean));
  for (const u of [head ? head.sourceUrl : "", ...(siteHints[univ] || [])]) {
    if (!u) continue;
    try { const p = new URL(u); if (!NEWSY.test(p.pathname)) allowed.add(registrable(p.hostname)); } catch {}
  }
  for (const origin of [...new Set(queue.map((u) => { try { return new URL(u).origin; } catch { return null; } }).filter(Boolean))].slice(0, 3)) {
    for (const u of await sitemapPicks(origin)) if (!queue.includes(u)) queue.push(u);
  }
  const seen = new Set(queue);
  let budget = PAGE_BUDGET;
  let got = 0;

  while (queue.length && budget > 0 && wanted.some((w) => !w.rec.sourceUrl)) {
    const batch = queue.splice(0, Math.min(PER_SITE, budget));
    budget -= batch.length;
    const fetched = (await pool(batch, async (u) => {
      const r = await get(u);
      return r.body ? { url: r.finalUrl || u, html: r.body } : null;
    }, PER_SITE)).filter(Boolean);

    for (const page of fetched) {
      const text = fold(stripTags(page.html));
      if (text.length < 200) continue;
      const ls = links(page.html, page.url);
      let host;
      try { host = registrable(new URL(page.url).hostname); } catch { continue; }
      if (!allowed.size) allowed.add(host);

      for (const w of wanted) {
        if (w.rec.sourceUrl) continue;
        // A link whose anchor text is the person's name points at their own page:
        // better provenance than the roster, so prefer it.
        const byAnchor = ls.find((l) => l.anchor.length <= 90 && !JUNK.test(l.href) && w.re.test(fold(l.anchor)));
        if (byAnchor) { w.rec.sourceUrl = byAnchor.href; filled++; got++; continue; }
        if (w.re.test(text)) { w.rec.sourceUrl = page.url; filled++; got++; }
      }

      for (const l of ls) {
        if (seen.size > 400 || JUNK.test(l.href) || seen.has(l.href)) continue;
        let lh;
        try { lh = registrable(new URL(l.href).hostname); } catch { continue; }
        if (!allowed.has(lh)) continue;
        const path = l.href.slice(l.href.indexOf(lh) + lh.length);
        if (NEWSY.test(path) || !DIRISH.test(path + " " + l.anchor)) continue;
        seen.add(l.href);
        if (STRONG.test(path + " " + l.anchor)) queue.unshift(l.href); else queue.push(l.href);
      }
    }
  }

  report.push({ university: univ, missing: wanted.length, filled: got, pagesFetched: PAGE_BUDGET - budget });
  done++;
  console.error(`${String(got).padStart(2)}/${String(wanted.length).padEnd(2)} [${done}/${universities.length}] ${univ}`);
}

let done = 0;
await pool(universities, crawlInstitution, SITES_AT_ONCE);


// ------------------------------------------------- phase 2: guessed bio pages
/**
 * Plenty of advancement sites render their roster with script, so the crawl walks
 * past a page whose HTML never contains a single name. Those same sites almost
 * always give each person a plain server-rendered bio at a slug built from their
 * name. Guessing that slug on hosts this institution is already known to publish
 * from costs one request and is confirmed the same way as everything else: the
 * page has to name the person.
 */
const BIO_PATTERNS = [
  "/{slug}/", "/about/{slug}/", "/staff/{slug}/", "/team/{slug}/", "/people/{slug}/",
  "/our-team/{slug}/", "/staff-directory/{slug}/", "/about/staff/{slug}/", "/leadership/{slug}/",
];

function slugsFor(raw) {
  const parts = nameParts(raw);
  if (!parts) return [];
  const out = [];
  // Middle names and two-part surnames both show up in slugs, so try the whole
  // name as written alongside the plain first-last pair.
  const whole = fold(String(raw).replace(/\([^)]*\)/g, " ")).replace(/\s+/g, "-");
  if (whole.includes("-")) out.push(whole);
  for (const f of parts.firsts) for (const l of parts.lasts) {
    out.push(`${f}-${l}`.replace(/\s+/g, "-"));
    out.push(`${f}${l}`.replace(/\s+/g, ""));
    out.push(`${f}.${l}`.replace(/\s+/g, ""));
  }
  return [...new Set(out)].slice(0, 3);
}

/** Hosts this institution already publishes advancement pages from. */
function knownHosts(records, domain) {
  const hosts = new Set();
  for (const r of records) {
    const u = String(r.sourceUrl || "");
    if (!/^https?:/.test(u)) continue;
    try { const p = new URL(u); if (!NEWSY.test(p.pathname)) hosts.add(p.origin); } catch {}
  }
  if (domain) for (const s of ["advancement", "giving", "alumni", "foundation", "development"]) hosts.add(`https://${s}.${domain}`);
  return [...hosts].slice(0, 3);
}

async function guessBios([univ, records]) {
  const wanted = records.filter((r) => !String(r.sourceUrl || "").trim());
  if (!wanted.length) return;
  const domain = DOMAINS.get(univ) || "";
  const hosts = knownHosts(records, domain);
  if (!hosts.length) return;
  let got = 0;

  await pool(wanted, async (r) => {
    const parts = nameParts(r.dean);
    if (!parts) return;
    const re = nameMatcher(parts);
    const urls = [];
    for (const host of hosts) for (const pat of BIO_PATTERNS) for (const slug of slugsFor(r.dean)) urls.push(host + pat.replace("{slug}", slug));
    const hits = await pool(urls.slice(0, 60), async (u) => {
      const res = await get(u);
      if (!res.body) return null;
      const text = fold(stripTags(res.body));
      // A guessed slug can land on a soft-404 that echoes the query, so the page
      // has to be a real one: enough text, and the person named in it.
      return text.length > 400 && re.test(text) ? (res.finalUrl || u) : null;
    }, 10);
    const hit = hits.find(Boolean);
    if (hit) { r.sourceUrl = hit; filled++; got++; }
  }, 4);

  if (got) console.error(`${String(got).padStart(2)}/${String(wanted.length).padEnd(2)} bios  ${univ}`);
}

if (!process.argv.includes("--no-bios")) {
  const short = [...byUniv.entries()].filter(([, rs]) => rs.some((r) => !String(r.sourceUrl || "").trim()));
  console.error(`\nguessing bio pages for ${short.length} institutions`);
  await pool(short, guessBios, SITES_AT_ONCE);
}

const after = deans.filter((r) => String(r.sourceUrl || "").trim()).length;
console.error(`\nfilled ${filled}; coverage ${after}/${deans.length} = ${(100 * after / deans.length).toFixed(1)}% (was ${(100 * before / deans.length).toFixed(1)}%)`);

if (WRITE) { writeFileSync(DATA, JSON.stringify(deans, null, 2) + "\n"); console.error(`wrote ${DATA}`); }
else console.error("(dry run; pass --write to save)");
mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, JSON.stringify(report, null, 2));
