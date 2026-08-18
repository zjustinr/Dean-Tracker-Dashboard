// Institution-name review report.
//
//   node scripts/check-school-names.mjs
//
// Institution names are join keys: affinity, Scout Assistant, School Explorer and the
// geo lookups all key on the raw `university` string. When a collection wave spells a
// school differently from an existing one, nothing errors -- the school quietly becomes
// two half-populated entries and every cross-index tie between them is lost. That is how
// Berkeley, Buffalo, Albany, West Chester and ~40 others ended up split: the
// education / nursing / pharmacy / public-health / ag / creative-arts waves used comma
// style ("University of California, Berkeley") while the admin / arts / business /
// provost / university / law waves used space style.
//
// lib/school-canon.mjs now folds those variants automatically. This script shows what it
// folded and what still needs a human eye, so a new wave's naming drift is caught while
// it is still cheap to fix.
//
// Deliberately exits 0. The near-miss list is dominated by genuinely distinct campuses
// (UNC Asheville is not UNC), so failing on it would be noise; run it after each
// collection wave and read the two sections.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildCanon, snorm, vkey } from "./lib/school-canon.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data");
const read = (f) => { try { return JSON.parse(readFileSync(join(SRC, f), "utf8")); } catch { return null; } };

const files = readdirSync(SRC).filter((f) => /^r1-.*-deans\.json$/.test(f)).sort();
const records = [];
const seenIn = new Map(); // raw spelling -> Set(index label)
for (const f of files) {
  const label = f.replace(/^r1-|-deans\.json$/g, "");
  for (const r of read(f) || []) {
    records.push(r);
    if (r.university) (seenIn.get(r.university) || seenIn.set(r.university, new Set()).get(r.university)).add(label);
  }
}
const { canon, variants } = buildCanon(records);

// --- 1. spelling variants folded into one institution -------------------------
const folded = [...variants.entries()].filter(([, s]) => s.size > 1);
console.log(`\n${canon.size} canonical institutions across ${files.length} indices`);
console.log(`\n=== ${folded.length} institution(s) written more than one way (auto-folded) ===`);
for (const [key, spellings] of folded.sort((a, b) => b[1].size - a[1].size)) {
  console.log(`  ${canon.get(key)}`);
  for (const s of spellings) {
    if (s === canon.get(key)) continue;
    console.log(`      also "${s}"  [${[...(seenIn.get(s) || [])].join(", ")}]`);
  }
}

// --- 2. near-miss pairs a human should confirm are actually different ---------
// Campus and system suffixes are the overwhelming majority and are genuinely
// distinct entities, so they are filtered out of the review list.
const CAMPUS = /^(system|campus|global|online|world campus|health science|health sciences|medical center|medical school|law|downtown|northwest)\b/;
const names = [...canon.values()];
const K = new Map(names.map((n) => [n, vkey(snorm(n))]));
const review = [];
for (const a of names) for (const b of names) {
  if (a === b) continue;
  const ka = K.get(a), kb = K.get(b);
  if (!kb.startsWith(ka + " ")) continue;
  const tail = kb.slice(ka.length + 1);
  if (tail.split(" ").length <= 2 && !CAMPUS.test(tail)) review.push([a, b]);
}
console.log(`\n=== ${review.length} prefix near-miss pair(s) to confirm are different schools ===`);
console.log("  (campuses and system offices already filtered out; most of the rest are");
console.log("   branch campuses too -- add any true duplicate to MERGE in lib/school-canon.mjs)\n");
for (const [a, b] of review) console.log(`  ${a}  <>  ${b}`);
console.log("");
