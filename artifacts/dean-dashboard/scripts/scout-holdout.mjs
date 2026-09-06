// Out-of-sample validation: hold out the last three years of appointments, run
// the model as it would have run BEFORE each of those hires, and measure where
// the person actually hired came out.
//
//   node scripts/scout-holdout.mjs [cutoffYear] [--json <path>]
//
// cutoffYear (default 2023): appointments starting in or after this year are the
// holdout. Everything before it is what the model may learn from.
//
// WHY THIS IS DIFFERENT FROM scout-backtest.mjs
// --------------------------------------------
// The backtest samples hires from any year since 2000 and re-mines trait weights
// leave-one-out per case. That answers "does the model recognise a hire it was
// not itself trained on". It does NOT answer the question a buyer asks, which is
// "if I had run this before the hires that just happened, would the person they
// picked have been on the list" -- because leave-one-out still lets the weights
// see every OTHER recent hire, including ones made after the case in hand.
//
// So here the split is by TIME, not by row: the model is mined once per index
// from appointments that had already happened by the cutoff, and then every
// appointment since is scored against it. That is the split that supports a
// claim about the future, and it is the one this run reports.
//
// WHAT IS AND IS NOT OUT OF SAMPLE
// --------------------------------
// Trait lifts ARE re-mined from pre-cutoff appointments only.
//
// Tie-category lifts (scout-insights.json) and employer-category lifts
// (employer-affinity.json) are NOT: both are shipped artifacts mined across the
// whole corpus, holdout window included, and re-mining them per run means
// redoing a corpus-wide baseline pass. Rather than quietly present a number that
// has seen its own test set, this reports TWO models:
//
//   clean -- trait fit only. Nothing in it saw the holdout window. This is the
//            number to quote.
//   full  -- trait + tie + employer, i.e. what ships. Optimistic by an unknown
//            margin wherever the tie or employer components fire.
//
// The gap between them is the size of the question, and it is printed.
//
// THE CEILING NOBODY QUOTES
// -------------------------
// A rank only means something if the person could have appeared at all. The
// product builds its pool from the school's feeder bench, its affinity ties, and
// its employer weak links; a hire reachable through none of those would never be
// shown at any list length, however well they score. So "reachable" is reported
// first, and every hit rate is over EVERY holdout hire -- an unreachable hire is
// a miss, not an exclusion. The in-pool subset is reported too, as a diagnostic,
// but the honest headline is the one with the full denominator.
//
// KNOWN APPROXIMATIONS, unchanged from the backtest and just as real here:
//  - The feeder bench is a current-roster snapshot with 37 start dates across
//    11,930 records, so it cannot be rolled back to the hire year. Bench
//    competitors are today's bench. This is F14's problem, not one this script
//    can fix.
//  - Affinity evidence IS date-filtered per hire year, as in the backtest.
//  - Competitors whose own record begins at or after the hire year are dropped:
//    they were not knowable then. The count is reported, since it changes the
//    field a hire is ranked against.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { assertRegistered, FILE_ID } from "./lib/indices.mjs";
import {
  traitsForIndex, traitFitScore, affinityTieFitScore, employerMatchScoreFor,
  dateFilteredAffEntry, hasGenuinePreexistingTie, round,
} from "./lib/scout-model.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data");
assertRegistered(SRC);
const read = (f) => JSON.parse(readFileSync(join(SRC, f), "utf8"));

const args = process.argv.slice(2);
const CUTOFF = parseInt(args.find((a) => /^\d{4}$/.test(a)) ?? "", 10) || 2023;
const jsonIdx = args.indexOf("--json");
const JSON_OUT = jsonIdx >= 0 ? args[jsonIdx + 1] : null;

const scoutInsights = read("scout-insights.json");
const employerAffinity = read("employer-affinity.json");
const affinityBySchool = read("affinity-by-school.json");

const ROWS_BY_INDEX = {};
for (const [f, id] of Object.entries(FILE_ID)) ROWS_BY_INDEX[id] = read(f);

const nameL = (s) => String(s ?? "").trim().toLowerCase();

// Indexed once, by name and by name+university. scout-backtest.mjs rescans the
// flat corpus per lookup, which is fine for the 50 cases it samples; this run
// scores every appointment since the cutoff against a pool each, and the same
// two scans took it from under a minute to over an hour.
const BY_NAME = new Map();
const BY_NAME_UNI = new Map();
for (const [id, rows] of Object.entries(ROWS_BY_INDEX)) {
  for (const r of rows) {
    const n = nameL(r.dean);
    const byName = BY_NAME.get(n);
    if (byName) byName.push(r); else BY_NAME.set(n, [r]);
    const k = `${n}|${nameL(r.university)}`;
    const byBoth = BY_NAME_UNI.get(k);
    if (byBoth) byBoth.push(r); else BY_NAME_UNI.set(k, [r]);
  }
}
function resolveDean(name, university) {
  const matches = BY_NAME_UNI.get(`${nameL(name)}|${nameL(university)}`);
  if (!matches?.length) return null;
  return matches.find((d) => d.endYear == null) ?? [...matches].sort((a, b) => (b.startYear || 0) - (a.startYear || 0))[0];
}
/** Earliest year this person appears anywhere in the corpus, or null if undated. */
const FIRST_SEEN = new Map();
function firstSeenYear(name) {
  const n = nameL(name);
  if (FIRST_SEEN.has(n)) return FIRST_SEEN.get(n);
  let min = null;
  for (const d of BY_NAME.get(n) ?? []) if (typeof d.startYear === "number" && (min == null || d.startYear < min)) min = d.startYear;
  FIRST_SEEN.set(n, min);
  return min;
}

// ---- train once per index, on appointments that had already happened --------
const TRAINED = {};
for (const [id, rows] of Object.entries(ROWS_BY_INDEX)) {
  const idx = scoutInsights[id];
  if (!idx) continue;
  const trainRows = rows.filter((r) => r.roleType !== "subdean" && typeof r.startYear === "number" && r.startYear < CUTOFF);
  const benchRows = rows.filter((r) => r.roleType === "subdean");
  TRAINED[id] = { idx, traits: traitsForIndex(trainRows, benchRows, idx.hasFeederBench), trainN: trainRows.length };
}

// ---- the holdout cohort: every appointment since the cutoff -----------------
const cohort = [];
for (const [id, rows] of Object.entries(ROWS_BY_INDEX)) {
  if (!TRAINED[id]) continue;
  for (const r of rows) {
    if (r.roleType === "subdean" || typeof r.startYear !== "number" || r.startYear < CUTOFF) continue;
    if (!r.dean || !r.university || /^\(/.test(r.dean.trim())) continue;
    cohort.push({ ...r, __index: id });
  }
}

// ---- score each holdout hire against the field as of that year --------------
const results = [];
for (const H of cohort) {
  const id = H.__index;
  const { idx, traits } = TRAINED[id];
  const allRows = ROWS_BY_INDEX[id];
  const employerProfile = employerAffinity[id]?.schools[H.university];
  const uniAff = affinityBySchool[H.university] || [];
  const affOf = (name) => uniAff.find((e) => nameL(e.name) === nameL(name));

  function scoreOf(dean, affEntryRaw) {
    const trait = traitFitScore(dean, traits);
    const affFiltered = affEntryRaw ? dateFilteredAffEntry(affEntryRaw, H.startYear) : { admin: [], faculty: [], grad: [], undergrad: [] };
    const tie = affinityTieFitScore(affFiltered, idx).score;
    const emp = employerMatchScoreFor(dean.priorInstitution, employerProfile).score;
    return { clean: trait, full: trait + tie + emp, trait, tie, emp };
  }

  const hAff = affOf(H.dean);
  const h = scoreOf(H, hAff);

  const schoolRows = allRows.filter((d) => d.university === H.university);
  // Anyone else who has ever held this seat is not a candidate for it.
  const everHeld = new Set(schoolRows.filter((d) => d.roleType !== "subdean" && nameL(d.dean) !== nameL(H.dean)).map((d) => nameL(d.dean)));

  // Was this person reachable BEFORE the hire? Their own record at this school
  // exists today and so does their affinity entry for it -- both created BY the
  // appointment we are trying to predict -- so neither counts. What counts is a
  // seat on this school's feeder bench, an affinity tie with evidence predating
  // the hire year, or a place in its employer weak links. Without this the answer
  // is "100% reachable", which is not a finding, it is the appointment being read
  // back to us.
  const hireIsBench = schoolRows.some((d) => d.roleType === "subdean" && nameL(d.dean) === nameL(H.dean));
  const hireHasPriorTie = hasGenuinePreexistingTie(hAff, H.startYear);
  const hireIsWeakLink = !!employerProfile?.weakLinks?.some((w) => nameL(w.name) === nameL(H.dean));
  const hireReachable = hireIsBench || hireHasPriorTie || hireIsWeakLink;

  const pool = [];
  const seen = new Set();
  let droppedAsOf = 0;
  function addCandidate(name, university, affEntryRaw) {
    const n = nameL(name);
    if (n === nameL(H.dean)) return;
    if (everHeld.has(n) || seen.has(n)) return;
    seen.add(n);
    // As of the hire year: someone whose own record starts later was not
    // knowable then. Undated (the feeder bench) cannot be filtered and stays.
    const first = firstSeenYear(name);
    if (first != null && first >= H.startYear) { droppedAsOf++; return; }
    const resolved = resolveDean(name, university) ?? { priorInstitution: "" };
    pool.push(scoreOf(resolved, affEntryRaw));
  }
  for (const d of schoolRows) {
    if (d.roleType !== "subdean") continue;
    addCandidate(d.dean, d.university, affOf(d.dean));
  }
  for (const e of uniAff) addCandidate(e.name, e.university, e);
  if (employerProfile) for (const w of employerProfile.weakLinks) addCandidate(w.name, w.university, affOf(w.name));

  const rankIn = (key) => 1 + pool.filter((p) => p[key] > h[key]).length;
  results.push({
    dean: H.dean, university: H.university, index: id, year: H.startYear,
    reachable: hireReachable,
    reach: { bench: hireIsBench, tie: hireHasPriorTie, weakLink: hireIsWeakLink },
    poolSize: pool.length + 1,
    droppedAsOf,
    clean: { score: round(h.clean), rank: rankIn("clean") },
    full: { score: round(h.full), rank: rankIn("full") },
    signals: { trait: round(h.trait), tie: round(h.tie), emp: round(h.emp) },
  });
}

// ---- report -----------------------------------------------------------------
const KS = [3, 5, 10, 25];
const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : "—");

function summarise(rows, key) {
  // An unreachable hire is a miss at every k: the product would never have shown
  // them, whatever they scored.
  const hits = Object.fromEntries(KS.map((k) => [k, rows.filter((r) => r.reachable && r[key].rank <= k).length]));
  // Chance has to play by the same rules. A shuffled list can only surface
  // somebody who is in the pool, so an unreachable hire is a miss for chance
  // too -- scoring chance over every case (as if the pool always contained the
  // hire) compares the model against a baseline with an advantage the model
  // does not have, and made the model look worse than chance at every k.
  const chance = Object.fromEntries(KS.map((k) => [k, rows.reduce((s, r) => s + (r.reachable ? Math.min(k, r.poolSize) / r.poolSize : 0), 0)]));
  const ranks = rows.filter((r) => r.reachable).map((r) => r[key].rank).sort((a, b) => a - b);
  const median = ranks.length ? ranks[Math.floor((ranks.length - 1) / 2)] : null;
  const mrr = rows.reduce((s, r) => s + (r.reachable ? 1 / r[key].rank : 0), 0) / (rows.length || 1);
  const pctile = rows.filter((r) => r.reachable).map((r) => r[key].rank / r.poolSize);
  const medPctile = pctile.length ? pctile.sort((a, b) => a - b)[Math.floor((pctile.length - 1) / 2)] : null;
  return { hits, chance, median, mrr, medPctile, n: rows.length };
}

function report(label, rows) {
  if (!rows.length) { console.log(`${label}: (no cases)`); return; }
  const reachable = rows.filter((r) => r.reachable).length;
  console.log(`\n${label} — ${rows.length} appointments since ${CUTOFF}`);
  console.log(`  Reachable at all (bench, affinity tie or weak link): ${reachable}/${rows.length} (${pct(reachable, rows.length)})`);
  console.log(`  ${"".padEnd(10)} ${"clean".padStart(16)} ${"full (optimistic)".padStart(20)} ${"chance".padStart(10)}`);
  const c = summarise(rows, "clean"), f = summarise(rows, "full");
  for (const k of KS) {
    const line = `  hit@${String(k).padEnd(3)}`;
    const cs = `${c.hits[k]} (${pct(c.hits[k], rows.length)})`;
    const fs = `${f.hits[k]} (${pct(f.hits[k], rows.length)})`;
    const ch = `${(c.chance[k]).toFixed(1)} (${pct(c.chance[k], rows.length)})`;
    console.log(`${line.padEnd(12)} ${cs.padStart(16)} ${fs.padStart(20)} ${ch.padStart(10)}`);
  }
  // Among the reachable subset: how well it ranks a hire it can actually see,
  // with reachability set aside. The diagnostic, not the headline.
  if (reachable) {
    const cr = summarise(rows.filter((r) => r.reachable), "clean");
    console.log(`  ${"".padEnd(10)} ${"— of the reachable subset —".padStart(38)}`);
    for (const k of KS) {
      console.log(`  hit@${String(k).padEnd(3)}`.padEnd(12) + `${cr.hits[k]} (${pct(cr.hits[k], reachable)})`.padStart(16) + `${""}`.padStart(20) + `${pct(cr.chance[k], reachable)}`.padStart(10));
    }
  }
  console.log(`  median rank (reachable)  ${String(c.median ?? "—").padStart(5)}${" ".repeat(11)}${String(f.median ?? "—").padStart(5)}`);
  console.log(`  median percentile        ${c.medPctile != null ? (c.medPctile * 100).toFixed(1) + "%" : "—"}${" ".repeat(9)}${f.medPctile != null ? (f.medPctile * 100).toFixed(1) + "%" : "—"}`);
  console.log(`  MRR                      ${c.mrr.toFixed(3)}${" ".repeat(9)}${f.mrr.toFixed(3)}`);
}

console.log(`Out-of-sample holdout: trained on appointments before ${CUTOFF}, tested on every appointment since.`);
console.log(`Indices with mined insights: ${Object.keys(TRAINED).length}. Training rows per index: ${Object.entries(TRAINED).map(([id, t]) => `${id}=${t.trainN}`).join(", ")}`);
report("ALL HOLDOUT APPOINTMENTS", results);

const avgPool = results.reduce((s, r) => s + r.poolSize, 0) / (results.length || 1);
const avgDropped = results.reduce((s, r) => s + r.droppedAsOf, 0) / (results.length || 1);
console.log(`\nField: ${avgPool.toFixed(1)} candidates per case on average, after dropping ${avgDropped.toFixed(1)} per case whose own record starts at or after the hire year.`);

console.log("\nBy index (clean model, hit@10 over every holdout appointment):");
const byIdx = {};
for (const r of results) (byIdx[r.index] ||= []).push(r);
for (const [id, rs] of Object.entries(byIdx).sort((a, b) => b[1].length - a[1].length)) {
  const reach = rs.filter((r) => r.reachable).length;
  const s = summarise(rs, "clean");
  // Chance is printed beside every hit rate on purpose. A school whose whole pool
  // is eight people gives hit@10 = 100% to any ranking at all, and an index made
  // of such schools would otherwise read as the best-performing one here.
  console.log(`  ${id.padEnd(20)} n=${String(rs.length).padStart(4)}  reachable ${pct(reach, rs.length).padStart(6)}  hit@10 ${pct(s.hits[10], rs.length).padStart(6)}  (chance ${pct(s.chance[10], rs.length).padStart(6)})`);
}

if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify({ cutoff: CUTOFF, generated: new Date().toISOString().slice(0, 10), results }, null, 2));
  console.log(`\nPer-case detail -> ${JSON_OUT}`);
}
