# The non-academic experience pilot — what 120 people cost, and what they bought

`gen-nonacademic-experience.mjs` derives ties from career stops the corpus
already holds. `nonacademic-experience.md` argues that ceiling is structural
rather than tunable. This pilot measured it: **120 sitting leaders, one web
query each, August 2026.**

It ran twice. The first pass counted **companies only**. The definition was then
widened — governments, nonprofits, foundations and health systems are credible
non-academic employers, and the network a foundation trustee carries is not a
lesser thing than the one a consultant carries. The same 120 records were
re-scored under the new rule. **Both readings are reported below, because the
gap between them is the most useful number in this document.**

## 1. The sample is stratified because a bare hit rate is meaningless

Most academic leaders have never worked outside a university, so a sample drawn
where hits are likely measures the sampler, not the population. The frame splits
four ways, and every rate is reported against the others rather than on its own.

| stratum | indices | n |
|---|---|---|
| administrative | adminleaders, advancement, system | 30 |
| professional | business, law, engineering, pharmacy | 30 |
| leadership | president, provost, LAC president, R2 | 30 |
| discipline | arts & sciences, education, nursing, medical, public health, ag, vet, graduate, creative arts | 30 |

`scripts/sample-nonacademic-research.mjs --per 30 --seed <n>` draws it from the
sitting leaders the derivation could not name an organisation for, minus anyone
a previous wave already covered. So a sample measures what research *adds*,
never what it re-confirms, and a second wave cannot spend its budget
re-researching the first wave's people.

## 2. The result, both ways

| stratum | companies only | **all non-academic** | 95% CI (new) |
|---|---|---|---|
| administrative | 23.3% | **53.3%** | [36.1%, 69.8%] |
| leadership | 13.3% | **46.7%** | [30.2%, 63.9%] |
| discipline | 0.0% | **20.0%** | [9.5%, 37.3%] |
| professional | 6.7% | **13.3%** | [5.3%, 29.7%] |
| **pooled** | **10.8%** | **33.3%** | [25.5%, 42.2%] |

Widening the definition **triples the hit rate**. It also reorders the strata:
discipline deanships went from the empty stratum to ahead of professional-school
deans, because a nursing dean's career runs through health systems and an
education dean's through school districts and foundations — non-academic
employers that the company-only rule scored at zero.

**This reverses the first pass's main recommendation.** "Skip the discipline
stratum, it returns nothing" was true of companies and is false of non-academic
work generally. The honest reading of the new numbers is narrower than the old
one: administrative and leadership seats lead, professional and discipline
deanships trail, and the two pairs are not separable from each other at n=30.

**The 33.3% is a lower bound, not an estimate.** These queries were written to
ask about industry and board seats. They surfaced government and nonprofit
employers incidentally, when a bio happened to mention them. A wave written for
this definition would ask directly, and would find more.

## 3. Cost

**≈1,800 billable tokens per person**, measured across the run — 3× to 17×
cheaper than this project had been planning against, because one query settles
the large majority of people, and it settles them either way.

Extrapolating over the 4,225 sitting leaders still un-researched:

| stratum | people | ≈ tokens | expected named ties | tokens per tie |
|---|---|---|---|---|
| administrative | 2,140 | 3.9M | ~1,141 | 3.4k |
| leadership | 668 | 1.2M | ~312 | 3.9k |
| discipline | 1,054 | 1.9M | ~211 | 9.0k |
| professional | 363 | 0.7M | ~48 | 13.6k |
| **all** | **4,225** | **7.6M** | **~1,712** | 4.4k |

Administrative and leadership together are 2,808 people, 5.1M tokens and ~1,453
ties — 85% of the yield for 67% of the cost. That is still the right place to
start. The rest is no longer worthless, only less efficient, so it is a budget
question rather than a taxonomy question.

## 4. Board seats: from zero to a third of all ties

The corpus contained **zero** board ties across 28,250 people. The pilot's 120
produced **24**, alongside 45 employment ties and 5 advisory seats.

| person | organisation | seat |
|---|---|---|
| John C. Bravman (Bucknell) | Geisinger Health | Board chair 2016–2023, director since 2012 |
| Claudia Lucchinetti (UT Austin) | Mayo Clinic | Board of Governors and Board of Trustees |
| Cathann Kress (Ohio State) | W.K. Kellogg Foundation, CAST, Ronald McDonald House Charities | Director ×3 |
| Robert Manuel (DePaul) | NAICU, Cristo Rey Network, Institute of International Education | Board chair + director ×2 |
| Brian Shanley (St John's) | BIG EAST Conference, ACCU, CICU | Board chair + director ×2 |
| Eric Nestler (Mount Sinai) | BPGbio, Sparian Biosciences | Scientific advisory chair + member |

Three things follow.

**Boards only appear if you ask.** Every one of these surfaced because the query
contained the words "board of directors". Bravman's Geisinger chairmanship is
not in the bio Bucknell publishes. Ask explicitly, in every query.

**Most of them are nonprofit.** Under the company-only rule, five of the six
people above scored nothing. Kress had the largest board portfolio in the sample
and was recorded as a flat `no`.

**A board seat is usually current, where a job usually is not.** Recency is a
scoring axis, and this is where the widened definition pays off twice: these
ties are both real and live.

## 5. What one query does not buy

| | of 75 ties |
|---|---|
| organisation named | 75 |
| title recorded | 73 |
| **dated** | **17** |

Recency is a scoring axis and fewer than a quarter of ties carry a year. A
name-level verdict is cheap; a complete tie record is not. Budget a second pass
for dates and rank on ties that clear a relevance bar, rather than paying for
completeness on all 4,225.

Separately, **three people have confirmed non-academic experience and no
nameable organisation** — Kathy Pharr spent six years as a television reporter,
Amy Henley worked in transportation logistics in Dallas, Darron Smith ran a
Pennsylvania farm. The background is confirmed and the *asset* is missing. That
bucket is structural: no research effort closes it when no public source names
the employer.

## 6. The derivation's false-negative rate, measured

Under the company-only reading, **nine of the thirteen** people with a nameable
firm were derived as a confident `no`. The starkest: Derrick Singleton (Berea)
spent 26 years in corporate operations at Sherwin-Williams and Coors; the corpus
held two career stops for him, both academic, and returned `no / medium`.

This is why the ledger **overrides** rather than merges. A researched no means
someone looked. A derived no only ever meant "the one job we recorded was
academic" — which is 85% of today's negatives.

## 7. Taxonomy defects the pilot exposed

1. **`seniorityOf` mis-ranks board titles.** It reads "Science Advisory Board
   member" as executive and "Chair of the Scientific Advisory Board" as unknown
   — exactly backwards. It is a good employment-title parser and a bad board
   one, so the ledger carries `seniority` as a field the researcher sets, with
   inference only as a fallback.
2. **`advisory` conflates two different things.** Nestler chairing a biotech's
   scientific advisory board and Manuel sitting on a vendor's customer advisory
   council both score `advisory` +8. They are not comparable.
3. **Founder-led ventures have no policy.** Joe Manok founded
   GlobalPhilanthropy.ai alongside his university job. Whether that counts is a
   call the taxonomy should make explicitly.
4. **Sector is deliberately not a scoring input.** A foundation seat and a
   corporate one rank on the same axes — seniority, kind, recency. Weighting
   sectors would re-introduce the hierarchy the widened definition exists to
   remove; anyone who wants to weigh them differently has the category filter.

## 8. Free by-catch: three data-quality defects

Reading 120 bios surfaced errors nothing in the pipeline would have caught.

- **Tom Landers** (Oklahoma) is recorded as a sitting leader. He left the
  deanship in 2019 and died in September 2025.
- **"Yao"** (Delaware, Lerner) is stored as a single token. He is Oliver Yao.
- **"Vicki Kleist"** (Wayne State) is Virginia Franke Kleist in every source.

A research wave is also an audit. Worth capturing deliberately next time.

## 9. The ledger

`research/nonacademic-ties.jsonl` — append-only, one record per person per wave,
last wave wins. Its shape is the output contract in `PROJECT.md`: organisation
name only, one entry per organisation, most senior title, years as a span, kind,
seniority, category from `CATEGORY_NAMES`, and **"none found" stated explicitly**
rather than omitted.

`gen-nonacademic-experience.mjs` reads it if present and derives exactly as
before if absent. Researched records carry `evidence: "research"` and a
`researchedOn` date, which the profile view uses to say "None found — career
reviewed" instead of the much weaker "None outside the academy on record".

Two merge rules:

- A tie the researcher marked `kind: "unresolved"` is **dropped, not
  downgraded**. Lynden Archer is widely reported to have co-founded NOHMs
  Technologies; this query did not confirm it, so it stays a note and never
  enters the ranked list.
- A researched person is never omitted, even when the corpus has no career
  evidence for them at all. Speaking for those people is the point.

The 29 records re-scored in §2 carry a note saying so. Every organisation added
in that pass was already written down in the original pilot note — the first
reading simply had no place to put it.

## 10. Recommendation

1. **Run administrative + leadership first** — 2,808 people, ≈5.1M tokens,
   ≈1,453 named ties. Board seats in the prompt, every time.
2. **Then decide on discipline and professional** on budget, not on principle.
   At 20% and 13% they are less efficient, not empty. The first pass's
   "skip discipline" recommendation does not survive the wider definition.
3. **Write the queries for this definition.** These asked about industry and
   boards, so 33.3% is a floor. Ask about government service, foundation and
   nonprofit roles, and health-system seats directly.
4. **Second pass for dates and rank**, on ties that clear a relevance bar only.
5. **Log data-quality defects as a first-class output** of the next wave.
