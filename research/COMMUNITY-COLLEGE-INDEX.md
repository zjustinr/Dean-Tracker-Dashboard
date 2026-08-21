# Community College Index — universe and market case

Status: **steps 1-2 complete, not wired into the app.** The universe and schools
files exist;
no dataset id is registered, no ETL has run, no leader history has been
collected. This document is the case for doing that work and the record of how
the universe was drawn.

- History target: `universe/universe_communitycollege.json` (200 institutions)
- Census: `universe/universe_communitycollege_all.json` (all 1,077, sitting leader only)
- Schools table: `src/data/r1-communitycollege-schools.json` (1,101 seats, both levels)
- Builders: `build-cc-universe.mjs` (universe files), `build-cc-schools.mjs` (schools table)

## 1. What the list is

The 200 largest US community colleges by total fall 2024 headcount, from IPEDS
via the Urban Institute Education Data API. No key, no scraping, fully
reproducible — re-running the script after the next IPEDS release regenerates
the list.

| | |
|---|---|
| Institutions | 200 |
| Combined enrollment | 3,564,479 students |
| Share of all US community-college enrollment | **54.4%** |
| Cutoff | 9,359 students (SUNY Westchester CC, rank 200) |
| States represented | 37 (CA 68, TX 19, FL 17, IL 8, NY 7, AZ 7, MI 7) |
| Sitting leader named by IPEDS | 200 of 200 |
| Interim/acting at capture | 12 |

### Why 200 is the right cut, not an arbitrary one

The candidate pool is 1,077 community colleges. The largest 200 hold 54% of the
sector's 6.56 million students; the median of the remaining 877 is **2,785
students**. The line falls almost exactly where a presidency stops being a
nationally-searched seat and becomes a local hire. Extending to 400 would
roughly double the collection cost to add colleges averaging a fifth the size.

The coverage curve is the argument in one table — what each increment of
collection actually buys:

| Colleges | Cumulative enrollment | Enrollment at that rank |
|---:|---:|---:|
| 50 | 24.2% | 19,795 |
| 100 | 36.9% | 14,082 |
| 150 | 46.4% | 11,481 |
| **200** | **54.4%** | **9,359** |
| 250 | 61.1% | 8,330 |
| 300 | 66.8% | 6,950 |
| 400 | 76.1% | 5,384 |
| 500 | 83.3% | 4,171 |
| 700 | 92.9% | 2,342 |
| 1,077 | 100% | 28 |

Returns fall off a cliff after the first few hundred. Of the 877 below the cut,
644 are under 5,000 students, 323 under 2,000, 139 under 1,000 and 67 under 500 —
mostly single-campus rural colleges whose president is hired from inside the
state system without a national search. They cost the same per institution as
Miami Dade and buy a seat nobody is retained to fill.

### Depth and breadth are separate decisions, so the index makes them separately

IPEDS names a sitting chief administrator for **all 1,077** colleges, not just
the 200 — the roster is free at any size. What costs money is the *history*
(prior appointments, tenure spells, origin at appointment), which is a
per-institution research wave. Those two facts pull in opposite directions, so
the build emits two files:

| File | Scope | Cost |
|---|---|---|
| `universe_communitycollege_all.json` | All 1,077, sitting leader only, `historyPlanned` flag | One script run |
| `universe_communitycollege.json` | Top 200, the history-collection target set | A collection wave |

The census is the schools table and the news-scout target list. No college is
missing from the map, and nobody has to defend the 200 line to a customer asking
why theirs isn't in here — it is, with one row instead of eight. Depth then
follows the market rather than the alphabet.

### Portraits, and why the photo pass is really a verification pass

`fetch-cc-photos.mjs` mirrors the sitting leader's portrait from the college's
own leadership page, reusing `photo-lib.mjs` — the same extraction, placeholder
rejection and name matching the other indices use. **80 of the 200** now have a
portrait in `public/deans/`, across 22 states.

The useful part is not the picture. `matchByName` only accepts an image whose
alt text, filename or surrounding markup carries the leader's first *and* last
name, so a hit is the college's own site asserting that this person holds this
seat — which independently confirms **73** of the IPEDS names, at no extra cost.
That is step 3 of the sequence below, already partly done.

A miss is *not* evidence the name is wrong. Of the 120 misses, 116 were
`no-name-match`, and the common causes are CSS background-images and
JS-rendered leadership cards, neither of which a static HTML pass can read.
Results are per-college in `universe/cc-photo-manifest.json` with the reason
recorded, so the remainder is a worklist rather than a mystery.

Portraits are downscaled to the repo's 320px JPEG convention by
`thumbnail-cc-photos.mjs` — 24.7 MB of college hero images becomes 1.0 MB, or
about 13 KB a head, matching the existing 244 mirrors. That script needs
`sharp`, which is deliberately **not** a repo dependency; it reads one from an
external install via `SHARP_PATH`.

### The trap this list avoids

"Largest community colleges" reads like a lookup. It is not. **IPEDS no longer
classifies the biggest community colleges as two-year institutions.** 154 public
colleges that were sector 4 (public, two-year) in 2010 are sector 1 (public,
four-year) in 2024, because they added a few applied bachelor's degrees. Among
them: Lone Star, Dallas College, Houston CC, Valencia, Austin CC, Collin and San
Jacinto — **seven of the fifteen largest community colleges in the country.**

The obvious build, filtering IPEDS on "two-year", drops all seven silently and
produces a list that looks complete. Florida's colleges converted before 2010,
so even a 2010 comparison misses Miami Dade (58,941 — the fourth largest),
Broward, Palm Beach State, St Petersburg and FSCJ. Those are caught on their
degree profile instead: associate + bachelor's and **no** graduate degrees is a
community college that went baccalaureate, whereas a genuine regional
university offers master's.

Four inclusion rules, and their share of the final 200:

| Rule | Definition | In top 200 |
|---|---|---|
| A | Public two-year (IPEDS 2024 sector 4) | 132 |
| B | Public two-year in 2010, now awards bachelor's | 51 |
| C | Awards associate + bachelor's, no graduate degrees | 16 |
| D | Public four-year by sector, community-college name | 1 |

Five institutions the rules admit and judgement removes are listed with reasons
in the file's `excluded` block — CUNY City Tech (a senior college), Georgia
Gwinnett (never a two-year institution), UC Clermont and UC Blue Ash (two-year
branch campuses led by deans reporting to a university), and GSU Perimeter
(absorbed into Georgia State in 2016, no independent presidency). The test each
time was not "is this open-access" but **"is this a seat a community-college
president is recruited into"** — the same question that keeps branch campuses
and federal service academies out of the other indices.

## 2. Campus or district? — SETTLED 21 Aug 2026: both

**Decision: the index carries both seats**, with `seatType` on every record —
`standalone` (the president is the top seat), `campus` (reports to a district
chancellor), `district` (the chancellorship itself). Built by
`build-cc-schools.mjs` into `r1-communitycollege-schools.json`.

| Option | Seats | What it loses |
|---|---:|---|
| Campus only | 1,077 | 24 district chancellorships — the largest-comp seats in the sector |
| District only | 1,018 | 83 campus presidencies — the bench those chancellorships recruit from |
| **Both (chosen)** | **1,101** | — |

Both costs 2% more rows than campus-only, which is a rounding error against a
collection wave, and it is the only option that loses nothing. The move between
campus president and district chancellor is precisely the career step this
product exists to show; collapsing to either level makes that step invisible.

Two further facts made the choice easy:

- **A pure campus-level table was never on offer.** Dallas College consolidated
  its seven colleges into one accredited institution; Houston CC, Lone Star and
  Tarrant County also report to IPEDS as single units. "Campus level" would have
  silently meant "whatever IPEDS happens to report", which is not a consistent
  seat definition. Only an explicit `seatType` fixes that.
- **The chancellorships are where the search fees are.** LACCD, Maricopa, Alamo,
  San Diego. A firm evaluating the data looks for those names first; their
  absence reads as a gap in the product, not a scoping choice.

**Two flagged districts get no chancellor row**, recorded in `NO_DISTRICT_SEAT`
rather than dropped silently:

- *Delaware Technical Community College* — not a district at all. One president
  leads four campuses that IPEDS reports separately; its campuses fold to
  `standalone`.
- *City University of New York* — CUNY's chancellor leads a full university
  system of senior and community colleges, not a community-college district.
  That seat belongs to `ussystem`; a row here would double-count one person.

**Chancellor names are not in IPEDS.** Districts are not IPEDS reporting units,
so all 24 ship with `leaderNameUnverified: ""`. Unlike the college presidents,
these are not even leads — they are research, and the first collection wave has
to source them from scratch.

## 3. Market appeal

### The demand driver is unusually well documented

AACC's 2023 leadership report found **36.5% of sitting community-college CEOs
planned to retire within five years**, with another 11.8% inside nine years —
and projected the wave to peak around 2026 and run through 2032. Average
presidential tenure has fallen to **5.9 years**, down roughly 31% over sixteen
years. Apply the retirement figure alone to this universe and it implies
something like 70 of these 200 seats turning over by 2028, before counting
ordinary churn. Twelve are sitting under interim leadership right now.

For comparison, the R1 presidency — the index we already lead with — has
160 institutions in our index, and turns over more slowly.

### The sector is growing while the rest of higher ed is not

Community colleges grew **3.0% in fall 2025**, about 173,000 students, the
fastest-growing sector in US higher education, while private four-year
enrollment declined. Dual enrollment reached 1.19 million students, nearly 20%
of community-college enrollment. A board hiring into a growing sector runs a
more competitive search than one hiring into contraction.

### It is genuinely new bench, not a re-cut of what we have

Of the 200 institutions, **33 appear anywhere in our existing 31,891-record
corpus** — as an employer or a prior employer. The other 167 are invisible to
us today. Contrast that with the R2 build, which stalled partly because the
searches it was meant to serve turned out to sit inside institutions we already
covered across nine indices.

### The pipeline argument is the strongest one, and we can already prove it

**95 leaders in the current corpus came directly from a community college** —
their `priorInstitution` is one. Where they landed:

| Index | Leaders hired straight out of a community college |
|---|---|
| Administrative leaders | 30 |
| R2 public presidents | 25 |
| LAC presidents | 10 |
| University systems | 8 |
| R1 presidents | 6 |
| Nursing deans | 5 |
| Advancement | 4 |
| Business, provost, law, creative arts | 6 |

And this is a **hard floor**. `priorInstitution` records only the *immediately*
prior employer, the same limitation documented for `hasIndustryExp` — anyone
with a decade in community colleges behind one intervening university role is
invisible in that count. The real flow is larger.

That table is the product argument. Today a client asking "who has run an
open-access, workforce-facing institution at scale" gets 95 names we happened to
catch on their way past. With this index they get the bench itself, plus the
downstream half of the move already in the corpus — 39 of those 95 went on to a
presidency, chancellorship or system office. **The community-college index is
the missing upstream half of the president index we already sell.** Affinity and
Slate Builder are cross-index by construction, so both halves light up the day
the file lands.

### Collection cost is materially lower than any index we have built

IPEDS names the sitting chief administrator for **all 200**, with title. No
other index started with a complete roster of current incumbents — the R2 build
budgeted ~460k subagent tokens largely to discover them. Research starts at the
predecessor, not at "who runs this college."

Two cautions on that field: it lags a year or more, and it is wrong at some
colleges (Broward's is recorded as a Chief Data Officer; CUNY City Tech's names
a president who left in 2021). It is a **lead, not a fact** — the file names it
`leaderNameUnverified` for that reason, and every row needs verification against
the college before use. Even so, this is the cheapest index in the portfolio to
populate.

Titles are also not uniform, the same warning the systems universe carries:
145 President, 23 Superintendent/President (the California convention), 17
Chancellor, 12 interim or acting. Any ETL that keys on "President" will drop a
fifth of the sector.

### What weakens the case

**The sales motion is new, and the sector's own firms may want it least.**
Community-college presidential search is served by a partly separate firm
ecosystem — ACCT Searches (the trustees' association's own practice, 750+
searches), Gold Hill Associates (community-college-only), RH Perry — rather
than by Isaacson Miller, WittKieffer or Greenwood Asher, who anchor the R1
market our indices were built for.

These are prospects, not closed doors, and one of them is already in our supply
chain: `datasets.ts` records RH Perry as a source for the admin-leaders index,
our largest. What does not carry over is the *relationship*. Our pilot access
sits with R1-anchored generalists, so selling a community-college index into a
community-college-only firm is a new logo and a new champion, not a cross-sell.

The sharper risk is willingness to pay. Gold Hill's consultants are former
community-college presidents; ACCT is owned by the trustees who do the hiring.
Both compete on a personal network that already contains much of what this
index would sell them, and ACCT carries association budgets besides. **The
strongest buyer is therefore probably not the community-college specialist but
the R1 generalist taking a community-college mandate** — the firm with the
relationship and without the network. That is a testable claim, and testing it
costs one conversation: ask an existing pilot firm whether they bid
community-college presidencies and what they lack when they do. Do that before
funding full collection, not after.

**Geographic concentration.** 68 of 200 are Californian, 34% of the index for
about 12% of the population. That is real — California genuinely has the
largest community-college system in the country — but a client outside
California sees a third of the index as irrelevant, and any aggregate trend
chart is substantially a chart about California policy. Worth showing a
state-normalised view alongside the raw one.

**Data thinness relative to the R1 indices.** No US News rank, no BSQ, no HERD
research spend. `rankLabel` for this index is enrollment, and the analytics
tabs will lean on the appointment/tenure/origin fields rather than the research
metrics. That is the same position the LAC and systems indices are in, so the
UI already handles it.

## 4. Recommendation

Build it, and treat it as the highest-value index remaining — best-documented
demand, fastest-growing sector, lowest collection cost, and the only one that
completes a career story the existing corpus already half-tells.

Sequence:

1. ~~**Settle campus-vs-district**~~ — done, section 2: both seats, `seatType` on every record.
1b. **Ask one existing pilot firm whether they bid community-college
   presidencies**, and what they lack when they do. One conversation, and it
   tests the buyer assumption this whole case rests on.
2. ~~**Ship the census as the schools table**~~ — done:
   `r1-communitycollege-schools.json`, 1,101 seats. Breadth is no longer what
   holds the index back; only depth is, and depth is the part worth paying for.
3. **Verify the 200 incumbents** against college websites. The photo pass already
   confirmed 73 of them (above); the remaining 127 are the actual work. Cheap, and it
   converts the IPEDS field from a lead into data. Do this before any history
   collection so waves start from a correct anchor. The other 877 stay
   explicitly unverified; `leaderNameUnverified` is named that way so no
   consumer mistakes a lead for a fact.
4. **Pilot one wave of 20 colleges** traced from 1996, mixing a Texas district,
   a California multi-college district and a standalone Midwestern college, to
   size the real per-institution cost against the R2 build's ~37k tokens
   batched.
5. **Register `uscommunitycollege`** via `research/register_index.mjs` — one
   line in `scripts/lib/indices.mjs`, then the shared generators pick it up.
6. Run `check-school-names.mjs` after every wave. This universe is full of
   institution-name landmines: "Glendale Community College" exists in both
   Arizona and California, "Metropolitan Community College" is an Omaha
   institution and a Kansas City one, and the `university` field is a join key, not
   a label.

## Sources

- [AACC, *The State of Community College Leadership: 2023*](https://www.aacc.nche.edu/wp-content/uploads/2023/09/LeadershipReport.pdf)
- [National Student Clearinghouse, fall 2025 enrollment](https://www.studentclearinghouse.org/news/fall-undergraduate-enrollment-shows-overall-growth-despite-decline-at-private-colleges/)
- [Chronicle of Higher Education, "Enrollment Ticked Up 1% Last Fall, With Most of the Growth at Community Colleges"](https://www.chronicle.com/article/enrollment-ticked-up-1-last-fall-with-most-of-the-growth-at-community-colleges)
- [Higher Ed Dive, "Fall 2025 enrollment increased 1% — but the devil is in the details"](https://www.highereddive.com/news/fall-2025-enrollment-increased-1-but-the-devil-is-in-the-details/809675/)
- [ACCT Searches](https://acctsearches.org/), [Gold Hill Associates](https://www.collegepresidentsearch.com/), [RH Perry & Associates](https://rhperry.com/)
- IPEDS 2024, via the [Urban Institute Education Data API](https://educationdata.urban.org/documentation/)
