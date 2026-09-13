// Discrete-time (annual) Kaplan-Meier / life-table survival for leadership tenures.
//
// WHY THIS EXISTS
// ---------------
// A tenure "norm" built from COMPLETED spells only is right-censored-biased, and
// biased in a predictable direction: the people who have served longest are the
// least likely to have finished yet, so dropping still-serving leaders
// systematically understates how long the seat is actually held. The app used to
// do exactly that in two places at once -- the Tenure benchmark's headline median
// and, separately, the cohort median/75th-percentile behind every Movability
// Index chip (four duplicated copies of the same `lens = completed only` sort,
// one per screen). Both now come through here instead.
//
// The estimator is the standard discrete-time life-table / Kaplan-Meier product:
// still-serving leaders contribute EXPOSURE (they sit in the at-risk denominator
// for every year they have already served) without ever contributing an event.
// That is what makes the resulting median a statement about the population
// rather than about the subset that happens to have finished.
//
// Time is annual because the source data is annual (startYear / endYear), so the
// grouped life-table form is the right estimator here, not a continuous-time one.
//
// AT-RISK CONVENTION: a spell of observed length t contributes to atRisk[0..t] --
// i.e. a censored leader currently t years in is counted at risk for the year
// they are partway through. The stricter actuarial alternative credits censored
// observations half an interval. The simpler convention is kept deliberately: it
// is the one the hazard curve already shipped with, and switching would move a
// published curve for reasons unrelated to the censoring fix. Documented rather
// than silently chosen.

import { useMemo } from "react";

export interface TenureSpell {
  startYear: number | null;
  endYear: number | null;
  tenureLength: number | null;
}

export interface TenureSurvival {
  /** events[t] = observed departures in year t of tenure. */
  events: number[];
  /** atRisk[t] = spells still held at the start of year t, INCLUDING still-serving (right-censored) ones. */
  atRisk: number[];
  /** hazard[t] = P(leaves in year t | still in the seat at the start of year t). */
  hazard: number[];
  /** surv[t] = Kaplan-Meier estimate of P(still in the seat after year t). */
  surv: number[];
  /** Censoring-aware survival-time quantile: null when the curve never reaches p. */
  quantile: (p: number) => number | null;
  /** Kaplan-Meier median survival time (censoring-aware), in years. */
  median: number | null;
  /** Kaplan-Meier 75th-percentile survival time (censoring-aware), in years. */
  p75: number | null;
  /** Observed departures behind the estimate. */
  nEvents: number;
  /** Still-serving spells contributing exposure but no event. */
  nCensored: number;
  /** Every spell contributing to the estimate. */
  nTotal: number;
  tmax: number;
}

/** Observed length of a spell in years: completed length if departed, else elapsed so far. */
export function spellYears(s: TenureSpell, now: number): number | null {
  if (!s.startYear) return null;
  const raw = s.endYear != null
    ? (s.tenureLength ?? s.endYear - s.startYear)
    : now - s.startYear;
  return raw == null || raw < 0 ? null : raw;
}

/**
 * Life-table survival over a cohort of tenure spells, counting still-serving
 * leaders as right-censored rather than discarding them.
 *
 * `tmax` caps the domain (spells longer than it pile into the last year), which
 * keeps the tail from being estimated off two or three people.
 */
export function tenureSurvival(
  spells: TenureSpell[],
  { now, tmax = 30 }: { now: number; tmax?: number },
): TenureSurvival {
  const NB = tmax + 1;
  const events = new Array<number>(NB).fill(0);
  const atRisk = new Array<number>(NB).fill(0);
  let nEvents = 0, nCensored = 0, nTotal = 0;

  for (const s of spells) {
    const raw = spellYears(s, now);
    if (raw == null) continue;
    const t = Math.min(tmax, Math.floor(raw));
    for (let j = 0; j <= t; j++) atRisk[j]++;
    nTotal++;
    if (s.endYear != null) { events[t]++; nEvents++; } else nCensored++;
  }

  const hazard = events.map((e, t) => (atRisk[t] > 0 ? e / atRisk[t] : 0));
  const surv = new Array<number>(NB).fill(1);
  { let s = 1; for (let t = 0; t < NB; t++) { s *= 1 - hazard[t]; surv[t] = s; } }

  // Midpoint convention: the first whole year by whose end at least p of the
  // cohort has departed is reported as t + 0.5. Same convention the fitted
  // hazard curve already used for its scale parameter, so the displayed median
  // and the curve's alpha stay the same number rather than drifting apart.
  //
  // A quantile only reached in the TERMINAL bin is reported as null, not tmax.
  // That bin is a catch-all for every spell of tmax years or more, so reaching p
  // there means the curve never actually crossed p inside the observed domain --
  // the quantile is not identified and any number we printed would be an artifact
  // of where the domain was cut. This is not hypothetical: the Administrative
  // Leaders index is a current-roster snapshot (31 departures against ~1,500
  // still-serving), and without this guard it reports a 30.5-year median tenure.
  // Better to show nothing than to show that.
  const quantile = (p: number): number | null => {
    for (let t = 0; t < tmax; t++) if (1 - surv[t] >= p) return t + 0.5;
    return null;
  };

  return {
    events, atRisk, hazard, surv, quantile,
    median: quantile(0.5), p75: quantile(0.75),
    nEvents, nCensored, nTotal, tmax,
  };
}

/** Index-wide tenure norm behind the Movability Index chip. */
export interface TenureNorms {
  /** Censoring-aware median years in seat, or null when no cohort reaches 50%. */
  median: number | null;
  /** Censoring-aware 75th percentile, or null when the curve never reaches 75%. */
  p75: number | null;
  /** Spells behind the estimate, still-serving included. */
  cohortN: number;
}

/**
 * The one cohort norm the Movability Index reads, wherever it is rendered.
 *
 * Four screens used to inline their own copy of this (Slate Builder's results
 * map, the dean profile, the school timeline, Scout's candidate list), all four
 * over completed spells only, so a leader could be called "not up to move"
 * against a threshold that was short purely because the long servers hadn't
 * finished yet.
 *
 * Interims are excluded because a ~1-year acting appointment is a different
 * process, not a short tenure. The associate/vice-dean feeder bench (roleType
 * "subdean") is excluded because those are not spells in the seat the norm
 * describes -- the 34 of them that carry a startYear are all still serving, so
 * they would only ever pad the at-risk denominator and inflate the norm.
 */
export function useTenureNorms(
  deans: (TenureSpell & { isInterim?: boolean; roleType?: string })[],
  now: number,
): TenureNorms {
  return useMemo(() => {
    const cohort = deans.filter((d) => !d.isInterim && d.roleType !== "subdean" && d.startYear);
    const curve = tenureSurvival(cohort, { now });
    return { median: curve.median, p75: curve.p75, cohortN: curve.nTotal };
  }, [deans, now]);
}

/**
 * Log-logistic hazard curve, parameterized in closed form from the cohort's own
 * 50th/75th survival quantiles (alpha = median, beta solved from the ratio).
 *
 * Deliberately NOT a maximum-likelihood or least-squares fit -- it is a
 * two-quantile match, which guarantees the curve reproduces two robust points of
 * the observed survival curve. Say it that way in anything customer-facing;
 * "fitted hazard model" would overstate it.
 *
 * Returns the hazard sampled every half-year over [0, tmax], or null when the
 * cohort is too thin (or the quantiles too flat) for the match to be defined.
 */
export function logLogisticHazard(
  curve: TenureSurvival,
  { minEvents = 8 }: { minEvents?: number } = {},
): number[] | null {
  const m50 = curve.median, m75 = curve.p75;
  if (curve.nEvents < minEvents || m50 == null || m75 == null || !(m75 > m50) || !(m50 > 0)) return null;
  const alpha = m50, beta = Math.log(3) / Math.log(m75 / m50);
  if (!(beta > 0)) return null;
  const out: number[] = [];
  for (let k = 0; k <= curve.tmax * 2; k++) {
    const t = k * 0.5;
    if (t <= 0) { out.push(0); continue; }
    const z = Math.pow(t / alpha, beta);
    out.push((beta / alpha) * Math.pow(t / alpha, beta - 1) / (1 + z));
  }
  return out;
}
