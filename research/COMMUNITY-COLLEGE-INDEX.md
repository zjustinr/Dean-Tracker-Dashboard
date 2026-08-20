# Community College Index — universe and market case

Status: **step 1 complete, not wired into the app.** The universe file exists;
no dataset id is registered, no ETL has run, no leader history has been
collected. This document is the case for doing that work and the record of how
the universe was drawn.

- Universe: `universe/universe_communitycollege.json` (200 institutions)
- Builder: `build-cc-universe.mjs` (`node research/build-cc-universe.mjs`)

## 1. What the list is

The 200 largest US community colleges by total fall 2024 headcount, from IPEDS
via the Urban Institute Education Data API. No key, no scraping, fully
reproducible — re-running the script after the next IPEDS release regenerates
the list.

| | |
|---|---|
| Institutions | 200 |
| Combined enrollment | 3,564,479 students |
| Share of all US community-college enrollment | **54.1%** |
| Cutoff | 9,359 students (SUNY Westchester CC, rank 200) |
| States represented | 37 (CA 68, TX 19, FL 17, IL 8, NY 7, AZ 7, MI 7) |
| Sitting leader named by IPEDS | 200 of 200 |
| Interim/acting at capture | 12 |

### Why 200 is the right cut, not an arbitrary one

The candidate pool is 1,077 community colleges. The largest 200 hold 54% of the
sector's 6.6 million students; the median of the remaining 882 is **2,796
students**. The line falls almost exactly where a presidency stops being a
nationally-searched seat and becomes a local hire. Extending to 400 would
roughly double the collection cost to add colleges averaging a fifth the size.

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

## 2. The open scoping decision: campus or district?

**53 of the 200 are colleges inside a multi-college district**, spanning 22
districts — LACCD (6 of the 200), Maricopa (6), Los Rios (4), Alamo (4), CUNY
(4), San Diego (3), Riverside (3), and 15 others. Each has a campus president
*and* a district chancellor, and both seats are searched nationally.

- **Campus level** (what the file currently holds): 200 seats. Matches how
  IPEDS reports and how enrollment is measured. Ranks six LA colleges
  separately while the district chancellor — the bigger job — is absent.
- **District level**: 169 distinct seats, and the file loses the campus
  presidencies, which are the standard proving ground for a chancellorship.

Note that the largest single entries — Lone Star, Dallas College, Houston CC,
Tarrant County, Austin, Collin — *already* report at district level, so the
list currently mixes the two conventions.

My recommendation: **keep the campus rows and add the district seat as its own
row.** The two are different jobs with different candidate pools, and the
career move between them is precisely the signal this product exists to show.
That means a universe closer to 222 seats than 200, and it needs a `district`
/ `campus` field on the record rather than a choice between them. This is the
one decision worth making before any collection starts, because it determines
the unit of the whole index.

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

**The buyer may not be our buyer.** Community-college presidential search is
served by a partly separate firm ecosystem — ACCT Searches (the trustees'
association's own practice, 750+ searches), Gold Hill Associates
(community-college-only, staffed by former CC presidents), RH Perry — rather
than by Isaacson Miller, WittKieffer or Greenwood Asher, who anchor the R1
market our indices were built for. That cuts both ways: it is a genuinely new
buyer set to sell into, but nothing about our existing relationships carries
over, and ACCT is an incumbent with a structural advantage we cannot match
(it *is* the trustees who do the hiring). Worth a conversation with one
community-college search practice before funding the full collection.

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

1. **Settle campus-vs-district** (section 2). Nothing else should start first.
2. **Verify the 200 incumbents** against college websites. Cheap, and it
   converts the IPEDS field from a lead into data. Do this before any history
   collection so waves start from a correct anchor.
3. **Pilot one wave of 20 colleges** traced from 1996, mixing a Texas district,
   a California multi-college district and a standalone Midwestern college, to
   size the real per-institution cost against the R2 build's ~37k tokens
   batched.
4. **Register `uscommunitycollege`** via `research/register_index.mjs` — one
   line in `scripts/lib/indices.mjs`, then the shared generators pick it up.
5. Run `check-school-names.mjs` after every wave. This universe is full of
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
