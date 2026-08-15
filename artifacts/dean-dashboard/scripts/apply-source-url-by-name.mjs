// Apply {dean, university, discipline, sourceUrl} research results into a
// deans dataset file, for records that have no stable `id` field (several
// bulk-added subdean datasets lack one). Matches on the exact composite key
// dean|university|discipline, never overwrites an existing sourceUrl, and
// preserves the file's existing compact-vs-pretty JSON formatting.
//
//   node scripts/apply-source-url-by-name.mjs <deans-file> <results.json> [--dry-run]
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "data");
const DRY = process.argv.includes("--dry-run");
const [deansFile, resultsFile] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!deansFile || !resultsFile) { console.error("usage: apply-source-url-by-name.mjs <deans-file> <results.json> [--dry-run]"); process.exit(1); }

function writeDeansJson(path, rawBefore, arr) {
  const m = /^\[\r?\n( *)/.exec(rawBefore);
  const indent = m ? m[1].length : 0;
  writeFileSync(path, indent ? JSON.stringify(arr, null, indent) : JSON.stringify(arr));
}

const key = (d, u, disc) => `${(d || "").trim().toLowerCase()}|${(u || "").trim().toLowerCase()}|${(disc || "").trim().toLowerCase()}`;

const path = join(SRC, deansFile);
const raw = readFileSync(path, "utf8");
const deans = JSON.parse(raw);
const byKey = new Map();
for (const r of deans) {
  const k = key(r.dean, r.university, r.discipline);
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(r);
}

const results = JSON.parse(readFileSync(resultsFile, "utf8"));
let applied = 0, skippedNotFound = 0, skippedAlreadyHas = 0, skippedBadUrl = 0, skippedAmbiguous = 0;
for (const { dean, university, discipline, sourceUrl } of results) {
  const candidates = byKey.get(key(dean, university, discipline)) || [];
  if (!candidates.length) { skippedNotFound++; continue; }
  const stillMissing = candidates.filter((r) => !r.sourceUrl);
  if (!stillMissing.length) { skippedAlreadyHas++; continue; }
  if (stillMissing.length > 1) { skippedAmbiguous++; continue; }
  if (!sourceUrl || !/^https?:\/\//.test(sourceUrl)) { skippedBadUrl++; continue; }
  if (!DRY) stillMissing[0].sourceUrl = sourceUrl;
  applied++;
}

if (!DRY) writeDeansJson(path, raw, deans);
console.log(`${deansFile}: applied ${applied}, skipped (not-found ${skippedNotFound}, already-had-url ${skippedAlreadyHas}, ambiguous ${skippedAmbiguous}, bad-url ${skippedBadUrl}) of ${results.length} results.${DRY ? " (dry run)" : ""}`);
