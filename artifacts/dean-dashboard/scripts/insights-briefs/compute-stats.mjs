// Weekly staleness check for every published Insights research brief
// (src/components/Insights.tsx's REPORTS array). Read-only: recomputes each
// brief's headline claims directly from the live src/data/*.json datasets
// and diffs against what's currently published, per-claim, with a tolerance.
// Does NOT touch the PDFs, the cover images, or Insights.tsx -- regenerating
// prose/charts is a judgment call (a claim can drift enough to invalidate an
// ORDERING or SUPERLATIVE in the prose, not just a number), so that stays a
// deliberate follow-up step, not something this script does unsupervised.
// See the "Insights brief refresh" Routine (weekly) for how this is used:
// it runs this script and opens a draft PR ONLY when something is flagged,
// summarizing exactly what drifted so the regeneration is targeted, not blind.
//
//   node scripts/insights-briefs/compute-stats.mjs
//
// Exit code 0 always (this is a report, not a build gate) -- check the
// printed summary and the "FLAGGED" section for anything that needs action.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "data");
const read = (f) => JSON.parse(readFileSync(join(SRC, f), "utf8"));
const pct = (a, b) => (100 * a / b);
const round1 = (x) => Math.round(x * 10) / 10;

// Mirrors gen-scout-insights.mjs's originCategory classifier (the corrected,
// institution-name-aware one) -- kept independent/duplicated on purpose, same
// as every other generator script in this repo.
const DEAN_TITLE_RE = /\bdean\b/i;
const NON_HEAD_DEAN_RE = /(assoc|asst|assistant|vice|interim|deputy)[^,]*\bdean\b/i;
const SCHOOL_DOMAIN_RE = {
  business: /business school|school of business|college of business|school of management/i,
  law: /law school|school of law|college of law/i,
  nursing: /school of nursing|college of nursing/i,
  pharmacy: /school of pharmacy|college of pharmacy/i,
};
function isDean(priorTitle) {
  return DEAN_TITLE_RE.test(priorTitle || "") && !NON_HEAD_DEAN_RE.test(priorTitle || "");
}
function isSameType(row, type) {
  const re = SCHOOL_DOMAIN_RE[type];
  if (!re) return null; // no domain regex for this field -- can't split same/other
  return re.test(row.priorTitle || "") || re.test(row.priorInstitution || "");
}

function trueExternalHires(rows, { minYear = 1990, maxYear = 2025 } = {}) {
  return rows.filter((r) => r.roleType !== "subdean" && r.startYear >= minYear && r.startYear <= maxYear
    && r.isExternal === true && !r.fromSameUniversityDiffSchool && r.priorTitle);
}

function interimOutcomes(rows) {
  const hires = rows.filter((r) => r.roleType !== "subdean" && r.startYear != null);
  const bySchool = {};
  for (const r of hires) {
    const key = r.university + "||" + (r.school || "");
    (bySchool[key] = bySchool[key] || []).push(r);
  }
  for (const arr of Object.values(bySchool)) arr.sort((a, b) => a.startYear - b.startYear);
  let converted = 0, extNext = 0, otherInternal = 0, anotherInterim = 0;
  for (const arr of Object.values(bySchool)) {
    for (let i = 0; i < arr.length; i++) {
      const cur = arr[i];
      if (!cur.isInterim) continue;
      const next = arr[i + 1];
      if (!next) continue;
      if (next.dean === cur.dean && !next.isInterim) converted++;
      else if (next.isInterim) anotherInterim++;
      else if (next.isExternal) extNext++;
      else otherInternal++;
    }
  }
  const resolved = converted + extNext + otherInternal + anotherInterim;
  return { resolved, convertedPct: pct(converted, resolved), extPct: pct(extNext, resolved) };
}

// { briefId, claim label, published value, computed value, tolerance (pp), unit }
const checks = [];
function check(briefId, label, published, computed, tolerance, unit = "pp") {
  checks.push({ briefId, label, published, computed: round1(computed), diff: round1(Math.abs(computed - published)), tolerance, unit });
}
function unverifiable(briefId, label, reason) {
  checks.push({ briefId, label, published: null, computed: null, diff: null, tolerance: null, unit: null, unverifiable: reason });
}

// ---- prior-position (The Path Before the Deanship) ----
{
  const rows = read("r1-bschool-deans.json");
  const hires = rows.filter((r) => r.roleType !== "subdean" && r.startYear >= 1990 && r.startYear <= 2025);
  const ext = trueExternalHires(rows);
  const cats = ext.map((r) => (isDean(r.priorTitle) ? (isSameType(r, "business") ? "same" : "other") : null));
  const deanElsewhereN = cats.filter(Boolean).length;
  const sameN = cats.filter((c) => c === "same").length;
  check("prior-position", "Combined dean-elsewhere share of true-external hires", 32.0, pct(deanElsewhereN, ext.length), 2.5);
  check("prior-position", "Same-type share of dean-elsewhere hires", 78.2, pct(sameN, deanElsewhereN), 4);
  const interim = interimOutcomes(rows);
  check("prior-position", "Interim -> converted to permanent", 17.2, interim.convertedPct, 4);
  check("prior-position", "Interim -> succeeded by external hire", 60.8, interim.extPct, 6);
  const ext2020s = ext.filter((r) => r.era === "2020s");
  const de2020s = ext2020s.filter((r) => isDean(r.priorTitle)).length;
  check("prior-position", "2020s dean-elsewhere share (era trend, most likely to drift)", 39.2, pct(de2020s, ext2020s.length), 4);
}

// ---- lateral-divide (The Lateral Dean Divide) ----
{
  const FILE_ID = {
    "r1-bschool-deans.json": ["r1bschool", "business"], "r1-lawschool-deans.json": ["r1law", "law"],
    "r1-nursing-deans.json": ["usnursing", "nursing"], "r1-pharmacy-deans.json": ["uspharmacy", "pharmacy"],
    "r1-provost-deans.json": ["r1provost", null],
  };
  const published = { r1bschool: 32.0, r1law: 30.9, usnursing: 31.2, uspharmacy: 33.3, r1provost: 57.4 };
  for (const [file, [id, type]] of Object.entries(FILE_ID)) {
    const rows = read(file);
    const ext = trueExternalHires(rows);
    const deN = ext.filter((r) => isDean(r.priorTitle)).length;
    check("lateral-divide", `${id}: dean-elsewhere share of true-external hires`, published[id], pct(deN, ext.length), 2.5);
  }
}

// ---- discipline (The Discipline Behind the Dean) + gender (Gendered Pathways) ----
// Both briefs share the same r1bschool census; only the era-trend claims below
// are cheaply re-derivable from this repo's data. Their discipline-specific
// representation/promotion RATIOS (1.38x for OM, female promotion ratio by
// discipline) require an external senior-faculty-by-discipline benchmark
// (AACSB data) this repo doesn't store, so those are marked unverifiable
// rather than silently skipped.
{
  const rows = read("r1-bschool-deans.json");
  const hires = rows.filter((r) => r.roleType !== "subdean");
  const firstEra = hires.filter((r) => r.startYear >= 1990 && r.startYear <= 1995);
  const lastEra = hires.filter((r) => r.startYear >= 2016 && r.startYear <= 2025);
  check("discipline", "Interim share, 1990-95", 18, pct(firstEra.filter((r) => r.isInterim).length, firstEra.length), 3);
  check("discipline", "Interim share, 2016-25", 38, pct(lastEra.filter((r) => r.isInterim).length, lastEra.length), 4);
  check("gender", "Female share, 1990-95", 1.2, pct(firstEra.filter((r) => r.isFemale).length, firstEra.length), 1.5);
  check("gender", "Female share, 2016-25", 31.4, pct(lastEra.filter((r) => r.isFemale).length, lastEra.length), 4);
  unverifiable("discipline", "OM representation ratio (1.38x)", "needs external AACSB senior-faculty-by-discipline benchmark, not stored in this repo");
  unverifiable("gender", "Female promotion ratio by discipline (28% strategy vs 6.5% operations)", "needs external AACSB senior-faculty-by-gender-by-discipline benchmark, not stored in this repo");
}

// ---- deanship-clock (The Graduate Deanship Clock) ----
// Only the cheaply-recomputable structural claims; the Kaplan-Meier-corrected
// 7yr median and the year-by-year hazard curve require re-implementing the
// survival model, not just a rate lookup -- left as unverifiable here rather
// than approximated. Re-run that analysis by hand if the naive/population
// numbers below have drifted materially.
{
  const rows = read("r1-grad-deans.json");
  const hires = rows.filter((r) => r.roleType !== "subdean");
  check("deanship-clock", "Total graduate-dean appointments tracked", 277, hires.length, 15, "count");
  const withPrior = hires.filter((r) => r.priorTitle);
  const feederRe = /associate dean|assistant dean|vice provost|associate provost|interim/i;
  const feederN = withPrior.filter((r) => feederRe.test(r.priorTitle)).length;
  check("deanship-clock", "Promoted from an explicit feeder title", 42, pct(feederN, withPrior.length), 5);
  unverifiable("deanship-clock", "Kaplan-Meier median tenure (7yr) and hazard curve", "requires re-running the survival-analysis model, not a simple rate lookup");
}

// ---- report ----
const flagged = checks.filter((c) => !c.unverifiable && c.diff > c.tolerance);
const clean = checks.filter((c) => !c.unverifiable && c.diff <= c.tolerance);
const skipped = checks.filter((c) => c.unverifiable);

console.log(`Insights brief staleness check -- ${new Date().toISOString().slice(0, 10)}`);
console.log(`${checks.length} claims checked across 5 briefs: ${clean.length} within tolerance, ${flagged.length} FLAGGED, ${skipped.length} unverifiable from repo data alone.\n`);

if (flagged.length) {
  console.log("FLAGGED -- drifted beyond tolerance, needs a look before the next refresh:");
  for (const c of flagged) {
    console.log(`  [${c.briefId}] ${c.label}: published ${c.published}${c.unit}, now ${c.computed}${c.unit} (diff ${c.diff}${c.unit}, tolerance ${c.tolerance}${c.unit})`);
  }
  console.log();
}
console.log("Within tolerance:");
for (const c of clean) {
  console.log(`  [${c.briefId}] ${c.label}: published ${c.published}${c.unit}, now ${c.computed}${c.unit} (diff ${c.diff}${c.unit})`);
}
console.log("\nUnverifiable from repo data alone (needs an external benchmark or a re-run model, not just a rate lookup):");
for (const c of skipped) {
  console.log(`  [${c.briefId}] ${c.label} -- ${c.unverifiable}`);
}

process.exitCode = 0;
