// One institution key, shared by everything that joins across indexes.
//
// school-canon.mjs already decides "are these two strings the same school" for the
// corpus's own spellings. This adds the one case it deliberately does not cover:
// index spellings that name a flagship campus by its short form. The B-school index
// writes "University of Maryland" for the Smith School, which is at College Park,
// and school-canon will not fold a bare system name onto a campus on its own --
// correctly, since "University of Maryland" could equally mean Baltimore County.
//
// Every entry below was confirmed against the source record's own city and state
// before being added. Babson College is deliberately absent: it has no row in either
// president index, so it drops out of a president-to-dean join rather than being
// attached to an institution it is not part of.

import { snorm, vkey, MERGE, ALIAS } from "./school-canon.mjs";

/** Short-form index spellings -> the campus they actually name. */
export const CAMPUS = {
  "indiana university": "indiana university bloomington", // Kelley, Bloomington IN
  "penn state university": "pennsylvania state university", // Smeal, University Park PA
  "university of maryland": "university of maryland college park", // Smith, College Park MD
  "university of minnesota": "university of minnesota twin cities", // Carlson, Minneapolis MN
  "university of tennessee": "university of tennessee knoxville", // Haslam, Knoxville TN
  "washington university st louis": "washington university in st louis", // Olin, St. Louis MO
};

/** The single bucket key for an institution name. */
export const keyOf = (raw) => {
  const n = snorm(raw);
  const merged = MERGE[n] || MERGE[vkey(n)] || ALIAS[n] || n;
  return vkey(CAMPUS[vkey(merged)] || CAMPUS[merged] || merged);
};

/** Stable, file-safe id derived from the bucket key: "university of iowa" -> "US-UNIVERSITY-OF-IOWA". */
export const idOf = (raw) =>
  "US-" +
  keyOf(raw)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase();
