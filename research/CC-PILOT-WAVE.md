# Community College — pilot collection wave

Step 4 of `COMMUNITY-COLLEGE-INDEX.md`. **Not yet run.** This is the brief.

The pilot's job is to **price the other 180**, not to be a first instalment of
data. Everything below exists so the number it produces is trustworthy enough to
commit budget against.

- Sample: `universe/cc-pilot-wave.json` (20 seats, regenerate with `node research/pick-cc-pilot.mjs`)
- ETL: `node research/etl_leaders.mjs --glob <prefix> --out r1-communitycollege --label "Community College"`
- QC: `node research/qc_leaders.mjs --out r1-communitycollege`

## Depth rule — current + 3 predecessors

**Four spells per seat.** Stop earlier only when the seat genuinely has no
further predecessor (a college founded in 2005 has three, and that is complete,
not truncated).

Chosen over the alternatives on measured evidence from the existing corpus of
4,166 seats:

| Depth | Median reach | Lands about | Reaches ≤1996 |
|---|---:|---|---:|
| current + 1 | 9 yrs | 2017 | 3% |
| current + 2 | 14 yrs | 2012 | 10% |
| **current + 3** | **20 yrs** | **2006** | **23%** |
| current + 4 | 24 yrs | 2002 | 34% |

A fixed *date* cutoff was considered and rejected. Tracing back to 2020 — the
intuitive choice if you believe average tenure is ~4 years — would have seen
**24% of completed spells** and reported mean tenure as **5.81 years against a
true 6.95**, a 16% understatement in the direction that flatters the
turnover story the index is meant to evidence. Bounding by spells instead of
years also spends evenly: a date rule costs one spell at a college with a
long-serving president and six at a churny one.

For reference, the true average tenure in the corpus is **6.95 years**; AACC's
2023 figure for community-college CEOs specifically is **5.9**.

**Still open:** whether the top 25 by enrollment get traced to 1996 regardless
of spell count, so they line up with the 1996-based indices for cross-index
comparison. Roughly 50 extra spells. Not decided — flagged here so it is a
choice rather than an omission.

## Output contract

One JSON file per agent batch, an array of institutions. Field names match what
`etl_leaders.mjs` already reads — do not invent variants.

```jsonc
[{
  "university": "Palomar College",        // EXACT string from cc-pilot-wave.json
  "state": "CA",
  "school": "Office of the President",
  "leaderTitle": "President",
  "moreHistoryExists": true,              // see below -- load-bearing
  "records": [{
    "name": "Jane Q. Smith",
    "startYear": 2021,
    "endYear": null,                      // null = sitting
    "isInterim": false,
    "convertedToPermanent": false,
    "priorInstitution": "Mt San Antonio College",
    "priorTitle": "Vice President, Instruction",
    "nextRole": null,
    "nextRoleInstitution": null,
    "sourceUrl": "https://…",             // REQUIRED on every record
    "notes": ""
  }]
}]
```

### `moreHistoryExists` is not optional

`etl_leaders.mjs` currently derives `truncated` as `historyFrom > founded`. Every
row in `r1-communitycollege-schools.json` has **`founded: null`**, so that
derivation yields `false` everywhere and a depth-capped index would claim
complete history for all 200 colleges.

Under a spell cap the truth is directly knowable: the researcher either hit the
cap with a predecessor still visible, or ran out of predecessors. Record it.
The ETL should prefer this flag over the founded-year comparison when present.

Same reasoning applies to `historyFrom`, which the ETL already computes from the
earliest record — that one is fine as is.

### Rules carried over from the existing builds

- **Origin is derived at appointment time and never defaulted to External.**
- **A leader is "sitting" only if they are the last record for that seat.**
- **Interim who then won the job** is flagged `convertedToPermanent`, and interim
  is never merged into internal/external.
- **`university` is a join key.** Copy it byte-for-byte from the sample file.
  Seven names are shared by two colleges in different states and are suffixed
  `(ST)` in the schools table; the pilot sample carries the plain IPEDS name, so
  the ETL must map through `unitid`/state, not the bare string.

## District seats are a different job

Three of the twenty are district chancellorships (LACCD, Maricopa, Alamo). They
have **no IPEDS row, no incumbent name, and no college website** — the census
gives nothing to start from. Expect to work from the district's own site, board
agendas and minutes, and local press. These three exist in the sample precisely
because they are the expensive cell; do not drop them to hit a cost target, or
the wave will be priced on the easy 17.

## Instrumentation — the actual deliverable

Per seat, record alongside the data:

| Field | |
|---|---|
| `spellsTraced` | how many of the 4 were found |
| `spellsAvailable` | 4, or fewer if the seat genuinely has less history |
| `tokensSpent` | agent tokens for this institution |
| `wallClockSec` | |
| `sourceTypes` | e.g. `["college-site", "local-press", "board-minutes", "wikipedia"]` |
| `hardest` | one line: what took the time |

Report the median and the 90th percentile, **split by seat type and by
verification status**, not just the mean. The mean over 20 hides the cell that
decides the budget.

## Batching

**Four to five institutions per agent.** The R2 build measured ~92k tokens per
institution when run one-per-agent against ~37k batched — see `research/README.md`.
With 20 seats that is four or five agents, not twenty.

## What "done" looks like

1. `r1-communitycollege-deans.json` for 20 seats, passing `qc_leaders.mjs`.
2. A cost table by cell, with the 90th percentile.
3. A recommendation: proceed to 180 at this depth, change the depth, or narrow
   the universe — with the projected token cost of each.

---

# RESULTS — run 21 Aug 2026

20 seats, **85 spells**, **536,740 tokens**, 288 tool calls, 5 batched agents.
Zero contract violations: every record carries a `sourceUrl`, every seat has
exactly one sitting record and a boolean `moreHistoryExists`.

Data: `universe/cc-pilot-results.json`.

## Cost: 26,837 tokens per seat

| Scope | Seats | Projected |
|---|---:|---:|
| Remaining 180 + 24 districts | 204 | **5.5M tokens** |
| Full top-200 scope | 224 | 6.0M |
| Top-500 scope | 524 | 14.1M |

Batch totals are measured. Per-seat figures split batch tokens in proportion to
`sourcesConsulted`, so treat them as estimates.

## The stratification hypothesis was wrong

The sample was built on the premise that district seats and unverified colleges
would cost materially more. **They do not.**

| Cell | n | Median tokens | p90 |
|---|---:|---:|---:|
| district | 3 | 26,260 | 30,291 |
| standalone | 12 | 23,460 | 33,657 |
| campus | 5 | 25,805 | 47,120 |
| unverified | 12 | 25,805 | 33,657 |
| verified | 8 | 26,010 | 47,120 |

Every cell lands within ~3k tokens of every other. Districts, which have no
IPEDS row and no incumbent name, cost the same as ordinary colleges — the
district's own site and board minutes turn out to be *better* sources than a
typical college's newsroom.

**The real cost driver is whether the institution publishes its own leadership
history**, and that cuts across every cell. The four most expensive seats — East
LA (47k), Miramar (41k), Hillsborough (36k), Palomar (34k) — all share one
sentence in their notes: no published list of past presidents. The cheapest —
South Texas and HACC (17.5k each) — publish one.

Consequence: **the wave can be priced with a single number.** Stratifying future
samples by seat type or verification status is not worth the complexity.

## Findings that change what the index says

- **41% of spells are interim** (35 of 85) — but only **9% of the years**.
  Interims are numerous and short. Any tenure statistic must be computed over
  time, not over spells, or it will understate typical tenure badly. This is the
  same length-bias trap that killed the 2020-cutoff proposal, in a new place.
- **Five of twenty IPEDS names were stale or wrong in kind** — Ivy Tech
  (Ellspermann → Pollio, Jul 2025), CT State (Maduko → Royal interim, Aug 2025),
  HACC (Sygielski → Lufkin, Jun 2026), Palomar (Rivera-Lacey → Recalde interim,
  Dec 2025), Phoenix College (Britt → Kruse interim, Jun 2026); ELAC's Perez was
  listed as permanent while still interim. That is a 25% error rate on the field,
  and it is the strongest argument yet for `leaderNameUnverified`.
- **Official college pages omit their own history.** Santa Monica's
  former-administrators page lists one Donner interim and not the second, which
  board minutes prove and which is the real third predecessor. An index built
  from official pages alone gets that chain wrong.
- **The depth cap binds almost everywhere**: 18 of 20 seats have more history
  than current + 3 reaches, median `spellsAvailable` 6, max 13.

## Environment constraints that cost real tokens

- **web.archive.org is blocked**, which is the standard tool for historical
  leadership pages. It caused the one genuine depth miss (Miramar 3 of 4).
- **Cloudflare 403s** on mesacc.edu, phoenixcollege.edu, tcc.edu and laccd.edu
  forced reconstruction from student papers and district sites.
- **No PDF tooling** in the environment: two chains were only closed by manually
  zlib-decoding PDF content streams. Installing `pdftotext` would pay for itself.

## Recommendation

**Proceed to the remaining 180 at current + 3, in batches of four.** 5.5M tokens
is a known, bounded number and the depth rule held: 17 of 20 seats reached four
spells, six exceeded it where an interim split a chain.

On extending to 500: it is now a straight trade — **14.1M tokens for 83.3% of
sector enrollment against 6.0M for 54.4%**. Defensible, but decide it *after*
the 180 land, when the per-seat figure has 200 observations behind it rather
than 20.
