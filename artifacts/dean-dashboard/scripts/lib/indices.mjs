// The index registry -- one place that knows which dean files exist, what their
// dataset id is, and what to call them.
//
// WHY THIS IS SHARED
// ------------------
// This map used to be copy-pasted into gen-affinity.mjs, gen-employer-affinity.mjs,
// gen-scout-insights.mjs and scout-backtest.mjs, each carrying a note that the
// duplication was "kept independent on purpose". It drifted anyway:
// scout-backtest.mjs was missing `r1-adminleaders-deans.json` -- the LARGEST index
// at 2,264 rows -- because a collection wave added the file to three generators
// and not the fourth. Nothing failed; the backtest just silently sampled from a
// corpus with a fifth of the people missing.
//
// That is the real cost of adding an index: not the ETL, but the N places that
// have to learn about it, none of which complain when they don't. So the map
// lives here, and `assertRegistered` turns "a new index nobody wired up" from a
// silent omission into a loud one.
import { readdirSync } from "node:fs";

/** Dean-file basename -> dataset id, as used in every generated artifact. */
export const FILE_ID = {
  "r1-bschool-deans.json": "r1bschool",
  "r1-eschool-deans.json": "r1eschool",
  "r1-university-deans.json": "r1university",
  "r1-medschool-deans.json": "r1medical",
  "r1-lawschool-deans.json": "r1law",
  "r1-provost-deans.json": "r1provost",
  "r1-agschool-deans.json": "usag",
  "r1-nursing-deans.json": "usnursing",
  "r1-pharmacy-deans.json": "uspharmacy",
  "r1-education-deans.json": "useducation",
  "r1-arts-deans.json": "r1arts",
  "r1-r2public-deans.json": "usr2",
  "r1-system-deans.json": "ussystem",
  "r1-publichealth-deans.json": "uspublichealth",
  "r1-vet-deans.json": "usvet",
  "r1-grad-deans.json": "usgrad",
  "r1-camd-deans.json": "uscreativearts",
  "r1-advancement-deans.json": "usadvancement",
  "r1-lac-deans.json": "uslac",
  "r1-adminleaders-deans.json": "usadminleaders",
};

/** Dataset id -> human label for UI and log lines. */
export const INDEX_LABEL = {
  r1bschool: "Business",
  r1eschool: "Engineering",
  r1university: "President",
  r1medical: "Medical",
  r1law: "Law",
  r1provost: "Provost",
  usag: "Ag & Forestry",
  usnursing: "Nursing",
  uspharmacy: "Pharmacy",
  useducation: "Education",
  r1arts: "Arts & Sciences",
  usr2: "R2",
  ussystem: "System",
  uspublichealth: "Public Health",
  usvet: "Veterinary",
  usgrad: "Graduate College",
  uscreativearts: "Creative Arts",
  usadvancement: "Advancement",
  uslac: "LAC President",
  usadminleaders: "Administrative",
};

/**
 * Dean files that exist on disk but deliberately carry no dataset id.
 *
 * `deans.json` is the Top-100 business cut, which overlaps r1-bschool almost
 * entirely -- counting both would double every business leader in any
 * cross-index pass. Passes that reason about PEOPLE still read it (a person's
 * industry history is the same person's regardless of which cut they appear in);
 * passes that reason about INDICES skip it.
 */
export const UNREGISTERED_BY_DESIGN = new Set(["deans.json"]);

const DEAN_FILE_RE = /^(r1-.*-deans|deans)\.json$/;

/** Every dean file on disk, sorted. Includes the unregistered-by-design ones. */
export function deanFiles(SRC) {
  return readdirSync(SRC).filter((f) => DEAN_FILE_RE.test(f)).sort();
}

/** Only the files that carry a dataset id, as [file, id] pairs. */
export function registeredFiles(SRC) {
  return deanFiles(SRC)
    .filter((f) => FILE_ID[f])
    .map((f) => [f, FILE_ID[f]]);
}

export const labelOf = (id) => INDEX_LABEL[id] || id;

/**
 * Fail loudly when a dean file exists that this registry has never heard of.
 *
 * Call it at the top of any generator that iterates indices. A new index is
 * supposed to be a one-line addition here; without this check it is instead a
 * silent partial rollout, which is exactly how adminleaders went missing from
 * the backtest for months.
 *
 * @param {string} SRC data directory
 * @param {{ strict?: boolean }} [opts] strict throws; otherwise it warns on stderr
 * @returns {string[]} the unregistered basenames
 */
export function assertRegistered(SRC, { strict = false } = {}) {
  const unknown = deanFiles(SRC).filter((f) => !FILE_ID[f] && !UNREGISTERED_BY_DESIGN.has(f));
  if (unknown.length) {
    const msg =
      `scripts/lib/indices.mjs does not know about: ${unknown.join(", ")}.\n` +
      `Add each to FILE_ID and INDEX_LABEL, or to UNREGISTERED_BY_DESIGN if it is ` +
      `a deliberate overlap. Until then every index-wide pass silently skips it.`;
    if (strict) throw new Error(msg);
    console.warn(`\n!! ${msg}\n`);
  }
  return unknown;
}
