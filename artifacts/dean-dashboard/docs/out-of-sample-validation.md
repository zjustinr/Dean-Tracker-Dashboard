# Out-of-sample validation of the Scout ranking

**Run:** `node scripts/scout-holdout.mjs [cutoffYear]` · **This report:** cutoff 2023, run 6 September 2026.

Trained on every appointment recorded before 2023; tested on all **3,129 appointments since**. No
sampling — the whole window. The question is the one a buyer actually asks: *if I had run this before
the hires that just happened, would the person they picked have been on the list?*

## Headline

| | clean | full (optimistic) | chance |
|---|---|---|---|
| Reachable at all | **27.5%** (861/3,129) | — | — |
| hit@3 | **11.4%** | 10.3% | 3.4% |
| hit@5 | **13.2%** | 11.9% | 4.9% |
| hit@10 | **15.8%** | 14.9% | 7.6% |
| hit@25 | **19.6%** | 19.1% | 12.6% |

Among the reachable subset — i.e. setting the coverage problem aside and asking only how well the
model ranks somebody it can see: hit@3 **41.3%**, hit@5 **47.9%**, hit@10 **57.5%**, hit@25 **71.2%**,
against chance of 12.3 / 17.7 / 27.6 / 45.7%. Median rank of a reachable hire: **6th of ~78**, the
15th percentile of the field.

Re-running with a 2021 cutoff (4,524 appointments, a five-year window) gives 27.2% reachable and
15.5% hit@10 — the numbers are not an artifact of where the line was drawn.

## What the three columns mean

**clean** — trait fit only. Every weight in it was mined from appointments that had already happened
by the cutoff. Nothing in this number has seen its own test set. **This is the number to quote.**

**full** — trait + tie-category + employer-category, i.e. what actually ships. The latter two are
mined corpus-wide in `scout-insights.json` and `employer-affinity.json`, holdout window included, so
this column has a leak in it and should read *better* than clean.

It reads worse, at every list size. That is the most useful thing in this report: the two components
we could not clean are not just failing to help rank real hires, they are **actively hurting** — the
tie and employer weights lift competitors above the person who was actually appointed more often than
they lift the appointee. Worth investigating before either component is described to a buyer as
signal.

**chance** — a shuffled list over the same pool, subject to the same coverage limit: an unreachable
hire is a miss for chance too. Scoring chance over every case, as though the pool always contained
the hire, would compare the model against a baseline holding an advantage the model does not have.

## The ceiling is coverage, not ranking

**72.5% of the last three years' hires could not have appeared at any list length.** The product
builds its pool from a school's feeder bench, its affinity ties, and its employer weak links; a hire
reachable through none of those is not a ranking failure, it is an absence. So the honest summary is
two sentences, not one:

> Of the appointments made in the last three years, the model would have shown the person actually
> hired in its top ten **15.8%** of the time, about **twice** what a shuffled list of the same
> candidates would manage. That ceiling is set by coverage: only **27.5%** of those hires were in the
> candidate pool at all, and among the ones that were, the model put them in the top ten **57.5%** of
> the time.

Raising the first number is a data problem (F14, feeder-bench start dates; affinity coverage), not a
modelling one.

## Per index

Chance is printed beside every rate deliberately. A school whose entire pool is eight people gives
hit@10 = 100% to any ranking at all, and without the baseline an index made of such schools reads as
the best-performing one here.

| index | n | reachable | hit@10 | chance | ratio |
|---|---|---|---|---|---|
| usadminleaders | 894 | 6.4% | 3.0% | 1.6% | 1.9× |
| uscommunitycollege | 227 | 1.8% | 1.8% | 1.8% | 1.0× |
| r1arts | 209 | 32.5% | 7.2% | 3.1% | 2.3× |
| usr2 | 192 | 7.3% | 6.8% | 3.1% | 2.2× |
| useducation | 190 | 40.0% | 23.7% | 17.3% | 1.4× |
| r1provost | 184 | 63.0% | 25.0% | 6.2% | 4.0× |
| usnursing | 160 | 43.1% | 37.5% | 21.6% | 1.7× |
| usadvancement | 133 | 45.1% | 45.1% | 10.4% | 4.3× |
| uslac | 124 | 34.7% | 34.7% | 32.5% | 1.1× |
| r1university | 120 | 50.8% | 5.0% | 4.5% | 1.1× |
| r1bschool | 118 | 44.1% | 32.2% | 3.6% | 8.9× |
| usag | 94 | 66.0% | 46.8% | 26.6% | 1.8× |
| r1law | 81 | 49.4% | 8.6% | 3.6% | 2.4× |
| usgrad | 72 | 26.4% | 13.9% | 3.4% | 4.1× |
| uspharmacy | 70 | 60.0% | 51.4% | 30.9% | 1.7× |
| uscreativearts | 65 | 33.8% | 7.7% | 8.7% | 0.9× |
| r1medical | 54 | 53.7% | 46.3% | 4.0% | 11.6× |
| r1eschool | 49 | 36.7% | 14.3% | 3.1% | 4.6× |
| uspublichealth | 35 | 11.4% | 2.9% | 1.4% | 2.1× |
| ussystem | 33 | 6.1% | 6.1% | 6.1% | 1.0× |
| usvet | 25 | 12.0% | 4.0% | 3.6% | 1.1× |

The spread is the finding. R1 business (8.9×) and medical (11.6×) carry real signal on small
cohorts; the community-college, system and liberal-arts indices are at chance and should not be
described as validated. Do not quote the corpus-wide figure for a specific index without checking
this table.

## Known approximations

Each one is a reason the real number could be worse than this report, and none of them can be fixed
by this script:

- **The feeder bench cannot be rolled back.** It is a current-roster snapshot with 37 start dates
  across 11,930 records, so bench competitors are *today's* bench, not the bench of the hire year.
  (F14.)
- **Affinity evidence is date-filtered** per hire year — evidence with no parseable year is treated as
  pre-existing, which is generous.
- **Competitors whose own record begins at or after the hire year are dropped** (8.8 per case on
  average) as not knowable then. This makes the field slightly smaller, and therefore the ranks
  slightly better, than a version that kept them.
- **Reachability is judged on today's data**: a hire counts as reachable only via a bench seat, an
  affinity tie with evidence predating the hire, or a weak link — but all three are read from
  artifacts built now. Their own record at the school, and their affinity entry for it, are excluded
  because both were created *by* the appointment being predicted; without that exclusion the answer
  is "100% reachable", which is the appointment being read back to us rather than a finding.
