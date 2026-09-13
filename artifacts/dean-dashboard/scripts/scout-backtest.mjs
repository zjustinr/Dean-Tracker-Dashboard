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
//  - Tie-CATEGORY weighting (admin vs. faculty vs. grad vs. undergrad) uses
//    gen-scout-insights.mjs's shipped idx.tieLift, which validates against a
//    corpus-wide external-hire baseline -- but like the employer-affinity
//    figures below, tieLift itself is NOT re-mined leave-one-out per test case
//    here (that pass re-derives a global baseline across every index, too
//    expensive to redo per hire); it's the shipped, already-validated figures.
//    Only 5 of 19 indices currently clear that validation gate at all -- the
//    rest correctly contribute 0 for every tie category, not a guess.
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
// The scoring logic now lives in lib/scout-model.mjs, shared with
// scout-holdout.mjs, so the two offline checks cannot drift into testing two
// different models. It is still a mirror of gen-scout-insights.mjs,
// gen-employer-affinity.mjs and ScoutAssistant.tsx: if you change how
// ScoutAssistant.tsx scores candidates, change the lib too, or both checks
// silently stop testing what is actually shipped.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { assertRegistered, FILE_ID } from "./lib/indices.mjs";
import {
  traitsForIndex, traitFitScore, affinityTieFitScore, employerMatchScoreFor,
  dateFilteredAffEntry, hasGenuinePreexistingTie, evidenceYear, mulberry32, seededShuffle, round,
} from "./lib/scout-model.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data");

assertRegistered(SRC);
const read = (f) => JSON.parse(readFileSync(join(SRC, f), "utf8"));

const N = parseInt(process.argv[2], 10) || 50;
const SEED = parseInt(process.argv[3], 10) || 20260809;
const MODE = process.argv[4] === "stratified" ? "stratified" : "random";

// FILE_ID / INDEX_LABEL now come from lib/indices.mjs. They used to be copied
// into each generator on the theory that standalone scripts should stay
// independent; in practice the copies drifted -- scout-backtest.mjs never
// learned about r1-adminleaders-deans.json, the largest index -- so a new index
// silently reached some passes and not others.

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


// ---- build eligible sample: currently-sitting leaders hired since 2000 -----
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
  const traitsLOO = traitsForIndex(hireRowsLOO, benchRows, hasFeederBench);
  const employerProfile = employerAffinity[id]?.schools[H.university];

  function scoreOf(dean, affEntryRaw) {
    const t = traitFitScore(dean, traitsLOO);
    const affFiltered = affEntryRaw ? dateFilteredAffEntry(affEntryRaw, H.startYear) : { admin: [], faculty: [], grad: [], undergrad: [] };
    const { score: tieScore, category: tieCat } = affinityTieFitScore(affFiltered, idx);
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
