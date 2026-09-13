v0.1 draft, September 13, 2026

# Data request: hierarchical vacancy coupling in nonprofit executive succession

## What this is for

This specification supports a reframed paper on why nonprofit higher education fills executive seats on an interim basis at roughly ten times the corporate rate, and on why an interim appointment at one level of the hierarchy predicts an interim appointment at the level below.

The prior submission (MS-ORG-2026-01441, ORSC-MS-2026-23006) was desk rejected twice for insufficient theoretical contribution. The reframe rests on a finding that emerged from the president panel: interim leadership is not an institutional trait (president and dean interim shares correlate at r = 0.12, decaying to negative as the minimum appointment count rises), and it behaves instead as a synchronized event in time (45.8 percent of dean appointments made while the president's chair sat interim were themselves interim, against 31.0 percent under a seated president).

Everything requested below exists to test whether that coupling is a cascade with a direction and a mechanism, or an artifact of institutional distress affecting both seats at once.

## Hypotheses this data must be able to falsify

**H1, cascade asymmetry.** An unresolved president's seat raises the probability that a dean appointment is interim, and an unresolved dean's seat raises the probability that a president appointment is interim by substantially less. Symmetric effects would indicate a common shock rather than a cascade, which is a materially weaker paper. This is the test that decides whether the project proceeds.

**H2, discretion moderates the cascade.** The effect is larger where the president holds more direct control over the dean appointment: units reporting to the president rather than the provost, institutions without an intervening chancellor layer, and units more central to institutional identity.

**H3, the coupling is not distress.** The effect survives institution-year controls for enrollment shocks, endowment drawdown, state appropriation cuts, rating actions, accreditor actions, and public scandal.

**H4, exogenous vacancy.** Restricting to unplanned presidential exits (death, incapacitating illness, scandal-driven or board-forced departure, resignation with abnormally short notice) yields an effect of comparable or larger magnitude. This is the identification strategy the Management Science associate editor explicitly asked for.

**H5, the rise is real.** The upward trend in interim share (R1 moving from 23.7 to 31.2 percent across 1996 to 2026) survives restriction to a subsample where archival research depth is constant across the window. If recent years simply have better web records, part of the trend is artifactual and the framing must change.

**H6, regime rather than tail.** The higher education interim rate exceeds the corporate rate by an order of magnitude across every tier, sector, and decanal unit type. Corporate benchmarks come from the published literature, so no pull is needed, but the internal breakdowns must support the comparison.

## Scope

**Institutions.** All institutions currently in either Carnegie index. Do not bound the sample by any ranking published in a single year. The 2025 USNWR bounding across a 1967 to 2026 window was flagged as a positive-selection problem in the Management Science letter, and it must not reappear. Use Carnegie classification, control, and continuous existence as the inclusion rule.

**Seats.** The president or equivalent chief executive of each institution, plus the deans of all major decanal units already in your expanded panel: business, law, medicine, engineering, arts and sciences, education, nursing, public health, and any others covered.

**Time range.**

- Appointment spells: all years available. Do not truncate at the source.
- Primary analysis window: 1996 through 2026, matching the R2 and R3 research floor.
- Extended window: full back history where it exists (R1 to the 1950s), used only for within-R1 robustness and for the H5 records-quality test.
- Institution-year panel: 1990 through 2025, with 1994 through 2026 as the binding requirement (the analysis needs lags and leads around appointments in the primary window).

## Three design decisions that must be honored

**1. Month-level dates are the single highest-value upgrade.** The current coupling result labels each dean appointment by what the president's chair was doing "that year." Year resolution both invents overlaps that did not exist and misses real ones, and it makes the ordering in H1 untestable. Wherever a month is recoverable, record it, and record the precision separately so I can run the analysis at day, month, and year resolution and show the result is not an artifact of coarseness.

**2. An interim later confirmed is two appointment rows.** You established this already. Thirty-eight presidents in the panel fit it. Folding them into one spell deletes a permanent appointment from the denominator while keeping the interim one in the numerator. Keep the two rows and link them explicitly.

**3. Appointment rows and roster rows must stay separated.** Start-date presence is the current separator, and 1378 of 2699 rows in the R1 president file are roster. Every row in `appointments.csv` must have a start date. Rows without one belong in a separate file or nowhere.

## Conventions for all files

UTF-8 CSV, RFC 4180 quoting, one file per table, header row required, snake_case column names exactly as written below. Dates in ISO 8601 (`2014-08-01`); where only a year is known write `2014-01-01` and set the precision field to `year`. Null is the empty string, never `NA`, `NULL`, `N/A`, or `-`. Booleans are `TRUE` or `FALSE`. Numbers carry no thousands separators, currency symbols, or percent signs. Dollar amounts are nominal; I will deflate.

---

## Table 1: `appointments.csv`

The spine. One row per leadership appointment spell, at any seat, at any level.

| Column | Type | Req | Definition |
|---|---|---|---|
| `appointment_id` | string | Y | Stable unique key, e.g. `{unit_id}-{start_year}-{seq}` |
| `institution_id` | string | Y | FK to `institutions.csv` |
| `unit_id` | string | Y | FK to `units.csv`. President rows use `{institution_id}-CENTRAL` |
| `seat_level` | enum | Y | `president`, `dean` |
| `seat_title_raw` | string | Y | Title exactly as recorded in the source, unedited |
| `person_id` | string | Y | FK to `people.csv` |
| `start_date` | date | Y | ISO 8601 |
| `start_precision` | enum | Y | `day`, `month`, `year`, `year_inferred` |
| `end_date` | date | N | Empty if still sitting |
| `end_precision` | enum | N | Same enum as `start_precision` |
| `is_current` | bool | Y | Sitting as of the extract date |
| `is_interim` | bool | Y | Per the coding rule below |
| `interim_word` | enum | N | `interim`, `acting`, `pro_tempore`, `other` |
| `converted_to_permanent` | bool | Y | This interim spell was followed by the same person in the permanent seat |
| `linked_permanent_id` | string | N | `appointment_id` of that permanent spell |
| `predecessor_appointment_id` | string | N | Prior spell in the same seat |
| `appointment_seq` | int | Y | Ascending order of spells within the seat |
| `is_left_censored` | bool | Y | Spell began before the unit enters the panel |
| `announcement_date` | date | N | Date the appointment was publicly announced. High value for H1 |
| `search_start_date` | date | N | Date the search launched or the committee was named. Highest value, lowest availability |
| `search_firm` | string | N | Retained search firm if named. A retained firm is evidence a real search was running, which separates a genuine search interval from a holding pattern |
| `is_internal_hire` | bool | N | Include only if your data already carries it; otherwise I derive it from `people.csv` |
| `source_type` | enum | Y | `institution_site`, `press_release`, `news`, `wayback`, `directory`, `ipeds`, `other` |
| `source_url` | string | Y | |
| `record_confidence` | enum | Y | `high`, `medium`, `low` |

**Interim coding rule.** Set `is_interim = TRUE` when the title at the start of the spell contains interim, acting, or pro tempore, or when the source explicitly describes the appointment as temporary pending a search. Record the raw title regardless, so the flag can be audited. Keep `interim_word` distinct from `is_interim`, because some institutions use "acting" for a short administrative fill and "interim" for a full holding appointment, and I want to test whether the distinction carries signal before collapsing it.

**Vacancy.** If a seat sat genuinely empty with no named occupant, record it as a row with `seat_title_raw = "VACANT"`, `person_id` empty, and `is_interim = FALSE`. Do not silently bridge the gap by extending the prior spell, which is what produces the stale-incumbency inflation already visible in the point-in-time cross-check.

---

## Table 2: `institutions.csv`

| Column | Type | Req | Definition |
|---|---|---|---|
| `institution_id` | string | Y | Primary key |
| `ipeds_unitid` | string | Y | IPEDS UNITID, the join key to everything external |
| `institution_name` | string | Y | |
| `state` | string | Y | Two-letter |
| `control` | enum | Y | `public`, `private_nonprofit`, `private_forprofit` |
| `carnegie_2021` | enum | N | `R1`, `R2`, `R3`, `other` |
| `carnegie_2025` | enum | N | `R1`, `R2`, `R3`, `other` |
| `carnegie_basic` | string | N | Full basic classification string |
| `is_system_member` | bool | Y | Belongs to a multi-campus system with a system head above the president |
| `system_name` | string | N | |
| `chief_exec_title` | string | Y | President, Chancellor, Rector, or other. Needed so the three institutions led by a Dean or a Senior Vice President and Provost are not dropped |
| `has_med_school` | bool | Y | |
| `has_law_school` | bool | Y | |
| `religious_affiliation` | string | N | From IPEDS HD. Governance-relevant |
| `board_size` | int | N | Number of trustees. Best effort |
| `board_type` | enum | N | `self_perpetuating`, `state_appointed`, `elected`, `mixed`. Best effort, high value for the mechanism |
| `first_year_in_panel` | int | Y | |

The `is_system_member` and `chief_exec_title` fields matter more than they look. A campus president inside a state system sits under a chancellor who may hold the real appointment power, which changes what an unresolved president's seat means for a dean search.

---

## Table 3: `units.csv`

| Column | Type | Req | Definition |
|---|---|---|---|
| `unit_id` | string | Y | Primary key |
| `institution_id` | string | Y | FK |
| `unit_type` | enum | Y | `central`, `business`, `law`, `medicine`, `engineering`, `arts_sciences`, `education`, `nursing`, `public_health`, `other` |
| `unit_name` | string | Y | As the institution names it |
| `reports_to` | enum | Y | `president`, `provost`, `chancellor`, `system`, `other`. **This is the moderator for H2 and the most important single field in this table** |
| `reports_to_source_url` | string | N | Reporting lines change; cite the source and the year observed |
| `reports_to_year_observed` | int | N | |
| `aacsb_accredited` | bool | N | Business units only |
| `accreditation_first_year` | int | N | |
| `unit_founded_year` | int | N | |
| `first_year_in_panel` | int | Y | Earliest year with usable appointment records |
| `last_year_in_panel` | int | Y | |
| `research_depth` | enum | Y | `deep_archival`, `standard_web`, `light`. **Required for H5** |
| `earliest_year_researched` | int | Y | Earliest year the research actually reached for this unit, whether or not a record was found |

`research_depth` and `earliest_year_researched` are what make the H5 test possible. Without them I cannot build a subsample where coverage is constant across the window, and I cannot rule out that the rise in interim share is a rise in record availability. Your own R3 caveat (thin research misses single-year interim spells first) applies with equal force to early years in every tier, and a referee will find it.

---

## Table 4: `people.csv`

| Column | Type | Req | Definition |
|---|---|---|---|
| `person_id` | string | Y | Primary key. One person may hold several appointments across institutions |
| `full_name` | string | Y | |
| `gender` | enum | N | `f`, `m`, `other`, `unknown` |
| `highest_degree` | enum | N | `phd`, `edd`, `jd`, `md`, `mba`, `other_masters`, `other` |
| `degree_field` | string | N | |
| `doctoral_institution_id` | string | N | FK where the institution is in the panel |
| `prior_position_title` | string | N | Position held immediately before this panel's first appointment |
| `prior_position_institution_id` | string | N | |
| `prior_dean_experience` | bool | N | Held a deanship before |
| `prior_president_experience` | bool | N | Held a presidency before |
| `first_appearance_year` | int | Y | |

Internal versus external hiring is derived at the appointment level, not here: I compute it by comparing the appointment's `institution_id` against the person's institution immediately prior. If your existing data already carries an internal-hire flag per appointment, add it to `appointments.csv` as `is_internal_hire` (bool) rather than recomputing.

---

## Table 5: `exits.csv`

This is the instrument table and the most valuable new work. One row per completed appointment spell.

| Column | Type | Req | Definition |
|---|---|---|---|
| `appointment_id` | string | Y | FK and primary key |
| `exit_date` | date | Y | |
| `exit_date_precision` | enum | Y | `day`, `month`, `year` |
| `exit_announcement_date` | date | N | Date the departure was publicly announced. **The field that makes H4 work** |
| `successor_named_at_announcement` | bool | N | Was a successor, interim or permanent, named in the same announcement |
| `exit_reason_primary` | enum | Y | See below |
| `exit_reason_detail` | string | N | One sentence, free text, with the source |
| `destination_type` | enum | N | `retirement`, `presidency_elsewhere`, `deanship_elsewhere`, `provostship`, `faculty_return`, `industry`, `government`, `nonprofit`, `deceased`, `unknown` |
| `destination_institution_id` | string | N | FK if in panel |
| `unplanned_basis` | enum | Y | See below |
| `coding_confidence` | enum | Y | `high`, `medium`, `low` |
| `source_url` | string | Y | |

`exit_reason_primary` values: `retirement`, `voluntary_upward`, `voluntary_lateral`, `return_to_faculty`, `contract_nonrenewal`, `forced_resignation`, `dismissal`, `scandal_resignation`, `health`, `death`, `unknown`.

`unplanned_basis` values: `death`, `health`, `scandal_or_investigation`, `board_dismissal`, `abrupt_resignation_short_notice`, `not_unplanned`, `undetermined`.

**On the coding you already have.** You mentioned some of this is coded for at least some leaders. Export whatever exists in this shape, populate `coding_confidence` honestly, and set `unplanned_basis = undetermined` where the existing coding does not distinguish it. Do not back-fill a guess. I would rather have 600 confident rows and 1300 undetermined ones than 1900 rows of uncertain provenance, because the instrument's credibility rests entirely on the unplanned cases being genuinely unplanned.

**Where to spend new coding effort.** Prioritize presidential exits that fall within three years of any dean appointment in the panel at the same institution. That is where all the identifying variation for H4 sits, and it is perhaps a third of the total volume. If you extend beyond that, go to R1 next.

**The two fields that carry the most weight** are `exit_announcement_date` and `successor_named_at_announcement`. Notice length is derivable from the first (`exit_date` minus `exit_announcement_date`), and a short or negative notice is the cleanest observable marker of an unplanned departure that does not require reading the circumstances. The second distinguishes an orderly handoff from a scramble. Both are usually in the same press release, so they cost little once you are already reading the source.

---

## Table 6: `institution_year.csv`

The distress controls for H3. One row per institution-year, 1990 through 2025.

| Column | Type | Req | Source |
|---|---|---|---|
| `institution_id` | string | Y | |
| `year` | int | Y | Fiscal year; state the convention once and hold it |
| `fall_enrollment_total` | int | N | IPEDS EF |
| `fall_enrollment_undergrad` | int | N | IPEDS EF |
| `first_time_freshmen` | int | N | IPEDS EF or ADM |
| `applicants` | int | N | IPEDS ADM |
| `admits` | int | N | IPEDS ADM |
| `endowment_market_value_eoy` | number | N | IPEDS Finance; NACUBO NCSE where IPEDS is thin |
| `state_appropriations` | number | N | IPEDS Finance, public institutions |
| `tuition_fees_revenue` | number | N | IPEDS Finance |
| `total_operating_revenue` | number | N | IPEDS Finance |
| `total_operating_expenses` | number | N | IPEDS Finance |
| `instruction_expenses` | number | N | IPEDS Finance |
| `private_gifts` | number | N | IPEDS Finance. You already use F1A19 for this |
| `fte_instructional_staff` | number | N | IPEDS HR |
| `credit_rating` | string | N | Moody's or S&P, best effort |
| `rating_action_flag` | enum | N | `upgrade`, `downgrade`, `outlook_negative`, `none` |
| `accreditor_action_flag` | bool | N | Probation, warning, show-cause, or sanction in force |
| `public_scandal_flag` | bool | N | Institution-level scandal in national coverage that year |
| `program_cuts_flag` | bool | N | Announced layoffs, program eliminations, or financial exigency |

Note the finance survey splits by control: private nonprofit institutions report under FASB and publics under GASB, so the same concept sits in different variables. Harmonize before delivery, or deliver both and tell me which is which. Do not silently concatenate them.

Admit rate, yield, operating margin, and year-over-year percent changes are all derived. Do not compute them; send the levels and I will build the changes, so the lag structure is consistent across every variable.

`public_scandal_flag`, `accreditor_action_flag`, and `program_cuts_flag` are the three that actually answer the distress objection, and they are the three IPEDS will not give you. They are worth hand-coding for the subset of institution-years within three years of any appointment in the panel.

---

## Table 7: `unit_year.csv`

Optional, and worth doing for business schools first if time is short.

| Column | Type | Req | Definition |
|---|---|---|---|
| `unit_id` | string | Y | |
| `year` | int | Y | |
| `usnwr_rank` | int | N | Rank published that year, not a single modern vintage applied backward |
| `usnwr_ranked` | bool | N | Distinguishes unranked from missing |
| `unit_enrollment` | int | N | |
| `reaccreditation_year_flag` | bool | N | Unit underwent accreditation review that year |

The point of `usnwr_rank` as a time-varying field is to replace the fixed 2025 bounding the Management Science letter objected to. A rank that moves with the year is a control; a rank frozen at 2025 and applied to 1996 is a selection device.

---

## What I do not need you to build

I derive the seat-state panel myself from `appointments.csv`: for each unit and each date, whether the seat was permanent, interim, or vacant, and the same for the president's seat above it. Do not construct that table. Building it from the spells is where the month-level precision earns its value, and doing it in the analysis code keeps the resolution choice a parameter I can vary rather than a decision baked into the extract.

Likewise: no rates, no shares, no aggregates. Send spells and levels.

## Quality checks before handoff

Run these and send the output alongside the files. Each one corresponds to a failure mode that has already bitten this dataset or that a referee will look for.

1. Every `appointment_id` unique. Every foreign key resolves.
2. Every row in `appointments.csv` has a non-empty `start_date`. Roster rows are excluded.
3. No two permanent spells overlap in the same seat. Report every overlap rather than silently resolving it; overlaps are the stale-incumbency problem that made the point-in-time cross-check disagree with the curated snapshot on nine of 170 R1 institutions.
4. At most one `is_current = TRUE` row per unit.
5. Every `converted_to_permanent = TRUE` row has a `linked_permanent_id` pointing at a row with the same `person_id` and a later `start_date`.
6. Counts of appointments by `start_precision`, so I know how much of the panel supports the month-level analysis.
7. Counts of appointments by decade crossed with `research_depth`. This is the H5 diagnostic and I need it before I trust the trend.
8. Counts of `is_interim` by `unit_type` and by `seat_level`, so the new decanal populations can be sanity-checked against the 32.4 percent business-school figure before any modeling.
9. Row counts per file and a one-line note on any institution deliberately excluded and why.

## Priority order

**P0, no new pull required.** Export `appointments.csv`, `units.csv`, and `institutions.csv` from what you have, with month-level dates wherever they already exist and `reports_to` populated for as many units as you can. This alone lets me run H1, the asymmetry test, which decides whether the rest is worth doing. Do not wait on anything else.

**P1.** `exits.csv` for the targeted set, existing coding exported as-is with honest confidence flags.

**P2.** `institution_year.csv` from IPEDS, plus hand-coded scandal, accreditor, and program-cut flags for institution-years near appointments.

**P3.** `announcement_date` and `search_start_date` backfill, and `unit_year.csv`.

## What I do on receipt

P0 arrives, and I run the asymmetry test in both directions at day, month, and year resolution, with the reverse conditional (president interim given an unresolved dean seat) as the falsification. I report the ratio of the two directional effects with confidence intervals, plus the H2 moderator split on `reports_to`, and the H5 records-quality diagnostic.

That result is the go/no-go. If the effect is strongly asymmetric, the paper is about a governance cascade and we build it out through P1 to P3. If it is symmetric, it is a distress story, and I will tell you plainly that the contribution is weaker and we should reconsider the target.

## Open items for you to decide

- Fiscal year versus calendar year for `institution_year.csv`. IPEDS finance is fiscal; enrollment is fall. Pick one convention for the `year` column and note the offset rather than mixing them.
- Whether the eleven institutions appearing in both Carnegie vintages keep their R1 assignment. Your sensitivity run showed it moves nothing (R1 28.2, R2 27.4, R3 19.8 percent), so I suggest holding them at R1 and reporting the swap as a robustness line.
- Whether `acting` and `interim` should be pooled. I would like them separated in the extract and will test the pooling decision empirically.
