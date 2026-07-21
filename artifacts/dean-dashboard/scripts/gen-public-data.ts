// Hardening Step 2 — build-time ETL: assemble each dataset from the raw
// src/data/*.json sources and emit public/data/<id>.json (the arrays that used
// to be compiled into the JS bundle). datasets.ts is now runtime-only (meta +
// fetch loader), so this script owns the assembly that datasets.ts used to do at
// import time — including the ops/IS discipline split and the Top-100 school-info
// mapping. Re-run after ANY data refresh:
//
//   node_modules/.bin/tsx scripts/gen-public-data.ts
import { writeFileSync, mkdirSync, readFileSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Dean } from "../src/data/types";
import { DATASET_LIST, type DatasetId, type SchoolInfo, type BSQSchool } from "../src/data/datasets";
import { SCHOOL_INFO as TOP100_SCHOOLS, SCHOOL_DEAN_MAP } from "../src/data/schools";

// Raw sources (same imports datasets.ts used before Step 2).
import top100Deans from "../src/data/deans.json";
import top100BSQ from "../src/data/schools-bsq.json";
import r1bsDeans from "../src/data/r1-bschool-deans.json";
import r1bsBSQ from "../src/data/r1-bschool-bsq.json";
import r1bsSchools from "../src/data/r1-bschool-schools.json";
import r1esDeans from "../src/data/r1-eschool-deans.json";
import r1esResearch from "../src/data/r1-eschool-research.json";
import r1esSchools from "../src/data/r1-eschool-schools.json";
import r1uDeans from "../src/data/r1-university-deans.json";
import r1uResearch from "../src/data/r1-university-research.json";
import r1uSchools from "../src/data/r1-university-schools.json";
import r1mDeans from "../src/data/r1-medschool-deans.json";
import r1mResearch from "../src/data/r1-medschool-research.json";
import r1mSchools from "../src/data/r1-medschool-schools.json";
import r1lDeans from "../src/data/r1-lawschool-deans.json";
import r1lResearch from "../src/data/r1-lawschool-research.json";
import r1lSchools from "../src/data/r1-lawschool-schools.json";
import r1pDeans from "../src/data/r1-provost-deans.json";
import r1pResearch from "../src/data/r1-provost-research.json";
import r1pSchools from "../src/data/r1-provost-schools.json";
import agDeans from "../src/data/r1-agschool-deans.json";
import agResearch from "../src/data/r1-agschool-research.json";
import agSchools from "../src/data/r1-agschool-schools.json";
import nurDeans from "../src/data/r1-nursing-deans.json";
import nurResearch from "../src/data/r1-nursing-research.json";
import nurSchools from "../src/data/r1-nursing-schools.json";
import phaDeans from "../src/data/r1-pharmacy-deans.json";
import phaResearch from "../src/data/r1-pharmacy-research.json";
import phaSchools from "../src/data/r1-pharmacy-schools.json";
import eduDeans from "../src/data/r1-education-deans.json";
import eduResearch from "../src/data/r1-education-research.json";
import eduSchools from "../src/data/r1-education-schools.json";
import artDeans from "../src/data/r1-arts-deans.json";
import artResearch from "../src/data/r1-arts-research.json";
import artSchools from "../src/data/r1-arts-schools.json";

// Operations Management and Information Systems are separate disciplines; re-split
// any legacy combined values (mirrors the old datasets.ts guard).
function splitOperationsFromIS(deans: Dean[]): Dean[] {
  return deans.map((d) => {
    let b = d.disciplineBroad;
    if (b === "Operations & IS") {
      b = /information/i.test(d.discipline || "") ? "Information Systems" : "Operations Management";
    } else if (b === "Operations") {
      b = "Operations Management";
    }
    return b === d.disciplineBroad ? d : { ...d, disciplineBroad: b };
  });
}

const TOP100_SCHOOL_INFOS: SchoolInfo[] = TOP100_SCHOOLS.map((s) => {
  const mapping = SCHOOL_DEAN_MAP[s.shortName];
  const university = mapping?.university || s.fullName.split(/\s[–-]\s/)[0] || "";
  const school = mapping?.school || s.shortName;
  return {
    university, school, rank: s.rank, fullName: s.fullName, shortName: s.shortName,
    type: s.type, totalFaculty: s.totalFaculty, lat: s.lat, lng: s.lng, city: s.city, state: s.state,
  };
});

type Data = { deans: Dean[]; bsq: BSQSchool[]; schools: SchoolInfo[] };
const D = (deans: unknown, bsq: unknown, schools: unknown): Data =>
  ({ deans: deans as Dean[], bsq: bsq as BSQSchool[], schools: schools as SchoolInfo[] });

const DATA: Record<DatasetId, Data> = {
  top100: D(splitOperationsFromIS(top100Deans as unknown as Dean[]), top100BSQ, TOP100_SCHOOL_INFOS),
  r1bschool: D(splitOperationsFromIS(r1bsDeans as unknown as Dean[]), r1bsBSQ, r1bsSchools),
  r1eschool: D(splitOperationsFromIS(r1esDeans as unknown as Dean[]), r1esResearch, r1esSchools),
  r1university: D(r1uDeans, r1uResearch, r1uSchools),
  r1medical: D(r1mDeans, r1mResearch, r1mSchools),
  r1law: D(r1lDeans, r1lResearch, r1lSchools),
  r1provost: D(r1pDeans, r1pResearch, r1pSchools),
  usag: D(agDeans, agResearch, agSchools),
  usnursing: D(nurDeans, nurResearch, nurSchools),
  uspharmacy: D(phaDeans, phaResearch, phaSchools),
  useducation: D(eduDeans, eduResearch, eduSchools),
  r1arts: D(artDeans, artResearch, artSchools),
};

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DATA = join(HERE, "..", "src", "data");
const OUT_DATA = join(HERE, "..", "public", "data");
const OUT_STATS = join(SRC_DATA, "corpus-stats.json");
mkdirSync(OUT_DATA, { recursive: true });

let totalRows = 0;
for (const id of Object.keys(DATA) as DatasetId[]) {
  const b = DATA[id];
  writeFileSync(join(OUT_DATA, `${id}.json`), JSON.stringify(b));
  totalRows += b.deans.length;
  console.log(`  ${id.padEnd(13)} ${String(b.deans.length).padStart(5)} deans  ${String(b.schools.length).padStart(4)} schools`);
}

// Corpus totals for the header strip — same logic App.tsx used inline, precomputed
// so the app no longer needs every dataset in memory for five numbers. Counts only
// DATASET_LIST (excludes hidden Top-100, a subset of R1 B-school) and dedupes on
// (dean, university, school, startYear).
const seen = new Set<string>();
const schools = new Set<string>();
let sitting = 0;
let minYear = Infinity;
for (const meta of DATASET_LIST) {
  for (const d of DATA[meta.id].deans) {
    const k = `${(d.dean || "").trim().toLowerCase()}|${(d.university || "").trim().toLowerCase()}|${(d.school || "").trim().toLowerCase()}|${d.startYear}`;
    if (seen.has(k)) continue;
    seen.add(k);
    schools.add(`${d.university}|${d.school}`);
    if (d.endYear == null) sitting++;
    if (d.startYear && d.startYear < minYear) minYear = d.startYear;
  }
}
const stats = { appts: seen.size, sitting, schools: schools.size, from: minYear };
writeFileSync(OUT_STATS, JSON.stringify(stats, null, 2) + "\n");

// Global enrichment maps (photos, headhunter research). src/data stays the source
// of truth the portrait/research pipelines write to; mirror them into public/data
// so they load at runtime instead of shipping in the JS bundle.
for (const f of ["dean-photos.json", "leader-research.json"]) {
  const rows = Object.keys(JSON.parse(readFileSync(join(SRC_DATA, f), "utf8"))).length;
  copyFileSync(join(SRC_DATA, f), join(OUT_DATA, f));
  console.log(`  mirrored ${f}  (${rows} keys)`);
}

console.log(`\nWrote ${Object.keys(DATA).length} data files (${totalRows} total rows) to public/data/`);
console.log(`Corpus stats -> src/data/corpus-stats.json:`, stats);
