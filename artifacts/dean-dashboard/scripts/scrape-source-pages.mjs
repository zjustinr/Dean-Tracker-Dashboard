// Every dean/subdean record in src/data already carries a `sourceUrl` (the
// page ETL researchers cited when the record was built) — often the
// person's own faculty/bio page. Rather than guessing a leadership-office
// URL and fuzzy-matching against it, fetch each STILL-MISSING record's own
// sourceUrl directly and look for their headshot there. Many sourceUrls are
// shared department directory/contact pages, so we dedupe by URL first.
//
//   node scripts/scrape-source-pages.mjs <out.json> [--limit N] [--offset N]
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "data");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const [outFile, ...rest] = process.argv.slice(2);
if (!outFile) { console.error("usage: scrape-source-pages.mjs <out.json> [--limit N] [--offset N]"); process.exit(1); }
const limitIdx = rest.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(rest[limitIdx + 1], 10) : Infinity;
const offsetIdx = rest.indexOf("--offset");
const offset = offsetIdx >= 0 ? parseInt(rest[offsetIdx + 1], 10) : 0;

const norm = (s) => (s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
const lastName = (full) => { const parts = norm(full).split(" ").filter(Boolean); return parts[parts.length - 1] || ""; };
const firstName = (full) => { const parts = norm(full).split(" ").filter(Boolean); return parts[0] || ""; };

const photos = JSON.parse(readFileSync(join(SRC, "dean-photos.json"), "utf8"));
const key = (d, u) => `${d.trim().toLowerCase()}|${u.trim().toLowerCase()}`;
const files = readdirSync(SRC).filter((f) => /deans.*\.json$/.test(f) && !/schools/.test(f) && f !== "dean-photos.json");
const missing = [];
for (const f of files) {
  const arr = JSON.parse(readFileSync(join(SRC, f), "utf8"));
  if (!Array.isArray(arr)) continue;
  for (const r of arr) {
    if (r.roleType !== "subdean" || !r.dean || !r.university || !r.sourceUrl) continue;
    if (!/^https?:\/\//.test(r.sourceUrl)) continue;
    if (photos[key(r.dean, r.university)]) continue;
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

function filenameText(src) {
  try {
    const p = new URL(src).pathname;
    const base = p.split("/").pop() || "";
    return base.replace(/\.(jpe?g|png|webp|gif|avif)$/i, "").replace(/-\d{2,4}x\d{2,4}$/i, "").replace(/[-_]+/g, " ");
  } catch { return ""; }
}

function extractImgs(html, pageUrl) {
  const imgs = [];
  const re = /<img\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const alt = /\balt\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] || "";
    if (!src) continue;
    let abs;
    try { abs = new URL(src, pageUrl).href; } catch { continue; }
    if (/\.(svg)(\?|$)/i.test(abs)) continue;
    const context = html.slice(m.index, Math.min(html.length, m.index + 500)).replace(/<[^>]+>/g, " ");
    imgs.push({ src: abs, alt, filename: filenameText(abs), context, index: m.index });
  }
  return imgs;
}

function matchByName(img, candidates) {
  const sources = [norm(img.alt), norm(img.filename), norm(img.context)];
  for (const c of candidates) {
    const ln = lastName(c.dean), fn = firstName(c.dean);
    if (ln.length < 3) continue;
    for (const s of sources) {
      if (!s) continue;
      if (s.includes(ln) && (s.includes(fn) || fn.length < 3)) return c;
    }
  }
  return null;
}

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
