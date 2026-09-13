v0.2 draft, September 13, 2026

# Data rebuild specification: succession panel

Instructions for the data team. Written against the export of September 13, 2026, and the findings in the integrity audit of the same date.

Changes from v0.1, all from corrections by Justin working against the source corpus rather than the export:

- Section 3.2 was scoped far too large. It is mostly a mechanical remap, and only 11.8 percent of interim spells need a manual override.
- Section 4 diagnosed the wrong defect. The problem is cross-index duplication of the same school, not name variants within an index. Rewritten, and the fix is different.
- Acceptance tests 8 and 14 contradicted each other. Resolved in section 9.
- Section 7's person identity diagnostic understated exposure by more than an order of magnitude. Replaced.

## Executive summary

The panel's structure is sound. Keys, foreign keys, and date logic all pass, and the primary hypothesis test already runs on it. The rebuild is about four things.

1. The surprise departure variable does not currently exist as a variable. It is a deterministic relabeling of another column. Section 2 specifies how to build a real one, and it is the largest item here.
2. Three fields are empty that the paper cannot proceed without: `reports_to`, verbatim titles, and exit announcement dates.
3. The same school appears in more than one source index, which corrupts spell sequencing and inflates counts. 220 institution-school pairs appear in two or more indexes, covering 1,859 appointment rows. Section 4 fixes that, and the fix has to start with provenance rather than with names.
4. The panel records who occupied a seat, never that a seat was empty, so a vacancy cannot be told apart from an unresearched stretch. Section 5 fixes that.

Two governing principles apply throughout.

**Record evidence, derive flags.** Collect observable facts and compute classifications in analysis code. A flag baked in at collection time cannot be varied in a robustness check, and a referee will ask for exactly that variation.

**Never let "we could not determine" masquerade as a substantive value.** Every coded field needs three states: the value, an explicit determined-negative, and an explicit cannot-determine-after-search. These are different research outcomes and collapsing them destroys information.

---

## 1. Why the current exit coding fails

The audit finding is short. `unplanned_basis` is a deterministic function of `exit_reason_primary`:

| exit_reason_primary | unplanned_basis assigned | n |
|---|---|---|
| death | death | 75 |
| forced_resignation | board_dismissal | 16 |
| retirement | not_unplanned | 304 |
| return_to_faculty | undetermined (22 abrupt) | 959 |
| voluntary_upward | undetermined (11 abrupt) | 1,070 |
| unknown | undetermined (5 abrupt) | 5,997 |

Apart from 38 rows that appear to come from a keyword scan, the column adds nothing to the column it was derived from. It looks like independent coding and is not.

Three further problems compound it.

**`exit_reason_primary` is unknown for 5,997 of 8,421 spells (71 percent).** For presidents ending a spell in 1996 or later, 894 of 1,906 have a known reason.

**`coding_confidence` is uninformative.** 8,366 of 8,421 rows are `low`, including all 304 retirements and 74 of the 75 deaths. A death in office recorded at low confidence means the field was defaulted rather than assessed.

**`exit_reason_detail` is not a recoding source.** It is 78.8 percent populated, which looks promising until you read it. The text describes the appointment's historical provenance, not the departure. Typical values on unknown-reason rows: "Founding dean of Boston University School of Medicine (established 1873...)", "Early law program at Trinity College". Do not plan an LLM pass over this field expecting departure circumstances; they are not in there.

**`destination_type` is thinner than it looks.** It reads as 93.6 percent populated, but 5,381 of those values are the literal string `unknown`. Effective fill is 2,496 rows, or 29.6 percent.

Net usable instrument today: 129 unplanned exits panel-wide, 19 of them presidents, all 19 coded `death`, and 10 of those within three years of a dean appointment. Ten events.

---

## 2. Rebuilding the surprise departure variable

### 2.1 What the target population actually is

The events exist. They are simply not coded.

| Population | n |
|---|---|
| Completed president spells ending 1996 or later | 1,906 |
| Of those, non-interim spells (the vacancy-creating events) | 1,442 |
| President exits 1996+ with a dean appointment at the same institution within ±3 years | 1,138 |
| Completed dean spells ending 1996 or later | 4,491 |

The coding target is roughly 1,100 to 1,400 presidential exits, not the full 8,421. Do not code pre-1996 exits at all.

### 2.2 Structure: three layers, and only the first two get collected

**Layer 0, observable facts.** No judgment, high inter-coder agreement, and it is where most of the value sits.

| Column | Type | Definition |
|---|---|---|
| `exit_effective_date` | date | Last day in the seat, as stated |
| `exit_effective_precision` | enum | `day`, `month`, `year` |
| `exit_announcement_date` | date | Date the departure was first publicly announced |
| `exit_announcement_precision` | enum | `day`, `month`, `year` |
| `announcement_source_url` | string | The document the two dates came from |
| `announcement_source_type` | enum | `board_statement`, `institution_press_release`, `campus_news`, `trade_press`, `local_press`, `other` |
| `successor_status_at_announcement` | enum | `none_named`, `interim_named`, `permanent_named`, `search_announced_only`, `cannot_determine` |
| `successor_appointment_id` | string | FK to the next spell in the seat, once known |
| `departure_statement_quote` | string | Up to 300 characters, verbatim, from the institution or board |
| `term_end_scheduled` | date | If the appointment carried a stated term or contract end |
| `person_birth_year` | int | On `people.csv`, not here. Needed for the retirement-age test |
| `coder_id` | string | |
| `coded_date` | date | |

**Layer 1, coded circumstance.** One value, chosen by the priority order below when several apply.

`exit_circumstance` enum, in priority order:

1. `death_in_office`
2. `health_incapacity` (medical leave that did not end in return, stated health reason)
3. `dismissal_by_board` (terminated, contract terminated, removed)
4. `resignation_under_pressure` (no-confidence vote, open investigation, public controversy, resignation following board conflict)
5. `contract_nonrenewal` (term allowed to lapse, board declined to renew)
6. `resignation_to_take_other_post`
7. `scheduled_retirement` (announced as retirement, and consistent with age or stated term)
8. `return_to_faculty` (no other post, returns to a faculty line)
9. `end_of_stated_term` (term expired as scheduled, no controversy)
10. `cannot_determine`

Two supporting fields:

| Column | Type | Definition |
|---|---|---|
| `circumstance_evidence` | enum | `explicit_statement`, `contemporaneous_reporting`, `inferred_from_timing`, `none` |
| `circumstance_confidence` | enum | `high`, `medium`, `low`. Must be assessed per row, not defaulted |

The rule on `cannot_determine`: it means a coder searched and found nothing, and it requires `circumstance_evidence = none` plus at least one searched source recorded. An uncoded row stays null, not `cannot_determine`. Those are different and the analysis treats them differently.

**Layer 2, derived. Do not put these in the extract.**

`notice_days`, `off_cycle_exit`, `no_successor_at_announcement`, and any surprise flag or index are all computed in analysis code from Layers 0 and 1, so the thresholds can be varied.

### 2.3 The tiers, and honest expectations for each

The paper should report the effect separately under each tier rather than under one pooled definition.

**Tier 1, plausibly exogenous.** `death_in_office` and `health_incapacity`. These are the only circumstances unrelated to the institution's condition or to any dean's search timing. Expect roughly 20 to 45 presidential events in the 1996+ window. That is enough for a clean robustness cut and not enough to carry the paper.

**Tier 2, exogenous to the dean's timing, not to institutional conditions.** `dismissal_by_board`, `resignation_under_pressure`, `contract_nonrenewal`. Expect perhaps 150 to 300 events. These require the distress controls, because the scandal that removes a president can independently push a dean out. State that limitation in the paper rather than waiting for a referee to.

**Tier 3, timing-based, mechanical, cheap, and the one that scales.** Derived entirely from Layer 0: short notice, no successor named, off-cycle effective date. Applies to every exit with an announcement date, so potentially all 1,400. Weaker as an exogeneity claim, strong for power.

### 2.4 Why the timing fields are the highest-return item

Higher education runs on a rigid calendar, and that calendar is a measurement instrument you do not get in corporate data.

From the 495 month-precision exits in the current export, 67.7 percent fall in June, July, or August. From the 586 month-precision starts, 63.8 percent do, with 233 in July alone. Departures and arrivals cluster hard on the academic year boundary.

The consequence: an effective date in, say, February is itself evidence of a departure that did not follow the normal cycle, with no need to read circumstances at all. And the preliminary signal points the right way. Among month-precision starts, off-cycle appointments are interim 35.8 percent of the time against 28.1 percent for on-cycle ones. That is a business-only subsample of 586 and it is suggestive rather than established, but it is the pattern the design predicts.

So the instruction to the team is: prioritize `exit_announcement_date` and `successor_status_at_announcement` above exhaustive circumstance coding. Both usually sit in the same press release, so they cost almost nothing once a coder has the document open, and they apply to every exit rather than to the rare ones.

### 2.5 A caution worth passing on

Do not over-invest in the exogenous instrument. Tier 1 will stay small no matter how much effort goes in, because presidents rarely die in office. The realistic identification strategy is an event study around the onset of a presidential vacancy, with Tier 1 and Tier 2 as robustness cuts rather than as the main specification. Collect accordingly: broad and shallow on timing, narrow and deep on circumstance.

---

## 3. Fields the paper cannot proceed without

### 3.1 `reports_to` on `units.csv`

Empty on all 1,966 units. This is the moderator that separates a documented correlation from a mechanism, and it is the single highest-value missing field in the dataset.

Values: `president`, `provost`, `chancellor`, `system`, `other`, `cannot_determine`.

Reporting lines change, so code it as an observation with a year attached rather than as a fixed attribute. Populate `reports_to_year_observed` and `reports_to_source_url` on every row.

Collection is cheaper than it sounds. Institutional org charts, the provost office's own listing of deans, and Wayback snapshots of both will resolve most of it. Prioritize the 25 institutions and the units involved in the 455 treated dean appointments, then expand.

A useful secondary field while you are in there: `has_provost` on `institutions.csv`, with the year first observed. An institution with no provost layer has a structurally different cascade.

### 3.2 `title_verbatim` on `appointments.csv`

**This is a mechanical remap, not a collection project.** The v0.1 version of this section overstated the work by roughly 4x, because it measured the export's broken `seat_title_raw` column rather than what the corpus holds.

The real position, measured against the source text fields: of 2,958 interim spells corpus-wide, 2,610 already contain "interim", "acting", or "pro tempore". Only 348 (11.8 percent) need any manual attention, and those split into 242 where the word exists only in ETL origin coding and 106 with no interim word anywhere in the record.

So the task is:

1. Pipe the existing source title text into a new `title_verbatim` column, unedited, including honorifics and the full phrase ("Dean ad interim", "Acting Dean", "Interim Dean of the Faculty", "Chancellor"). Keep `unit_name` in its own field. This covers 88.2 percent of interim spells with no human involvement.
2. For the 242 ETL-origin rows, surface whatever string the origin coding used into `title_verbatim` if it is a real title, or set `interim_override` with the origin code recorded as the reason.
3. For the 106 rows with no interim word anywhere, set `interim_override = TRUE` and populate `interim_override_reason` with the source evidence that the appointment was temporary. This is the only genuinely manual bucket and it is 106 rows.

`is_interim` then becomes derivable from `title_verbatim` by a documented rule, with `interim_override` carrying the exceptions. That makes acceptance test 8 achievable rather than aspirational, which was the doubt in v0.1.

### 3.3 Month-level dates

Currently 5.7 percent of starts and 5.9 percent of exits carry month precision, and 585 of the 586 month-precision starts are business schools. The month-level analysis is impossible outside business.

This matters more than a precision footnote. At year resolution a 15-month interim presidency spans three calendar years, so year resolution systematically overstates how long a chair sat interim and pulls borderline cases into the treated group.

Do not attempt this panel-wide. Target, in order:

1. All president spells starting 1990 or later.
2. All dean spells at the same institution within five years of a president transition.
3. All 455 currently treated dean appointments and a matched set of controls.

Never impute a month. If only the year is known, keep the year and set the precision field honestly.

---

## 4. Cross-index duplication and canonical seat identity

**Correction to v0.1.** The previous version diagnosed this as name variants within an index, and prescribed string normalization. That was wrong, and it missed its own flagship example. Name normalization resolves only 11 of the 150 institution-by-unit-type cells with more than one unit. The other 139 are genuinely distinct colleges that should stay distinct.

**The actual defect is cross-index duplication of the same school.** 220 institution-school pairs appear in two or more source indexes, covering 1,859 appointment rows. The concentration is `adminleaders` against LAC (132 pairs) and `adminleaders` against R2/R3 (70 pairs).

Sarah Cole shows the mechanism. Her interim spell comes from `r1-arts-deans.json` (2023) and her permanent spell from `r1-camd-deans.json` (2024). Same university, identical school string, and the two records carry different `unit_type` values. No amount of name normalization merges them, because the names already match. The `unit_type` difference is what splits them, and `unit_type` is part of how `unit_id` is constructed.

Two consequences follow, and the second matters more than the first.

The `unit_type` field must not participate in seat identity. A school's classification is an attribute of the seat, assigned once, and never an input to the key that identifies it. Any keying scheme that includes `unit_type` will re-split the same school every time two indexes classify it differently.

And the export ships no provenance at all. `source_type` carries only `institution_site` (7,818), `other` (2,010), and `news` (492), which says nothing about which index a row came from. Running the strongest detection I can build from the export alone finds 23 cross-type near-duplicate pairs covering 375 rows, against the 220 pairs and 1,859 rows visible in the corpus. The export sees about a sixth of the problem. That is precisely why v0.1 diagnosed it wrong, and it is the first thing to fix.

**This generalizes beyond this paper.** The same indexes feed BatonIndex. A duplication defect at the corpus level propagates into every product built on it, and it will be far more expensive to unwind after the fact than to fix at the source now.

### 4.1 The fix, in order

**Step 1: add `source_index` to every appointment row.** The originating file name, verbatim (`r1-arts-deans.json`, `r1-camd-deans.json`, `adminleaders-lac.json`). Non-null on every row. Without this, cross-index duplication is undetectable downstream and no acceptance test can catch a regression.

**Step 2: deduplicate at the corpus level, before export.** Match on institution plus normalized school name, ignoring `unit_type` entirely. Record every merge in a decision log with both source rows, the chosen survivor, and the reason. Establish an explicit precedence order between indexes so the choice is a rule rather than a judgment call each time: the specialist index should generally beat `adminleaders`, since `adminleaders` is a broad sweep and the specialist indexes carry deeper research.

**Step 3: assign `seat_id` at the corpus level.** A seat is the chief executive position of one real school at one institution. It persists across renames, mergers, splits, and reclassification. It is assigned once and never recomputed from attributes at export time.

**Step 4: run the within-index name normalization.** This is the v0.1 fix, and it is still worth doing for the 11 cells it genuinely resolves. Case-fold, expand `&` to `and`, strip parenthetical qualifiers, strip leading "The", collapse whitespace. It is a small cleanup rather than the main event.

### 4.2 The seat table

Introduce a `seat_id` separate from `unit_id`.

New table, `seats.csv`:

| Column | Type | Definition |
|---|---|---|
| `seat_id` | string | Primary key |
| `institution_id` | string | FK |
| `seat_level` | enum | `president`, `provost`, `dean` |
| `unit_type` | enum | As currently defined |
| `canonical_name` | string | The current name of the school |
| `reports_to` | enum | Per section 3.1 |
| `created_year` | int | Founding, or first year the seat existed |
| `dissolved_year` | int | If the school merged or closed |
| `predecessor_seat_id` | string | If the seat descends from a merger or split |

Note that `unit_type` appears as an attribute of the seat and nowhere in its key.

And `seat_name_variants.csv` mapping every observed `unit_name` string, every legacy `unit_id`, and every `source_index` it appeared in to its `seat_id`, so the rebuild is auditable and reversible.

**Detection query to keep running after the rebuild.** Group appointment rows by institution plus normalized school name, ignoring `unit_type`. Any group spanning more than one `seat_id`, or more than one `source_index` without a recorded merge decision, is a defect. This is the check that would have caught Sarah Cole, and it cannot run until step 1 above is done.

**Also fold in the provosts.** `appointments_provost.csv` holds 1,377 rows that are currently exiled because `seat_level` had no provost value. Add `provost` to the enum and merge the file in. The provost is the layer between the president and the dean, and a three-level cascade is a materially stronger paper than a two-level one. This costs almost nothing and may be the highest-value structural change in this document after `reports_to`.

---

## 5. Seat state, not just occupancy

The corpus records occupants. It never records that a seat was empty. So a gap between spells cannot be distinguished from a stretch nobody researched, and there are 379 gaps of two years or more.

This blocks a claim the paper wants to make. "The chair was empty when the dean was appointed" and "we have no record of who held the chair" are different facts, and only the first supports the argument.

**The fix.** A coverage table, `seat_coverage.csv`:

| Column | Type | Definition |
|---|---|---|
| `seat_id` | string | FK |
| `year_from` | int | |
| `year_to` | int | |
| `coverage` | enum | `researched_complete`, `researched_partial`, `not_researched` |
| `method` | enum | `institutional_archive`, `wayback`, `web_search`, `directory`, `none` |
| `researcher_id` | string | |
| `researched_date` | date | |

With that table, a gap inside a `researched_complete` window is a genuine vacancy and can be written into `appointments.csv` as a `VACANT` row. A gap inside a `not_researched` window stays missing. The analysis then excludes unresearched stretches instead of silently treating them as permanent occupancy, which is what happens today.

This also finally makes the H5 records-quality test rigorous. `earliest_year_researched` is populated on only 665 of 1,966 units, and the coverage table supersedes it.

---

## 6. Stale interim spells

194 rows are both current and interim. 26 started in 2024 or earlier and 11 in 2023 or earlier, against a median interim duration of one year. Confirmed error: Sarah Cole is recorded as a current interim dean at Columbia's School of the Arts from 2023, while she was appointed permanent dean in June 2024.

**The fix, in two parts.**

Add `last_verified_date` to every appointment row. It is the cheapest possible defense against this entire error class, and it lets the analysis discount records that have gone stale.

Adopt a standing rule: any appointment that is both current and interim, and whose start date is more than 18 months before the extract date, must be re-verified before export. There are 26 such rows today, so the recurring cost is trivial.

While that pass runs, also close out the 22 spells ending in 2026 that run longer than 15 years. These are ETL placeholders, including the University of Tennessee's founding law dean recorded as 1890 to 2026. Set the end date to null rather than to the extract year. A null end date with `is_current = FALSE` is honest; a fabricated one corrupts every duration and overlap calculation downstream.

---

## 7. Smaller items

**`converted_to_permanent` undercounts.** 166 permanent spells are preceded by a same-person interim spell in the same unit, against 144 flagged. Most of the gap is the cross-index duplication in section 4 and will resolve with the canonical seat key. Recompute the flag after the rebuild rather than patching it. Expect the count to rise well above 166 once cross-index pairs merge, since Sarah Cole's conversion is currently invisible on both sides.

**Permanent-permanent overlaps.** 54 by strict count. Several trace to the placeholder end dates above, for instance the Boise State engineering spell recorded 1997 to 2026 overlapping three successors. Re-run the check after section 6.

**Multiple current rows.** 16 units carry two current appointments, plus the cross-index duplicates that evade that check entirely because the two rows sit under different `unit_id` values. Sarah Cole is one of those, which is why she does not appear in the list of 16. Re-run this check against `seat_id` after section 4 rather than against `unit_id`. 83 units have no current appointment, which may be correct for dissolved schools and should be confirmed against `dissolved_year`.

**`person_id` is name-derived.** The v0.1 diagnostic here was bad. Testing for career spans over 45 years finds 2 people out of 9,196, which is a test for one extreme failure mode rather than for merges generally. The right test is whether one `person_id` holds overlapping spells at two different institutions, which nobody does legitimately. That finds 29 in this export by strict overlap, and 35 in the corpus counting adjacency. The 45-year test understated exposure by more than an order of magnitude.

The priority call does not change: 35 of 9,196 is still small, and none of the five hypotheses turn on person identity. But make the call on the right number. Add a `person_aliases` table when convenient and disambiguate on doctoral institution plus year. Run the overlapping-institutions test as a standing check rather than the span test.

**`person_birth_year`** on `people.csv`. Needed to distinguish a genuine retirement from a departure framed as one, which is the standard refinement in the forced-turnover literature. Collect it only for presidents in the 1996+ window.

**`institution_year.csv`.** Do not work on this. I am building it directly from IPEDS, and 456 of the 459 institutions carry a usable `ipeds_unitid`. The three hand-coded distress flags (`accreditor_action_flag`, `public_scandal_flag`, `program_cuts_flag`) still need a human, but they sit behind everything above in priority.

---

## 8. What not to do

Scope discipline matters more than completeness here.

- Do not code exit circumstances for spells ending before 1996. They cannot enter the analysis window.
- Do not attempt to backfill `destination_type` for the 5,381 rows currently marked unknown. Low yield and it feeds no hypothesis.
- Do not collect `search_firm` broadly. It is a nice descriptive but it answers nothing on the current list.
- Do not attempt month precision panel-wide. Follow the targeting in section 3.3.
- Do not compute rates, shares, or aggregates in the extract. Ship spells and levels.
- Do not resolve overlaps, gaps, or contradictions silently. Report them and let the analysis decide.

---

## 9. Acceptance tests for the rebuild

Ship the output of these alongside the files. Each corresponds to a defect found in the current export.

1. Every primary key unique; every foreign key resolves. (Passed today; keep it passing.)
2. Every appointment row has a start date. (Passed today.)
3. No person holds two `seat_id` values at one institution with overlapping dates, unless explicitly flagged as a genuine dual appointment.
4. No two permanent spells overlap within one `seat_id`.
5. At most one current appointment per `seat_id`.
6. No appointment has an end date equal to the extract year unless the departure is independently documented.
7. Every current-and-interim appointment has a `last_verified_date` within 18 months of the extract date.
8. `is_interim` is reproducible from `title_verbatim` by the documented rule, except where `interim_override` is set with a reason.
9. `exit_circumstance = cannot_determine` appears only with `circumstance_evidence = none` and at least one recorded searched source.
10. `circumstance_confidence` is not a constant. Report its distribution; a single dominant value means it was defaulted.
11. Cross-tabulate every derived-looking field against its likely parent. No field should be a deterministic function of another while presenting as independent. This is the test the current `unplanned_basis` fails.
12. Report counts by `start_precision` and by `exit_effective_precision`, split by seat level and unit type.
13. Report `seat_coverage` totals by decade, so the H5 diagnostic can be run on the rebuild.
14. Reconcile against the published tier table. See the resolution below; this is deliberately not an equality test.
15. Every appointment row has a non-null `source_index`.
16. No institution plus normalized school name group spans more than one `seat_id`, or more than one `source_index` without a recorded merge decision.
17. No `person_id` holds overlapping spells at two different institutions.

### Resolving the conflict between tests 8 and 14

In v0.1 these two tests contradicted each other, and the contradiction would have surfaced at the acceptance gate rather than before the work started. Test 8 demands that `is_interim` be re-derivable from titles. Test 14 demanded exact reproduction of R1 27.8, R2 27.9, R3 19.9 percent. Re-deriving moves some of the 348 override rows, and the table moves with them.

The sensitivity is unforgiving. R1 has 741 president appointments in the 1996+ window, so a single reclassified row moves the R1 rate by 0.13 points and five rows move it by 0.67. If the 348 corpus-wide override rows hit presidents in window proportionally, that is on the order of 50 rows, which would move R1 by roughly six points. Exact reproduction and honest re-derivation cannot both hold.

**Test 8 wins.** The published tier numbers come from an unpublished working paper and carry no external authority. Reproducing an unaudited figure is not a virtue if the derivation behind it was unauditable, which is the whole reason section 3.2 exists.

**Implementation.** Keep both flags. Carry `is_interim_legacy` frozen at the current ETL definition alongside the newly derived `is_interim`, and ship a reconciliation exhibit listing every row where the two disagree, with the title evidence and the override reason for each. Test 14 then becomes: the rebuild reproduces R1 27.8, R2 27.9, R3 19.9 percent under `is_interim_legacy`, and every divergence under `is_interim` is accounted for row by row.

That keeps the change auditable instead of silent. It also converts a liability into an asset, since a reviewer asking how interim status was determined can be shown the reclassification and its effect directly.

---

## 10. Priority order

| Priority | Item | Section | Approximate volume |
|---|---|---|---|
| P0 | `exit_announcement_date` and `successor_status_at_announcement`, presidents, 1996+ | 2.2 | ~1,400 rows |
| P0 | `reports_to`, starting with units in the treated set | 3.1 | ~500 units, then expand |
| P0 | `title_verbatim` remap | 3.2 | mechanical for 88%; 106 rows genuinely manual |
| P0 | `source_index` on every appointment row | 4.1 | mechanical, and it gates everything in section 4 |
| P1 | Cross-index dedup, canonical `seat_id`, provost merge | 4 | 220 pairs to adjudicate, 1,377 rows to fold in |
| P1 | Stale interim re-verification and placeholder cleanup | 6 | 26 plus 22 rows |
| P1 | `exit_circumstance` coding, presidents, 1996+ | 2.2 | ~1,400 rows |
| P2 | Month-level dates, targeted | 3.3 | ~2,000 rows |
| P2 | `seat_coverage` table | 5 | 1,966 seats |
| P3 | `person_birth_year`, presidents 1996+ | 7 | ~1,900 people |
| P3 | Hand-coded distress flags | 7 | institution-years near appointments |

P0 items unblock the two hypotheses that currently cannot run at all. Everything at P2 and below improves precision on tests that already work.
