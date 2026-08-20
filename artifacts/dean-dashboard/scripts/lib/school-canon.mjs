// Shared institution-name canonicalizer.
//
// The corpus grew index by index, and different collection waves spelled the same
// institution differently -- "University of California, Berkeley" in the education /
// nursing / pharmacy / public-health / ag / creative-arts files vs "University of
// California Berkeley" in the admin / arts / business / provost / university / law
// files. Anything that keys on the raw university string therefore splits one school
// into two buckets. That is invisible in a single-index view and very visible in
// affinity, which is cross-index by construction: half of Berkeley's alumni and
// faculty ties land under one spelling and half under the other, so a Scout Assistant
// run on Berkeley silently shows about half the bench it should.
//
// This module is the single place that decides "these two strings are the same
// school". It is deliberately conservative: campuses and system offices stay
// distinct (Rutgers-Camden is not Rutgers; the LSU System is not LSU), and only
// verified same-institution spellings are merged.
//
// Used by gen-affinity.mjs and check-school-names.mjs.

/**
 * Normalize an institution string for comparison.
 *
 * Folds combining diacritics (Mānoa -> manoa), drops the Hawaiian okina and curly
 * apostrophes outright rather than turning them into word breaks (Hawaiʻi -> hawaii,
 * not "hawai i"), unifies the Unicode dash family, then strips to [a-z0-9 ].
 */
export const snorm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining accents: Mānoa -> Manoa
    .replace(/[ʻʼ‘’']/g, "") // okina + curly/straight apostrophes
    .replace(/[‐-―]/g, "-") // en/em dash family -> hyphen
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^the /, "")
    .trim();

/**
 * Looser key that ignores the punctuation-and-connective differences between
 * collection waves: "University of California, Berkeley" and "University of
 * California Berkeley" both reduce to "university of california berkeley".
 *
 * Only "at"/"in" are dropped. That is safe because every campus keeps its
 * distinguishing token: "university of alabama birmingham" still differs from
 * "university of alabama", and "university of maryland baltimore" from
 * "university of maryland baltimore county".
 */
export const vkey = (n) =>
  String(n || "")
    .replace(/\b(at|in)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Verified same-institution spellings, normalized-key -> normalized-key.
 *
 * Every entry here is one school that appears under two or more names in the
 * corpus. Campuses, system offices, and same-prefix-different-school pairs are
 * deliberately NOT listed -- see the rejected set in the comment below.
 */
export const MERGE = {
  // SUNY / CUNY parentheticals and long forms
  "university at albany": "university at albany suny",
  "university at buffalo suny": "university at buffalo",
  "university at buffalo state university of new york": "university at buffalo",
  "binghamton university suny": "binghamton university",
  "stony brook university suny": "stony brook university",
  "hunter college cuny": "hunter college",
  // Official-name vs short-name pairs
  "west chester university": "west chester university of pennsylvania",
  "lake erie college of osteopathic medicine lecom": "lake erie college of osteopathic medicine",
  "oberlin college and conservatory": "oberlin college",
  "north carolina agricultural and technical state university":
    "north carolina a and t state university",
  "state university of new york college of environmental science and forestry suny esf":
    "suny college of environmental science and forestry",
  // 2025 rename, not a second campus: Texas A&M-Commerce became East Texas A&M.
  "texas a and m university commerce": "east texas a and m university",
  "missouri state university springfield": "missouri state university",
  // Acronym suffixes on the same seat
  "university of texas medical branch at galveston utmb": "university of texas medical branch at galveston",
  "university of texas health science center at houston uthealth houston":
    "university of texas health science center at houston",
};
// Deliberately NOT merged, though they share a prefix:
//   * "<X> System" offices      -- distinct entities, and ussystem indexes them
//   * campuses                  -- Rutgers-Camden/Newark, Texas A&M-Kingsville,
//                                  Purdue Northwest/Global, UMass Boston/Dartmouth,
//                                  UNC Greensboro/Wilmington, Indiana Bloomington/
//                                  Indianapolis, UC campuses, Michigan Dearborn/Flint
//   * different schools sharing a stem -- Indiana University of Pennsylvania,
//     Saint Mary's College of California, University of Mary Washington,
//     Westminster College (Missouri), American University of Health Sciences

/** Unambiguous abbreviations and legal-name variants -> normalized canonical key. */
export const ALIAS = {
  ucla: "university of california los angeles",
  ucsd: "university of california san diego",
  ucsb: "university of california santa barbara",
  "uc berkeley": "university of california berkeley",
  berkeley: "university of california berkeley",
  cal: "university of california berkeley",
  "uc davis": "university of california davis",
  "uc irvine": "university of california irvine",
  "uc riverside": "university of california riverside",
  "uc santa cruz": "university of california santa cruz",
  "uc san francisco": "university of california san francisco",
  ucsf: "university of california san francisco",
  mit: "massachusetts institute of technology",
  penn: "university of pennsylvania",
  upenn: "university of pennsylvania",
  nyu: "new york university",
  usc: "university of southern california",
  unc: "university of north carolina",
  uva: "university of virginia",
  umich: "university of michigan",
  msu: "michigan state university",
  osu: "the ohio state university",
  "penn state": "pennsylvania state university",
  "georgia tech": "georgia institute of technology",
  asu: "arizona state university",
  // Added: recurring misses seen in career/degree free text
  smu: "southern methodist university",
  "virginia polytechnic institute and state university": "virginia tech",
  "virginia polytechnic institute": "virginia tech",
  uiuc: "university of illinois urbana champaign",
  "suny albany": "university at albany suny",
  "suny college at albany": "university at albany suny",
  "suny buffalo": "university at buffalo",
  "suny stony brook": "stony brook university",
  "suny binghamton": "binghamton university",
  "texas a and m": "texas a and m university",
  "ut austin": "university of texas austin",
};

/**
 * Trailing sub-unit phrases. "Harvard Law School" is a unit of Harvard University,
 * not an institution the corpus indexes separately, so the tie belongs to the parent.
 * Only applied after an exact match fails, so "Oberlin College" is never mistaken
 * for a sub-unit of "Oberlin".
 */
const SUBUNIT =
  /\s+(graduate school of business|school of law|law school|school of medicine|medical school|school of business|business school|school of nursing|nursing school|school of pharmacy|school of dentistry|school of dental medicine|school of public health|school of engineering|school of education|school of social work|school of journalism|school of architecture|school of divinity|divinity school|kennedy school|college of law|college of medicine|college of engineering|college of education|college of nursing|college of pharmacy|college of business|medical center|health science center|health sciences center|graduate school|college)\b.*$/;

/**
 * Build a resolver over the corpus's own institution names.
 *
 * @param {Array<{university?: string}>} records every dean record in the corpus
 * @returns {{toCanon: (org: string) => string|null, canon: Map<string,string>, variants: Map<string,Set<string>>}}
 */
/**
 * The single bucket key for an institution string: apply the verified merge, then
 * reduce to the punctuation-insensitive variant key.
 *
 * MERGE targets are written in readable snorm form, but buckets are keyed by vkey
 * (which also drops "at"/"in"), so the merge result MUST be run through vkey too --
 * otherwise "University at Buffalo (SUNY)" merges to the key "university at buffalo"
 * while plain "University at Buffalo" keys to "university buffalo", and the two
 * spellings stay in separate buckets, which is the exact bug this module exists to fix.
 */
const keyOf = (raw) => {
  const n = snorm(raw);
  return vkey(MERGE[n] || MERGE[vkey(n)] || n);
};

export function buildCanon(records) {
  // canonical key -> Map(raw spelling -> how many records use it)
  const spellCount = new Map();
  for (const r of records) {
    const raw = r && r.university;
    if (!raw) continue;
    const m = spellCount.get(keyOf(raw)) || spellCount.set(keyOf(raw), new Map()).get(keyOf(raw));
    m.set(raw, (m.get(raw) || 0) + 1);
  }
  // The spelling that dominates the corpus becomes the display name, so the
  // canonical choice follows the data instead of whichever file loaded first.
  // Ties break toward the longer (more official) spelling.
  const canon = new Map(); // canonical key -> display name
  const variants = new Map(); // canonical key -> every raw spelling seen
  for (const [k, m] of spellCount) {
    let best = null, bestN = -1;
    for (const [raw, n] of m) {
      if (n > bestN || (n === bestN && raw.length > best.length)) { best = raw; bestN = n; }
    }
    canon.set(k, best);
    variants.set(k, new Set(m.keys()));
  }
  const canonKeys = [...canon.keys()];

  /** Resolve a free-text org/degree string to a canonical institution, or null. */
  function toCanon(org) {
    const n0 = snorm(org);
    if (!n0) return null;

    const lookup = (n) => {
      if (!n) return null;
      const k = keyOf(n);
      if (canon.has(k)) return canon.get(k);
      const a = ALIAS[n] || ALIAS[vkey(n)];
      if (a && canon.has(keyOf(a))) return canon.get(keyOf(a));
      return null;
    };

    // 1) the string itself (exact, merged, or alias)
    let hit = lookup(n0);
    if (hit) return hit;

    // 2) "<Unit>, <Parent>" -- e.g. "Meadows School of the Arts, SMU"
    const comma = String(org).split(",");
    if (comma.length > 1) {
      hit = lookup(snorm(comma[comma.length - 1]));
      if (hit) return hit;
    }

    // 3) trailing sub-unit -- "Harvard Law School" -> Harvard University
    const stem = n0.replace(SUBUNIT, "").trim();
    if (stem && stem !== n0) {
      hit = lookup(stem) || lookup(stem + " university") || lookup(stem + " college");
      if (hit) return hit;
    }

    // 4) unique prefix in either direction, as before -- "University of Michigan
    //    Medical School" resolves, ambiguous stems like "University of California"
    //    (many campuses) stay unmatched rather than guessing a campus.
    const k0 = vkey(n0);
    const supers = canonKeys.filter((k) => k.startsWith(k0 + " "));
    if (supers.length === 1) return canon.get(supers[0]);
    let best = null;
    for (const k of canonKeys) if (k0.startsWith(k + " ") && (!best || k.length > best.length)) best = k;
    if (best && canonKeys.filter((k) => k0.startsWith(k + " ") && k.length === best.length).length === 1) {
      return canon.get(best);
    }
    return null;
  }

  return { toCanon, canon, variants };
}
