// Fetch each university's leadership-directory page(s) from a leads file,
// extract <img> tags, fuzzy-match alt text / nearby names against the
// dataset's still-missing subdean (vice/associate/assistant/interim dean)
// records for that university, and emit {dean, university, imageUrl,
// pageUrl} rows ready for prep-photo-urls.mjs + download-photos.mjs.
//
//   node scripts/scrape-leadership-images.mjs <leads.json> <out.json> [--limit N]
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SRC, PHOTOS_PATH, UA, photoKey, extractImgs, matchByName, curlFetchText } from "./photo-lib.mjs";

const [leadsFile, outFile, ...rest] = process.argv.slice(2);
if (!leadsFile || !outFile) { console.error("usage: scrape-leadership-images.mjs <leads.json> <out.json> [--limit N]"); process.exit(1); }
const limitIdx = rest.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(rest[limitIdx + 1], 10) : Infinity;

// Load missing subdean records grouped by university.
const photos = JSON.parse(readFileSync(PHOTOS_PATH, "utf8"));
const files = readdirSync(SRC).filter((f) => /deans.*\.json$/.test(f) && !/schools/.test(f) && f !== "dean-photos.json");
const missingByUni = {};
for (const f of files) {
  const arr = JSON.parse(readFileSync(join(SRC, f), "utf8"));
  if (!Array.isArray(arr)) continue;
  for (const r of arr) {
    if (r.roleType !== "subdean" || !r.dean || !r.university) continue;
    if (photos[photoKey(r.dean, r.university)]) continue;
    (missingByUni[r.university] ||= []).push(r.dean);
  }
}

const leads = JSON.parse(readFileSync(leadsFile, "utf8"));

// matchByName from photo-lib expects {dean, university, ...} candidates;
// here candidates are bare dean-name strings, so wrap them.
function matchDean(img, candidateNames) {
  const cand = matchByName(img, candidateNames.map((dean) => ({ dean })));
  return cand ? cand.dean : null;
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const DELAY_MS = parseInt(process.env.SCRAPE_DELAY_MS || "600", 10);

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
    if (report.fetched > 0) await sleep(DELAY_MS);
    let html;
    try {
      const r = await fetch(pageUrl, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
      report.fetched++;
      if (!r.ok) {
        try { html = curlFetchText(pageUrl); } catch { report.fetchFailed.push(`${pageUrl}: HTTP ${r.status}`); continue; }
      } else {
        html = await r.text();
      }
    } catch (e) {
      try { html = curlFetchText(pageUrl); } catch { report.fetchFailed.push(`${pageUrl}: ${e.message}`); continue; }
    }
    const imgs = extractImgs(html, pageUrl);
    for (const img of imgs) {
      const dean = matchDean(img, candidates.filter((c) => !claimed.has(c)));
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
