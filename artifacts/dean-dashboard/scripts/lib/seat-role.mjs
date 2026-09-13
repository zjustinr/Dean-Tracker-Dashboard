// Seat-vs-cabinet classification for every dated leadership row in the corpus.
//
// WHY A NEW FIELD RATHER THAN `roleTier`
// --------------------------------------
// The corpus-pass scope proposed populating `roleTier`, on the grounds that it
// already exists with the right shape and is only 4% filled. Reading its consumers
// says otherwise: `useScoutCandidates.ts` reads `roleTier` for BENCH candidates and
// maps "Department Chair" and "Associate Dean"/"Vice Dean"/"Assistant Dean" onto
// scoring categories, and `datasets.ts` documents it as the mechanism by which "a
// feeder bench can drop in". It is a bench label, not a seat label. Stamping sitting
// presidents into it would not break the mapping today -- those values simply miss
// every branch -- but it would quietly change what the field means to every future
// reader, which is how the overloading of `discipline` (academic field on some rows,
// job title on others) happened in the first place.
//
// So `seatRole` is additive and purpose-named, and sits alongside the two existing
// role fields rather than competing with them:
//
//   `roleType`  dean | subdean        -- is this the seat-holder or the feeder bench
//   `roleTier`  "Associate Dean", ... -- which kind of bench role, for scoring
//   `seatRole`  see below             -- which seat in the hierarchy this row is
//
// WHAT PROBLEM IT SOLVES
// ----------------------
// The corpus files the chief executive and their cabinet under one key. Arizona
// State's rows hold Michael Crow (president, 2002) beside Morgan Olsen (EVP and CFO,
// 2008); Ball State's hold a president and two vice presidents. Nothing in the row
// says which is which, and `startYear` presence does not separate them -- 191
// non-chief-executive rows carry a start year in the president indexes alone. Every
// consumer that wants "who actually held this seat" has to rebuild a title
// classifier, and only the succession panel ever did.
//
// IMPORTANT: populating this field does NOT by itself change what the dashboard
// shows. The UI selects seat-holders as `roleType !== "subdean"`, which still lets
// cabinet rows through. Adopting `seatRole` in those consumers is a separate change
// with its own risk, deliberately not bundled here.

import { isChiefExecutiveSeat } from "./interim-panel.mjs";

/** The phrase before the first comma, lowercased -- the corpus appends bio after it. */
const head = (r) =>
  String(r.discipline || "")
    .split(",")[0]
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Associate/assistant/vice/deputy anything: the feeder bench, never the seat.
 *
 * The leading "interim"/"acting" is stripped before this runs, because otherwise
 * "Interim Vice President for Student Affairs" matches nothing and falls through to
 * unresolved -- which is how 358 plainly-classifiable adminleaders rows were landing
 * in the unresolved bucket.
 */
const SUBORDINATE = /^(associate|assistant|senior associate|senior assistant|deputy|vice)\b/;
/** Leading temporariness, which never changes WHICH seat a row is. */
const stripActing = (h) => h.replace(/^(interim|acting|co)\s+/, "").trim();
/** Officers reporting to the chief executive: not a seat in the academic hierarchy. */
const CABINET =
  /^(chief |general counsel|treasurer|secretary|director of athletics|athletic director|controller|registrar|chief of staff|university counsel)/;
const PROVOST = /^(provost|chief academic officer)\b/;
/**
 * Chief-executive titles that do not begin with the word.
 *
 * California's community colleges style the head "Superintendent/President", which
 * is the chief executive of the district under another name; 56 such rows were
 * unresolved before this.
 */
/**
 * Chief-executive titles that do not begin with "president" or "chancellor".
 *
 * Two real families, both unambiguous:
 *   - California's community colleges style the head "Superintendent/President".
 *   - The service academies -- Air Force, West Point, Annapolis -- and VMI call
 *     theirs "Superintendent" outright. All 34 such rows sit in the LAC index.
 *
 * NOTE: `head()` has already stripped punctuation, so "Superintendent/President"
 * arrives here as "superintendent president"; matching a literal slash matched
 * nothing and left 56 rows unresolved on the first attempt.
 */
const CHIEF_ALIAS =
  /^(superintendent( president)?|president superintendent|college president|district president|campus (president|chief executive))\b/;
const DEAN = /^dean\b|^head of school\b/;

/**
 * Which seat a row occupies.
 *
 * Values, and the reason each exists:
 *   `chief_executive`  president / chancellor / rector of the institution.
 *   `provost`          chief academic officer, the layer between president and dean.
 *   `dean`             head of a school or college.
 *   `subordinate`      associate / assistant / vice of any of the above. Distinct
 *                      from `roleType: "subdean"`, which only some indexes populate.
 *   `cabinet`          CFO, CIO, general counsel, athletics -- reports to the chief
 *                      executive, holds no academic seat.
 *   `""`               unresolved. Left empty rather than guessed, so "we could not
 *                      tell" never masquerades as a classification.
 *
 * `indexRole` is what the file itself implies -- a row in `r1-lawschool-deans.json`
 * is a law deanship whatever its `discipline` says, and for the five indexes whose
 * `discipline` holds an academic field ("Law", "Finance") that is the only signal
 * there is. It is consulted only after the title fails, never before.
 */
export function classifySeatRole(record, { indexRole = "", leaderTitle = "" } = {}) {
  const h = head(record);
  const bare = stripActing(h);

  // The bench first: "Vice Provost" must not read as "Provost", and the corpus's own
  // subdean flag is authoritative where a collection wave bothered to set it.
  if (record.roleType === "subdean") return "subordinate";
  if (bare && SUBORDINATE.test(bare)) return "subordinate";

  // Chief executive uses the same test the succession panel uses, so the two agree
  // by construction rather than by coincidence. It consults the institution's own
  // leader title, which is how the handful of institutions led by a Dean or a Senior
  // Vice President and Provost are not misfiled.
  if (h && isChiefExecutiveSeat(record, leaderTitle)) return "chief_executive";
  if (bare && CHIEF_ALIAS.test(bare)) return "chief_executive";

  if (bare && PROVOST.test(bare)) return "provost";
  if (bare && DEAN.test(bare)) return "dean";
  if (bare && CABINET.test(bare)) return "cabinet";

  // Title exhausted. Fall back to what the index means, which is reliable for the
  // dean indexes and for provosts, and says nothing useful anywhere else.
  if (!h || indexRole === "dean" || indexRole === "provost" || indexRole === "cabinet") return indexRole || "";
  return "";
}

/** What each index implies about rows in it, where that is unambiguous. */
export const INDEX_ROLE = {
  "r1-university-deans.json": "", // mixes the president with the whole cabinet
  "r1-r2public-deans.json": "",
  "r1-lac-deans.json": "",
  "r1-communitycollege-deans.json": "",
  // Cabinet rosters by construction: every row is an officer reporting to the chief
  // executive, so a row whose title resolves to nothing is still not an academic
  // seat. The title is consulted first regardless, which is how the six presidents
  // of affiliated institutes in adminleaders still classify as chief executives.
  "r1-adminleaders-deans.json": "cabinet",
  "r1-advancement-deans.json": "cabinet",
  "r1-system-deans.json": "",
  "r1-provost-deans.json": "provost",
  "r1-bschool-deans.json": "dean",
  "r1-lawschool-deans.json": "dean",
  "r1-medschool-deans.json": "dean",
  "r1-eschool-deans.json": "dean",
  "r1-nursing-deans.json": "dean",
  "r1-publichealth-deans.json": "dean",
  "r1-education-deans.json": "dean",
  "r1-arts-deans.json": "dean",
  "r1-camd-deans.json": "dean",
  "r1-agschool-deans.json": "dean",
  "r1-pharmacy-deans.json": "dean",
  "r1-vet-deans.json": "dean",
  "r1-grad-deans.json": "dean",
  "deans.json": "dean",
};
