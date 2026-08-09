// Scout Assistant real-world backtest -- a repeatable check of whether the
// live scoring model (ScoutAssistant.tsx) would actually have surfaced real
// hires, not just a mined-pattern sanity check like gen-scout-insights.mjs's
// AUC. Run manually (NOT wired into gen-data/predev/prebuild -- this re-mines
// trait weights once per sampled hire, which is too slow to run on every
// build, and it's a model-health check for a developer to read, not shipped
// data any component consumes):
//
//   node scripts/scout-backtest.mjs [N] [seed] [mode]
//
// N (default 50): how many currently-sitting leaders to sample.
// seed (default 20260809): PRNG seed, for a different (still reproducible) draw.
// mode (default "random"): "random" draws N leaders uniformly from every
//   sitting leader hired since 2000 -- representative of reality, but reality
//   is mostly internal promotions, so it mostly exercises the bench/trait-fit
//   pathway and barely touches the connected/weak-link pathway (see below).
//   "stratified" instead draws N/2 from that same general pool and N/2
//   specifically from EXTERNAL hires who had a genuine, dated, pre-existing
//   affinity tie or a validated employer-category match to their hiring
//   school -- so the connected/weak-link pathway actually gets exercised in
//   the same run, not left to chance. The point of merging bench + connected +
//   weak-link into one list (see ScoutAssistant.tsx) is to maximize the set a
//   headhunter gets to choose from, not to pick a single best guess -- so
//   "stratified" is the more honest test of the MERGED system: does the union
//   of both pathways actually cover more real hires than either alone would?
//
// Question: for N CURRENTLY SITTING leaders, if we'd run Scout Assistant for
// their school right before they were hired, would they have appeared in the
// suggested candidates? Reported at several list sizes (top 3/5/10/25) since
// the product goal is a headhunter's longlist, not a single #1 guess --
// "would this person have been in the set we showed" matters more than
// "would they have out-scored literally everyone else."
//
// Methodology, and its honest limits:
//  - Trait-lift weights (idx.traits) are RE-MINED per test case, excluding the
//    test hire's own row from the training population (leave-one-out) -- so
//    this isn't just checking whether a hire matches weights that were partly
//    computed FROM that same hire. Mirrors gen-scout-insights.mjs's own
//    computeLifts/traitsForIndex logic exactly (copied below).
//  - Direct affinity ties (alumni/faculty/admin) are date-filtered: a piece of
//    evidence only counts if the year embedded in its text predates the hire
//    year, so a tie that only exists because of something the person did AFTER
//    being hired elsewhere doesn't leak in. Evidence with no parseable year
//    (mostly bare "MA, X University" degree lines) is treated as pre-existing.
//  - Employer/weak-link category match uses the hire's own recorded
//    priorInstitution, categorized with the exact same regex gen-employer-
//    affinity.mjs uses -- but the CATEGORY LIFT figures themselves (which
//    categories are "distinctive" for a discipline, and by how much) are NOT
//    re-mined leave-one-out here (that pass is more expensive to redo per test
//    case); they're the shipped, already-validated figures. This is the one
//    place with a bit of in-sample optimism baked in, and it only ever applies
//    where a discipline actually cleared the shipped validation gate
//    (currently just r1bschool).
//  - The competing "field" a test hire is ranked against is TODAY's actual
//    bench/affinity/weak-link candidate pool for that school (minus the hire
//    themself and anyone who has since held the role) -- NOT a historical
//    snapshot of who was actually available in that hire's year, because the
//    feeder-bench data is a current-roster snapshot with no historical dates
//    and can't be rolled back. This is the single biggest approximation: an
//    old hire is being ranked against today's field, which may be stronger or
//    weaker than the real field they beat at the time.
//  - Every pool competitor is scored with the SAME three components (trait fit
//    from their own resolved record + tie fit + employer fit) the test hire
//    gets. Comparing a fully-scored test hire against competitors who only get
//    one component each (bench: trait-only, affinity: tie-only, weak-link:
//    employer-only) would inflate the hit rate for free.
//
// The scoring logic below (PRE_HIRE_BOOL/PRE_HIRE_CATEGORICAL/liftEntry from
// gen-scout-insights.mjs; CATEGORY_PATTERNS from gen-employer-affinity.mjs;
// TIE_CONNECTION_TYPES/traitFitScore/affinityTieFitScore/employerMatchScoreFor
// from ScoutAssistant.tsx) is duplicated on purpose, same as every other
// gen-*.mjs script in this directory -- each runs standalone. If you change
// how ScoutAssistant.tsx scores candidates, update the copy here too, or this
// backtest silently stops testing what's actually shipped.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data");
const read = (f) => JSON.parse(readFileSync(join(SRC, f), "utf8"));

const N = parseInt(process.argv[2], 10) || 50;
const SEED = parseInt(process.argv[3], 10) || 20260809;
const MODE = process.argv[4] === "stratified" ? "stratified" : "random";

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

const scoutInsights = read("scout-insights.json");
const employerAffinity = read("employer-affinity.json");
const affinityBySchool = read("affinity-by-school.json");

const ROWS_BY_INDEX = {};
for (const [f, id] of Object.entries(FILE_ID)) ROWS_BY_INDEX[id] = read(f);

// Flat cross-index lookup so affinity/weak-link pool candidates can be resolved
// to their OWN actual dean record -- exactly what ScoutAssistant.tsx's
// resolveAffinityProfile does before adding a trait-fit bonus to their score.
const ALL_ROWS_FLAT = [];
for (const [id, rows] of Object.entries(ROWS_BY_INDEX)) for (const r of rows) ALL_ROWS_FLAT.push({ ...r, __index: id });
function resolveDean(name, university) {
  const nameL = name.trim().toLowerCase(), uniL = university.trim().toLowerCase();
  const matches = ALL_ROWS_FLAT.filter((d) => d.dean.trim().toLowerCase() === nameL && d.university.trim().toLowerCase() === uniL);
  if (!matches.length) return null;
  return matches.find((d) => d.endYear == null) ?? matches.sort((a, b) => (b.startYear || 0) - (a.startYear || 0))[0];
}

// ---- copied from gen-scout-insights.mjs ------------------------------------
const PRE_HIRE_BOOL = [
  "hasPhd", "fromEliteInstitution", "priorInstitutionElite", "hasPriorDeanExp",
  "hadAssocDeanRole", "hadDeptChairRole", "hasIndustryExp", "hasConsultingBg",
  "isFirstTimeDean", "hadPriorConnection", "hasInstitutionalLink", "fromSameUniversityDiffSchool",
];
const PRE_HIRE_CATEGORICAL = ["disciplineBroad", "careerBackground", "connectionType", "origin"];
const MIN_N = 8;
const RECENT_YEARS = 15;
const ENRICHMENT_ARTIFACT_BAND = [0.02, 0.98];
const round = (x, d = 3) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
const rate = (rows, pred) => (rows.length ? rows.filter(pred).length / rows.length : null);
function liftEntry(field, value, kind, numRows, denomRows, pred) {
  if (numRows.length < MIN_N || denomRows.length < MIN_N) return null;
  const r1 = rate(numRows, pred), r2 = rate(denomRows, pred);
  if (!r2) return null;
  if (kind === "promotion") {
    const [lo, hi] = ENRICHMENT_ARTIFACT_BAND;
    if (r1 <= lo || r1 >= hi || r2 <= lo || r2 >= hi) return null;
  }
  return { field, value, kind, rate: round(r1), compareRate: round(r2), lift: round(r1 / r2, 2), n: numRows.length };
}
function topValues(rows, field, max = 6) {
  const counts = new Map();
  for (const r of rows) { const v = r[field]; if (v === undefined || v === null || v === "" || v === "Unknown") continue; counts.set(v, (counts.get(v) || 0) + 1); }
  return [...counts.entries()].filter(([, n]) => n >= MIN_N).sort((a, b) => b[1] - a[1]).slice(0, max).map(([v]) => v);
}
function computeLifts(numRows, denomRows, kind) {
  const out = [];
  for (const field of PRE_HIRE_BOOL) { const e = liftEntry(field, true, kind, numRows, denomRows, (r) => r[field] === true); if (e) out.push(e); }
  for (const field of PRE_HIRE_CATEGORICAL) for (const value of topValues(numRows, field)) { const e = liftEntry(field, value, kind, numRows, denomRows, (r) => r[field] === value); if (e) out.push(e); }
  return out;
}
function traitsForIndexLOO(hireRows, benchRows, hasFeederBench) {
  const years = hireRows.map((r) => r.startYear).filter((y) => typeof y === "number");
  const maxYear = years.length ? Math.max(...years) : null;
  const recentRows = maxYear != null ? hireRows.filter((r) => r.startYear >= maxYear - RECENT_YEARS) : [];
  const historicalRows = maxYear != null ? hireRows.filter((r) => r.startYear < maxYear - RECENT_YEARS) : [];
  const out = [];
  if (hasFeederBench) out.push(...computeLifts(hireRows, benchRows, "promotion"));
  if (recentRows.length >= MIN_N && historicalRows.length >= MIN_N) out.push(...computeLifts(recentRows, historicalRows, "trend"));
  return out;
}

// ---- copied from gen-employer-affinity.mjs's categorizer -------------------
const CATEGORY_PATTERNS = [
  ["Academic", /\b(university|college|institute of technology|polytechnic|school of|business school|graduate school|academy|insead|\bimd\b|georgia tech|virginia tech|caltech|cal tech|\bmit\b)\b/i],
  ["Government & Public Sector", /\b(department of|u\.?s\.? (army|navy|air force|government)|federal|white house|congress|senate|pentagon|\bnasa\b|\bnih\b|\bcdc\b|\bdarpa\b|federal reserve|world bank|united nations|city of|state of|ministry|\bdept\.? of\b)\b/i],
  ["Nonprofit & Foundation", /\b(foundation|nonprofit|non-profit|\bngo\b|charitable|philanthrop)\b/i],
  ["Law", /\b(law firm|\bllp\b|attorneys)\b/i],
  ["Healthcare & Biotech", /\b(hospital|health system|medical center|clinic|pharma|biotech|healthcare)\b/i],
  ["Finance & Consulting", /\b(bank|venture capital|private equity|capital partners|capital management|equity partners|equity firm|hedge fund|investment|mckinsey|bain\b|boston consulting|\bbcg\b|goldman sachs|morgan stanley|j\.?p\.?\s?morgan|deloitte|pricewaterhousecoopers|\bpwc\b|ernst\s?&?\s?young|\bkpmg\b|accenture|blackstone|vanguard|fidelity|wells fargo|citigroup|credit suisse|\bubs\b|consulting)\b/i],
  ["Media & Entertainment", /\b(disney|warner|broadcasting|entertainment|studios?\b|new york times|washington post)\b/i],
  ["Technology", /\b(google|microsoft|amazon|apple\b|meta\b|facebook|technolog|software|\bibm\b|intel\b|oracle\b|cisco\b|adobe\b|salesforce|tesla\b|spacex|nvidia|qualcomm|uber\b|airbnb|netflix|twitter|linkedin|computer)\b/i],
];
function categorize(org) {
  const s = String(org || "").trim();
  if (!s) return null;
  for (const [cat, re] of CATEGORY_PATTERNS) if (re.test(s)) return cat;
  return "Other";
}

// ---- copied from ScoutAssistant.tsx -----------------------------------------
const TIE_CONNECTION_TYPES = {
  admin: ["Board-member", "Prior-institutional-role", "Former-dean"],
  faculty: ["Former-faculty", "Current faculty", "Alumni-and-former-faculty"],
  grad: ["Alumni", "Alumni-and-former-faculty"],
  undergrad: ["Alumni", "Alumni-and-former-faculty"],
};
const FALLBACK_TIE_RATE = { admin: 0.12, faculty: 0.09, grad: 0.06, undergrad: 0.06 };
const TIE_BASELINE = 0.25;
function tieCategoryRates(idx) {
  const bucket = idx.connectionPatterns.external;
  if (!bucket) return FALLBACK_TIE_RATE;
  const rateOf = (values) => bucket.connectionType.filter((c) => values.includes(c.value)).reduce((s, c) => s + c.rate, 0);
  const rates = {};
  for (const tie of Object.keys(TIE_CONNECTION_TYPES)) { const r = rateOf(TIE_CONNECTION_TYPES[tie]); rates[tie] = r > 0 ? r : FALLBACK_TIE_RATE[tie]; }
  return rates;
}
function traitFitScore(d, traits) {
  const matched = traits.filter((t) => d[t.field] === t.value);
  return matched.reduce((s, t) => s + Math.log(t.lift), 0);
}
function strongestCategory(e) {
  if (e.admin.length) return "admin";
  if (e.faculty.length) return "faculty";
  if (e.grad.length) return "grad";
  if (e.undergrad.length) return "undergrad";
  return null;
}
function affinityTieFitScore(e, rates) {
  const cat = strongestCategory(e);
  if (!cat) return { score: 0, category: null };
  return { score: Math.log(rates[cat] / TIE_BASELINE), category: cat };
}
function employerMatchScoreFor(priorInstitution, employerProfile) {
  if (!employerProfile) return { score: 0, category: null };
  const cat = categorize(priorInstitution);
  const match = employerProfile.categories.find((c) => c.category === cat);
  return match ? { score: Math.log(match.lift), category: cat } : { score: 0, category: null };
}

// ---- date-filtering affinity evidence ---------------------------------------
function evidenceYear(ev) {
  const m = String(ev).match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}
function filterEvidenceBefore(list, cutoffYear) {
  return list.filter((ev) => { const y = evidenceYear(ev); return y == null || y <= cutoffYear - 1; });
}
function dateFilteredAffEntry(entry, cutoffYear) {
  return {
    admin: filterEvidenceBefore(entry.admin, cutoffYear),
    faculty: filterEvidenceBefore(entry.faculty, cutoffYear),
    grad: filterEvidenceBefore(entry.grad, cutoffYear),
    undergrad: filterEvidenceBefore(entry.undergrad, cutoffYear),
  };
}

// ---- deterministic PRNG + sample, mirroring gen-scout-insights.mjs's own ---
function mulberry32(seed) {
  let a = seed;
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function seededShuffle(rows, rng) {
  const a = rows.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---- build eligible sample: currently-sitting leaders hired since 2000 -----
function hasGenuinePreexistingTie(entry, cutoffYear) {
  if (!entry) return false;
  for (const cat of ["admin", "faculty", "grad", "undergrad"]) {
    for (const ev of entry[cat]) { const y = evidenceYear(ev); if (y == null || y <= cutoffYear - 1) return true; }
  }
  return false;
}
const eligible = [];
const connectedEligible = []; // external hires with a real pre-existing tie or a validated employer-category match -- the subset that can actually exercise the connected/weak-link pathway
for (const [id, rows] of Object.entries(ROWS_BY_INDEX)) {
  if (!scoutInsights[id]) continue;
  for (const r of rows) {
    if (r.roleType === "subdean" || r.endYear != null || !r.startYear || r.startYear < 2000 || !r.dean || !r.university) continue;
    if (/^\(/.test(r.dean.trim())) continue; // placeholder rows ("(vacant — in search)", etc.)
    const row = { ...r, __index: id };
    eligible.push(row);
    if (r.isExternal !== true) continue;
    const uniAff = affinityBySchool[r.university] || [];
    const affEntry = uniAff.find((e) => e.name.trim().toLowerCase() === r.dean.trim().toLowerCase());
    const employerProfile = employerAffinity[id]?.schools[r.university];
    if (hasGenuinePreexistingTie(affEntry, r.startYear) || employerProfile) connectedEligible.push({ ...row, __stratum: "connected" });
  }
}
for (const r of eligible) r.__stratum = "general";

const rng = mulberry32(SEED);
let sample;
if (MODE === "stratified") {
  const half = Math.floor(N / 2);
  const generalPart = seededShuffle(eligible, rng).slice(0, N - half);
  const connectedPart = seededShuffle(connectedEligible, rng).slice(0, half);
  sample = [...generalPart, ...connectedPart];
  console.log(`Stratified draw: ${generalPart.length} general + ${connectedPart.length} connected-eligible (pool of ${connectedEligible.length} external hires with a real pre-existing tie or employer match)`);
  if (connectedPart.length < half) console.log(`  Note: only ${connectedEligible.length} connected-eligible hires exist in the corpus -- couldn't fill the requested ${half}.`);
} else {
  sample = seededShuffle(eligible, rng).slice(0, N);
}

// ---- run backtest ------------------------------------------------------------
const results = [];
for (const H of sample) {
  const id = H.__index;
  const idx = scoutInsights[id];
  const allRows = ROWS_BY_INDEX[id];
  const hireRows = allRows.filter((r) => r.roleType !== "subdean");
  const benchRows = allRows.filter((r) => r.roleType === "subdean");
  const hasFeederBench = idx.hasFeederBench;

  const hireRowsLOO = hireRows.filter((r) => r.id !== H.id);
  const traitsLOO = traitsForIndexLOO(hireRowsLOO, benchRows, hasFeederBench);
  const tieRates = tieCategoryRates(idx);
  const employerProfile = employerAffinity[id]?.schools[H.university];

  function scoreOf(dean, affEntryRaw) {
    const t = traitFitScore(dean, traitsLOO);
    const affFiltered = affEntryRaw ? dateFilteredAffEntry(affEntryRaw, H.startYear) : { admin: [], faculty: [], grad: [], undergrad: [] };
    const { score: tieScore, category: tieCat } = affinityTieFitScore(affFiltered, tieRates);
    const { score: empScore, category: empCat } = employerMatchScoreFor(dean.priorInstitution, employerProfile);
    return { total: t + tieScore + empScore, trait: t, tie: tieScore, tieCat, emp: empScore, empCat };
  }

  const uniAff = affinityBySchool[H.university] || [];
  const hAffRaw = uniAff.find((e) => e.name.trim().toLowerCase() === H.dean.trim().toLowerCase());
  const hScore = scoreOf(H, hAffRaw);

  const schoolDeans = allRows.filter((d) => d.university === H.university);
  const everHeldNames = new Set(schoolDeans.filter((d) => d.roleType !== "subdean" && d.dean.trim().toLowerCase() !== H.dean.trim().toLowerCase()).map((d) => d.dean.trim().toLowerCase()));

  const poolScores = [];
  const seenNames = new Set();
  function addPoolCandidate(name, university, affEntryRaw) {
    const nameL = name.trim().toLowerCase();
    if (everHeldNames.has(nameL) || nameL === H.dean.trim().toLowerCase() || seenNames.has(nameL)) return;
    seenNames.add(nameL);
    const resolved = resolveDean(name, university);
    const dean = resolved || { priorInstitution: "" };
    poolScores.push(scoreOf(dean, affEntryRaw).total);
  }
  for (const d of schoolDeans) {
    if (d.roleType !== "subdean") continue;
    addPoolCandidate(d.dean, d.university, uniAff.find((e) => e.name.trim().toLowerCase() === d.dean.trim().toLowerCase()));
  }
  for (const e of uniAff) addPoolCandidate(e.name, e.university, e);
  if (employerProfile) {
    for (const w of employerProfile.weakLinks) {
      addPoolCandidate(w.name, w.university, uniAff.find((e) => e.name.trim().toLowerCase() === w.name.trim().toLowerCase()));
    }
  }

  const rank = 1 + poolScores.filter((s) => s > hScore.total).length;
  const poolSize = poolScores.length + 1;
  results.push({
    dean: H.dean, university: H.university, index: id, startYear: H.startYear, stratum: H.__stratum,
    hScore: round(hScore.total, 3), rank, poolSize,
    signals: { trait: round(hScore.trait, 3), tie: round(hScore.tie, 3), tieCat: hScore.tieCat, emp: round(hScore.emp, 3), empCat: hScore.empCat },
    hit25: rank <= 25, hit10: rank <= 10, hit5: rank <= 5, hit3: rank <= 3,
  });
}

// ---- report -------------------------------------------------------------
// "Headhunter longlist" framing: the product goal is the union of both
// pathways giving the widest good candidate set, so recall at a few list
// sizes (not just a strict top-10) is the metric that actually matters --
// hit@25 answers "would this person have been in the set at all," which is
// closer to what a headhunter reviewing a longlist experiences than hit@3.
function reportOn(label, rows) {
  if (!rows.length) { console.log(`${label}: (no cases)`); return; }
  const pct = (n) => round((n / rows.length) * 100, 1);
  const c25 = rows.filter((r) => r.hit25).length, c10 = rows.filter((r) => r.hit10).length;
  const c5 = rows.filter((r) => r.hit5).length, c3 = rows.filter((r) => r.hit3).length;
  console.log(`${label} (n=${rows.length}):`);
  console.log(`  Hit @25: ${c25}/${rows.length} (${pct(c25)}%)`);
  console.log(`  Hit @10: ${c10}/${rows.length} (${pct(c10)}%)`);
  console.log(`  Hit @5:  ${c5}/${rows.length} (${pct(c5)}%)`);
  console.log(`  Hit @3:  ${c3}/${rows.length} (${pct(c3)}%)`);
}

console.log(`N = ${results.length} (seed ${SEED}, mode ${MODE})`);
console.log("");
reportOn("Combined", results);
if (MODE === "stratified") {
  console.log("");
  reportOn("  General stratum", results.filter((r) => r.stratum === "general"));
  reportOn("  Connected-eligible stratum", results.filter((r) => r.stratum === "connected"));
  const connectedRows = results.filter((r) => r.stratum === "connected");
  const carriedByTieOrEmp = connectedRows.filter((r) => r.hit10 && (r.signals.tieCat || r.signals.empCat)).length;
  console.log(`  Of the connected-eligible hits@10, ${carriedByTieOrEmp}/${connectedRows.filter((r) => r.hit10).length} had a nonzero tie or employer signal (the rest were carried by trait-fit alone despite being eligible).`);
}
const zeroSignal = results.filter((r) => r.hScore <= 0).length;
console.log("");
console.log(`No positive signal at all (score <= 0): ${zeroSignal}/${results.length}`);
console.log("");
console.log("By index:");
const byIdx = {};
for (const r of results) { (byIdx[r.index] ||= []).push(r); }
for (const [id, rs] of Object.entries(byIdx)) {
  const h = rs.filter((r) => r.hit10).length;
  console.log(`  ${id}: ${h}/${rs.length} hit@10`);
}
console.log("");
console.log("Per-case detail:");
for (const r of results.sort((a, b) => a.rank - b.rank)) {
  console.log(`  [rank ${String(r.rank).padStart(3)}/${r.poolSize}] ${r.hit10 ? "HIT " : "miss"} (${r.stratum}) ${r.dean} — ${r.university} (${r.index}, ${r.startYear}) score=${r.hScore} [trait=${r.signals.trait} tie=${r.signals.tie}${r.signals.tieCat ? "/" + r.signals.tieCat : ""} emp=${r.signals.emp}${r.signals.empCat ? "/" + r.signals.empCat : ""}]`);
}
