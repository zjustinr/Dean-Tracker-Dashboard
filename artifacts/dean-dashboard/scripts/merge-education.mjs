// Merge researched education strings into leader-research.json.
//   node scripts/merge-education.mjs <edu1.json> [edu2.json ...]
// Each input is an array of {dean, university, education}. Matches the existing
// key convention (dean|university, lowercased); only non-empty education is set.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const LR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "leader-research.json");
const lr = JSON.parse(readFileSync(LR, "utf8"));
const key = (d, u) => `${String(d).trim().toLowerCase()}|${String(u).trim().toLowerCase()}`;

let added = 0, skipped = 0, blank = 0;
for (const f of process.argv.slice(2)) {
  if (!existsSync(f)) { console.warn("missing:", f); continue; }
  let rows;
  try { rows = JSON.parse(readFileSync(f, "utf8")); } catch { console.warn("invalid JSON:", f); continue; }
  for (const r of rows) {
    if (!r || !r.dean || !r.university) continue;
    if (!r.education || !r.education.trim()) { blank++; continue; }
    const k = key(r.dean, r.university);
    if (lr[k]?.education) { skipped++; continue; }
    lr[k] = Object.assign({}, lr[k] || {}, { education: r.education.trim() });
    added++;
  }
}
writeFileSync(LR, JSON.stringify(lr));
console.log(`education merged: +${added} | already-had: ${skipped} | left blank by researcher: ${blank} | leader-research keys: ${Object.keys(lr).length}`);
