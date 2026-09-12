import type { Dean } from "./types";

/**
 * The one definition of a tenure spell, shared by every screen.
 *
 * Two errors motivated this module, and both are the same mistake in different
 * places: treating a record's stored `tenureLength` as if it were a completed
 * spell.
 *
 *  - Right-censoring. A sitting leader has no completed tenure. Four indices
 *    still carry a frozen `tenureLength` on people who never left, so any screen
 *    that filters on "does this record have a tenure length" averages
 *    still-serving snapshots together with finished ones and reads short.
 *  - Impossible arithmetic. Negative spans (an end year with no start), a start
 *    year of zero (one row read as a 2,004-year tenure), and 80-to-136-year
 *    spells where the end year is a placeholder for "not documented".
 *
 * So the rule is: a screen never reads `tenureLength` directly. It asks
 * `completedTenure()`, which returns a number only for a spell that actually
 * finished and whose arithmetic can be true, and null otherwise.
 */

/**
 * The corpus's reference year. Elapsed tenure for sitting leaders is measured
 * against it, so every screen ages in step rather than each having its own idea
 * of "now".
 */
export const CURRENT_YEAR = 2026;

/**
 * Longest span we will accept as one person's single completed appointment.
 * Nobody holds one deanship for six decades; a longer span always turns out to
 * be an undocumented succession collapsed into one row (see the notes on the
 * records this guard rejects). Deliberately generous: the point is to reject
 * the impossible, not to trim the long tail.
 */
export const MAX_PLAUSIBLE_TENURE_YEARS = 60;

/** Nothing in the corpus predates 1850; anything below this is a placeholder. */
export const MIN_PLAUSIBLE_YEAR = 1700;

/** The subset of Dean this module needs, so scripts and tests can pass plain rows. */
export type TenureFields = Pick<Dean, "startYear" | "endYear" | "tenureLength"> &
  Partial<Pick<Dean, "startLabel" | "endLabel" | "isInterim">>;

const isUnknownLabel = (label: string | undefined | null) => /^\s*unknown\s*$/i.test(label || "");

const validYear = (y: number | null | undefined): y is number =>
  typeof y === "number" && Number.isFinite(y) && y >= MIN_PLAUSIBLE_YEAR;

/**
 * The record says the spell ended but not when. `endYear: null` on its own means
 * "still in the seat"; paired with an "unknown" end label it means the opposite
 * -- a historical row whose end was never documented. Both are excluded from
 * completed-tenure statistics, but only the first is a sitting leader.
 */
export const hasUnknownEnd = (d: TenureFields): boolean =>
  d.endYear == null && isUnknownLabel(d.endLabel);

/** Still in the seat: no end year, and no "unknown end" marker. */
export const isSitting = (d: TenureFields): boolean => d.endYear == null && !isUnknownLabel(d.endLabel);

/**
 * The completed length of a finished spell, in years, or null when the record
 * cannot support one: still serving, an undocumented end, a missing or
 * placeholder year, or arithmetic that cannot be true.
 *
 * Both the stored value and the span implied by the years must be plausible --
 * a stored length can be right on a row whose years are garbage, and vice
 * versa, and either way the number is not one to average.
 */
export function completedTenure(d: TenureFields): number | null {
  if (isSitting(d) || hasUnknownEnd(d)) return null; // right-censored, or end never documented
  if (!validYear(d.startYear) || !validYear(d.endYear)) return null;
  const span = d.endYear - d.startYear;
  if (span < 0 || span > MAX_PLAUSIBLE_TENURE_YEARS) return null;
  const stored = d.tenureLength;
  if (stored == null) return span;
  if (!Number.isFinite(stored) || stored < 0 || stored > MAX_PLAUSIBLE_TENURE_YEARS) return null;
  return stored;
}

/**
 * Years in the seat: elapsed time for a sitting leader, completed length for a
 * departed one, null when neither can be established. This is the figure a
 * "years served" screen should sort and filter on.
 */
export function yearsInSeat(d: TenureFields, now: number = CURRENT_YEAR): number | null {
  if (isSitting(d)) return validYear(d.startYear) ? now - d.startYear : null;
  return completedTenure(d);
}

/** Completed spells only, ascending. Interims serve ~1 year and skew any norm. */
export function completedTenures(rows: TenureFields[], opts: { includeInterims?: boolean } = {}): number[] {
  const out: number[] = [];
  for (const r of rows) {
    if (!opts.includeInterims && r.isInterim) continue;
    const t = completedTenure(r);
    if (t != null && t > 0) out.push(t);
  }
  return out.sort((a, b) => a - b);
}

export interface TenureStats {
  /** Completed spells the statistics are built from, ascending. */
  values: number[];
  n: number;
  mean: number | null;
  median: number | null;
  /** Modal whole year of the completed distribution. */
  mode: number | null;
  percentile: (p: number) => number | null;
}

/** Mean/median/percentiles over completed spells only. */
export function tenureStats(rows: TenureFields[], opts: { includeInterims?: boolean } = {}): TenureStats {
  const values = completedTenures(rows, opts);
  const percentile = (p: number) =>
    values.length ? values[Math.min(values.length - 1, Math.floor(p * values.length))] : null;
  let mode: number | null = null;
  if (values.length) {
    const counts = new Map<number, number>();
    for (const v of values) {
      const k = Math.floor(v);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    mode = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  }
  return {
    values,
    n: values.length,
    mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
    median: percentile(0.5),
    mode,
    percentile,
  };
}
