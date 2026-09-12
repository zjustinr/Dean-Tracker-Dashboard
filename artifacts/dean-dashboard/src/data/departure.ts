import type { Dean } from "./types";

/**
 * Departure categories: one closed, mutually exclusive set for where a leader
 * went, derived from what the corpus already records.
 *
 * The build-time twin is scripts/lib/departure.mjs, and the two must stay in
 * step -- same categories, same rules, same precedence. Nothing is stored: the
 * category is a pure function of `nextRole`, so a second copy on 12,941 records
 * would only be a thing to keep in step for no reader that could not call this.
 *
 * Read the coverage before reading the distribution. `nextRole` is populated on
 * 94.5% of completed spells, but 62.2% of them say "Unknown" or nothing at all --
 * the destination is genuinely recorded for 37.8%. And `unknown` means unknown:
 * it is not evidence that an exit was voluntary. Involuntary exit is the category
 * the record is least likely to carry at all (32 rows corpus-wide), so it has no
 * category here and cannot get one from re-coding what is already written down.
 */

export type DepartureCategory =
  | "promotion" | "another_deanship" | "other_leadership" | "faculty"
  | "retirement" | "external" | "death" | "continued" | "other" | "unknown";

export interface DepartureCategoryDef {
  label: string;
  definition: string;
  /** Set where the SOURCE coding blurs a boundary this category depends on. */
  ambiguous?: string;
}

export const DEPARTURE_CATEGORIES: Record<DepartureCategory, DepartureCategoryDef> = {
  promotion: { label: "Provost, president or chancellor", definition: "Moved up into a university-wide office." },
  another_deanship: { label: "Another deanship", definition: "Took the same kind of job at a different college." },
  other_leadership: { label: "Other senior administration", definition: "A vice-presidency, vice-provostship, or a university centre or institute directorship." },
  faculty: {
    label: "Returned to the faculty",
    definition: "Went back to a professorship, an endowed chair, or a department headship.",
    ambiguous: "The corpus's own Faculty_emeritus code covers both an active return to teaching and an emeritus title on retirement.",
  },
  retirement: {
    label: "Retired",
    definition: "Left the workforce.",
    ambiguous: "Retired_or_emeritus overlaps Faculty_emeritus; the boundary between retiring and returning to the faculty is not cleanly measured.",
  },
  external: { label: "Industry, government or nonprofit", definition: "Left the academy for a company, an agency, or a foundation." },
  death: { label: "Died", definition: "Died in office, or before another role is recorded." },
  continued: { label: "Continued leading the same college", definition: "The spell ended on paper only — almost always an interim confirmed as permanent." },
  other: { label: "Other", definition: "A destination the record names but that fits none of the categories above." },
  unknown: { label: "Not recorded", definition: "The record does not say where they went. Not evidence that the exit was voluntary." },
};

/** Display order: the destinations a searcher asks about first, then the residue. */
export const DEPARTURE_ORDER: DepartureCategory[] = [
  "promotion", "another_deanship", "other_leadership", "faculty",
  "retirement", "external", "death", "continued", "other", "unknown",
];

const CODE_TO_CATEGORY: Record<string, DepartureCategory> = {
  Provost_president_chancellor: "promotion",
  Another_deanship: "another_deanship",
  Faculty_emeritus: "faculty",
  Full_retirement: "retirement",
  Retired_or_emeritus: "retirement",
  Industry_nonprofit_govt: "external",
  Deceased: "death",
  Continued_same_college: "continued",
  Still_serving: "continued",
  Unknown: "unknown",
};

// Named agencies, companies and outside nonprofits -- not words like "foundation"
// or "institute", which universities use for their own units.
const EXTERNAL_ORG = /\b(nsf|doe|nasa|jpl|census bureau|ferc|medtronic|broadcom|kavli|acm|ccst|middle states commission|enterprise partners|venture|inc\.|corp\.|llc)\b/i;

// Precedence order is the logic; see scripts/lib/departure.mjs for why each of
// these three orderings matters.
const TEXT_RULES: [RegExp, DepartureCategory, RegExp?][] = [
  [/medical leave/i, "other"],
  [/\bdied\b|deceased/i, "death", /\bnot (confirmed )?deceased\b/i],
  [/\bretir(ed|ement)\b/i, "retirement"],
  [/\bprovost\b/i, "promotion"],
  [/\b(president|chancellor)\b/i, "promotion", /\b(vice|deputy|associate|assistant)\s+(president|chancellor)\b/i],
  [/\bdean\b/i, "another_deanship"],
  [/\b(ceo|cto|chief scientist|chief financial officer)\b/i, "external"],
  [/\b(professor|chair in|scientist)\b/i, "faculty"],
  [/\b(head|chair)\b.*\b(dept|department)\b/i, "faculty"],
  [EXTERNAL_ORG, "external"],
  [/\b(vp|vice president|vice provost|vice chancellor|vc for|director|executive director)\b/i, "other_leadership"],
];

/** The category for a completed spell, or null while the leader is still serving. */
export function departureCategory(d: Dean): DepartureCategory | null {
  if (d.endYear == null) return null;
  const raw = String(d.nextRole ?? "").trim();
  if (!raw) return "unknown";
  const mapped = CODE_TO_CATEGORY[raw];
  if (mapped) return mapped;

  const text = `${raw.replace(/_/g, " ")} ${d.nextRoleDetail ?? ""}`;
  for (const [pattern, category, veto] of TEXT_RULES) {
    if (!pattern.test(text)) continue;
    if (veto && veto.test(text)) continue;
    return category;
  }
  return "other";
}

/** Counts by category over a set of records, in display order, zeroes dropped. */
export function departureBreakdown(rows: Dean[]): { category: DepartureCategory; label: string; value: number }[] {
  const counts = new Map<DepartureCategory, number>();
  for (const d of rows) {
    const c = departureCategory(d);
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return DEPARTURE_ORDER
    .filter((c) => (counts.get(c) ?? 0) > 0)
    .map((c) => ({ category: c, label: DEPARTURE_CATEGORIES[c].label, value: counts.get(c) as number }));
}
