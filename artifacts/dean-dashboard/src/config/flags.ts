/**
 * Ship-time feature flags.
 *
 * Both flags below are HIDES, not deletes: the code behind each one is intact
 * and unchanged, and flipping the flag on restores the old behaviour exactly.
 * Each records why it is off and what has to be true before it goes back on.
 * Do not flip one without resolving the note.
 *
 * HOW THEY ARE READ, and all three of these matter:
 *
 *   1. BUILD-TIME CONFIG ONLY. The values come from `import.meta.env`, which
 *      Vite resolves when the bundle is built. Never read a flag from user
 *      settings, a query string, a cookie or localStorage -- if a customer can
 *      turn it on, the capability still ships.
 *   2. NOT EXPOSED IN ANY UI. No admin panel, no keyboard shortcut, no debug
 *      menu in production.
 *   3. DOCUMENTED. See "Feature flags" under the Baton Index dashboard section
 *      of PROJECT.md, so the next person to touch this finds the reason before
 *      the switch.
 *
 * To flip one on in a LOCAL build only:
 *   VITE_ENABLE_GENDER_SELECTION_FILTER=true pnpm --dir artifacts/dean-dashboard build
 */

/** A flag is on only for the exact string "true" -- any other value is off. */
const enabled = (v: unknown): boolean => v === "true";

export const FLAGS = {
  // Hides the Include: All / Women / Men selection control in Slate Builder
  // and Scout Assistant.
  // Off because it filters candidates on a protected characteristic, which
  // sits on the selection side of the recruitment/selection line.
  // Turn back on only if it is redesigned as a pool-composition readout, or
  // after counsel signs off on the current behaviour.
  ENABLE_GENDER_SELECTION_FILTER: enabled(import.meta.env.VITE_ENABLE_GENDER_SELECTION_FILTER),

  // Hides the Movability Index sentence claiming a very long tenure usually
  // means a leader is staying put.
  // Off because the D4 backtest measured the opposite: over a five-year
  // horizon across 2,711 sitting leaders, those past the 75th percentile
  // departed at 69.6% against a 57.8% base rate (55.4% below the median).
  // Turn back on only if a later measurement supports the claim.
  ENABLE_TENURE_STAYING_PUT_COPY: enabled(import.meta.env.VITE_ENABLE_TENURE_STAYING_PUT_COPY),
} as const;

/** The Include control's three values. "all" is the only one that ever ships. */
export type GenderInclude = "all" | "women" | "men";

/**
 * The state-layer clamp for the Include control.
 *
 * Every path that can introduce a gender value -- initial state, a persisted
 * slate, a URL parameter, a trial scope link, the control's own onChange --
 * goes through here. With the flag off this returns "all" unconditionally, so
 * hiding the buttons cannot leave an inbound value quietly filtering the list.
 */
export function resolveGenderInclude(v: unknown): GenderInclude {
  if (!FLAGS.ENABLE_GENDER_SELECTION_FILTER) return "all";
  return v === "women" || v === "men" ? v : "all";
}

/**
 * The gender predicate, belt and braces with resolveGenderInclude: with the
 * flag off it returns true for every candidate, so a code path we have not
 * thought of cannot reintroduce the filtering.
 *
 * @param value the Include selection
 * @param norm  the candidate's normalised gender, from genderNorm()
 */
export function passesGenderInclude(value: GenderInclude, norm: "M" | "F" | ""): boolean {
  if (!FLAGS.ENABLE_GENDER_SELECTION_FILTER) return true;
  if (value === "all") return true;
  return value === "women" ? norm === "F" : norm === "M";
}
