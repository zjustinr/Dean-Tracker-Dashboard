// Hardening Step 2 — build-time ETL (plain Node, no TS/tsx so it runs in the
// Vercel build with zero extra dependencies). Assembles each dataset from the
// raw src/data/*.json sources and emits public/data/<id>.json (the arrays that
// used to compile into the JS bundle), mirrors the global photo/research maps,
// and precomputes corpus-stats.json. Re-run after ANY data refresh:
//
//   node scripts/gen-public-data.mjs        (or: pnpm gen-data)
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "data");
const OUT = join(HERE, "..", "public", "data");
mkdirSync(OUT, { recursive: true });

const read = (name) => JSON.parse(readFileSync(join(SRC, name), "utf8"));

// Operations Management and Information Systems are separate disciplines; re-split
// any legacy combined values (mirrors the old datasets.ts guard). Applied to the
// business/engineering datasets only.
function splitOpsFromIS(deans) {
  return deans.map((d) => {
    let b = d.disciplineBroad;
    if (b === "Operations & IS") b = /information/i.test(d.discipline || "") ? "Information Systems" : "Operations Management";
    else if (b === "Operations") b = "Operations Management";
    return b === d.disciplineBroad ? d : { ...d, disciplineBroad: b };
  });
}

// id -> [deansFile, bsqOrResearchFile, schoolsFile, splitOps?]
// top100 is hidden (never fetched by the UI): its one TS-only transform (school
// infos assembled from schools.ts) is dropped, so it ships with empty schools.
const SPEC = {
  top100:      ["deans.json", "schools-bsq.json", null, true],
  r1bschool:   ["r1-bschool-deans.json", "r1-bschool-bsq.json", "r1-bschool-schools.json", true],
  r1eschool:   ["r1-eschool-deans.json", "r1-eschool-research.json", "r1-eschool-schools.json", true],
  r1university:["r1-university-deans.json", "r1-university-research.json", "r1-university-schools.json", false],
  r1medical:   ["r1-medschool-deans.json", "r1-medschool-research.json", "r1-medschool-schools.json", false],
  r1law:       ["r1-lawschool-deans.json", "r1-lawschool-research.json", "r1-lawschool-schools.json", false],
  r1provost:   ["r1-provost-deans.json", "r1-provost-research.json", "r1-provost-schools.json", false],
  usag:        ["r1-agschool-deans.json", "r1-agschool-research.json", "r1-agschool-schools.json", false],
  usnursing:   ["r1-nursing-deans.json", "r1-nursing-research.json", "r1-nursing-schools.json", false],
  uspharmacy:  ["r1-pharmacy-deans.json", "r1-pharmacy-research.json", "r1-pharmacy-schools.json", false],
  useducation: ["r1-education-deans.json", "r1-education-research.json", "r1-education-schools.json", false],
  r1arts:      ["r1-arts-deans.json", "r1-arts-research.json", "r1-arts-schools.json", false],
};

// Order for the corpus tally: the visible switcher list, excluding hidden top100
// (a strict subset of r1bschool).
const VISIBLE = ["r1bschool", "r1eschool", "r1university", "r1medical", "r1law", "r1provost", "usag", "usnursing", "uspharmacy", "useducation", "r1arts"];

const DATA = {};
let totalRows = 0;
for (const [id, [deansF, bsqF, schoolsF, split]] of Object.entries(SPEC)) {
  let deans = read(deansF);
  if (split) deans = splitOpsFromIS(deans);
  const bsq = bsqF ? read(bsqF) : [];
  const schools = schoolsF ? read(schoolsF) : [];
  DATA[id] = { deans, bsq, schools };
  writeFileSync(join(OUT, `${id}.json`), JSON.stringify(DATA[id]));
  totalRows += deans.length;
  console.log(`  ${id.padEnd(13)} ${String(deans.length).padStart(5)} deans  ${String(schools.length).padStart(4)} schools`);
}

// Corpus totals — same logic App.tsx used inline. Dedupe on
// (dean, university, school, startYear).
const seen = new Set();
const schoolSet = new Set();
let sitting = 0;
let minYear = Infinity;
for (const id of VISIBLE) {
  for (const d of DATA[id].deans) {
    const k = `${(d.dean || "").trim().toLowerCase()}|${(d.university || "").trim().toLowerCase()}|${(d.school || "").trim().toLowerCase()}|${d.startYear}`;
    if (seen.has(k)) continue;
    seen.add(k);
    schoolSet.add(`${d.university}|${d.school}`);
    if (d.endYear == null) sitting++;
    if (d.startYear && d.startYear < minYear) minYear = d.startYear;
  }
}
const stats = { appts: seen.size, sitting, schools: schoolSet.size, from: minYear };
writeFileSync(join(SRC, "corpus-stats.json"), JSON.stringify(stats, null, 2) + "\n");

// Global enrichment maps (photos, headhunter research). src/data stays the source
// of truth the portrait/research pipelines write to; mirror into public/data so
// they load at runtime instead of shipping in the JS bundle.
for (const f of ["dean-photos.json", "leader-research.json"]) {
  const keys = Object.keys(read(f)).length;
  copyFileSync(join(SRC, f), join(OUT, f));
  console.log(`  mirrored ${f}  (${keys} keys)`);
}

console.log(`\nWrote ${Object.keys(SPEC).length} data files (${totalRows} total rows) to public/data/`);
console.log(`Corpus stats -> src/data/corpus-stats.json:`, stats);
