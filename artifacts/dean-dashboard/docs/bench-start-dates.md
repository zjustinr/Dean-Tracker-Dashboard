# Feeder-bench start dates (F14) — the pipeline

**Run:** `node scripts/bench-start-dates.mjs [--limit N] [--concurrency C] [--index ID] [--stats]`
then `node scripts/apply-bench-start-dates.mjs [--dry-run]`.

11,930 associate/vice-dean records carry **37** start dates between them. Until that changes, any
tenure or movability claim about the feeder bench is unsupported — and the product now declines to
make one (`tenureInfoFor` returns no reading for a bench row). F10 measured what this costs:
**72.5% of recent hires were unreachable** by the candidate pool, and the bench is the largest part
of that gap.

## Why archived leadership pages

Nobody announces an associate dean's appointment, so announcement-based sourcing does not scale here.
Archived leadership pages do: a person **absent** from a school's leadership page in one snapshot and
**present** in the next started between those dates, and no announcement had to exist for the archive
to record it. That is the only source on the list that scales to 11,930 records.

## This is a pipeline, not a sprint

6,213 distinct leadership pages, a few archive fetches each, at a rate the Internet Archive is happy
to serve. Measured here: **~26s per page at concurrency 2**, ≈ **43 hours** for the full corpus (≈22h
at concurrency 4). It is built to be run repeatedly and interrupted freely:

- every page's result is written to `research/bench-start-dates.json` as soon as it is known;
- a page already in the ledger is skipped next run;
- pages are worked **in descending order of how many people they cover**, so the first hours deliver
  the most records — **922 pages cover half the bench**;
- a page that failed because the network wobbled is *not* recorded as checked. It stays pending and
  is retried, up to five times, before being retired. (In this sandbox the egress proxy closes
  long-lived tunnels to `web.archive.org`, so runs here are short by necessity; that is an
  environment limit, not a pipeline one.)

## Outcomes, and what each is worth

Measured over the first pages crawled:

| outcome | meaning | written? |
|---|---|---|
| `bracketed` | absent at one snapshot, present at the next | **yes** — `startYear` + `startPrecision: "bracketed"` |
| `open-bracket` | present in the oldest snapshot held | no — an upper bound ("no later than"), not a date |
| `not-found` | the page never names them, though other names on it matched | no |
| `page-yields-no-names` | no name on the page matched in any snapshot — it renders its names in JavaScript, or in a shape the matcher cannot read | no — triage the page, not the people |
| `unsupported-format` | a PDF; the crawler does not read those | no |
| `non-monotonic` | appears, disappears and reappears — no reliable first appearance | no |

**Bracket quality is the pleasant surprise: median width 2–4 months, and every bracket seen so far is
under 12 months.** Where the pipeline answers at all, it answers tightly.

**Roughly 40% of people come back `open-bracket`.** The archive simply does not hold a snapshot from
before they arrived. That is a real ceiling on this method and no amount of crawling moves it.

## Honesty rules built into the merge

- Only `bracketed` findings are written. Everything else stays undated rather than becoming a guess.
- A written year carries `startPrecision: "bracketed"` and a `startLabel` naming the window
  ("between Apr 2025 and Aug 2025"). D1's estimator treats every year as exact, so feeding it inferred
  years without a precision marker is precisely the failure F15 is about.
- Brackets wider than 18 months (`--max-months`) are not written at all.
- Brackets that straddle a year boundary are counted and reported: the true start may fall in the
  previous calendar year, and the label carries the window so a reader can see it.
- The name matcher is permissive about middle names and strict about first and last. A false negative
  costs one unresolved record; a false positive writes a wrong date into the corpus.

## Two things found while building this, both worth fixing properly

**The bench has no usable ids.** 6,553 of the 11,930 rows carry no `id` field at all, and the 5,377
that do are numbered per file, so the same number names a different person in another index. A
pipeline keyed on `id` matched 1,340 records for 29 findings before this was caught — it would have
written most of those dates onto strangers. Bench rows are therefore addressed by a natural key
(`lib/bench.mjs`), unique for 11,928 of 11,930 rows. **Giving the bench real ids is the better fix**
and is a bigger change than a research pipeline should make in passing.

**Two exact duplicate rows exist** (Joseph M. Hall at Tuck, Scott Kelley at Gatton), same person, same
seat, same index. Harmless here — both get the same date — but they are duplicates.
