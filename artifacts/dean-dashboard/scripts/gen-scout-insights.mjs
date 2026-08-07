// Scout Assistant mining pass — per index, quantify (a) what kind of prior
// connection successors typically have to the institution, and (b) which
// pre-appointment-knowable traits are associated with landing the role.
// Output feeds both the Scout Assistant scoring function and an auto-generated
// methodology brief (see src/components/ScoutAssistant.tsx). Regenerated on
// every build/deploy (wired into gen-data/predev/prebuild), so the "constantly
// tweaked and tested" loop is: edit a field list or MIN_N below, re-run, and the
// backtest AUC below tells you whether that change made the model MORE or LESS
// predictive -- not just differently correlated.
//
//   node scripts/gen-scout-insights.mjs
//
// Two distinct kinds of "lift" are computed, and never mixed together:
//   - "promotion" lift: rate among actual hires vs. rate among the associate
//     dean / dept chair feeder bench (roleType "subdean") for that same index.
//     Only computed where a feeder bench exists — this is the strongest signal,
//     closest to "predicts who gets promoted," and the only kind fed into the
//     backtest below (trend lift can't discriminate between two candidates at
//     the same point in time).
//   - "trend" lift: rate among the most recent RECENT_YEARS of hires vs. rate
//     among earlier hires. Computed for every index; shows what characterizes
//     *today's* hires vs. the past, not causal promotion odds. Caution: this can
//     also reflect data-collection completeness improving in later verification
//     sweeps rather than a real behavioral shift -- treat as a lead, not proof.
// Deliberately excluded from "traits": nextRole, tenureLength, involuntary,
// surpriseDeparture, convertedToPermanent — these are known only *after* the
// appointment, so mining them as "predictive of hiring" would be leakage.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data");
const OUT = join(SRC, "scout-insights.json");

// Mirrors scripts/gen-affinity.mjs's FILE_ID map (kept independent/duplicated
// on purpose — each generator script is meant to run standalone).
const FILE_ID = {
  "r1-bschool-deans.json": "r1bschool", "r1-eschool-deans.json": "r1eschool",
  "r1-university-deans.json": "r1university", "r1-medschool-deans.json": "r1medical",
  "r1-lawschool-deans.json": "r1law", "r1-provost-deans.json": "r1provost",
  "r1-agschool-deans.json": "usag", "r1-nursing-deans.json": "usnursing",
  "r1-pharmacy-deans.json": "uspharmacy", "r1-education-deans.json": "useducation",
  "r1-arts-deans.json": "r1arts", "r1-r2public-deans.json": "usr2",
  "r1-system-deans.json": "ussystem", "r1-publichealth-deans.json": "uspublichealth",
  "r1-vet-deans.json": "usvet", "r1-grad-deans.json": "usgrad",
  "r1-camd-deans.json": "uscreativearts",
  "r1-advancement-deans.json": "usadvancement", "r1-lac-deans.json": "uslac",
};

const read = (f) => { try { return JSON.parse(readFileSync(join(SRC, f), "utf8")); } catch { return []; } };

// Boolean traits knowable about a candidate *before* the appointment decision.
const PRE_HIRE_BOOL = [
  "hasPhd", "fromEliteInstitution", "priorInstitutionElite", "hasPriorDeanExp",
  "hadAssocDeanRole", "hadDeptChairRole", "hasIndustryExp", "hasConsultingBg",
  "isFirstTimeDean", "hadPriorConnection", "hasInstitutionalLink", "fromSameUniversityDiffSchool",
];
// Categorical traits knowable before the appointment decision.
const PRE_HIRE_CATEGORICAL = ["disciplineBroad", "careerBackground", "connectionType", "origin"];
// Fields reported as "connection patterns" — the successor's tie to the institution.
const CONNECTION_BOOL = ["hadPriorConnection", "hasInstitutionalLink", "fromSameUniversityDiffSchool"];

const MIN_N = 8; // below this, a rate/lift is too noisy to report at all
const RECENT_YEARS = 15;

const round = (x, d = 3) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
const confidenceFor = (n) => (n < 20 ? "low" : n < 75 ? "medium" : "high");
const rate = (rows, pred) => (rows.length ? rows.filter(pred).length / rows.length : null);

// The feeder bench (roleType "subdean") is a lightly-scraped current-roster
// snapshot, not a researched profile like an actual hire record (e.g. hasPhd is
// true for 1218/1218 r1university hires but only 4/1479 bench rows -- because
// nobody went and researched PhDs for a cabinet directory listing, not because
// bench members are really that unlikely to hold one). A biographical trait
// sitting at a near-constant rate across hundreds of real people is a giveaway
// that the field wasn't populated on that side, not a real behavioral signal --
// so "promotion" lift (which pits hires against exactly that bench data) refuses
// to score a field once either side is this extreme. "trend" lift never hits
// this guard since it compares two equally-researched hire-record populations.
const ENRICHMENT_ARTIFACT_BAND = [0.02, 0.98];
function liftEntry(field, value, kind, numRows, denomRows, pred) {
  if (numRows.length < MIN_N || denomRows.length < MIN_N) return null;
  const r1 = rate(numRows, pred);
  const r2 = rate(denomRows, pred);
  if (!r2) return null; // zero (or null) denominator rate -> lift is undefined/infinite, skip
  if (kind === "promotion") {
    const [lo, hi] = ENRICHMENT_ARTIFACT_BAND;
    if (r1 <= lo || r1 >= hi || r2 <= lo || r2 >= hi) return null;
  }
  return {
    field, value, kind,
    rate: round(r1), compareRate: round(r2), lift: round(r1 / r2, 2),
    n: numRows.length, confidence: confidenceFor(numRows.length),
  };
}

function topValues(rows, field, max = 6) {
  const counts = new Map();
  for (const r of rows) {
    const v = r[field];
    if (v === undefined || v === null || v === "" || v === "Unknown") continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n >= MIN_N).sort((a, b) => b[1] - a[1]).slice(0, max).map(([v]) => v);
}

function connectionPatterns(rows) {
  if (rows.length < MIN_N) return null;
  const connectionType = topValues(rows, "connectionType", 8).map((v) => ({
    value: v, rate: round(rate(rows, (r) => r.connectionType === v)), n: rows.filter((r) => r.connectionType === v).length,
  }));
  const flags = {};
  for (const f of CONNECTION_BOOL) flags[f] = round(rate(rows, (r) => r[f] === true));
  return { n: rows.length, connectionType, flags };
}

// Every (field, value) lift computable between two row sets, boolean + categorical
// fields alike. Shared by the reporting pass (traitsForIndex) and the backtest's
// per-fold weight training (backtestIndex) so both use identical logic.
function computeLifts(numRows, denomRows, kind) {
  const out = [];
  for (const field of PRE_HIRE_BOOL) {
    const e = liftEntry(field, true, kind, numRows, denomRows, (r) => r[field] === true);
    if (e) out.push(e);
  }
  for (const field of PRE_HIRE_CATEGORICAL) {
    for (const value of topValues(numRows, field)) {
      const e = liftEntry(field, value, kind, numRows, denomRows, (r) => r[field] === value);
      if (e) out.push(e);
    }
  }
  return out;
}

function traitsForIndex(hireRows, benchRows, hasFeederBench) {
  const years = hireRows.map((r) => r.startYear).filter((y) => typeof y === "number");
  const maxYear = years.length ? Math.max(...years) : null;
  const recentRows = maxYear != null ? hireRows.filter((r) => r.startYear >= maxYear - RECENT_YEARS) : [];
  const historicalRows = maxYear != null ? hireRows.filter((r) => r.startYear < maxYear - RECENT_YEARS) : [];

  const out = [];
  if (hasFeederBench) out.push(...computeLifts(hireRows, benchRows, "promotion"));
  if (recentRows.length >= MIN_N && historicalRows.length >= MIN_N) out.push(...computeLifts(recentRows, historicalRows, "trend"));

  // Most surprising (furthest from lift=1, i.e. no association) first, within each kind.
  const strength = (e) => Math.abs(Math.log(e.lift));
  const promotion = out.filter((e) => e.kind === "promotion").sort((a, b) => strength(b) - strength(a)).slice(0, 12);
  const trend = out.filter((e) => e.kind === "trend").sort((a, b) => strength(b) - strength(a)).slice(0, 12);
  return [...promotion, ...trend];
}

// ---- backtest: does promotion-lift scoring actually separate hires from the
// feeder bench that never got promoted? Only meaningful for indices with a real
// feeder bench (roleType "subdean") -- trend lift can't discriminate between two
// candidates at the same point in time, so it's excluded from this test.
//
// Deterministic PRNG (not Math.random) so re-running the generator on unchanged
// data reproduces the same fold split and the same AUC, instead of a noisy diff
// on every regen.
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(rows, rng) {
  const a = rows.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function kFoldChunks(rows, k) {
  const size = Math.ceil(rows.length / k);
  const chunks = [];
  for (let i = 0; i < k; i++) chunks.push(rows.slice(i * size, (i + 1) * size));
  return chunks.filter((c) => c.length);
}
function scoreRow(row, weights) {
  let s = 0;
  for (const w of weights) if (row[w.field] === w.value) s += Math.log(w.lift);
  return s;
}
const SEED = 20260807; // fixed -> reproducible fold split across regenerations
const K_FOLDS = 5;
function backtestIndex(hireRows, benchRows) {
  if (hireRows.length < MIN_N * K_FOLDS || benchRows.length < MIN_N * K_FOLDS) return null;
  const rng = mulberry32(SEED);
  const hireChunks = kFoldChunks(seededShuffle(hireRows, rng), K_FOLDS);
  const benchChunks = kFoldChunks(seededShuffle(benchRows, rng), K_FOLDS);
  const folds = Math.min(hireChunks.length, benchChunks.length);
  let wins = 0, ties = 0, total = 0, foldsUsed = 0;
  for (let i = 0; i < folds; i++) {
    const hireTrain = hireChunks.filter((_, j) => j !== i).flat();
    const benchTrain = benchChunks.filter((_, j) => j !== i).flat();
    const weights = computeLifts(hireTrain, benchTrain, "promotion");
    if (!weights.length) continue;
    foldsUsed++;
    const hireTest = hireChunks[i], benchTest = benchChunks[i];
    const hireScores = hireTest.map((r) => scoreRow(r, weights));
    const benchScores = benchTest.map((r) => scoreRow(r, weights));
    for (const hs of hireScores) {
      for (const bs of benchScores) {
        total++;
        if (hs > bs) wins++;
        else if (hs === bs) ties++;
      }
    }
  }
  if (!total) return null;
  // AUC: probability a held-out hire outscores a held-out bench member (0.5 = no
  // better than chance, 1.0 = perfect separation). Ties count as half a win.
  return { auc: round((wins + 0.5 * ties) / total, 3), pairs: total, folds: foldsUsed, hireN: hireRows.length, benchN: benchRows.length };
}

const insights = {};
let processed = 0;
for (const [file, id] of Object.entries(FILE_ID)) {
  const rows = read(file);
  if (!rows.length) continue;
  const hireRows = rows.filter((r) => r.roleType !== "subdean");
  const benchRows = rows.filter((r) => r.roleType === "subdean");
  const hasFeederBench = benchRows.length >= MIN_N;
  if (hireRows.length < MIN_N) continue;

  insights[id] = {
    sampleSize: hireRows.length,
    benchSize: benchRows.length,
    hasFeederBench,
    lowConfidence: hireRows.length < 50,
    connectionPatterns: {
      all: connectionPatterns(hireRows),
      external: connectionPatterns(hireRows.filter((r) => r.isExternal === true)),
    },
    traits: traitsForIndex(hireRows, benchRows, hasFeederBench),
    backtest: hasFeederBench ? backtestIndex(hireRows, benchRows) : null,
  };
  processed++;
}

writeFileSync(OUT, JSON.stringify(insights) + "\n");
const withBacktest = Object.values(insights).filter((x) => x.backtest);
console.log(`scout-insights.json: ${processed} indices, ${Object.values(insights).reduce((n, x) => n + x.traits.length, 0)} trait entries`);
console.log(`backtest AUC (hire vs. never-promoted bench, held-out folds): ${withBacktest.map((x) => x.backtest.auc).join(", ") || "none (no index had enough feeder-bench data)"}`);
