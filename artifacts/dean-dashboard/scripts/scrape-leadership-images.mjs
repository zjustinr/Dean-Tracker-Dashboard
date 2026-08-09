// Fetch each university's leadership-directory page(s) from a leads file,
// extract <img> tags, fuzzy-match alt text / nearby names against the
// dataset's still-missing subdean (vice/associate/assistant/interim dean)
// records for that university, and emit {dean, university, imageUrl,
// pageUrl} rows ready for prep-photo-urls.mjs + download-photos.mjs.
//
//   node scripts/scrape-leadership-images.mjs <leads.json> <out.json> [--limit N]
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "data");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const [leadsFile, outFile, ...rest] = process.argv.slice(2);
if (!leadsFile || !outFile) { console.error("usage: scrape-leadership-images.mjs <leads.json> <out.json> [--limit N]"); process.exit(1); }
const limitIdx = rest.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(rest[limitIdx + 1], 10) : Infinity;

const norm = (s) => (s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
const lastName = (full) => { const parts = norm(full).split(" ").filter(Boolean); return parts[parts.length - 1] || ""; };
const firstName = (full) => { const parts = norm(full).split(" ").filter(Boolean); return parts[0] || ""; };

// Load missing subdean records grouped by university.
const photos = JSON.parse(readFileSync(join(SRC, "dean-photos.json"), "utf8"));
const key = (d, u) => `${d.trim().toLowerCase()}|${u.trim().toLowerCase()}`;
const files = readdirSync(SRC).filter((f) => /deans.*\.json$/.test(f) && !/schools/.test(f) && f !== "dean-photos.json");
const missingByUni = {};
for (const f of files) {
  const arr = JSON.parse(readFileSync(join(SRC, f), "utf8"));
  if (!Array.isArray(arr)) continue;
  for (const r of arr) {
    if (r.roleType !== "subdean" || !r.dean || !r.university) continue;
    if (photos[key(r.dean, r.university)]) continue;
    (missingByUni[r.university] ||= []).push(r.dean);
  }
}

const leads = JSON.parse(readFileSync(leadsFile, "utf8"));

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
    imgs.push({ src: abs, alt });
  }
  return imgs;
}

function matchDean(alt, candidates) {
  const altNorm = norm(alt);
  if (!altNorm) return null;
  for (const c of candidates) {
    const ln = lastName(c), fn = firstName(c);
    if (ln.length >= 3 && altNorm.includes(ln) && (altNorm.includes(fn) || fn.length < 3)) return c;
  }
  return null;
}

const results = [];
const report = { fetched: 0, fetchFailed: [], matched: 0, universities: 0 };
let n = 0;
for (const lead of leads) {
  if (n >= limit) break;
  const candidates = missingByUni[lead.university];
  if (!candidates || !candidates.length) continue;
  n++;
  report.universities++;
  const claimed = new Set();
  for (const pageUrl of lead.leadUrls || []) {
    let html;
    try {
      const r = await fetch(pageUrl, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
      report.fetched++;
      if (!r.ok) { report.fetchFailed.push(`${pageUrl}: HTTP ${r.status}`); continue; }
      html = await r.text();
    } catch (e) { report.fetchFailed.push(`${pageUrl}: ${e.message}`); continue; }
    const imgs = extractImgs(html, pageUrl);
    for (const img of imgs) {
      if (/\.(svg)(\?|$)/i.test(img.src)) continue;
      const dean = matchDean(img.alt, candidates.filter((c) => !claimed.has(c)));
      if (!dean) continue;
      claimed.add(dean);
      results.push({ dean, university: lead.university, imageUrl: img.src, pageUrl });
      report.matched++;
    }
  }
}

writeFileSync(outFile, JSON.stringify(results, null, 2));
console.log(`universities processed: ${report.universities}, pages fetched: ${report.fetched}, matched: ${report.matched}`);
if (report.fetchFailed.length) console.log(`fetch failures (${report.fetchFailed.length}):\n` + report.fetchFailed.map((s) => "  " + s).join("\n"));
console.log(`-> ${outFile}`);
