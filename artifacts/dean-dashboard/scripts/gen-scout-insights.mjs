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
const AFFINITY_FILE = "affinity-by-school.json";

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

// ---- tie-category lift: does having a direct alumni/faculty/admin tie
// (gen-affinity.mjs's affinity-by-school.json) to the hiring school actually
// predict getting hired, and if so, which tie TYPE matters most?
//
// Two earlier attempts at this baseline were both wrong, in instructive ways:
//   1. Mapping tie categories onto the hand-researched connectionType field
//      and comparing against a flat 25%-per-category chance baseline. That
//      cross-mapping was starved of data (18 of 19 indices never had enough
//      external hires with one of the specific connectionType values, so
//      they silently fell back to guessed constants below the 25% baseline --
//      meaning a REAL tie scored as a NEGATIVE signal almost everywhere,
//      backwards from the intent).
//   2. Baselining against "everyone with any tie to a school this index
//      tracks" (pooled from affinity-by-school.json directly). That pool
//      is dominated by OTHER leaders in this same leader-tracking corpus, so
//      65%+ of it has "admin" as its strongest tie just because being an
//      administrator SOMEWHERE is what got someone into this database in the
//      first place -- an artifact of what the corpus even is, not a real
//      base rate for "how connected is a random plausible candidate."
// This version baselines against the ONE population that's actually
// comparable: the tie-category mix among EXTERNAL HIRES ACROSS THE WHOLE
// CORPUS (every index pooled), using the same date-filtered pre-existing-tie
// definition -- so the question becomes "is THIS index's external-hire tie
// mix distinctively different from the typical external hire's, anywhere,"
// which is the same shape of comparison gen-employer-affinity.mjs already
// validated (subgroup rate vs. the broader population's own rate).
// Gated on a leave-one-hire-out validation: does the most-distinctive category
// trained on every OTHER external hire in this index actually predict the
// held-out hire's real tie category more often than that category's GLOBAL
// base rate would by chance? An index that doesn't clear this bar contributes
// no tie-lift data at all -- ScoutAssistant.tsx should treat that as "no
// calibrated signal," not fall back to a guess.
function evidenceYear(ev) {
  const m = String(ev).match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}
function filterEvidenceBefore(list, cutoffYear) {
  return (list || []).filter((ev) => { const y = evidenceYear(ev); return y == null || y <= cutoffYear - 1; });
}
const TIE_CATEGORIES = ["admin", "faculty", "grad", "undergrad"];
function strongestTieCategory(entry) {
  for (const cat of TIE_CATEGORIES) if (entry[cat] && entry[cat].length) return cat;
  return null;
}
function tieCategoryFor(hire, affinityBySchool) {
  const entries = affinityBySchool[hire.university] || [];
  const raw = entries.find((e) => e.name.trim().toLowerCase() === hire.dean.trim().toLowerCase());
  if (!raw) return null;
  const filtered = {
    admin: filterEvidenceBefore(raw.admin, hire.startYear), faculty: filterEvidenceBefore(raw.faculty, hire.startYear),
    grad: filterEvidenceBefore(raw.grad, hire.startYear), undergrad: filterEvidenceBefore(raw.undergrad, hire.startYear),
  };
  return strongestTieCategory(filtered);
}

const MIN_TIE_N = 15; // hires-with-a-tie below this, per index, is too noisy to validate a category split
const TIE_LIFT_THRESHOLD = 1.4; // matches gen-employer-affinity.mjs's bar for "distinctive"

/** Global tie-category rate among external hires across every index, pooled -- the shared baseline every index's own rate gets compared against. */
function globalTieRates(allExternalHires, affinityBySchool) {
  const cats = allExternalHires.map((h) => tieCategoryFor(h, affinityBySchool));
  const counts = new Map();
  for (const c of cats) if (c) counts.set(c, (counts.get(c) || 0) + 1);
  const n = allExternalHires.length;
  const rates = {};
  for (const cat of TIE_CATEGORIES) rates[cat] = (counts.get(cat) || 0) / n;
  return rates;
}

function tieCategoryLiftForIndex(hireRows, affinityBySchool, globalRates) {
  const externalHires = hireRows.filter((r) => r.isExternal === true && r.university && r.dean && r.startYear);
  const hireCats = externalHires.map((h) => tieCategoryFor(h, affinityBySchool));
  const withTie = hireCats.filter(Boolean).length;
  if (withTie < MIN_TIE_N) return null;

  const hireCatCounts = new Map();
  for (const c of hireCats) if (c) hireCatCounts.set(c, (hireCatCounts.get(c) || 0) + 1);
  const hireRate = (cat) => (hireCatCounts.get(cat) || 0) / externalHires.length;

  // Leave-one-hire-out: exclude the held-out hire, recompute which category is
  // most distinctive from everyone else (vs. the fixed GLOBAL rate -- removing
  // one hire from a 5000+ pool doesn't meaningfully move it), check whether it
  // matches the held-out hire's actual (date-filtered) category.
  let hits = 0, baselineSum = 0, evaluated = 0;
  for (let i = 0; i < hireCats.length; i++) {
    if (!hireCats[i]) continue; // no tie at all isn't something a tie-based signal could have predicted
    const trainCats = hireCats.filter((_, j) => j !== i);
    const trainCounts = new Map();
    for (const c of trainCats) if (c) trainCounts.set(c, (trainCounts.get(c) || 0) + 1);
    const distinctive = TIE_CATEGORIES
      .map((cat) => ({ cat, lift: globalRates[cat] > 0 ? ((trainCounts.get(cat) || 0) / trainCats.length) / globalRates[cat] : 0 }))
      .filter((d) => Number.isFinite(d.lift) && d.lift >= TIE_LIFT_THRESHOLD)
      .sort((a, b) => b.lift - a.lift)[0];
    if (!distinctive) continue;
    evaluated++;
    if (hireCats[i] === distinctive.cat) hits++;
    baselineSum += globalRates[distinctive.cat];
  }
  const validation = evaluated >= 10
    ? { hitRate: round(hits / evaluated), baselineHitRate: round(baselineSum / evaluated), n: evaluated }
    : null;
  const validated = !!validation && validation.hitRate >= validation.baselineHitRate * 2 && validation.hitRate >= 0.1;
  if (!validated) return null;

  const categories = {};
  for (const cat of TIE_CATEGORIES) {
    const gr = globalRates[cat], hr = hireRate(cat), n = hireCatCounts.get(cat) || 0;
    if (!gr || n < 3) continue; // matches gen-employer-affinity.mjs's own floor -- a 1-2-hire "category" is noise, not a rate
    categories[cat] = { globalRate: round(gr), hireRate: round(hr), lift: round(hr / gr, 2), n };
  }
  if (!Object.keys(categories).length) return null;
  return { categories, validation, hireN: externalHires.length, withTieN: withTie };
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

const affinityBySchool = read(AFFINITY_FILE);

// First pass: gather every external hire across every index, so the tie-lift
// baseline reflects the whole corpus (see tieCategoryLiftForIndex's comment)
// before the per-index second pass uses it.
const allRowsByIndex = {};
const allExternalHires = [];
for (const [file, id] of Object.entries(FILE_ID)) {
  const rows = read(file);
  if (!rows.length) continue;
  allRowsByIndex[id] = rows;
  for (const r of rows) if (r.roleType !== "subdean" && r.isExternal === true && r.university && r.dean && r.startYear) allExternalHires.push(r);
}
const globalRates = globalTieRates(allExternalHires, affinityBySchool);

const insights = {};
let processed = 0;
for (const [id, rows] of Object.entries(allRowsByIndex)) {
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
    tieLift: tieCategoryLiftForIndex(hireRows, affinityBySchool, globalRates),
  };
  processed++;
}

writeFileSync(OUT, JSON.stringify(insights) + "\n");
const withBacktest = Object.values(insights).filter((x) => x.backtest);
const withTieLift = Object.entries(insights).filter(([, x]) => x.tieLift);
console.log(`scout-insights.json: ${processed} indices, ${Object.values(insights).reduce((n, x) => n + x.traits.length, 0)} trait entries`);
console.log(`backtest AUC (hire vs. never-promoted bench, held-out folds): ${withBacktest.map((x) => x.backtest.auc).join(", ") || "none (no index had enough feeder-bench data)"}`);
console.log(`tie-category lift validated for ${withTieLift.length}/${processed} indices:`);
for (const [id, x] of withTieLift) {
  console.log(`  ${id}: leave-one-out hit rate ${x.tieLift.validation.hitRate} vs. baseline ${x.tieLift.validation.baselineHitRate} (n=${x.tieLift.validation.n}) -- ${Object.entries(x.tieLift.categories).map(([cat, c]) => `${cat} ×${c.lift}`).join(", ")}`);
}
