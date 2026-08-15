// Download dean headshots from researched image URLs, validate them, save to
// public/deans/<slug>.<ext>, and update src/data/dean-photos.json. Shares its
// fetch/validate/archive-on-change logic with the scraper scripts and the
// news-scout auto-fetch hook via photo-lib.mjs.
//
//   node scripts/download-photos.mjs <urls1.json> [urls2.json ...]
// Each input file is an array of {dean, university, slug, imageUrl, pageUrl}.
// Skips entries with empty imageUrl; validates real image bytes + min size;
// leaves a report of successes and failures.
import { readFileSync, existsSync } from "node:fs";
import { loadPhotos, savePhotos, downloadAndRecordPhoto } from "./photo-lib.mjs";

const inputs = process.argv.slice(2);
if (!inputs.length) { console.error("usage: download-photos.mjs <urls.json> ..."); process.exit(1); }

const rows = [];
for (const f of inputs) { if (existsSync(f)) rows.push(...JSON.parse(readFileSync(f, "utf8"))); }
const seen = new Set();
const targets = rows.filter((r) => r.imageUrl && r.slug && !seen.has(r.slug) && seen.add(r.slug));
console.log(`${rows.length} rows, ${targets.length} with an image URL to fetch`);

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const DELAY_MS = parseInt(process.env.DOWNLOAD_DELAY_MS || "300", 10);

const photos = loadPhotos();
let added = 0, updated = 0, unchanged = 0; const fails = [];
for (const t of targets) {
  await sleep(DELAY_MS);
  const status = await downloadAndRecordPhoto({ dean: t.dean, university: t.university, imageUrl: t.imageUrl, pageUrl: t.pageUrl, photos });
  if (status === "added") added++;
  else if (status === "updated") updated++;
  else if (status === "unchanged") unchanged++;
  else fails.push(`${t.slug}: ${status.replace(/^fail:/, "")}`);
}

savePhotos(photos);
console.log(`\nAdded ${added}, updated ${updated} (old photo archived), unchanged ${unchanged}, of ${targets.length}. dean-photos.json now ${Object.keys(photos).length} entries.`);
if (fails.length) { console.log(`\nFailures (${fails.length}):`); fails.forEach((f) => console.log("  " + f)); }
