// Free backfill pass: for records missing sourceUrl, if leader-research.json
// already has a curated news item for that exact dean|university, use its
// URL as the sourceUrl. Zero network calls -- reuses research already on file.
//
//   node scripts/backfill-source-urls-from-research.mjs [--dry-run]
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "data");
const DRY = process.argv.includes("--dry-run");

const key = (d, u) => `${d.trim().toLowerCase()}|${u.trim().toLowerCase()}`;
const research = JSON.parse(readFileSync(join(SRC, "leader-research.json"), "utf8"));

const files = readdirSync(SRC).filter((f) => /deans.*\.json$/.test(f) && !/schools/.test(f) && f !== "dean-photos.json");

let total = 0, filled = 0;
for (const f of files) {
  const p = join(SRC, f);
  const arr = JSON.parse(readFileSync(p, "utf8"));
  let changed = false;
  for (const r of arr) {
    if (r.sourceUrl || !r.dean || !r.university) continue;
    total++;
    const rec = research[key(r.dean, r.university)];
    const url = rec?.news?.find((n) => n.url)?.url;
    if (!url) continue;
    filled++;
    changed = true;
    if (!DRY) r.sourceUrl = url;
    console.log(`${f}#${r.id}: ${r.dean} (${r.university}) -> ${url}`);
  }
  if (changed && !DRY) writeFileSync(p, JSON.stringify(arr, null, 2));
}
console.log(`\n${filled} / ${total} missing sourceUrls filled from curated research.${DRY ? " (dry run, nothing written)" : ""}`);
