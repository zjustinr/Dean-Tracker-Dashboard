#!/usr/bin/env node
/**
 * Interim rate for R1 / R2 / R3 presidents, and whether it tracks the B-school dean
 * rate inside the same university.
 *
 * Two questions, and they need different treatment.
 *
 * **How often is the chair interim, by Carnegie tier?** A raw count over the files
 * answers the wrong question twice over: the files carry cabinet rosters alongside
 * appointment spells (see lib/interim-panel.mjs), and the R2/R3 research was capped
 * at appointments from about 1996 onward while the R1 index runs back to the 1950s.
 * Compare those uncapped and R1 looks calmer than it is, because a president who sat
 * from 1962 to 1984 contributes one non-interim appointment to a stretch of years in
 * which R2/R3 contributes nothing. So every cross-tier number here is computed on
 * appointments starting 1996 or later, which is the window all three tiers cover.
 * A point-in-time reading (is the seat interim *now*) is reported alongside, because
 * it needs no window at all and so cannot be a truncation artefact.
 *
 * **Does the president rate track the B-school dean rate within a university?** The
 * institution-level correlation is the obvious test and the weakest one: interim
 * shares built from four or five appointments are mostly noise, and noise attenuates
 * correlation toward zero, so a null there is close to uninformative. The test with
 * actual power is temporal -- whether a dean appointment made while the president's
 * chair is itself interim (or just vacated) is more likely to be an interim dean
 * appointment. Both are reported, and they do not agree, which is the finding.
 *
 * Tier assignment uses the schools files. Eleven institutions appear in both the R1
 * index and the R2/R3 index -- Boise State, Chapman, TCU, Wake Forest, Stevens and
 * UAH among them -- because the R1 index follows the 2025 Carnegie vintage (which
 * promoted them) while the R2/R3 universe is the 2021 vintage. They are counted as
 * R1, and --swap-vintage recomputes with them as R2/R3 so the choice is auditable.
 *
 *   node scripts/analyze-interim-rates.mjs [--swap-vintage] [--json]
 *
 * Exit status is always 0: this reports, it does not gate CI.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { keyOf } from "./lib/institution-key.mjs";
import {
  isChiefExecutiveSeat,
  surnameKey,
  dedupeSpells,
  pearson,
  spearman,
  permutationP,
  wilson,
  twoProportionP,
} from "./lib/interim-panel.mjs";
import { deriveInterim } from "./lib/seat-identity.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data");
const SWAP_VINTAGE = process.argv.includes("--swap-vintage");
/**
 * Which interim flag the analysis runs on.
 *
 * The corpus's own `isInterim` is the default and the published headline. The panel
 * export re-derives the flag from source evidence without ever consulting it
 * (scripts/lib/seat-identity.mjs), and the two disagree on 61 of 11,775 appointments
 * -- 20 of them R1-R3 president spells inside this analysis's window. They do NOT miss
 * it entirely, so the tier table reports BOTH columns rather than publishing one
 * number while the panel asserts another. `--derived` swaps which one drives the rest
 * of the analysis.
 *
 * The default stays legacy because the divergences are disagreements, not proven ETL
 * errors: most are a bare "President" title with silent notes against an ETL interim
 * flag, where the origin coding may well have known something the title does not say.
 * Publishing the derived column as the headline would assert a re-derivation the
 * corpus cannot yet adjudicate. The gap is stated instead, and it is small everywhere
 * except R3.
 */
const USE_DERIVED = process.argv.includes("--derived");
const EMIT_JSON = process.argv.includes("--json");

/** Window every cross-tier comparison is computed on -- the R2/R3 research floor. */
const WINDOW = 1996;
/** Latest appointment year in the corpus; used as the open end of a sitting spell. */
const NOW = 2026;

const read = (f) => JSON.parse(readFileSync(join(SRC, f), "utf8"));

// ---------------------------------------------------------------------------
// Panel construction
// ---------------------------------------------------------------------------

/**
 * Turn a leadership file into appointment spells.
 *
 * `seatFilter` decides which rows are the seat in question. For presidents that is
 * the title test; for B-school deans every row with a startYear already is a dean
 * spell (the associate deans are the rows without one), so it is the identity.
 */
function spellsFrom(file, seatFilter, seatLevel) {
  return read(file)
    .filter((r) => r.startYear && seatFilter(r, leaderTitleOf.get(keyOf(r.university))))
    .map((r) => {
      // The derivation never sees `r.isInterim`; where it reaches no conclusion the
      // legacy flag carries the row, exactly as the panel export does it.
      const ev = deriveInterim(r, { seatLevel, startYear: r.startYear, rowEndYear: r.endYear ?? NOW });
      const legacy = Boolean(r.isInterim);
      const derived = ev.derived === null ? legacy : ev.derived;
      return {
        institution: keyOf(r.university),
        display: r.university,
        person: r.dean,
        surname: surnameKey(r.dean),
        startYear: r.startYear,
        endYear: r.endYear ?? null,
        isInterimLegacy: legacy,
        isInterimDerived: derived,
        interimEvidence: ev.evidence,
        isInterim: USE_DERIVED ? derived : legacy,
      };
    });
}

// Carnegie tier per institution, from the schools files.
//
// The R2 and R3 universes overlap by construction (Abilene Christian is in both
// `universe_r2.json` and `universe_r3.json`), and the ETL resolved almost all of the
// overlap by name. One pair survives it: the 2025 rename of Texas A&M-Commerce to
// East Texas A&M left the institution in the schools file twice, R2 under the new
// name and R3 under the old one, and school-canon correctly folds the two names onto
// one institution. R2 wins ties, because appearing in the R2 universe is the stronger
// claim and last-write-wins would otherwise make the tier depend on file order.
const RANK = { R2: 2, R3: 1 };
const tierOf = new Map();
const leaderTitleOf = new Map();
for (const s of read("r1-r2public-schools.json")) {
  const k = keyOf(s.university);
  const prev = tierOf.get(k);
  if (!prev || (RANK[s.carnegie] || 0) > (RANK[prev] || 0)) tierOf.set(k, s.carnegie);
  if (s.leaderTitle) leaderTitleOf.set(k, s.leaderTitle);
}
const r1Index = new Set(read("r1-university-schools.json").map((s) => keyOf(s.university)));

const deans = dedupeSpells(spellsFrom("r1-bschool-deans.json", () => true, "dean"));
const dualVintage = new Set([...r1Index].filter((k) => tierOf.has(k)));
for (const k of r1Index) if (!SWAP_VINTAGE || !tierOf.has(k)) tierOf.set(k, "R1");

// The dual-vintage institutions repeat their whole history in both files, and the two
// copies disagree on details (Pace's Stephen Friedman is interim in one and permanent
// in the other). Reconciling row by row would mean adjudicating those disagreements;
// taking whichever file the tier decision assigned them to keeps one institution on
// one source's editorial judgement, which is the cleaner of the two options.
const presR1 = spellsFrom("r1-university-deans.json", isChiefExecutiveSeat, "president").filter(
  (s) => !(SWAP_VINTAGE && dualVintage.has(s.institution)),
);
const presR23 = spellsFrom("r1-r2public-deans.json", isChiefExecutiveSeat, "president").filter(
  (s) => !(!SWAP_VINTAGE && dualVintage.has(s.institution)),
);
const presidents = dedupeSpells([...presR1, ...presR23]).map((s) => ({
  ...s,
  tier: tierOf.get(s.institution) || "Unclassified",
}));

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------

const inWindow = (s) => s.startYear >= WINDOW;
const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "n/a");
const p3 = (x) => (Number.isFinite(x) ? (x < 0.0001 ? "<0.0001" : x.toFixed(4)) : "n/a");

/** Appointment-level interim share, with a Wilson interval. */
function rate(spells) {
  const n = spells.length;
  const k = spells.filter((s) => s.isInterim).length;
  const [lo, hi] = wilson(k, n);
  return { n, k, p: n ? k / n : NaN, lo, hi };
}

/** Group spells by institution. */
function byInstitution(spells) {
  const m = new Map();
  for (const s of spells) (m.get(s.institution) || m.set(s.institution, []).get(s.institution)).push(s);
  return m;
}

/**
 * Is the institution's chair interim right now?
 *
 * The sitting leader is the open-ended spell with the latest start; if an index left
 * no spell open, the latest-starting spell stands in. Truncation cannot touch this
 * number, which is why it is worth reporting next to the appointment rate.
 *
 * It has its own weakness, though, and the analysis leans on it only as a secondary
 * reading because of it. Checked against `university-presidents.json` -- a curated
 * snapshot of the sitting R1 president at 170 institutions -- this measure disagrees
 * on 9, and almost all of them are one failure mode: an interim spell the index never
 * closed out after a permanent successor arrived (Boise State's Jeremiah Shinn, UAH's
 * Charles Karr, Clemson's Robert Jones). Stale incumbency is a known corpus problem;
 * check-simultaneous-roles.mjs exists to hunt it. It inflates this number in every
 * tier, so the cross-tier *ordering* survives while the levels read high.
 */
function sittingInterimRate(spells) {
  const m = byInstitution(spells);
  let n = 0, k = 0;
  for (const [, list] of m) {
    const open = list.filter((s) => s.endYear === null);
    const pool = open.length ? open : list;
    const latest = pool.reduce((a, b) => (b.startYear > a.startYear ? b : a));
    n++;
    if (latest.isInterim) k++;
  }
  const [lo, hi] = wilson(k, n);
  return { n, k, p: n ? k / n : NaN, lo, hi };
}

const TIERS = ["R1", "R2", "R3"];
const tierSpells = Object.fromEntries(
  TIERS.map((t) => [t, presidents.filter((s) => s.tier === t)]),
);

const out = { window: WINDOW, swapVintage: SWAP_VINTAGE, tiers: {}, withinUniversity: {} };

console.log("=".repeat(78));
console.log("INTERIM RATE IN THE PRESIDENT'S CHAIR, BY CARNEGIE TIER");
console.log("=".repeat(78));
console.log(`Appointments starting ${WINDOW} or later (the window all three tiers cover).`);
console.log(
  SWAP_VINTAGE
    ? `Vintage: the ${dualVintage.size} dual-classified institutions counted as R2/R3.`
    : `Vintage: the ${dualVintage.size} dual-classified institutions counted as R1.`,
);
console.log();
console.log("tier  institutions  appts  interim   rate    95% CI            appts/inst  sitting now");
for (const t of TIERS) {
  const all = tierSpells[t];
  const r = rate(all.filter(inWindow));
  const sit = sittingInterimRate(all);
  const insts = byInstitution(all).size;
  out.tiers[t] = { institutions: insts, appointments: r, sitting: sit, apptsPerInstitution: r.n / insts };
  console.log(
    `${t.padEnd(6)}${String(insts).padStart(9)}` +
      `${String(r.n).padStart(9)}${String(r.k).padStart(8)}` +
      `${pct(r.p).padStart(9)}   [${pct(r.lo)}, ${pct(r.hi)}]`.padEnd(24) +
      `${(r.n / insts).toFixed(2).padStart(9)}   ${sit.k}/${sit.n} = ${pct(sit.p)}`,
  );
}
console.log();
console.log(
  "The appts/inst column is a coverage check, not a finding. R3 records about a quarter",
);
console.log(
  "fewer appointments per institution than R1 or R2 over the same 31 years. That is",
);
console.log(
  "either longer R3 tenures or thinner research, and interim spells -- often a single",
);
console.log(
  "year, and the easiest kind of spell for a source to omit -- are what thin research",
);
console.log("misses first. Read the R3 rate as a floor.");

// Pairwise tests between tiers on the appointment rate.
console.log();
// ---------------------------------------------------------------------------
// Legacy flag vs. re-derived flag
// ---------------------------------------------------------------------------
//
// The question this answers, asked at review: does the tier table above use the
// corpus's `isInterim` or the panel's re-derivation? It uses the legacy flag by
// default, and the two do not agree, so both are printed. Each panel is deduped on
// its own flag -- interim status is part of the dedupe key, because an
// interim-to-permanent conversion is two appointments and must not collapse into one
// -- so this is a full recomputation, not a recount over one panel.
const altPanel = dedupeSpells(
  [...presR1, ...presR23].map((x) => ({ ...x, isInterim: USE_DERIVED ? x.isInterimLegacy : x.isInterimDerived })),
).map((x) => ({ ...x, tier: tierOf.get(x.institution) || "Unclassified" }));

console.log("Legacy ETL flag vs. the panel's re-derivation from source evidence:");
console.log("tier   published (" + (USE_DERIVED ? "derived" : "legacy") + ")      alternative (" + (USE_DERIVED ? "legacy" : "derived") + ")     gap");
out.derivationSensitivity = { published: USE_DERIVED ? "derived" : "legacy", tiers: {} };
for (const t of TIERS) {
  const a = rate(tierSpells[t].filter(inWindow));
  const b = rate(altPanel.filter((x) => x.tier === t).filter(inWindow));
  out.derivationSensitivity.tiers[t] = { published: a, alternative: b };
  console.log(
    `${t.padEnd(6)} ${pct(a.p).padStart(6)} (${a.k}/${a.n})`.padEnd(28) +
      `${pct(b.p).padStart(6)} (${b.k}/${b.n})`.padEnd(22) +
      `${(100 * (b.p - a.p) >= 0 ? "+" : "") + (100 * (b.p - a.p)).toFixed(1)}pp`,
  );
}
const divergent = presidents.filter(
  (x) => inWindow(x) && TIERS.includes(x.tier) && x.isInterimLegacy !== x.isInterimDerived,
);
console.log();
console.log(
  `${divergent.length} in-window president spells carry different values under the two flags,`,
);
console.log(
  "so the re-derivation is NOT confined to rows outside this analysis. R1 and R2 move by",
);
console.log(
  "a tenth of a point either way; R3 is where it matters, and it moves in the direction",
);
console.log(
  "the coverage check already warned about -- the tier with the thinnest research is the",
);
console.log(
  "tier whose interim flags rest most heavily on the ETL alone. The R1-R3 gap is the",
);
console.log(
  "finding, and it survives the swap; the R3 LEVEL does not, and should be read as the",
);
console.log(
  "floor the coverage note says it is. Evidence behind the divergent spells:",
);
const evTally = new Map();
for (const x of divergent) evTally.set(x.interimEvidence, (evTally.get(x.interimEvidence) || 0) + 1);
for (const [k, v] of [...evTally].sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(34)} ${v}`);
console.log();

console.log("Pairwise two-proportion tests (appointment rate):");
for (const [a, b] of [["R1", "R2"], ["R1", "R3"], ["R2", "R3"]]) {
  const ra = rate(tierSpells[a].filter(inWindow));
  const rb = rate(tierSpells[b].filter(inWindow));
  const p = twoProportionP(ra.k, ra.n, rb.k, rb.n);
  out.tiers[`${a}_vs_${b}`] = { diff: ra.p - rb.p, p };
  console.log(
    `  ${a} vs ${b}: ${pct(ra.p)} vs ${pct(rb.p)}  ` +
      `diff ${(100 * (ra.p - rb.p)).toFixed(1)}pp   p = ${p3(p)}`,
  );
}

// Sub-windows, to show the trend is not an artefact of the window's left edge.
console.log();
console.log("By appointment decade (interim share of appointments started in the decade):");
const decades = [[1996, 2005], [2006, 2015], [2016, 2026]];
console.log("tier   " + decades.map(([a, b]) => `${a}-${b}`.padStart(14)).join(""));
for (const t of TIERS) {
  const cells = decades.map(([a, b]) => {
    const r = rate(tierSpells[t].filter((s) => s.startYear >= a && s.startYear <= b));
    return `${pct(r.p)} (${r.k}/${r.n})`.padStart(14);
  });
  console.log(t.padEnd(7) + cells.join(""));
  out.tiers[t].byDecade = decades.map(([a, b]) => rate(tierSpells[t].filter((s) => s.startYear >= a && s.startYear <= b)));
}

// Public/private split. The tiers are not comparable populations: the R1 index is
// mostly public flagships and large privates, while R3 is more than half small
// private institutions, where a board is likelier to hand the chair to a sitting
// provost quietly than to run a public interim appointment. Splitting on control
// shows whether the tier gradient is really a sector gradient wearing a tier label.
const controlOf = new Map();
for (const f of ["r1-university-schools.json", "r1-r2public-schools.json"])
  for (const s of read(f)) if (!controlOf.has(keyOf(s.university))) controlOf.set(keyOf(s.university), s.type);
console.log();
console.log("By control (appointments 1996+):");
console.log("tier        public                    private");
out.tiers.byControl = {};
for (const t of TIERS) {
  const w = tierSpells[t].filter(inWindow);
  const pub = rate(w.filter((s) => controlOf.get(s.institution) === "Public"));
  const priv = rate(w.filter((s) => controlOf.get(s.institution) === "Private"));
  console.log(
    `${t.padEnd(8)}${`${pct(pub.p)} (${pub.k}/${pub.n})`.padEnd(26)}${pct(priv.p)} (${priv.k}/${priv.n})`,
  );
  out.tiers.byControl[t] = { public: pub, private: priv };
}

// Direct standardisation to the pooled public/private mix: what each tier's rate
// would be if all three had the same sector composition. This is the number to quote
// when comparing tiers, because the raw R3 figure is partly measuring "private".
const pooled = presidents.filter(inWindow);
const wPub = pooled.filter((s) => controlOf.get(s.institution) === "Public").length;
const wPriv = pooled.filter((s) => controlOf.get(s.institution) === "Private").length;
console.log();
console.log("Standardised to the pooled sector mix:");
out.tiers.standardised = {};
for (const t of TIERS) {
  const { public: pub, private: priv } = out.tiers.byControl[t];
  const std = (pub.p * wPub + priv.p * wPriv) / (wPub + wPriv);
  out.tiers.standardised[t] = std;
  console.log(`  ${t}: ${pct(std)}   (raw ${pct(out.tiers[t].appointments.p)})`);
}

// ---------------------------------------------------------------------------
// Within-university: does the president rate track the B-school dean rate?
// ---------------------------------------------------------------------------

const deanByInst = byInstitution(deans);
const presByInst = byInstitution(presidents);
const joined = [...deanByInst.keys()].filter((k) => presByInst.has(k));
const unmatched = [...deanByInst.keys()].filter((k) => !presByInst.has(k));

console.log();
console.log("=".repeat(78));
console.log("DOES IT TRACK THE B-SCHOOL DEAN RATE IN THE SAME UNIVERSITY?");
console.log("=".repeat(78));
console.log(
  `${joined.length} of ${deanByInst.size} B-school universities join to a president index` +
    (unmatched.length ? ` (${unmatched.length} unmatched: ${unmatched.map((k) => deanByInst.get(k)[0].display).join(", ")})` : ""),
);

const deanRateAll = rate(deans.filter(inWindow));
const presJoinedRate = rate(joined.flatMap((k) => presByInst.get(k)).filter(inWindow));
console.log();
console.log(`B-school dean appointments ${WINDOW}+ : ${deanRateAll.k}/${deanRateAll.n} interim = ${pct(deanRateAll.p)}`);
console.log(`Presidents at those same universities: ${presJoinedRate.k}/${presJoinedRate.n} interim = ${pct(presJoinedRate.p)}`);
out.withinUniversity.levels = { dean: deanRateAll, president: presJoinedRate };

// --- Test 1: institution-level correlation of interim shares ---------------
console.log();
console.log("Test 1 -- institution-level correlation of interim shares");
for (const minN of [1, 3, 5]) {
  const rows = joined
    .map((k) => ({
      k,
      display: presByInst.get(k)[0].display,
      pres: presByInst.get(k).filter(inWindow),
      dean: deanByInst.get(k).filter(inWindow),
    }))
    .filter((r) => r.pres.length >= minN && r.dean.length >= minN);
  if (rows.length < 3) continue;
  const xs = rows.map((r) => r.pres.filter((s) => s.isInterim).length / r.pres.length);
  const ys = rows.map((r) => r.dean.filter((s) => s.isInterim).length / r.dean.length);
  const rp = pearson(xs, ys);
  const rs = spearman(xs, ys);
  const pp = permutationP(xs, ys, pearson);
  console.log(
    `  >=${minN} appts each side: n = ${String(rows.length).padStart(3)} universities   ` +
      `Pearson r = ${rp.toFixed(3)}   Spearman rho = ${rs.toFixed(3)}   perm p = ${p3(pp)}`,
  );
  out.withinUniversity[`corr_min${minN}`] = { n: rows.length, pearson: rp, spearman: rs, p: pp };
}

// --- Test 2: does an interim president predict an interim dean, same window? --
const rows = joined.map((k) => ({
  pres: presByInst.get(k).filter(inWindow),
  dean: deanByInst.get(k).filter(inWindow),
}));
const withPres = rows.filter((r) => r.pres.length && r.dean.length);
const anyInterimPres = withPres.filter((r) => r.pres.some((s) => s.isInterim));
const noInterimPres = withPres.filter((r) => !r.pres.some((s) => s.isInterim));
const dr = (set) => rate(set.flatMap((r) => r.dean));
const a = dr(anyInterimPres), b = dr(noInterimPres);
console.log();
console.log("Test 2 -- dean interim rate, split by whether the university had any interim president");
console.log(`  had an interim president ${WINDOW}+ (n=${anyInterimPres.length} universities): ${a.k}/${a.n} = ${pct(a.p)}`);
console.log(`  had none                 (n=${noInterimPres.length} universities): ${b.k}/${b.n} = ${pct(b.p)}`);
console.log(
  `  difference ${(100 * (a.p - b.p)).toFixed(1)}pp   p = ${p3(twoProportionP(a.k, a.n, b.k, b.n))}`,
);
out.withinUniversity.split = { withInterimPres: a, withoutInterimPres: b, p: twoProportionP(a.k, a.n, b.k, b.n) };

// --- Test 3: temporal co-occurrence ---------------------------------------
//
// The institution-level tests throw away timing, which is where a real link would
// show. Here each dean appointment is labelled by what the president's chair was
// doing when it happened: interim, or held by a permanent president. If instability
// is an institution-wide state rather than a school-level accident, the dean
// appointments made under an interim president are the ones that should be interim.
//
// Two labellings, because they trade coverage against precision. The strict one asks
// only who was in the chair in the dean's own start year, and leaves a dean
// appointment unlabelled when no president spell covers that year. The +/-k one also
// counts an interim spell that begins or ends within k years, which is the state a
// B-school would actually be reacting to -- a president on the way out or just
// arrived is as much of a hiring freeze as one formally interim on the day.

/** @param {"strict"|number} mode  strict = same year only; a number = +/- that many years. */
function presidentStateAt(instKey, year, mode) {
  const list = presByInst.get(instKey) || [];
  const covering =
    mode === "strict"
      ? list.filter((s) => s.startYear <= year && (s.endYear ?? NOW) >= year)
      : list.filter(
          (s) => (s.startYear <= year + mode && (s.endYear ?? NOW) >= year - mode),
        );
  if (!covering.length) return "unlabelled";
  return covering.some((s) => s.isInterim) ? "interim" : "permanent";
}

function temporalTest(mode, label) {
  const labelled = joined.flatMap((k) =>
    deanByInst
      .get(k)
      .filter(inWindow)
      .map((d) => ({ ...d, presState: presidentStateAt(k, d.startYear, mode) })),
  );
  const ui = rate(labelled.filter((d) => d.presState === "interim"));
  const up = rate(labelled.filter((d) => d.presState === "permanent"));
  const unl = labelled.filter((d) => d.presState === "unlabelled").length;
  const p = twoProportionP(ui.k, ui.n, up.k, up.n);
  console.log(`  ${label}`);
  console.log(`    chair interim:   ${String(ui.k).padStart(3)}/${String(ui.n).padEnd(4)} interim deans = ${pct(ui.p).padStart(6)}   [${pct(ui.lo)}, ${pct(ui.hi)}]`);
  console.log(`    chair permanent: ${String(up.k).padStart(3)}/${String(up.n).padEnd(4)} interim deans = ${pct(up.p).padStart(6)}   [${pct(up.lo)}, ${pct(up.hi)}]`);
  console.log(`    difference ${(100 * (ui.p - up.p)).toFixed(1)}pp   p = ${p3(p)}${unl ? `   (${unl} dean appointments unlabelled -- no president spell covers the year)` : ""}`);
  return { mode, underInterim: ui, underPermanent: up, unlabelled: unl, p, labelled };
}

console.log();
console.log("Test 3 -- dean appointments labelled by the state of the president's chair at the time");
const strict = temporalTest("strict", "strict (president sitting in the dean's start year):");
const loose = temporalTest(2, "+/-2 years (an interim spell overlapping a 5-year window):");
out.withinUniversity.temporal = {
  strict: { ...strict, labelled: undefined },
  loose: { ...loose, labelled: undefined },
};

// Period control. Interim appointments have become more common over time on both
// sides -- the president rate climbs from 23.7% to 31.2% across the three periods --
// so a pooled gap could be nothing but two trends sharing a calendar. If the gap is
// real it should survive inside each period, where the calendar is held roughly fixed.
console.log();
console.log("  Period control -- the same +/-2 comparison inside each appointment period:");
console.log("  period        under interim chair      under permanent chair     diff");
out.withinUniversity.temporalByPeriod = [];
for (const [a, b] of decades) {
  const seg = loose.labelled.filter((d) => d.startYear >= a && d.startYear <= b);
  const ui = rate(seg.filter((d) => d.presState === "interim"));
  const up = rate(seg.filter((d) => d.presState === "permanent"));
  console.log(
    `  ${`${a}-${b}`.padEnd(12)}  ${`${ui.k}/${ui.n} = ${pct(ui.p)}`.padEnd(23)}` +
      `${`${up.k}/${up.n} = ${pct(up.p)}`.padEnd(24)}${(100 * (ui.p - up.p)).toFixed(1)}pp`,
  );
  out.withinUniversity.temporalByPeriod.push({ from: a, to: b, underInterim: ui, underPermanent: up });
}

if (EMIT_JSON) {
  // Written relative to the working directory, not into src/data: these are derived
  // numbers for whoever asked for them, not a dataset the dashboard loads.
  const path = process.env.INTERIM_JSON_OUT || "interim-rate-analysis.json";
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log(`\nwrote ${path}`);
}
