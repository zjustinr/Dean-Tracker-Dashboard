v0.1 draft, September 13, 2026

# Audit of the rebuilt succession panel

Against the rebuild specification v0.2 and the export of September 13, 2026, 16:20.

## Verdict

The structural work is done and done well. Every table the spec asked for exists, `seat_id` is properly decoupled from `unit_type`, `source_index` is on every row, the legacy interim flag is preserved, and the provosts are folded in. The QC report is unusually honest about its own failures, which is worth more than a clean report would have been.

The rebuild also produced the best new result in the project, which nobody asked for and which changes the paper. See section 2.

Three tests that report as passing do not actually test what they claim. None of this is dishonesty in the rebuild; two of the three are subtle construction problems and the third is a misclassification. But all three need fixing before the acceptance gate means anything. See section 3.

The collection work is entirely undone, and the QC report says so plainly. See section 5.

---

## 1. What genuinely passed

Keys and foreign keys resolve. Every appointment carries a start date. `source_index` is populated on all 11,776 rows, which was the gating fix and it is done.

`seat_id` no longer contains `unit_type`. Sample keys read as `US-COLUMBIA-UNIVERSITY-D-COLUMBIA-LAW-SCHOOL`, with classification held as an attribute on `seats.csv`. This is the specific change that lets the Sarah Cole case resolve, and it resolved: cross-index seat merging recovered 201 interim-to-permanent conversions against 144 before.

`unplanned_basis` is gone. `exit_circumstance` is populated only where independent corpus evidence exists, 92 rows of 9,653, all of them `death_in_office` or `dismissal_by_board`, all carrying `contemporaneous_reporting` as evidence. Nothing was fabricated to fill the column. `circumstance_confidence` is empty rather than defaulted to `low`, which is the right call and the opposite of what the previous export did.

`end_date_suppressed` is implemented correctly. All 23 suppressed rows have a genuinely null end date rather than a suppression flag sitting next to a retained value.

`successor_appointment_id` is populated on 9,553 of 9,653 exits. This was not in the spec and it is useful: it gives the vacancy-to-successor link directly, which the analysis previously had to reconstruct.

Folding in the provosts added 1,456 appointment rows and surfaced a defect class nobody could see before. 40 of 161 provost seats carry more than one sitting provost, Cornell with five, and 39 carry overlapping permanent spells. Exiling provosts to a separate file meant no check ever ran across them. Reporting those rather than resolving them is correct; closing a spell needs a source.

---

## 2. The rebuild produced a better result than the one it was built to test

Folding in the provost layer makes the three-level cascade testable for the first time, and the provost effect is roughly half again the size of the president effect.

Dean appointments starting 1996 or later:

| Layer above | Treated n | Interim rate | Control n | Interim rate | Gap | p |
|---|---|---|---|---|---|---|
| President interim | 447 | 30.6% | 4,781 | 22.0% | +8.7pp | 5.6e-05 |
| Provost interim | 601 | 34.8% | 3,668 | 21.6% | +13.2pp | 1.1e-11 |
| Both interim | 151 | 35.8% | | | | |

This is what the cascade predicts. The provost typically owns the dean search, so the proximate vacancy should bind harder than the one two layers up. The president result is a shadow of the provost result rather than the primary mechanism, which is a sharper theoretical claim than the paper currently makes.

Two things to note before leaning on it.

Provost seat-state is the least reliable layer in the panel, carrying the 40 multi-current and 39 overlapping-permanent defects above. Those defects inflate the treated group with false positives, so the measurement error should attenuate the estimate. The +13.2 is more likely conservative than overstated, but establish that rather than assert it.

And the president result barely moved under the rebuild, from +9.1 to +8.7 points, which is reassurance that the seat restructuring did not destabilize anything.

**Consequence for priorities.** The provost index was the worst-maintained file in the corpus and is now the one carrying the strongest finding. Cleaning it has moved well up the list.

---

## 3. Three tests that pass without testing anything

### 3.1 Test 14 is vacuous

The report shows zero rows where derived and legacy `is_interim` disagree. That is guaranteed by the construction, not discovered by it.

The rule appears to be: where the title contains an interim word, derive the flag from the title; otherwise set `interim_override` and restore the legacy value. Measured: 100.0 percent of override rows have `is_interim` equal to `is_interim_legacy`, and all 1,230 override rows have a title with no interim word and a resulting flag of TRUE. The override only ever runs in one direction.

So the reconciliation exhibit is empty, and the question the whole exercise existed to answer, which is which rows the legacy ETL got wrong, has not been asked.

**Fix.** Derive `is_interim` from title plus narrative evidence without consulting `is_interim_legacy` at any point. Then compare. A non-zero disagreement count is the deliverable, and if it really is zero, that is a finding rather than a construction.

### 3.2 Test 16 is circular

`seat_id` is built from institution plus normalized canonical name. A test that no institution-plus-name group spans two `seat_id` values therefore cannot fail, whatever the data looks like.

The underlying situation is nonetheless fine, established by a separate check: only 5 dean groups draw from more than one `source_index`, and all 5 are merged, with the classification conflicts recorded in `merge_decisions.csv` and flagged `needs_review`. That is real work correctly done.

**But mind the scope.** This panel draws on 16 indexes, and `adminleaders` and the LAC files are not among them. The 220 cross-index pairs you identified were concentrated in `adminleaders` against LAC (132) and `adminleaders` against R2/R3 (70), so roughly 202 of 220 sit entirely outside this export. The panel is clean. The corpus is not, and BatonIndex draws on `adminleaders`. The rebuild fixed the export boundary rather than the corpus, which is the right scope for the paper and the wrong scope for the product.

**Fix.** Replace the test with one that groups by institution plus a normalized name computed independently of `seat_id`, and run the corpus-level version across all indexes including `adminleaders` and LAC.

### 3.3 Test 8 passes, and the 53.9 percent override rate is a misclassification rather than a data problem

The override rate looks alarming against your corpus figure of 11.8 percent. It is not what it appears.

Breaking down `interim_evidence` on the 2,281 interim rows: `title` 1,051, `narrative` 936, `etl_only` 208, `none` 86.

Title plus narrative is 1,987 of 2,281, or 87.1 percent, against your corpus expectation of 2,610 of 2,958, or 88.2 percent. The remainder is 12.9 percent against your 11.8 percent. The corpus matches your count almost exactly.

The pipeline filed narrative-sourced evidence as an override instead of as a derivation. Narrative evidence is legitimate derivation from source text, and treating it as a manual exception inflates the override bucket from 294 rows to 1,230.

**Fix.** Treat `interim_evidence = narrative` as derived, recording the narrative snippet as the evidence string. `interim_override` then applies only to `etl_only` and `none`, which is 294 rows, and test 8 becomes meaningful rather than definitional.

---

## 4. Defects the rebuild surfaced or left open

### 4.1 `title_verbatim` is 30 percent empty, and the gap is entirely by index

This is the root cause of the override inflation above, and it is a wiring problem rather than a research problem.

| source_index | rows | empty | rate |
|---|---|---|---|
| r1-lawschool-deans | 1,009 | 1,009 | 100.0% |
| r1-medschool-deans | 626 | 626 | 100.0% |
| r1-vet-deans | 277 | 277 | 100.0% |
| r1-bschool-deans | 854 | 849 | 99.4% |
| r1-eschool-deans | 564 | 559 | 99.1% |
| r1-grad-deans | 176 | 114 | 64.8% |
| r1-nursing-deans | 698 | 21 | 3.0% |
| r1-provost-deans | 1,500 | 32 | 2.1% |
| president rows | 2,706 | 0 | 0.0% |

Where it is populated it is a real title. 601 distinct values, reading as `Dean`, `President`, `Interim Dean`, `Acting Dean`, `Provost and Executive Vice President for Academic Affairs`. Zero rows have `title_verbatim` equal to `unit_name`, so the confusion in the previous export is fixed. The pipe-through was simply wired for some indexes and not others.

### 4.2 The 9 contradictions are a detector worth keeping

Nine rows have a title containing an interim word, a flag of FALSE, and no override. Reading them, most are not classification errors at all:

- `Acting Provost (1977-1978); Senior Vice President for Academic Affairs and Provost (1978-1983)` at Cincinnati
- `Interim Provost/Provost` at Missouri
- `Provost; Acting President; Chancellor` at Rice

These are two or three spells collapsed into a single row. That violates the two-row rule, deletes a conversion, and biases the interim rate downward, which is exactly the failure mode the two-row rule exists to prevent. At least one of the nine is a plain error: `Acting Dean` at Arizona pharmacy, flagged not interim.

**Keep this as a standing detector.** A title containing an interim word on a row flagged not interim is a reliable signal of a collapsed conversion, and it is concentrated in the provost index, which is the index now carrying the strongest result.

### 4.3 `seat_coverage.csv` cannot do its job as shipped

The table exists with 2,110 rows against 2,110 seats, so each seat gets exactly one window and there is no period structure. `researcher_id` and `researched_date` are empty on all rows. `method` is `none` on 1,433 and `web_search` on 677.

The purpose of the table was to let a gap inside a researched window count as a genuine vacancy. With one window per seat there is no inside, and `appointments.csv` still contains zero VACANT rows. The vacancy question remains unanswerable, and the distinction between "the chair was empty" and "nobody researched that stretch" is still not in the data.

The decade table in the QC report is still usable for the H5 diagnostic, so this is not blocking. It is simply not what was specified.

### 4.4 Partial cleanups

223 rows still end in the extract year without being current, against 208 in the previous export. The 23 long-run placeholders were suppressed correctly, so the obvious cases are handled and the rest were left. That is defensible under the rule that closing a spell needs a source, but the count should be shrinking rather than growing.

Test 3 reports 6 same-level overlaps (dean and dean) alongside 67 cross-level concurrencies. The cross-level cases are legitimate; one person can hold a deanship and an interim provostship at once, and 29 president-plus-provost pairs are normal. The 6 same-level cases are defects.

Test 17 rose from 29 to 42 people holding overlapping spells at two institutions, which is the expected consequence of adding 1,456 provost rows rather than a regression.

---

## 5. Collection work, none of which was started

The QC report lists these plainly, which is the right way to ship an incomplete rebuild.

| Field | Filled | Consequence |
|---|---|---|
| `reports_to` | 0 of 2,110 seats | H2 still cannot run |
| `exit_announcement_date` | 0 of 9,653 | H4 still cannot run; this was the spec's P0 |
| `successor_status_at_announcement` | 0 of 9,653 | |
| `departure_statement_quote` | 0 | |
| `term_end_scheduled` | 0 | |
| `coder_id` | 0 | No accountability trail on any coded row |
| `person_birth_year` | 0 of 10,065 | Retirement-age test unavailable |
| `last_verified_date` | 0 of 11,776 | Test 7 fails by design; 29 stale-interim rows still unverified |
| `exit_circumstance` | 92 of 9,653 | |
| Month precision, presidents | 0 of 2,706 | Was P1 in section 3.3 of the spec |

The president month-precision figure deserves emphasis. Total month precision across the panel is 590 rows against 586 in the previous export, so effectively nothing moved, and presidents are at zero. Since the president seat-state window is what defines the treated group in H1, and a 15-month interim presidency currently spans three calendar years at year resolution, this remains the largest measurement weakness in the primary test.

---

## 6. Recommended order for the next pass

Mechanical work first, since it is cheap and it makes the acceptance gate meaningful.

1. Wire `title_verbatim` through for the six indexes where it is empty: law, medicine, veterinary, business, engineering, graduate. No research required.
2. Reclassify `interim_evidence = narrative` as derivation rather than override. Override drops from 1,230 rows to 294.
3. Rebuild test 14 so `is_interim` is derived without reference to `is_interim_legacy`, then report the disagreement count honestly.
4. Replace test 16 with a non-circular version, and run the corpus-level variant across `adminleaders` and LAC for the BatonIndex exposure.
5. Split the compound-title rows found by the 9 contradictions, and keep that check as a standing detector for collapsed conversions.
6. Clean the provost index: 40 multi-current seats and 39 overlapping permanent spells. This moved up because the provost layer now carries the strongest result in the paper.
7. Give `seat_coverage` real year ranges, then emit VACANT rows where a gap sits inside a researched window.

Then the research work, unchanged in order from spec v0.2: `reports_to`, then `exit_announcement_date` and `successor_status_at_announcement`, then month precision for presidents.

I still owe you `institution_year` from IPEDS, which is unblocked and independent of all of the above.
