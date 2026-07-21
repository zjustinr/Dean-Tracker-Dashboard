// Baton Index — dataset assembly from raw src/data (shared).
//
// Single source of truth for turning the raw src/data/*.json files into a
// dataset bundle {deans, bsq, schools}. Used by:
//   - api/data.mjs         (the gated serverless function that serves /data)
//   - the vite dev server  (serves /data locally, ungated)
//   - scripts/gen-public-data.mjs (precomputes corpus-stats.json)
//
// Reading raw src/data on demand (rather than a generated artifact) means the
// news-scout refresh — which writes src/data — is served fresh on the next
// deploy with nothing else to regenerate.
import { readFileSync } from "node:fs";
import { join } from "node:path";

// id -> [deansFile, bsqOrResearchFile, schoolsFile, splitOps?]
// top100 is hidden; its one TS-only transform (school infos) is dropped -> [].
export const SPEC = {
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

// The visible switcher list (excludes hidden top100), for the corpus tally.
export const VISIBLE = ["r1bschool", "r1eschool", "r1university", "r1medical", "r1law", "r1provost", "usag", "usnursing", "uspharmacy", "useducation", "r1arts"];

// Global enrichment maps served straight through (no assembly).
export const ENRICHMENT = new Set(["dean-photos.json", "leader-research.json"]);

// Operations Management and Information Systems are separate disciplines; re-split
// any legacy combined values (mirrors the old datasets.ts guard).
function splitOpsFromIS(deans) {
  return deans.map((d) => {
    let b = d.disciplineBroad;
    if (b === "Operations & IS") b = /information/i.test(d.discipline || "") ? "Information Systems" : "Operations Management";
    else if (b === "Operations") b = "Operations Management";
    return b === d.disciplineBroad ? d : { ...d, disciplineBroad: b };
  });
}

const readJson = (srcDir, f) => JSON.parse(readFileSync(join(srcDir, f), "utf8"));

/** Assemble a dataset bundle {deans, bsq, schools} from raw files in srcDir. */
export function assembleDataset(id, srcDir) {
  const spec = SPEC[id];
  if (!spec) return null;
  const [deansF, bsqF, schoolsF, split] = spec;
  let deans = readJson(srcDir, deansF);
  if (split) deans = splitOpsFromIS(deans);
  const bsq = bsqF ? readJson(srcDir, bsqF) : [];
  const schools = schoolsF ? readJson(srcDir, schoolsF) : [];
  return { deans, bsq, schools };
}

/** Raw text of an enrichment file (photos / research), or null. */
export function readEnrichment(file, srcDir) {
  if (!ENRICHMENT.has(file)) return null;
  return readFileSync(join(srcDir, file), "utf8");
}

/** Corpus totals for the header strip. Same dedupe logic App.tsx used inline. */
export function computeCorpus(srcDir) {
  const seen = new Set();
  const schools = new Set();
  let sitting = 0;
  let minYear = Infinity;
  for (const id of VISIBLE) {
    for (const d of assembleDataset(id, srcDir).deans) {
      const k = `${(d.dean || "").trim().toLowerCase()}|${(d.university || "").trim().toLowerCase()}|${(d.school || "").trim().toLowerCase()}|${d.startYear}`;
      if (seen.has(k)) continue;
      seen.add(k);
      schools.add(`${d.university}|${d.school}`);
      if (d.endYear == null) sitting++;
      if (d.startYear && d.startYear < minYear) minYear = d.startYear;
    }
  }
  return { appts: seen.size, sitting, schools: schools.size, from: minYear };
}
