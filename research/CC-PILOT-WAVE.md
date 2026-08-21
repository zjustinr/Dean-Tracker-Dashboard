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
