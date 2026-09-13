/**
 * The Scout Assistant scoring model, as a library, so every offline check runs
 * the SAME model rather than its own copy of it.
 *
 * These pieces used to be copied into scripts/scout-backtest.mjs (and are still
 * mirrored from gen-scout-insights.mjs, gen-employer-affinity.mjs and
 * ScoutAssistant.tsx, which each run standalone). The copies are what this file
 * exists to stop multiplying: the same directory's lib/indices.mjs was created
 * after a drifted copy meant scout-backtest never learned about the largest
 * index, and a second backtest with a second copy of the scorer would be the
 * same bug waiting to happen -- with the twist that a drifted scorer does not
 * crash, it just reports a number for a model nobody ships.
 *
 * If you change how ScoutAssistant.tsx scores candidates, change it here too.
 */

// ---- mined trait lifts (mirrors gen-scout-insights.mjs) --------------------
export const PRE_HIRE_BOOL = [
  "hasPhd", "fromEliteInstitution", "priorInstitutionElite", "hasPriorDeanExp",
  "hadAssocDeanRole", "hadDeptChairRole", "hasIndustryExp", "hasConsultingBg",
  "isFirstTimeDean", "hadPriorConnection", "hasInstitutionalLink", "fromSameUniversityDiffSchool",
];
export const PRE_HIRE_CATEGORICAL = ["disciplineBroad", "careerBackground", "connectionType", "origin"];
export const MIN_N = 8;
export const RECENT_YEARS = 15;
export const ENRICHMENT_ARTIFACT_BAND = [0.02, 0.98];
export const round = (x, d = 3) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
export const rate = (rows, pred) => (rows.length ? rows.filter(pred).length / rows.length : null);
export function liftEntry(field, value, kind, numRows, denomRows, pred) {
  if (numRows.length < MIN_N || denomRows.length < MIN_N) return null;
  const r1 = rate(numRows, pred), r2 = rate(denomRows, pred);
  if (!r2) return null;
  if (kind === "promotion") {
    const [lo, hi] = ENRICHMENT_ARTIFACT_BAND;
    if (r1 <= lo || r1 >= hi || r2 <= lo || r2 >= hi) return null;
  }
  return { field, value, kind, rate: round(r1), compareRate: round(r2), lift: round(r1 / r2, 2), n: numRows.length };
}
export function topValues(rows, field, max = 6) {
  const counts = new Map();
  for (const r of rows) { const v = r[field]; if (v === undefined || v === null || v === "" || v === "Unknown") continue; counts.set(v, (counts.get(v) || 0) + 1); }
  return [...counts.entries()].filter(([, n]) => n >= MIN_N).sort((a, b) => b[1] - a[1]).slice(0, max).map(([v]) => v);
}
export function computeLifts(numRows, denomRows, kind) {
  const out = [];
  for (const field of PRE_HIRE_BOOL) { const e = liftEntry(field, true, kind, numRows, denomRows, (r) => r[field] === true); if (e) out.push(e); }
  for (const field of PRE_HIRE_CATEGORICAL) for (const value of topValues(numRows, field)) { const e = liftEntry(field, value, kind, numRows, denomRows, (r) => r[field] === value); if (e) out.push(e); }
  return out;
}
export function traitsForIndex(hireRows, benchRows, hasFeederBench) {
  const years = hireRows.map((r) => r.startYear).filter((y) => typeof y === "number");
  const maxYear = years.length ? Math.max(...years) : null;
  const recentRows = maxYear != null ? hireRows.filter((r) => r.startYear >= maxYear - RECENT_YEARS) : [];
  const historicalRows = maxYear != null ? hireRows.filter((r) => r.startYear < maxYear - RECENT_YEARS) : [];
  const out = [];
  if (hasFeederBench) out.push(...computeLifts(hireRows, benchRows, "promotion"));
  if (recentRows.length >= MIN_N && historicalRows.length >= MIN_N) out.push(...computeLifts(recentRows, historicalRows, "trend"));
  return out;
}

// ---- employer categorisation (mirrors gen-employer-affinity.mjs) ----------
export const CATEGORY_PATTERNS = [
  ["Academic", /\b(university|college|institute of technology|polytechnic|school of|business school|graduate school|academy|insead|\bimd\b|georgia tech|virginia tech|caltech|cal tech|\bmit\b)\b/i],
  ["Government & Public Sector", /\b(department of|u\.?s\.? (army|navy|air force|government)|federal|white house|congress|senate|pentagon|\bnasa\b|\bnih\b|\bcdc\b|\bdarpa\b|federal reserve|world bank|united nations|city of|state of|ministry|\bdept\.? of\b)\b/i],
  ["Nonprofit & Foundation", /\b(foundation|nonprofit|non-profit|\bngo\b|charitable|philanthrop)\b/i],
  ["Law", /\b(law firm|\bllp\b|attorneys)\b/i],
  ["Healthcare & Biotech", /\b(hospital|health system|medical center|clinic|pharma|biotech|healthcare)\b/i],
  ["Finance & Consulting", /\b(bank|venture capital|private equity|capital partners|capital management|equity partners|equity firm|hedge fund|investment|mckinsey|bain\b|boston consulting|\bbcg\b|goldman sachs|morgan stanley|j\.?p\.?\s?morgan|deloitte|pricewaterhousecoopers|\bpwc\b|ernst\s?&?\s?young|\bkpmg\b|accenture|blackstone|vanguard|fidelity|wells fargo|citigroup|credit suisse|\bubs\b|consulting)\b/i],
  ["Media & Entertainment", /\b(disney|warner|broadcasting|entertainment|studios?\b|new york times|washington post)\b/i],
  ["Technology", /\b(google|microsoft|amazon|apple\b|meta\b|facebook|technolog|software|\bibm\b|intel\b|oracle\b|cisco\b|adobe\b|salesforce|tesla\b|spacex|nvidia|qualcomm|uber\b|airbnb|netflix|twitter|linkedin|computer)\b/i],
];
export function categorize(org) {
  const s = String(org || "").trim();
  if (!s) return null;
  for (const [cat, re] of CATEGORY_PATTERNS) if (re.test(s)) return cat;
  return "Other";
}

// ---- candidate scoring (mirrors ScoutAssistant.tsx) -----------------------
// Tie-category weighting now comes straight from gen-scout-insights.mjs's
// validated tieLift (idx.tieLift.categories), computed against a corpus-wide
// external-hire baseline -- no more guessed fallback constant. An index with
// no validated tieLift contributes 0 for every tie, not a guess.
export function traitFitScore(d, traits) {
  const matched = traits.filter((t) => d[t.field] === t.value);
  return matched.reduce((s, t) => s + Math.log(t.lift), 0);
}
export function strongestCategory(e) {
  if (e.admin.length) return "admin";
  if (e.faculty.length) return "faculty";
  if (e.grad.length) return "grad";
  if (e.undergrad.length) return "undergrad";
  return null;
}
export function affinityTieFitScore(e, idx) {
  const cat = strongestCategory(e);
  if (!cat) return { score: 0, category: null };
  const c = idx.tieLift?.categories?.[cat];
  if (!c) return { score: 0, category: cat };
  return { score: Math.log(c.lift), category: cat };
}
export function employerMatchScoreFor(priorInstitution, employerProfile) {
  if (!employerProfile) return { score: 0, category: null };
  const cat = categorize(priorInstitution);
  const match = employerProfile.categories.find((c) => c.category === cat);
  return match ? { score: Math.log(match.lift), category: cat } : { score: 0, category: null };
}

// ---- date-filtering affinity evidence ------------------------------------
export function evidenceYear(ev) {
  const m = String(ev).match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}
export function filterEvidenceBefore(list, cutoffYear) {
  return list.filter((ev) => { const y = evidenceYear(ev); return y == null || y <= cutoffYear - 1; });
}
export function dateFilteredAffEntry(entry, cutoffYear) {
  return {
    admin: filterEvidenceBefore(entry.admin, cutoffYear),
    faculty: filterEvidenceBefore(entry.faculty, cutoffYear),
    grad: filterEvidenceBefore(entry.grad, cutoffYear),
    undergrad: filterEvidenceBefore(entry.undergrad, cutoffYear),
  };
}

// ---- deterministic PRNG + sample ------------------------------------------
export function mulberry32(seed) {
  let a = seed;
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function seededShuffle(rows, rng) {
  const a = rows.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---- a genuine tie that predates a hire ------------------------------------
export function hasGenuinePreexistingTie(entry, cutoffYear) {
  if (!entry) return false;
  for (const cat of ["admin", "faculty", "grad", "undergrad"]) {
    for (const ev of entry[cat]) { const y = evidenceYear(ev); if (y == null || y <= cutoffYear - 1) return true; }
  }
  return false;
}
