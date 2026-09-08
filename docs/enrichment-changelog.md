# Change log: field enrichment pass (September 2026)

A record of what this pass changed and how to undo any part of it. For *why*
the fields were empty and how the values were derived, see
[`data-provenance.md`](./data-provenance.md); this document is the operational
companion — what moved, which commit moved it, and how to put it back.

Branch: `claude/feeder-bench-records-discrepancy-4pp9cn`
Merge base: `1cb2031d`
Pull request: [#172](https://github.com/zjustinr/Dean-Tracker-Dashboard/pull/172)

## What triggered it

A coverage readout showed feeder-bench records at 11,930 corpus-wide with only
37 carrying a start date (0.3%). Investigating that surfaced two further gaps
raised in the same thread — PhD provenance and the school covariates — and all
three were addressed together.

The bench finding itself: **nothing was missing from the roster**. All 11,930
people are present. The bench was harvested as a roster snapshot (name + title
off leadership directory pages), not as appointment events, so the gap was a
*field*, not records.

## Field-level effect

| Field | Before | After | Introduced by |
|---|---|---|---|
| `startYear` (bench rows only) | 37 (0.3%) | 579 (4.9%) | `e7a520c8`, `c51c92b2` |
| `phdInstitution` | 5,500 (16.3%) | 6,817 (20.3%) | `e7a520c8`, `c51c92b2` |
| `phdYear` | field absent | 1,094 (3.2%) | `e7a520c8` (schema), `c51c92b2` |
| `enrollmentEnd` | 2.3% | 29,861 (88.7%) | `c51c92b2`, revised by `6efe3cfa` |
| `enrollmentAvg` | 2.5% | 29,861 (88.7%) | `c51c92b2`, revised by `6efe3cfa` |
| `businessPctEnd` | 2.3% | 29,482 (87.6%) | `c51c92b2`, revised by `6efe3cfa` |
| `businessDegreesLatest` | 2.3% | 28,416 (84.4%) | `c51c92b2`, revised by `6efe3cfa` |
| `enrollmentStart` | field absent | 10,375 (30.8%) | `7ee4a2d9` |
| `businessPctStart` | field absent | 10,699 (31.8%) | `7ee4a2d9` |
| `businessDegreesStart` | field absent | 10,699 (31.8%) | `7ee4a2d9` |

Four fields were added to the `Dean` interface in `types.ts`: `phdYear`,
`enrollmentStart`, `businessPctStart`, `businessDegreesStart`. All are
optional/nullable, so consumers that ignore them are unaffected.

**No rows were added, removed or reordered.** Every change is a field value on
an existing row, which is what makes the positional restore below safe.

## Commits, in order

| SHA | What it did | Reversible alone? |
|---|---|---|
| `e7a520c8` | Adds `phdYear` to the schema, builds the bio-extraction pipeline, applies it to the B-school index only | Yes |
| `c51c92b2` | IPEDS covariates corpus-wide; extends bio enrichment to all remaining indices | Yes |
| `c85295db` | Regenerates the dashboard's derived data files | Yes (regenerable) |
| `9bef2e2a` | Removes a duplicate key and three dead entries from the IPEDS alias table | Yes; verified behaviour-neutral (0 resolution changes across 2,112 names) |
| `6efe3cfa` | **Reverses** the covariate policy: restores pre-existing values and makes preserving the default | Not independently — it depends on `c51c92b2` |
| `7ee4a2d9` | Adds the three appointment-year covariates | Yes |

Note that `6efe3cfa` partly undoes `c51c92b2`. The intermediate state
(`c51c92b2` through `9bef2e2a`) recomputed the ~2% of pre-existing covariates;
`6efe3cfa` put them back after that decision was reversed. Reverting
`c51c92b2` alone would therefore leave `6efe3cfa` restoring values that are no
longer there — revert the range, not the single commit.

## How to undo

### Everything

```sh
git revert -m 1 <merge commit>
```

The pass was merged with a merge commit rather than squashed precisely so that
the individual commits stay addressable for the narrower options below.

### One commit

```sh
git revert <sha>          # e.g. 7ee4a2d9 to drop the appointment-year fields
```

Safe for `e7a520c8`, `c85295db`, `9bef2e2a`, `7ee4a2d9`. For the covariates,
revert `c51c92b2..6efe3cfa` as a range.

### One field group, without touching the others

The scripts are the cleanest route, because they are idempotent and
format-preserving:

```sh
# Recompute all covariates from the committed panel (preserves pre-existing
# values by default; --supersede-legacy recomputes them too).
node scripts/src/compute-school-covariates.mjs --panel research/ipeds --write
```

To null a field group outright, a positional restore from the merge base is
safe because row order is unchanged — read the old value at the same index and
write it back. Verify alignment first by comparing `dean` + `university` at
every index; that check passed for all 22 files and 33,664 rows during this
pass and is the guard that made the `6efe3cfa` restore possible.

### What is regenerable rather than revertible

`corpus-stats.json`, `affinity-by-school.json`, `leader-careers.json`,
`nonacademic-experience.json` and `scout-insights.json` are derived. Do not
hand-edit them; re-run the dashboard's generators:

```sh
cd artifacts/dean-dashboard
node scripts/gen-public-data.mjs && node scripts/gen-careers.mjs \
  && node scripts/gen-affinity.mjs && node scripts/gen-scout-insights.mjs \
  && node scripts/gen-employer-affinity.mjs \
  && node scripts/gen-nonacademic-experience.mjs
```

## Code and artifacts added

**Pipelines** (`scripts/src/`)

- `enrich-from-source-pages.mjs` — crawls source/bio pages, emits candidates
- `lib/bio-extract.mjs` — sentence-level extraction with the precision guards
- `apply-source-page-enrichment.mjs` — merges candidates; dry-run by default
- `fetch-ipeds-panel.mjs` — builds the IPEDS panel, crosswalk and vintage record
- `lib/ipeds.mjs` — IPEDS CSV readers and the name→UNITID crosswalk
- `compute-school-covariates.mjs` — derives the covariates from the panel
- `lib/dataset-io.mjs` — format-preserving dataset read/write

**Committed data** (`research/ipeds/`)

- `ipeds-panel.json` — enrolment and completions by UNITID by year
- `ipeds-crosswalk.json` — every university name, its UNITID, and how it matched
- `ipeds-vintage.json` — every IPEDS survey file used, by year

These are committed so the covariates can be audited or recomputed without
re-downloading ~400MB from NCES.

## Known weak points

Recorded here so a future reader does not have to rediscover them:

- **Extraction accuracy is roughly 8 in 10** on hand-audited random samples.
  The bio-derived fields (`startYear` on bench rows, `phdInstitution`,
  `phdYear`) carry real noise. Each candidate retains the sentence it came from,
  so any individual value can be checked against its source.
- **The covariates are not one homogeneous series.** About 3,300 values come
  from the earlier, unrecorded basis (preserved by decision) and ~114,000 from
  the documented IPEDS vintage. The legacy values reproduce 14 times out of
  2,348 under recomputation. Worth a control if they are modelled.
- **Covariates are university-wide, not school-wide.** IPEDS publishes no
  per-school enrolment, so a business dean's `enrollmentEnd` is the whole
  university's.
- **Bench start-date coverage stays at 4.9%** and is source-limited, not
  method-limited. This also caps the appointment-year covariates at ~31%.

## Two defects found and fixed during the pass

Both were introduced by this work and caught before merge; noted in case
similar symptoms appear later.

1. **Minified datasets were being reflowed.** Indent detection recognised only
   indented JSON, so the five datasets that are minified in `main` (agschool,
   education, nursing, system, vet) were rewritten pretty-printed — roughly
   250,000 lines of pure formatting noise. Fixed in `6efe3cfa` by teaching
   `lib/dataset-io.mjs` to detect the minified form, and by moving the helper
   into one place instead of a copy per script.
2. **A duplicate key and three dead entries in the IPEDS alias table**, from
   `normName` folding `&`→`and` and then dropping it as a stopword, so
   `'college of william and mary'` and `'college of william & mary'` were the
   same key. Fixed in `9bef2e2a`, verified behaviour-neutral.
