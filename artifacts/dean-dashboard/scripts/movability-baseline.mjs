// Baton Index -- the trivial baseline for the Movability Index.
//
//   node scripts/movability-baseline.mjs [cutoff] [horizon]
//
// cutoff  (default 2019): the year we pretend it is. Only information a user
//         could have had on that date is used.
// horizon (default 5): how many years forward the outcome is measured over.
//         cutoff + horizon must be <= the data's "now" (2026) or the outcome
//         is itself right-censored and the accuracy figure is meaningless.
//
// WHY THIS EXISTS
// ---------------
// The product ships a Movability Index chip that labels a sitting leader from
// their years in seat against the cohort's tenure distribution. Before any
// multiplier or model claim can be interpreted, someone has to be able to
// answer: what does the DUMB version of that rule score? "x2.68" against an
// unstated reference is not a finding, and an accuracy figure that fails to
// beat "predict nobody moves" is not a model.
//
// So this measures three things on real outcomes, per index and pooled:
//
//   1. BASE RATE -- what share of sitting leaders actually departed within the
//      horizon, and the accuracy of the majority-class rule (predict the more
//      common outcome for everybody). This is the number any accuracy claim
//      has to clear. It is usually embarrassingly high, which is the point.
//   2. THE TRIVIAL RULE -- "past the cohort median tenure => will move."
//      Accuracy, precision, recall, and precision lift over the base rate.
//   3. THE SHIPPED CHIP'S OWN BANDS -- below median / median-to-p75 / past p75.
//      The chip does NOT predict monotonically increasing risk: it calls the
//      middle band "Could move" and the top band "Entrenched", i.e. it asserts
//      departure risk RISES then FALLS. That is a testable claim about the
//      hazard and this reports whether the data supports it.
//
// NO LEAKAGE: the median and p75 thresholds are re-estimated as of the cutoff,
// from spells that had started by then, with everyone still in post at the
// cutoff treated as right-censored there (same Kaplan-Meier estimator as
// src/data/survival.ts). Using today's thresholds would let the outcome window
// inform the predictor.
//
// Not wired into any build -- a model-health check for a human to read, same
// as scripts/scout-backtest.mjs.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "data");
const DATA_NOW = 2026; // the dataset's "current" year (see NOW in the components)
const TMAX = 30;

const CUTOFF = Number(process.argv[2]) || 2019;
const HORIZON = Number(process.argv[3]) || 5;
if (CUTOFF + HORIZON > DATA_NOW) {
  console.error(`cutoff + horizon = ${CUTOFF + HORIZON} exceeds the data's now (${DATA_NOW}); the outcome would be censored.`);
  process.exit(1);
}

/** Kaplan-Meier quantiles over annual spells, censoring at `asOf`. Mirrors src/data/survival.ts. */
function kmQuantiles(spells, asOf) {
  const NB = TMAX + 1;
  const events = new Array(NB).fill(0), atRisk = new Array(NB).fill(0);
  let nEvents = 0;
  for (const s of spells) {
    if (!s.startYear || s.startYear > asOf) continue;
    // As of `asOf`, a spell ending later has not ended yet: censor it there.
    const ended = s.endYear != null && s.endYear <= asOf;
    const raw = ended ? s.endYear - s.startYear : asOf - s.startYear;
    if (raw < 0) continue;
    const t = Math.min(TMAX, Math.floor(raw));
    for (let j = 0; j <= t; j++) atRisk[j]++;
    if (ended) { events[t]++; nEvents++; }
  }
  const surv = new Array(NB).fill(1);
  let sv = 1;
  for (let t = 0; t < NB; t++) { sv *= 1 - (atRisk[t] > 0 ? events[t] / atRisk[t] : 0); surv[t] = sv; }
  // Terminal bin means the quantile was never reached inside the domain.
  const q = (p) => { for (let t = 0; t < TMAX; t++) if (1 - surv[t] >= p) return t + 0.5; return null; };
  return { median: q(0.5), p75: q(0.75), nEvents };
}

const pct = (x) => (x == null ? "  n/a" : `${(x * 100).toFixed(1)}%`.padStart(6));

const files = readdirSync(SRC).filter((f) => /deans.*\.json$/.test(f) && !/schools/.test(f));
const perIndex = [];
const pooled = { n: 0, departed: 0, tp: 0, fp: 0, fn: 0, tn: 0, bands: [[0, 0], [0, 0], [0, 0]] };

for (const f of files.sort()) {
  let data;
  try { data = JSON.parse(readFileSync(join(SRC, f), "utf8")); } catch { continue; }
  if (!Array.isArray(data) || !data.length || !("dean" in data[0])) continue;

  const spells = data.filter((d) => !d.isInterim && d.roleType !== "subdean" && d.startYear);
  const { median, p75, nEvents } = kmQuantiles(spells, CUTOFF);
  if (median == null) { perIndex.push({ f, skip: `no identified median as of ${CUTOFF} (${nEvents} departures)` }); continue; }

  // The evaluation set: everyone actually in the seat on the cutoff date.
  const sitting = spells.filter((d) => d.startYear <= CUTOFF && (d.endYear == null || d.endYear > CUTOFF));
  let n = 0, departed = 0, tp = 0, fp = 0, fn = 0, tn = 0;
  const bands = [[0, 0], [0, 0], [0, 0]]; // [departed, total] for below-median / median-p75 / past-p75
  for (const d of sitting) {
    const ct = CUTOFF - d.startYear;
    const left = d.endYear != null && d.endYear <= CUTOFF + HORIZON;
    n++; if (left) departed++;
    const predictMove = ct >= median;
    if (predictMove && left) tp++; else if (predictMove && !left) fp++;
    else if (!predictMove && left) fn++; else tn++;
    const band = p75 != null && ct >= p75 ? 2 : ct >= median ? 1 : 0;
    bands[band][1]++; if (left) bands[band][0]++;
  }
  if (!n) { perIndex.push({ f, skip: "nobody sitting at the cutoff" }); continue; }

  perIndex.push({ f, median, p75, n, departed, tp, fp, fn, tn, bands });
  pooled.n += n; pooled.departed += departed;
  pooled.tp += tp; pooled.fp += fp; pooled.fn += fn; pooled.tn += tn;
  for (let b = 0; b < 3; b++) { pooled.bands[b][0] += bands[b][0]; pooled.bands[b][1] += bands[b][1]; }
}

function scores(r) {
  const base = r.departed / r.n;                       // P(departs) -- the thing being predicted
  const majority = Math.max(base, 1 - base);           // accuracy of "predict the common outcome for everyone"
  const acc = (r.tp + r.tn) / r.n;
  const prec = r.tp + r.fp ? r.tp / (r.tp + r.fp) : null;
  const rec = r.tp + r.fn ? r.tp / (r.tp + r.fn) : null;
  return { base, majority, acc, prec, rec, lift: prec == null || !base ? null : prec / base };
}

console.log(`Movability baseline -- as of ${CUTOFF}, did they leave within ${HORIZON} years?`);
console.log(`Thresholds re-estimated as of ${CUTOFF} (no outcome leakage). Data "now" = ${DATA_NOW}.\n`);
console.log(
  "index".padEnd(32), "med/p75".padEnd(10), "N".padStart(5), "base".padStart(7),
  "majority".padStart(9), "rule acc".padStart(9), "prec".padStart(7), "recall".padStart(7), "lift".padStart(6),
);
for (const r of perIndex) {
  if (r.skip) { console.log(r.f.padEnd(32), `-- skipped: ${r.skip}`); continue; }
  const s = scores(r);
  console.log(
    r.f.replace(/\.json$/, "").padEnd(32), `${r.median}/${r.p75 ?? "-"}`.padEnd(10), String(r.n).padStart(5),
    pct(s.base), pct(s.majority).padStart(9), pct(s.acc).padStart(9), pct(s.prec).padStart(7), pct(s.rec).padStart(7),
    (s.lift == null ? "n/a" : `x${s.lift.toFixed(2)}`).padStart(6),
  );
}

const ps = scores(pooled);
console.log("\n" + "=".repeat(70));
console.log(`POOLED  N=${pooled.n} sitting leaders across every index`);
console.log(`  Actually departed within ${HORIZON} yrs        ${pct(ps.base)}   <- the base rate`);
console.log(`  Majority-class rule ("nobody moves")   ${pct(ps.majority)}   <- the accuracy floor to beat`);
console.log(`  Trivial rule ("past the median")       ${pct(ps.acc)}   accuracy`);
console.log(`     precision ${pct(ps.prec)}   recall ${pct(ps.rec)}   precision lift x${ps.lift?.toFixed(2) ?? "n/a"}`);
console.log(`\n  Departure rate by the shipped chip's own bands:`);
const BAND_LABELS = ['below median  ("Not up to move")', 'median..p75   ("Could move")   ', 'past p75      ("Entrenched")  '];
for (let b = 0; b < 3; b++) {
  const [dep, tot] = pooled.bands[b];
  console.log(`    ${BAND_LABELS[b]}  ${pct(tot ? dep / tot : null)}  (n=${tot})`);
}
console.log("=".repeat(70));
console.log(`
Read the pooled figures with two caveats:
  * Top-100 B-school and R1 B-school overlap in membership, so a school in both
    is counted twice in the pool. Per-index rows are unaffected.
  * A leader whose record was never updated after they left reads as "still in
    post" and scores as a non-departure, so the true base rate is a floor, not
    a point estimate.`);
