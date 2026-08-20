// Which index belongs to which research stratum.
//
// In its own module because importing it from sample-nonacademic-research.mjs
// RAN that script -- it draws a sample at module top level, so any consumer
// silently re-sampled and rewrote the worklist file as a side effect of an
// import. Shared constants do not belong in a file that does work when loaded.
export const STRATA = {
  administrative: ["usadminleaders", "usadvancement", "ussystem"],
  professional: ["r1bschool", "r1law", "r1eschool", "uspharmacy"],
  discipline: [
    "r1arts", "useducation", "usnursing", "r1medical", "uspublichealth",
    "usag", "usvet", "usgrad", "uscreativearts",
  ],
  leadership: ["r1university", "r1provost", "uslac", "usr2"],
};

/** index id -> stratum name */
export const STRATUM_OF = Object.fromEntries(
  Object.entries(STRATA).flatMap(([s, ids]) => ids.map((id) => [id, s])),
);
