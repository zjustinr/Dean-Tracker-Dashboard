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
  usr2: ["r1-r2public-deans.json", null, "r1-r2public-schools.json", false],
  ussystem: ["r1-system-deans.json", null, "r1-system-schools.json", false],
  uslac: ["r1-lac-deans.json", null, "r1-lac-schools.json", false],
  uscommunitycollege: ["r1-communitycollege-deans.json", null, "r1-communitycollege-schools.json", false],
  uspublichealth: ["r1-publichealth-deans.json", "r1-publichealth-research.json", "r1-publichealth-schools.json", false],
  usvet:       ["r1-vet-deans.json", null, "r1-vet-schools.json", false],
  usgrad:      ["r1-grad-deans.json", null, "r1-grad-schools.json", false],
  uscreativearts: ["r1-camd-deans.json", null, "r1-camd-schools.json", false],
  usadvancement: ["r1-advancement-deans.json", null, "r1-advancement-schools.json", false],
  usadminleaders: ["r1-adminleaders-deans.json", null, "r1-adminleaders-schools.json", false],
};

// The visible switcher list (excludes hidden top100), for the corpus tally.
// NOTE: usadminleaders and uscommunitycollege are intentionally NOT in VISIBLE yet. VISIBLE also gates
// scripts/news-scout.mjs's assertDatasetCoverage() (the daily automated
// appointment-scan cron job) -- adding an id here without a matching
// TYPE_TO_DATASET/UNIT_PHRASES entry in news-lib.mjs/news-scout.mjs makes that
// job throw and breaks daily news coverage for every OTHER index too. Wiring
// usadminleaders into the news classifier (which is tightly hand-tuned around
// dean/provost/president/advancement role words) is real, separate follow-up
// work -- add it to VISIBLE only once that's done and tested.
//
// uscommunitycollege is out for a second reason on top of that one: it is a
// PILOT holding 20 of its 224 seats, so folding it into the corpus tally would
// advertise a headline number the index cannot yet stand behind. Both gates lift
// together once the remaining collection wave lands and the news classifier
// learns community-college role words ("president" at a two-year college, and
// "chancellor" meaning a DISTRICT head rather than a system head).
export const VISIBLE = ["r1bschool", "r1eschool", "r1university", "r1medical", "r1law", "r1provost", "usag", "usnursing", "uspharmacy", "useducation", "r1arts", "uspublichealth", "usvet", "usr2", "ussystem", "usgrad", "uscreativearts", "usadvancement", "uslac"];

// Global enrichment maps served straight through (no assembly).
export const ENRICHMENT = new Set(["dean-photos.json", "leader-research.json", "leader-careers.json", "affinity-by-school.json", "scout-insights.json", "employer-affinity.json", "nonacademic-experience.json"]);

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
      // The Assoc/Vice/Interim feeder bench (roleType "subdean") is a current-
      // roster snapshot, not a tracked succession appointment -- excluded from
      // the headline corpus totals so "sitting leaders"/"appointments" keep
      // meaning "top-office leaders", not top-office-plus-cabinet-VPs.
      if (d.roleType === "subdean") continue;
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
