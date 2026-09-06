/**
 * The storage-side tenure invariant, and the guard that enforces it.
 *
 * This is the build-time mirror of src/data/tenure.ts. The frontend module keeps
 * a bad record out of a statistic; this one keeps it out of the file, which is
 * the only fix that stops the error coming back. Both encode the same two rules:
 *
 *   1. A leader who is still in the seat has no tenure length. Their spell is
 *      right-censored -- storing a frozen number for it means every screen that
 *      filters on "has a tenure length" averages still-serving snapshots in with
 *      finished appointments.
 *   2. Arithmetic that cannot be true is not stored. A negative span, a year of
 *      zero standing in for "not documented", a spell longer than a career.
 *
 * Generators call normalizeTenureFields() on every record they write.
 * scripts/validate-tenure.mjs fails the build on anything that still violates it.
 */

/** Longest span accepted as one person's single completed appointment. */
export const MAX_PLAUSIBLE_TENURE_YEARS = 60;

/** Nothing in the corpus predates 1850; below this a year is a placeholder. */
export const MIN_PLAUSIBLE_YEAR = 1700;

/** Label marking a boundary the sources do not document (the corpus convention). */
export const UNKNOWN_LABEL = "unknown";

const isUnknownLabel = (label) => /^\s*unknown\s*$/i.test(String(label ?? ""));

/** The record's end is not documented -- distinct from still being in the seat. */
export const hasUnknownEnd = (r) => r.endYear == null && isUnknownLabel(r.endLabel);

/** Still in the seat: no end year, and no "unknown end" marker. */
export const isSitting = (r) => r.endYear == null && !isUnknownLabel(r.endLabel);

const placeholderYear = (y) => y != null && (!Number.isFinite(y) || y < MIN_PLAUSIBLE_YEAR);

/**
 * Every way this record's tenure arithmetic is impossible or contradicts the
 * invariant, as { code, detail } objects. Empty means the record is sound.
 */
export function tenureViolations(r) {
  const out = [];
  const push = (code, detail) => out.push({ code, detail });
  const { startYear, endYear, tenureLength } = r;

  if (placeholderYear(startYear)) push("placeholder-start-year", `startYear=${startYear}`);
  if (placeholderYear(endYear)) push("placeholder-end-year", `endYear=${endYear}`);
  if (isSitting(r) && tenureLength != null)
    push("sitting-with-tenure", `still in the seat but carries tenureLength=${tenureLength}`);
  if (hasUnknownEnd(r) && tenureLength != null)
    push("unknown-end-with-tenure", `end year undocumented but carries tenureLength=${tenureLength}`);
  if (tenureLength != null && (!Number.isFinite(tenureLength) || tenureLength < 0))
    push("negative-tenure", `tenureLength=${tenureLength}`);
  if (tenureLength != null && Number.isFinite(tenureLength) && tenureLength > MAX_PLAUSIBLE_TENURE_YEARS)
    push("implausible-tenure", `tenureLength=${tenureLength} exceeds ${MAX_PLAUSIBLE_TENURE_YEARS} years`);
  if (!placeholderYear(startYear) && !placeholderYear(endYear) && startYear != null && endYear != null) {
    const span = endYear - startYear;
    if (span < 0) push("end-before-start", `${startYear} -> ${endYear}`);
    else if (span > MAX_PLAUSIBLE_TENURE_YEARS)
      push("implausible-span", `${startYear} -> ${endYear} is ${span} years`);
    else if (tenureLength != null && Math.abs(tenureLength - span) > 1)
      push("tenure-disagrees-with-years", `tenureLength=${tenureLength} but ${startYear} -> ${endYear} is ${span}`);
  }
  return out;
}

/**
 * Apply the invariant to one record, in place, and report what changed.
 *
 * Deliberately narrow: it drops values that cannot be true and marks
 * undocumented boundaries. It never invents a year, and it never rewrites a
 * span that is merely long -- an implausible span is left to fail validation,
 * because deciding which end of it is wrong takes a source, not a rule.
 */
export function normalizeTenureFields(r) {
  const changes = [];
  const set = (field, value, why) => {
    if (r[field] === value) return;
    changes.push(`${field}: ${JSON.stringify(r[field])} -> ${JSON.stringify(value)} (${why})`);
    r[field] = value;
  };

  // A year of zero (or any pre-1700 value) is a placeholder for "not documented",
  // not a date. Mark the boundary unknown so a missing end is never read as
  // "still in the seat".
  if (placeholderYear(r.startYear)) {
    set("startYear", null, "placeholder start year");
    if (!r.startLabel || /^0*$/.test(String(r.startLabel))) set("startLabel", UNKNOWN_LABEL, "placeholder start year");
  }
  if (placeholderYear(r.endYear)) {
    set("endYear", null, "placeholder end year");
    set("endLabel", UNKNOWN_LABEL, "placeholder end year");
  }
  // No end year, whether they are still serving or the end is undocumented:
  // there is no completed spell to store.
  if (r.endYear == null && r.tenureLength != null)
    set("tenureLength", null, isSitting(r) ? "still in the seat" : "end year undocumented");
  if (r.startYear == null && r.tenureLength != null)
    set("tenureLength", null, "start year undocumented");
  if (r.tenureLength != null && (!Number.isFinite(r.tenureLength) || r.tenureLength < 0))
    set("tenureLength", null, "negative tenure");
  if (r.tenureLength != null && r.tenureLength > MAX_PLAUSIBLE_TENURE_YEARS)
    set("tenureLength", null, `longer than ${MAX_PLAUSIBLE_TENURE_YEARS} years`);
  if (r.startYear != null && r.endYear != null && r.endYear < r.startYear && r.tenureLength != null)
    set("tenureLength", null, "end year before start year");
  // The years are the primary record and the length is derived from them, so when
  // the two disagree the stored length is what goes: it is the copy, and keeping
  // it means two screens reading the same row get different answers.
  if (r.startYear != null && r.endYear != null && r.tenureLength != null &&
      Math.abs(r.tenureLength - (r.endYear - r.startYear)) > 1)
    set("tenureLength", null, `disagrees with ${r.startYear} -> ${r.endYear}`);
  return changes;
}
