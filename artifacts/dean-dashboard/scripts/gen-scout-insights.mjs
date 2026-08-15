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
  "r1-adminleaders-deans.json": "usadminleaders",
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

// ---- origin-category lift: when a hire comes from outside, what were they
// doing right before -- already a dean somewhere (same kind of school, or a
// different kind), an associate/vice dean, a department chair, straight from
// industry, or faculty with no admin title at all? Mined the same shape as
// tie-category lift above: a category mix compared against the GLOBAL mix
// among external hires pooled across the whole corpus, gated on a
// leave-one-hire-out validation. See the BatonIndex research brief "The Path
// Before the Deanship" for the r1bschool-specific deep dive this generalizes.
//
// Mirrors useScoutCandidates.ts's SCHOOL_DOMAIN_RE (kept independent/
// duplicated on purpose, same as the FILE_ID map above) -- needed here to
// split "dean elsewhere" into same-kind-of-school vs. a different kind, since
// only the same-kind case is ever reachable by this app's "broader pool"
// candidate source (which only ever pulls from the SAME index/school type),
// and the two buckets are not interchangeable: in the r1bschool brief, the
// same-kind-of-school case had a materially SHORTER average tenure (5.3yr)
// than the cross-kind case (6.6yr) or a faculty-only hire (7.9yr).
const SCHOOL_DOMAIN_RE = {
  business: /business school|school of business|college of business|school of management/i,
  engineering: /school of engineering|college of engineering|engineering school/i,
  medical: /school of medicine|medical school|college of medicine|health sciences center/i,
  law: /law school|school of law|college of law/i,
  agriculture: /college of agriculture|school of agriculture|\bforestry\b/i,
  nursing: /school of nursing|college of nursing/i,
  pharmacy: /school of pharmacy|college of pharmacy/i,
  education: /school of education|college of education/i,
  arts: /college of arts (?:and|&) sciences|school of arts (?:and|&) sciences/i,
  publichealth: /school of public health/i,
  veterinary: /veterinary medicine|school of veterinary/i,
  creativearts: /school of the arts|school of music|school of fine arts|\bconservatory\b/i,
  graduate: /graduate school|graduate college/i,
};
// Only indices that mean "one specific school among several at a university" --
// deliberately excludes university/provost/system/r2/liberal-arts/advancement,
// same exemption as useScoutCandidates.ts's ownDomainTies, where "was a dean of
// some specific school" is the norm rather than a same-kind/different-kind split.
const ID_SCHOOL_TYPE = {
  r1bschool: "business", r1eschool: "engineering", r1medical: "medical", r1law: "law",
  usag: "agriculture", usnursing: "nursing", uspharmacy: "pharmacy", useducation: "education",
  r1arts: "arts", uspublichealth: "publichealth", usvet: "veterinary", uscreativearts: "creativearts",
  usgrad: "graduate",
};

const ORIGIN_CATEGORIES = ["dean-same-type", "dean-other-type", "assoc-vice-dean", "dept-chair", "industry", "faculty-only"];
const DEAN_TITLE_RE = /\bdean\b/i;
const NON_HEAD_DEAN_RE = /(assoc|asst|assistant|vice|interim|deputy)[^,]*\bdean\b/i;
const ASSOC_VICE_DEAN_RE = /associate dean|assoc\.? dean|vice dean|deputy dean|senior associate dean/i;
const DEPT_CHAIR_RE = /department chair|dept\.? chair|department head|\bchair of\b|chair,/i;
const FACULTY_RE = /professor|faculty/i;

function originCategory(row, ownType) {
  const title = row.priorTitle || "";
  const inst = row.priorInstitution || "";
  if (DEAN_TITLE_RE.test(title) && !NON_HEAD_DEAN_RE.test(title)) {
    if (!ownType) return "dean-same-type"; // no same-kind/different-kind concept for this index -- don't split
    const ownRe = SCHOOL_DOMAIN_RE[ownType];
    // Conservative: only counts as same-type if the prior title/institution
    // EXPLICITLY names our own domain; an ambiguous/generic "Dean" mention
    // defaults to "other-type" rather than inflating the bucket the broader
    // pool actually draws candidates from.
    return ownRe && (ownRe.test(title) || ownRe.test(inst)) ? "dean-same-type" : "dean-other-type";
  }
  if (ASSOC_VICE_DEAN_RE.test(title)) return "assoc-vice-dean";
  if (DEPT_CHAIR_RE.test(title)) return "dept-chair";
  if (row.hasIndustryExp === true) return "industry";
  if (FACULTY_RE.test(title)) return "faculty-only";
  return null;
}

const MIN_ORIGIN_N = 15; // mirrors MIN_TIE_N -- classified external hires below this, per index, is too noisy to validate
const ORIGIN_LIFT_THRESHOLD = 1.4; // mirrors TIE_LIFT_THRESHOLD

function globalOriginRates(allExternalHiresWithType) {
  const cats = allExternalHiresWithType.map(({ row, ownType }) => originCategory(row, ownType));
  const counts = new Map();
  for (const c of cats) if (c) counts.set(c, (counts.get(c) || 0) + 1);
  const n = allExternalHiresWithType.length;
  const rates = {};
  for (const cat of ORIGIN_CATEGORIES) rates[cat] = (counts.get(cat) || 0) / n;
  return rates;
}

function originCategoryLiftForIndex(hireRows, ownType, globalRates) {
  const externalHires = hireRows.filter((r) => r.isExternal === true && r.priorTitle);
  const cats = externalHires.map((h) => originCategory(h, ownType));
  const classified = cats.filter(Boolean).length;
  if (classified < MIN_ORIGIN_N) return null;

  // Leave-one-hire-out validation, identical shape to tieCategoryLiftForIndex's:
  // does the most-distinctive category (trained on every OTHER hire, vs. the
  // fixed global rate) actually predict the held-out hire's real category?
  let hits = 0, baselineSum = 0, evaluated = 0;
  for (let i = 0; i < cats.length; i++) {
    if (!cats[i]) continue;
    const trainCats = cats.filter((_, j) => j !== i);
    const trainCounts = new Map();
    for (const c of trainCats) if (c) trainCounts.set(c, (trainCounts.get(c) || 0) + 1);
    const distinctive = ORIGIN_CATEGORIES
      .map((cat) => ({ cat, lift: globalRates[cat] > 0 ? ((trainCounts.get(cat) || 0) / trainCats.length) / globalRates[cat] : 0 }))
      .filter((d) => Number.isFinite(d.lift) && d.lift >= ORIGIN_LIFT_THRESHOLD)
      .sort((a, b) => b.lift - a.lift)[0];
    if (!distinctive) continue;
    evaluated++;
    if (cats[i] === distinctive.cat) hits++;
    baselineSum += globalRates[distinctive.cat];
  }
  const validation = evaluated >= 10
    ? { hitRate: round(hits / evaluated), baselineHitRate: round(baselineSum / evaluated), n: evaluated }
    : null;
  const validated = !!validation && validation.hitRate >= validation.baselineHitRate * 2 && validation.hitRate >= 0.1;
  if (!validated) return null;

  const tenureOf = (rows) => {
    const vals = rows.map((r) => r.tenureLength).filter((t) => typeof t === "number");
    return vals.length >= 5 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const overallAvgTenure = tenureOf(externalHires);

  const categories = {};
  for (const cat of ORIGIN_CATEGORIES) {
    const gr = globalRates[cat];
    const rowsInCat = externalHires.filter((_, i) => cats[i] === cat);
    const n = rowsInCat.length;
    if (!gr || n < 3) continue;
    const hr = n / externalHires.length;
    const lift = round(hr / gr, 2);
    const avgTenure = tenureOf(rowsInCat);
    // A category with too few tenure-having rows, or no corpus-wide average to
    // compare against, gets a neutral 1.0 factor rather than a noisy estimate.
    const tenureFactor = avgTenure != null && overallAvgTenure ? round(avgTenure / overallAvgTenure, 2) : 1;
    categories[cat] = { globalRate: round(gr), hireRate: round(hr), lift, n, avgTenure: round(avgTenure, 1), tenureFactor, adjustedLift: round(lift * tenureFactor, 2) };
  }
  if (!Object.keys(categories).length) return null;
  return { categories, validation, hireN: externalHires.length, classifiedN: classified };
}

const affinityBySchool = read(AFFINITY_FILE);

// First pass: gather every external hire across every index, so the tie-lift
// baseline reflects the whole corpus (see tieCategoryLiftForIndex's comment)
// before the per-index second pass uses it.
const allRowsByIndex = {};
const allExternalHires = [];
const allExternalHiresWithType = [];
for (const [file, id] of Object.entries(FILE_ID)) {
  const rows = read(file);
  if (!rows.length) continue;
  allRowsByIndex[id] = rows;
  for (const r of rows) {
    if (r.roleType === "subdean" || r.isExternal !== true) continue;
    if (r.university && r.dean && r.startYear) allExternalHires.push(r);
    if (r.priorTitle) allExternalHiresWithType.push({ row: r, ownType: ID_SCHOOL_TYPE[id] ?? null });
  }
}
const globalRates = globalTieRates(allExternalHires, affinityBySchool);
const globalOrigin = globalOriginRates(allExternalHiresWithType);

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
    originLift: originCategoryLiftForIndex(hireRows, ID_SCHOOL_TYPE[id] ?? null, globalOrigin),
  };
  processed++;
}

writeFileSync(OUT, JSON.stringify(insights) + "\n");
const withBacktest = Object.values(insights).filter((x) => x.backtest);
const withTieLift = Object.entries(insights).filter(([, x]) => x.tieLift);
const withOriginLift = Object.entries(insights).filter(([, x]) => x.originLift);
console.log(`scout-insights.json: ${processed} indices, ${Object.values(insights).reduce((n, x) => n + x.traits.length, 0)} trait entries`);
console.log(`backtest AUC (hire vs. never-promoted bench, held-out folds): ${withBacktest.map((x) => x.backtest.auc).join(", ") || "none (no index had enough feeder-bench data)"}`);
console.log(`tie-category lift validated for ${withTieLift.length}/${processed} indices:`);
for (const [id, x] of withTieLift) {
  console.log(`  ${id}: leave-one-out hit rate ${x.tieLift.validation.hitRate} vs. baseline ${x.tieLift.validation.baselineHitRate} (n=${x.tieLift.validation.n}) -- ${Object.entries(x.tieLift.categories).map(([cat, c]) => `${cat} ×${c.lift}`).join(", ")}`);
}
console.log(`origin-category lift validated for ${withOriginLift.length}/${processed} indices:`);
for (const [id, x] of withOriginLift) {
  console.log(`  ${id}: leave-one-out hit rate ${x.originLift.validation.hitRate} vs. baseline ${x.originLift.validation.baselineHitRate} (n=${x.originLift.validation.n}) -- ${Object.entries(x.originLift.categories).map(([cat, c]) => `${cat} ×${c.adjustedLift} (raw ×${c.lift}, tenure ×${c.tenureFactor})`).join(", ")}`);
}
