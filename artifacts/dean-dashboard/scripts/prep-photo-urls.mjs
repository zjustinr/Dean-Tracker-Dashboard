// Normalize researched photo-URL files by adding the canonical `slug` that
// download-photos.mjs expects, then write one combined file.
//   node scripts/prep-photo-urls.mjs <out.json> <urls1.json> [urls2.json ...]
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const [out, ...inputs] = process.argv.slice(2);
if (!out || !inputs.length) { console.error("usage: prep-photo-urls.mjs <out.json> <urls...>"); process.exit(1); }

const slugify = (d, u) => `${d} ${u}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const rows = [];
for (const f of inputs) {
  if (!existsSync(f)) { console.warn("missing:", f); continue; }
  let arr;
  try { arr = JSON.parse(readFileSync(f, "utf8")); } catch { console.warn("invalid JSON:", f); continue; }
  for (const r of arr) {
    if (!r || !r.dean || !r.university) continue;
    if (!r.imageUrl || !r.imageUrl.trim()) continue;
    rows.push({ dean: r.dean, university: r.university, slug: slugify(r.dean, r.university), imageUrl: r.imageUrl.trim(), pageUrl: r.pageUrl || "" });
  }
}
writeFileSync(out, JSON.stringify(rows));
console.log(`normalized ${rows.length} url rows -> ${out}`);
