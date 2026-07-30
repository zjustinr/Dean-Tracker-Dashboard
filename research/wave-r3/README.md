# R3 build raw research (2026-07-30)

Raw agent output for the Carnegie R3 (Doctoral/Professional Universities, 2021
vintage, 187 institutions per `research/universe/universe_r3.json`) build,
merged into the existing `usr2` index to make "R2/R3 Presidents" per Justin's
2026-07-30 decision.

`x_w{wave}_a{agent}.json` -- one file per research agent, 4 institutions each
(waves 1-8, 47 files total, batched from `research/r3_batches/`).

`y_merged.json` -- all 47 files concatenated, with 3 institutions dropped
(Northeastern University Professional Programs, South University-Columbia,
South University-Savannah Online -- none are independently degree-granting
with their own president/chancellor) and the two "University of St Thomas"
entries (Saint Paul, MN and Houston, TX -- both legitimately separate
institutions) disambiguated by name. This is what fed
`node research/etl_leaders.mjs --glob y --out r1-r3temp --label "R3 University"`,
whose output was then appended to `r1-r2public-deans.json` /
`-schools.json` with ids renumbered to continue after R2's.

Same 1996+ appointment cap as the R2 build; pre-1996 history backfill is
scheduled alongside R2's (see [[r2-regional-public-index]] in memory).

**Known follow-up work, not done in this pass:**
- No portraits: research prompts didn't collect photoUrl. 181 sitting leaders
  need a photo-fetch pass like the one `research/fetch_photos.mjs` runs off
  R2's manifest.
- No headhunter-style enrichment (LinkedIn/News/career research, alma mater)
  for the new R3 leaders -- the phdField and career-roots backfills run
  2026-07-30 only covered leaders that existed in the corpus before this
  build landed.
- A few institutions carry data gaps flagged in their own `notes` fields
  rather than fabricated (unnamed interims, unconfirmed prior/next roles) --
  search each file for `"Unknown"` or `unresolved`/`could not` in notes to
  find them.
- Institutions worth a second look on data-quality fit for a headhunter
  product: Taft University System (DEAC-only, for-profit, thin records),
  University of Phoenix-Arizona and Colorado Technical University-Colorado
  Springs (for-profit, real leadership but different buyer profile than the
  rest of the index). Left in for now since none are fabricated.
