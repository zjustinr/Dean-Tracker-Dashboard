// Apply {id, sourceUrl} research results (from WebSearch-driven backfill
// batches) into a deans dataset file. Only fills records that are still
// missing a sourceUrl (never overwrites an existing one), validates the URL
// looks like a real http(s) URL, and preserves the file's existing
// compact-vs-pretty JSON formatting.
//
//   node scripts/apply-source-url-results.mjs <deans-file> <results.json> [--dry-run]
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "data");
const DRY = process.argv.includes("--dry-run");
const [deansFile, resultsFile] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!deansFile || !resultsFile) { console.error("usage: apply-source-url-results.mjs <deans-file> <results.json> [--dry-run]"); process.exit(1); }

function writeDeansJson(path, rawBefore, arr) {
  const m = /^\[\r?\n( *)/.exec(rawBefore);
  const indent = m ? m[1].length : 0;
  writeFileSync(path, indent ? JSON.stringify(arr, null, indent) : JSON.stringify(arr));
}

const path = join(SRC, deansFile);
const raw = readFileSync(path, "utf8");
const deans = JSON.parse(raw);
const byId = new Map(deans.map((r) => [r.id, r]));

const results = JSON.parse(readFileSync(resultsFile, "utf8"));
let applied = 0, skippedNotFound = 0, skippedAlreadyHas = 0, skippedBadUrl = 0;
for (const { id, sourceUrl } of results) {
  const rec = byId.get(id);
  if (!rec) { skippedNotFound++; continue; }
  if (rec.sourceUrl) { skippedAlreadyHas++; continue; }
  if (!sourceUrl || !/^https?:\/\//.test(sourceUrl)) { skippedBadUrl++; continue; }
  if (!DRY) rec.sourceUrl = sourceUrl;
  applied++;
}

if (!DRY) writeDeansJson(path, raw, deans);
console.log(`${deansFile}: applied ${applied}, skipped (not-found ${skippedNotFound}, already-had-url ${skippedAlreadyHas}, bad-url ${skippedBadUrl}) of ${results.length} results.${DRY ? " (dry run)" : ""}`);
