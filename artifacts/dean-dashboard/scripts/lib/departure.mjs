/**
 * Departure categories, and interim-to-permanent conversions.
 *
 * Both are DERIVED from what the corpus already records, not collected afresh.
 *
 * Departure category. `nextRole` is populated on 94.5% of departed spells, but
 * "populated" is doing a lot of work there: 7,343 of 12,941 departures say
 * literally "Unknown", so the destination is actually recorded for 4,891 (37.8%).
 * On top of that the recorded values are not one vocabulary -- ten canonical
 * codes, two of which overlap (`Faculty_emeritus` vs `Retired_or_emeritus`), plus
 * 58 free-text strings naming a specific job. This module maps all of it onto one
 * closed set of mutually exclusive categories, which is what a competing-risks
 * model needs: leaving for a provostship, retiring, and being pushed out are
 * different events with different predictors, and one "departed" outcome hides
 * that.
 *
 * Conversions. An interim who wins the permanent job is a real outcome variable
 * and every provost asks about it. It is already derivable -- an interim spell
 * followed by the same person holding the same seat permanently -- and the
 * corpus half-records it: `convertedToPermanent` is set on 210 rows, but with
 * three different meanings across indices (on the interim spell in some, on the
 * permanent spell in others, and on 47 permanent spells whose interim predecessor
 * is not in the corpus at all), and eleven indices never set it. So it is defined
 * here once and derived for every index.
 *
 * What this does NOT do is recover WHY someone left when the record does not say.
 * Involuntary exit in particular stays hard: 32 records in the entire corpus carry
 * `involuntary`, and it is the category least likely to be documented publicly.
 * An `unknown` category here means unknown, and must not be read as "voluntary".
 */

/**
 * The closed set. One row per spell, mutually exclusive, exhaustive.
 *
 * `ambiguous` marks a category whose SOURCE coding blurs a boundary we would want
 * sharp for competing risks -- the corpus conflates returning to the faculty with
 * retiring into an emeritus title, and no amount of re-coding the existing string
 * separates those two. Anyone modelling on these categories should treat the
 * faculty/retirement boundary as soft rather than assume the split is measured.
 */
export const DEPARTURE_CATEGORIES = {
  promotion: {
    label: "Provost, president or chancellor",
    definition: "Moved up into a university-wide office.",
  },
  another_deanship: {
    label: "Another deanship",
    definition: "Took the same kind of job at a different college.",
  },
  other_leadership: {
    label: "Other senior administration",
    definition: "A vice-presidency, vice-provostship, or a university centre or institute directorship.",
  },
  faculty: {
    label: "Returned to the faculty",
    definition: "Went back to a professorship, an endowed chair, or a department headship.",
    ambiguous: "The corpus's own `Faculty_emeritus` code covers both an active return to teaching and an emeritus title on retirement.",
  },
  retirement: {
    label: "Retired",
    definition: "Left the workforce.",
    ambiguous: "The corpus's `Retired_or_emeritus` code overlaps `Faculty_emeritus`; the boundary between retiring and returning to the faculty is not cleanly measured.",
  },
  external: {
    label: "Industry, government or nonprofit",
    definition: "Left the academy for a company, an agency, or a foundation.",
  },
  death: { label: "Died", definition: "Died in office, or before another role is recorded." },
  continued: {
    label: "Continued leading the same college",
    definition: "The spell ended on paper only -- almost always an interim confirmed as permanent.",
  },
  other: {
    label: "Other",
    definition: "A destination the record names but that fits none of the categories above.",
  },
  unknown: {
    label: "Not recorded",
    definition: "The record does not say where they went. NOT evidence that the exit was voluntary.",
  },
};

/** Canonical `nextRole` codes -> category. The corpus's own vocabulary. */
const CODE_TO_CATEGORY = {
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

// Agencies, companies and outside nonprofits named in the free-text tail. Needed
// because "Director, DOE Office of Science" and "Director, Yale Nanoscience
// Institute" are the same job title pointing at completely different employers,
// and only the employer decides whether someone left the academy. Deliberately a
// list of named organisations rather than words like "foundation" or "institute",
// which universities use for their own units ("Interim Foundation Director, MSU").
const EXTERNAL_ORG = /\b(nsf|doe|nasa|jpl|census bureau|ferc|medtronic|broadcom|kavli|acm|ccst|middle states commission|enterprise partners|venture|inc\.|corp\.|llc)\b/i;

/**
 * Free-text destinations, in precedence order: [pattern, category, veto?].
 * First match wins, so order IS the logic. Three orderings carry real weight:
 *
 *  - A provostship before a vice-presidency, or "Interim Senior Vice President
 *    for Academic Affairs and Provost" reads as a VP job rather than the
 *    provostship it is.
 *  - A C-suite title before a professorship, or "Chief Scientist, US Census
 *    Bureau" reads as academic because it contains the word "scientist".
 *  - A professorship before the outside-organisation check, or "Regents
 *    Professor; Advisor to DOE and FERC" reads as leaving for government when
 *    the person is a professor who advises one.
 */
const TEXT_RULES = [
  // Before the death rule: this record says "not confirmed deceased", and a
  // substring match on "deceased" would bury a living person.
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

/**
 * The category for one spell, and how it was reached.
 *
 * `basis` is "code" (the corpus's own vocabulary), "text" (a free-text
 * destination read by the rules above), "none" (nothing recorded) or "sitting".
 * It exists so a reviewer can find every record a rule guessed at rather than
 * one a human coded -- 58 records corpus-wide, small enough to read by hand.
 */
export function deriveDepartureCategory(record) {
  if (record.endYear == null) return { category: null, basis: "sitting" };
  const raw = String(record.nextRole ?? "").trim();
  if (!raw) return { category: "unknown", basis: "none" };
  if (CODE_TO_CATEGORY[raw]) return { category: CODE_TO_CATEGORY[raw], basis: "code" };

  const text = `${raw.replace(/_/g, " ")} ${record.nextRoleDetail ?? ""}`;
  for (const [pattern, category, veto] of TEXT_RULES) {
    if (!pattern.test(text)) continue;
    if (veto && veto.test(text)) continue;
    return { category, basis: "text" };
  }
  // A destination is named but no rule claims it. "other", never "unknown" --
  // the two mean different things and collapsing them would overstate how much
  // of the corpus is genuinely blank.
  return { category: "other", basis: "text" };
}

const nameKey = (s) => String(s ?? "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
const unitKey = (r) => `${String(r.university ?? "").toLowerCase()}|${String(r.school ?? "").toLowerCase()}`;

/**
 * Interim-to-permanent conversions across one index.
 *
 * Returns a Map from record id to the flags that record should carry:
 *   convertedToPermanent -- on the INTERIM spell: this person went on to hold
 *     this seat permanently.
 *   fromInterim -- on the PERMANENT spell: this person held this seat on an
 *     interim basis first.
 *
 * The two are separate because the corpus supports each on its own. A conversion
 * is established by succession (the seat passes from a person's interim spell
 * straight to their own permanent one) or, where no permanent spell was recorded
 * separately, by the interim spell's own `Continued_same_college` next-role code.
 * And 47 permanent spells are flagged as conversions with no interim spell on
 * record anywhere -- known from the prose, not the succession -- which `fromInterim`
 * keeps rather than discards.
 *
 * "Straight to" matters: an interim who leaves, is succeeded by somebody else, and
 * returns years later has not converted. That is a re-appointment, and counting it
 * as a conversion would inflate the rate every provost asks about.
 */
export function deriveConversions(rows) {
  const flags = new Map();
  const set = (id, key) => {
    if (id == null) return;
    const cur = flags.get(id) ?? { convertedToPermanent: false, fromInterim: false };
    cur[key] = true;
    flags.set(id, cur);
  };

  const byUnit = new Map();
  for (const r of rows) {
    const k = unitKey(r);
    if (!byUnit.has(k)) byUnit.set(k, []);
    byUnit.get(k).push(r);
  }

  for (const list of byUnit.values()) {
    const ordered = [...list].sort((a, b) => (a.startYear ?? 0) - (b.startYear ?? 0));
    ordered.forEach((r, i) => {
      if (r.isInterim) {
        const next = ordered[i + 1];
        if (next && !next.isInterim && nameKey(next.dean) === nameKey(r.dean)) {
          set(r.id, "convertedToPermanent");
          set(next.id, "fromInterim");
        } else if (String(r.nextRole ?? "") === "Continued_same_college") {
          // The conversion is recorded on the spell itself; the permanent spell
          // it converted into was never entered as its own row.
          set(r.id, "convertedToPermanent");
        } else if (r.convertedToPermanent) {
          // Already flagged, with no structural evidence to rebuild it from: 33
          // interim spells whose notes read "named interim Aug 2022, formally
          // appointed permanent by March 2023" and whose permanent spell was
          // never entered as a second row. A rule cannot re-derive somebody's
          // reading of an announcement, so a recorded conversion is carried
          // forward, never overwritten. This derivation only ever ADDS.
          set(r.id, "convertedToPermanent");
        }
        return;
      }
      // A permanent spell flagged as a conversion, with no interim spell for this
      // person in this seat: the corpus knows it from the narrative rather than
      // the succession. Preserve it on the side of the pair it actually describes.
      //
      // Reading `fromInterim` as well as `convertedToPermanent` is what makes this
      // derivation a fixed point rather than a one-way trip. The first run moves
      // the fact from one field to the other; without this the second run would
      // look for a flag its own first run had already cleared, and silently drop
      // 51 recorded conversions. A derivation that consumes a field it also
      // writes has to be stable under its own output.
      if ((r.convertedToPermanent || r.fromInterim) && !ordered.slice(0, i).some((x) => x.isInterim && nameKey(x.dean) === nameKey(r.dean))) {
        set(r.id, "fromInterim");
      }
    });
  }
  return flags;
}
