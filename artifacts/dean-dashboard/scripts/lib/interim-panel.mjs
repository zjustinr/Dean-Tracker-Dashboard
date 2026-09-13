// Shared panel builder for interim-rate analysis.
//
// The leadership indexes are not pure appointment histories. Each `*-deans.json`
// file mixes two kinds of row:
//
//   1. **Appointment spells** -- a person who held the seat, with a startYear
//      (and an endYear, or null while sitting). This is the appointment history.
//   2. **Current administrative roster** -- the sitting VPs, chiefs of staff,
//      general counsel and associate deans who report to the seat. These carry
//      no startYear at all (1378 of 2699 rows in `r1-university-deans.json`,
//      1739 of 3394 in `r1-r2public-deans.json`, 464 of 1336 in the B-school file).
//
// Anything that counts rows without separating the two measures the size of a
// president's cabinet, not the churn in the president's chair. `startYear != null`
// is the separator, and it is exact: every row without one is a roster entry.
//
// A startYear is necessary but not sufficient for the president files. A handful of
// cabinet rows do carry a start year -- Stevens' general counsel (2010), Chapman's
// VP for campus planning (2019), Santa Clara's CHRO (2022) -- so the seat title has
// to be checked too, and checked in a way that does not read "Vice President for
// Research" as a president. That is what `isChiefExecutiveSeat` is for.
//
// Used by analyze-interim-rates.mjs.

/** Lowercase, strip punctuation and honorifics-free noise from a title string. */
const tnorm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Titles that contain "president" or "chancellor" but are not the seat.
 *
 * Ordered longest-first is unnecessary -- these are tested as a leading prefix on
 * the seat phrase, and every one of them is a *subordinate* of the chief executive.
 */
const SUBORDINATE = /^(vice|vice\s|deputy|associate|assistant|senior vice|executive vice|acting vice|interim vice|vice provost|provost|dean|chief|director|general counsel|secretary|treasurer)\b/;

/**
 * True when a seat title names the institution's chief executive.
 *
 * The indexes put the seat title in `discipline` for president/chancellor rows and
 * sometimes append free-text bio after a comma ("President, Ph.D."), so only the
 * phrase before the first comma is classified. Leading "Interim"/"Acting" is stripped
 * before the test because interim status is carried separately by `isInterim` -- an
 * interim president is still a president for the purpose of counting appointments.
 *
 * `leaderTitle` is the institution's own name for its top seat, from the schools
 * file, and it is checked first because three institutions do not call that person a
 * president at all: the Albert Einstein College of Medicine and the Icahn School of
 * Medicine are led by a Dean, and the University of Oklahoma Health Sciences Center
 * by a Senior Vice President and Provost. Without this, those institutions
 * contribute no appointments and silently drop out of their tier. The match is exact,
 * so a Vice President for Student Affairs still cannot slip in behind it.
 */
export function isChiefExecutiveSeat(record, leaderTitle) {
  const head = tnorm(String(record.discipline || "").split(",")[0]);
  if (!head) return false;
  const seat = head.replace(/^(interim|acting|co)\s+/, "").trim();
  if (leaderTitle && seat === tnorm(leaderTitle)) return true;
  // SUNY names an interim campus head "Officer in Charge"; it is the seat, not a deputy.
  if (/^officer in charge\b/.test(seat)) return true;
  if (SUBORDINATE.test(seat)) return false;
  return /^(president|chancellor|rector)\b/.test(seat);
}

/** Surname key used to collapse "Robert W. Kustra" and "Bob Kustra" onto one spell. */
export const surnameKey = (name) => {
  const parts = tnorm(name)
    .replace(/\b(jr|sr|ii|iii|iv|phd|ph d|edd|ed d|dba|esq|md|sj|s j)\b/g, "")
    .split(" ")
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
};

/**
 * Collapse rows that are the same appointment entered twice.
 *
 * The corpus occasionally records one appointment under two spellings of the name
 * (Pepperdine carries both "James A. Gash" and "Jim Gash" for 2019, and "David
 * Davenport" twice for 1985), and start years differ by one when one source dates
 * the announcement and the other the first day in the seat. Matching on surname
 * plus a start year within one catches those.
 *
 * **Interim status must match for rows to merge**, and that condition is the whole
 * point of this function rather than a detail of it. An interim promoted to the
 * permanent seat -- Farnam Jahanian interim at Carnegie Mellon in 2017 and president
 * in 2018, Joseph Harroz at Oklahoma in 2019 and 2020 -- is two appointments, not
 * one, and 38 such conversions sit in the president panel. Folding each into a
 * single interim spell would delete a permanent appointment from the denominator
 * while keeping the interim one in the numerator, biasing every rate upward. The
 * corpus recognises the same distinction with its own `convertedToPermanent` flag.
 */
export function dedupeSpells(spells) {
  const out = [];
  for (const s of spells.slice().sort((a, b) => a.startYear - b.startYear)) {
    const twin = out.find(
      (o) =>
        o.institution === s.institution &&
        o.surname === s.surname &&
        o.isInterim === s.isInterim &&
        Math.abs(o.startYear - s.startYear) <= 1,
    );
    if (twin) {
      twin.endYear = twin.endYear === null || s.endYear === null ? null : Math.max(twin.endYear, s.endYear);
      continue;
    }
    out.push({ ...s });
  }
  return out;
}

/** Pearson product-moment correlation. */
export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return NaN;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx === 0 || syy === 0 ? NaN : sxy / Math.sqrt(sxx * syy);
}

/** Fractional ranks, averaging ties -- the input to Spearman. */
const ranks = (v) => {
  const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(v.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
};

/** Spearman rank correlation. */
export const spearman = (xs, ys) => pearson(ranks(xs), ranks(ys));

/**
 * Two-sided permutation p-value for a correlation.
 *
 * Used instead of the t approximation because the institution-level interim shares
 * are bounded, lumpy (many are exactly 0, 1/3 or 1/2) and far from bivariate normal,
 * which is exactly the case where the parametric p-value flatters the result.
 */
export function permutationP(xs, ys, stat = pearson, iters = 20000, seed = 12345) {
  const observed = Math.abs(stat(xs, ys));
  if (!Number.isFinite(observed)) return NaN;
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const shuffled = ys.slice();
  let hits = 0;
  for (let it = 0; it < iters; it++) {
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const v = Math.abs(stat(xs, shuffled));
    if (Number.isFinite(v) && v >= observed - 1e-12) hits++;
  }
  return (hits + 1) / (iters + 1);
}

/** Wilson score interval for a binomial proportion -- honest at small n and near 0. */
export function wilson(k, n, z = 1.96) {
  if (!n) return [NaN, NaN];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - s) / d, (c + s) / d];
}

/** Two-proportion z test, two-sided. */
export function twoProportionP(k1, n1, k2, n2) {
  if (!n1 || !n2) return NaN;
  const p = (k1 + k2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (se === 0) return NaN;
  const z = Math.abs(k1 / n1 - k2 / n2) / se;
  // Two-sided normal tail via Abramowitz-Stegun 7.1.26 error function.
  const t = 1 / (1 + 0.3275911 * (z / Math.SQRT2));
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(z / Math.SQRT2) * (z / Math.SQRT2));
  return 1 - erf;
}
