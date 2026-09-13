# Scope: a corpus-level pass

Measured against the 21 registered indexes, 13 September 2026. Written after the
succession-panel rebuild, to answer whether its fixes should be pushed corpus-wide.

## The short answer

Partly. Two of the four candidate fixes are worth doing corpus-wide, one is not
worth doing at all, and the pass that matters most is one nobody has proposed yet.

And the framing needs one correction. A one-time corpus cleanup does **not** by
itself make future analysis easier, because there is no single ETL to fix: roughly
ten scripts write the dean JSONs (`build-r1-data`, `build-publichealth`,
`apply-name-corrections`, `apply-admin-start-years`, `backfill-industry-exp`,
`merge-grad-career`, `news-lib`, and the `research/etl_leaders` waves). Anything
cleaned once is reintroduced by the next collection wave. This repository already
learned that lesson — `assertRegistered` exists because adding an index was "a
silent partial rollout" that nothing complained about. **The durable win is a
standing check wired to the CI that already fires on `src/data/**.json`, not the
cleanup.** The cleanup is what makes the check pass the first time.

---

## What the measurement actually found

Counting across all 21 indexes, 17,563 dated spells, 4,401 distinct seats:

| Defect | Count | Notes |
|---|---|---|
| Seats with more than one open spell | 581 | **Mostly not what it looks like — see below** |
| Seats drawing from more than one index | 220 | 1,859 spells; 202 involve `adminleaders` |
| Placeholder end dates (2026, run > 15y) | 29 | mechanical |
| Collapsed/compound titles | 65 | needs source research to split |

The 581 was the number I expected to be the headline: stale incumbency at ten times
the rate the panel showed. Reading the rows, it is not.

```
Arizona State      2002  Michael M. Crow          <- president
                   2008  Morgan R. Olsen          <- EVP, Treasurer and CFO
Ball State         2017  Geoffrey S. Mearns       <- president
                   2018  Rebecca Rice             <- VP, Government Relations
                   2020  Paula Luff               <- VP, Enrollment
Amherst College    2018  Matthew L. McGann        <- Dean of Admission
                   2022  Michael A. Elliott       <- president
```

These are not two people in one chair. They are **the seat-holder and the cabinet
filed under one key**, because the corpus stores both in the same file under the
same `school` value ("Office of the President") and nothing in the row says which is
which. `startYear` presence does not separate them: 191 non-chief-executive rows
carry a start year in the president indexes alone.

That is the real corpus-wide defect, and it is upstream of almost everything else.
The succession panel works around it with a title classifier
(`isChiefExecutiveSeat`), which is a consumer patching a producer's gap. Every other
consumer — affinity, scout, the dashboard — has no such guard.

### The field for this already exists and is 4% populated

`roleTier` is in the schema, with an established vocabulary (`Dean`, `Associate
Dean`, `Vice Provost`, `Vice President`, `Department Chair`, …). It is populated on
**697 of 17,563 dated spells**, and `camd` is the only index that fills it properly,
at 422 of 422 — proof the pattern works.

The indexes carrying the largest defect counts have **zero**:

| Index | Dated spells | roleTier populated |
|---|---|---|
| r2public | 1,655 | 0 |
| adminleaders | 1,616 | 0 |
| university | 1,321 | 0 |
| lac | 1,074 | 0 |
| education | 1,039 | 0 |
| communitycollege | 867 | 0 |
| grad | 254 | 0 |

**73.1% of all dated spells can be classified from the title text alone** —
4,901 chief executive, 4,741 dean, 1,066 provost, 1,561 subordinate, 565 cabinet.
Most of the remaining 26.9% are the law, medicine, veterinary, business and
engineering rows whose `discipline` holds an academic field; for those the index of
origin already implies the seat, so index-implied classification covers most of the
residual. The genuinely ambiguous remainder is a few hundred rows.

---

## Recommended pass

### P0 — Populate `roleTier` corpus-wide

The single highest-value change. It gives every consumer the seat-vs-cabinet
distinction that only the succession panel currently has, and it makes the other
checks meaningful — a "two people in one seat" check is noise until cabinet rows are
excluded.

- Derive mechanically from title text (73.1%), then from index-of-origin for the
  dean indexes, using the classifier already written in `scripts/lib/interim-panel.mjs`.
- Leave genuinely ambiguous rows empty rather than guessing. Three states: the
  value, an explicit "not a seat", and empty for unresolved.
- Effort: one script, plus a review pass over the few hundred residual rows.

### P0 — Standing check, wired to CI

`.github/workflows/ci.yml` already triggers on `artifacts/dean-dashboard/src/data/**.json`
and runs one validator. Add a second in the same shape as the five existing
`check-*.mjs` scripts, asserting:

1. No seat has two open spells **once cabinet rows are excluded by `roleTier`**.
2. No end date equals the extract year on a spell running more than 15 years.
3. No institution-plus-school group spans two indexes without a recorded decision.
4. No title collapses several spells (the compound-title detector).

This is what stops the next wave reintroducing all of it. Effort: half a day, since
the detectors are already written in `scripts/lib/seat-identity.mjs`.

### P1 — Cross-index seat reconciliation

220 seats, 1,859 spells, of which **202 are `adminleaders` against LAC (132) or
R2/R3 (70)**. This is a live BatonIndex defect: the product pools these indexes, so
the same school's leadership appears twice. Resolve as an alias table
(`seat_name_variants` already has the shape), not a corpus rewrite — the merge
decisions stay auditable and reversible.

### P2 — Mechanical cleanups

29 placeholder end dates set to null with `is_current = FALSE`. 65 compound titles
flagged for splitting; the split itself needs a source, so it is research, not code.

---

## What not to do

**Do not write `seat_id` into the corpus.** It does not generalise. The panel's key
is institution plus normalised school name with classification deliberately
excluded, which is right for seats that have one holder — but `adminleaders` and
`advancement` are role rosters, where one school value covers a CFO, a CIO and four
vice presidents. Those are distinct seats, and the key would collapse them. A
corpus-wide seat identity needs a role dimension, which is precisely what
`roleTier` would supply — so this is blocked behind P0 in any case, and may not be
worth doing even then.

**Do not write `source_index` into the corpus.** In the corpus the file name *is*
the index, so the field is redundant. It earns its place only once rows from
several indexes are pooled, which is a consumer concern — and consumers know which
file they read. Keep it in the export layer where it does real work.

---

## Does this make future analysis easier?

Yes, with one qualification worth stating plainly.

P0 does, unambiguously: every future analysis that needs "who actually held this
seat" currently has to rebuild the title classifier or silently count cabinet
officers as leaders. The panel's own history is the argument — the first export
counted 465 spurious overlapping spells and 94 units with two sitting deans before
that distinction was drawn.

The check is what makes it *stay* easier. Without it, this document describes a
cleanup that decays; with it, the next collection wave fails loudly instead of
quietly. Twenty-four files read these JSONs, and none of them would notice.
