import type { Dean } from "./types";
import { CURRENT_YEAR, completedTenure, isSitting, tenureStats } from "./tenure";

/**
 * The Movability Index: where a sitting leader's time in seat falls in their
 * cohort's completed-tenure distribution.
 *
 * It used to be three bands, and the top one asserted the opposite of what the
 * data says. D4 measured all three over 2,711 sitting leaders on a five-year
 * horizon: below the median 55.4% had departed, between the median and the 75th
 * percentile 75.2%, past the 75th percentile 69.6%, against a 57.8% base rate.
 * The band the product called "Overdue" -- and whose panel copy said that being
 * this far past the typical window "usually means they're staying put" -- in
 * fact leaves MORE often than average.
 *
 * So: one boundary, at the median, because that is the only boundary the
 * measurement supports; both bands above it sit between 69.6% and 75.2% and
 * splitting them implies a resolution the data does not have. And the labels
 * describe a tenure position rather than asserting an intent, because tenure
 * position is all this measures.
 */

/**
 * The definition's version stamp, and every change to it.
 *
 * A movability reading is a claim about a person, and the definition behind it
 * has already moved twice: D1 recomputed every index's cohort median on a
 * censoring-aware basis (moving them by one to three and a half years, which
 * moved some people's band), and this revision collapsed three bands to two.
 * Anyone who quoted a reading before either change gets a different answer today,
 * and until now there was nothing in the product to explain why. So: the version
 * rides beside every reading, and what changed is one click away.
 *
 * Bump the version and add a changelog entry for ANY change to the bands, the
 * boundary, or the cohort the median is taken from. Wording fixes that leave the
 * arithmetic alone do not need one.
 */
export const MOVABILITY_VERSION = "2.0";

export interface MovabilityChange {
  version: string;
  /** ISO date. `dateNote` says what the date refers to when it isn't the change itself. */
  date: string;
  dateNote?: string;
  summary: string;
}

export const MOVABILITY_CHANGELOG: MovabilityChange[] = [
  {
    version: "2.0",
    date: "2026-09-06",
    summary:
      "Three bands collapsed to two, split at the cohort median. The old top band (past the 75th percentile, labelled " +
      "\u201cOverdue\u201d) claimed a long-tenured leader was staying put; D4 measured that band departing more often than " +
      "average, so the claim is gone and the labels now describe a tenure position rather than an intent. Readings in the " +
      "old middle and top bands are now one band.",
  },
  {
    version: "1.1",
    date: "2026-09-05",
    dateNote: "date of the audit that reported it; the change itself landed earlier that week",
    summary:
      "Cohort medians recomputed on a censoring-aware basis (D1): sitting leaders' unfinished tenures no longer count as " +
      "completed ones. Every index's median moved by one to three and a half years, so some readings changed band without " +
      "the person changing at all.",
  },
  {
    version: "1.0",
    date: "2026-08-19",
    dateNote: "earliest revision in the repository; the definition is older than this date",
    summary:
      "First definition: three bands, at the cohort median and the 75th percentile, labelled \u201cNot up to move\u201d, " +
      "\u201cCould move\u201d and \u201cOverdue\u201d.",
  },
];

/** The measurement the bands are drawn from. Quoted verbatim in the panel. */
export const MOVABILITY_EVIDENCE = {
  study: "D4 departure audit, 5 September 2026",
  cohortN: 2711,
  horizonYears: 5,
  baseRatePct: 57.8,
  /** Precision/recall of the tenure-position signal read as a screen at its strictest. */
  precisionPct: 72.9,
  recallPct: 17.5,
  lift: 1.26,
} as const;

export type MovabilityTone = "low" | "high";
export type MovabilityBandKey = "below-median" | "at-or-past-median";

export interface MovabilityBandDef {
  key: MovabilityBandKey;
  /** Chip text. A position in a distribution, never a claim about intent. */
  label: string;
  /** Shorter still, for the compact badge on a ranked candidate row. */
  chipLabel: string;
  /** The same band spelled out, for the panel and the disclosure table. */
  longLabel: string;
  definition: string;
  /** Share of leaders in this band who had departed within five years (D4). */
  departedPct: string;
  tone: MovabilityTone;
  cls: string;
}

export const MOVABILITY_BANDS: MovabilityBandDef[] = [
  {
    key: "below-median",
    label: "Below median",
    chipLabel: "Below median",
    longLabel: "Below the cohort median",
    definition: "Fewer years in the seat than half of this cohort's completed appointments.",
    departedPct: "55.4%",
    tone: "low",
    cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  },
  {
    key: "at-or-past-median",
    label: "At or past median",
    chipLabel: "At/past median",
    longLabel: "At or past the cohort median",
    definition: "As many years in the seat as half of this cohort's completed appointments, or more.",
    departedPct: "69.6–75.2%",
    tone: "high",
    cls: "bg-green-200 text-green-900 dark:bg-green-800 dark:text-green-100",
  },
];

/** What the panel says the band is, is not, and is worth. */
export const MOVABILITY_COPY = {
  whatItIs:
    "Where this leader's years in the seat sit in their cohort's distribution of completed appointments.",
  whatItIsNot:
    "Not a statement of intent, availability, or interest in moving, and not a probability that they leave.",
  whatItIsWorth:
    `Over ${MOVABILITY_EVIDENCE.cohortN.toLocaleString()} sitting leaders on a ${MOVABILITY_EVIDENCE.horizonYears}-year horizon, ` +
    `${MOVABILITY_BANDS[0].departedPct} of those below the median had departed against ` +
    `${MOVABILITY_BANDS[1].departedPct} of those at or past it (base rate ${MOVABILITY_EVIDENCE.baseRatePct}%). ` +
    `Read as a screen rather than a probability it fires rarely, and is right about three times in four when it does: ` +
    `${MOVABILITY_EVIDENCE.precisionPct}% precision at ${MOVABILITY_EVIDENCE.recallPct}% recall, ` +
    `a lift of ${MOVABILITY_EVIDENCE.lift} over the base rate.`,
} as const;

export interface TenureInfo {
  sitting: boolean;
  /** Years in the seat: elapsed for a sitting leader, completed for a past one. */
  currentTenure: number | null;
  /** Cohort median completed tenure -- the single band boundary. */
  median: number | null;
  /** This person's own average completed tenure across earlier appointments. */
  personalAvg: number | null;
  /** Completed spells the cohort median is built from. */
  cohortN: number;
}

export interface MovabilityRating extends MovabilityBandDef {
  reason: string;
}

/**
 * The band, or null when there is nothing to band: a past leader, an unknown
 * start year, or a cohort with no completed tenures to take a median from.
 */
export function movabilityBand(t: TenureInfo | undefined): MovabilityRating | null {
  if (!t || !t.sitting || t.currentTenure == null || t.median == null) return null;
  const ct = t.currentTenure;
  const own =
    t.personalAvg != null
      ? ` · usually stays ~${Math.round(t.personalAvg)} yr${Math.round(t.personalAvg) === 1 ? "" : "s"}`
      : "";
  const cohort = t.cohortN ? ` (n=${t.cohortN.toLocaleString()})` : "";
  const band = ct >= t.median ? MOVABILITY_BANDS[1] : MOVABILITY_BANDS[0];
  const side = ct >= t.median ? "at or past" : "below";
  return {
    ...band,
    reason: `${ct} yr${ct === 1 ? "" : "s"} in role, ${side} the cohort median of ${t.median} yrs${cohort}${own}`,
  };
}

/**
 * The cohort inputs the band needs, computed the one way everywhere it is shown:
 * completed, non-interim spells for the median (never a sitting leader's frozen
 * tenure), and this person's own completed appointments for their average.
 */
export function tenureInfoFor(dean: Dean, cohort: Dean[], pastPositions?: { startYear: number | null; endYear: number | null; tenureLength: number | null }[]): TenureInfo {
  // The feeder bench gets no reading. Two reasons, and either alone is enough.
  // The cohort median is built from completed DEAN appointments, so banding an
  // associate dean against it compares them to a different job. And the bench is
  // a current-roster snapshot: 37 of 11,930 rows carry a start date at all, so
  // for almost all of them there is no years-in-seat to band in the first place.
  // Until F14's pipeline changes that, a movability claim about the bench is
  // unsupported and the product should not make one.
  if ((dean as { roleType?: string }).roleType === "subdean") {
    return { sitting: isSitting(dean), currentTenure: null, median: null, personalAvg: null, cohortN: 0 };
  }
  const stats = tenureStats(cohort);
  const own = (pastPositions ?? cohort.filter((x) => x.dean === dean.dean && x.id !== dean.id))
    .map((p) => completedTenure(p))
    .filter((t): t is number => t != null && t > 0);
  return {
    sitting: isSitting(dean),
    currentTenure: isSitting(dean)
      ? (dean.startYear ? CURRENT_YEAR - dean.startYear : null)
      : completedTenure(dean),
    median: stats.median,
    personalAvg: own.length ? own.reduce((a, b) => a + b, 0) / own.length : null,
    cohortN: stats.n,
  };
}
