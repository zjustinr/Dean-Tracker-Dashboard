# The industry-tie research pilot — what 120 people cost, and what they bought

`gen-industry-experience.mjs` derives ties from career stops the corpus already
holds. That has a ceiling, and `industry-ties.md` argues the ceiling is
structural rather than tunable. This pilot measured it instead of arguing about
it: **120 sitting leaders, one web query each, August 2026.**

Two questions, both previously guesses: what does research actually find, and
what does it cost per person.

## 1. The sample is stratified because a bare hit rate is meaningless

Most academic leaders have no industry background at all. A sample drawn where
hits are likely measures the sampler, not the population — so the frame is split
into four strata that encode the prior being tested, and every number below is
reported as a **lift over the baseline stratum** rather than on its own.

| stratum | indices | n |
|---|---|---|
| administrative | adminleaders, advancement, system | 30 |
| professional | business, law, engineering, pharmacy | 30 |
| leadership | president, provost, LAC president, R2 | 30 |
| discipline | arts & sciences, education, nursing, medical, public health, ag, vet, graduate, creative arts | 30 |

`scripts/sample-industry-research.mjs --per 30 --seed 20260819` draws it. The
frame is the **sitting leaders the derivation could not name a firm for** — 4,775
when the sample was drawn, 4,762 now that the pilot's own findings have merged
back in. Anyone who already has a named tie is excluded, so the pilot measures
what research *adds*, never what it re-confirms. The seed is fixed, so the sample is
auditable and a rerun extends it rather than reshuffling it.

## 2. The result

| stratum | named firm | rate | 95% CI | + confirmed, unnamed | any |
|---|---|---|---|---|---|
| **administrative** | 7/30 | **23.3%** | [11.8%, 40.9%] | 2 | 30.0% |
| leadership | 4/30 | 13.3% | [5.3%, 29.7%] | 0 | 13.3% |
| professional | 2/30 | 6.7% | [1.8%, 21.3%] | 2 | 13.3% |
| **discipline** | 0/30 | **0.0%** | [0%, 11.4%] | 1 | 3.3% |
| pooled | 13/120 | 10.8% | [6.4%, 17.7%] | 5 | 15.0% |

**The administrative-versus-discipline gap is real at this sample size** — the
intervals do not overlap. The three-way ordering among administrative,
leadership and professional is *not* established; those intervals overlap and
n=30 cannot separate them. The defensible claim is the coarse one: seats whose
job is running an institution carry corporate ties, seats whose job is running a
discipline essentially do not.

Nothing here contradicts the existing corpus. It quantifies it.

## 3. Cost

**≈1,800 billable tokens per person**, measured across the run (≈215k tokens for
120 people, including the cost of writing each finding to the ledger). That is
between 3× and 17× cheaper than the 6k–30k per-person range this project had
been planning against, because a single well-formed query answers the question
for the overwhelming majority of people — the ones with no industry background at
all, which is most of them.

Two caveats. The figure is billable tokens under prompt caching, so a run that
cannot reuse a warm context will cost more. And it is the cost of a **firm-level
verdict**, not of a complete tie record — see §5.

Extrapolating over the frame:

| scope | people | ≈ tokens | expected named ties |
|---|---|---|---|
| full frame | 4,762 | 8.6M | ~690 |
| **administrative + leadership only** | **3,150** | **5.7M** | **~660** |
| discipline only | 1,171 | 2.1M | ~0 |

**Two thirds of the cost buys 96% of the yield.** Skipping the discipline stratum
is not a compromise; it is the finding. And ~660 new named ties against the 260
sitting leaders who currently have one is a **3.5× increase in the shippable
population** — the number `industry-ties.md` called "small, and the real finding."

## 4. Board and advisory seats are the payload, and only appear if you ask

The corpus contained **zero** board ties across 28,250 people. The pilot found
five board or advisory seats in 120:

| person | firm | seat |
|---|---|---|
| John C. Bravman (Bucknell) | Geisinger Health | Board chair 2016–2023, director since 2012 |
| John C. Bravman | Risant Health | Director |
| Eric J. Nestler (Mount Sinai) | BPGbio | Chair, Scientific Advisory Board |
| Eric J. Nestler | Sparian Biosciences | Science Advisory Board |
| Robert L. Manuel (DePaul) | EAB | President's Advisory Board |

Every one surfaced **only because the query included the words "board of
directors."** Bravman's own institutional bio does not mention Geisinger.
Bravman now tops the ranked list at score 71, ahead of the 29-way tie at 70 that
the ranked view previously opened with — the board bonus doing exactly what it
was designed to do, the first time it has had anything to act on.

The lesson for the next wave is a prompt-shape lesson: **ask about boards
explicitly, every time.** They are invisible to a question about employment.

## 5. What one query does not buy

| | of 23 ties |
|---|---|
| firm named | 23 |
| title recorded | 21 |
| **dated** | **10** |

Recency is a scoring axis and less than half the ties carry a year. A firm-level
verdict is cheap; a *complete* tie record is not. Budget a second pass for dates
and rank on the ties that clear a relevance bar, rather than paying for
completeness on all 4,762.

Separately, **5 of 18 hits have no firm name at all** — Andrew Hessick "practised
litigation in Washington DC", Kathy Pharr spent six years as a television
reporter, Teresa Nichols had "a successful career in mortgage banking." The
industry background is confirmed and the *asset* is missing. The flagged-only
bucket is structural, not a data-entry failure, and no amount of research effort
closes it when no public source names the employer.

## 6. The derivation's false-negative rate, measured

Of the 13 people with a nameable firm tie, **nine were derived as a confident
`no`** and two more as `yes/low`. The single starkest case: Derrick Singleton
(Berea College) spent 26 years in corporate operations at Sherwin-Williams and
Coors. The corpus held two career stops for him, both academic, and returned
`no / medium`.

This is why the ledger **overrides** rather than merges. A researched no is worth
something; a derived no only ever meant "the one job we recorded was academic."

## 7. Four taxonomy defects the pilot exposed

1. **The nonprofit and health-provider exclusions suppress real networks.**
   Bravman chairs a multi-billion-dollar health system. Claudia Lucchinetti sits
   on Mayo Clinic's board of governors. Cathann Kress holds six board seats
   including the W.K. Kellogg Foundation — the largest board portfolio in the
   pilot, and worth zero under a firm-only definition. Clare Shinnerl was
   COO/CFO of an employer health coalition; Morgan Bazilian sits on the World
   Economic Forum's energy council. Each is a genuine door-opening relationship
   that scores nothing. The definition, not the evidence, is deciding these.
2. **`seniorityOf` mis-ranks board titles.** It reads "Science Advisory Board
   member" as executive and "Chair of the Scientific Advisory Board" as unknown
   — exactly backwards. It is a good employment-title parser and a bad board one.
   The ledger therefore carries `seniority` as a field the researcher sets, with
   inference only as a fallback.
3. **`advisory` conflates two very different things.** Nestler chairing a
   biotech's scientific advisory board and Manuel sitting on a vendor's customer
   advisory council both score `advisory` +8. They are not comparable.
4. **Founder-led ventures have no policy.** Joe Manok founded GlobalPhilanthropy.ai
   alongside his university job. Whether that counts is a call the taxonomy should
   make explicitly rather than leave to whoever is researching that day.

## 8. Free by-catch: three data-quality defects

Reading 120 bios surfaced errors nothing in the pipeline would have caught.

- **Tom Landers** (Oklahoma) is recorded as a sitting leader. He left the deanship
  in 2019 and died in September 2025.
- **"Yao"** (Delaware, Lerner) is stored as a single token. He is Oliver Yao.
- **"Vicki Kleist"** (Wayne State) is Virginia Franke Kleist in every public source.

A research wave is also an audit. Worth capturing deliberately next time.

## 9. The ledger

`research/industry-ties.jsonl` — append-only, one record per person per wave,
last wave wins. Its shape is the output contract in `PROJECT.md`: employer name
only, one entry per employer, most senior title, years as a span, kind, sector
from `INDUSTRY_NAMES`, and **"none found" stated explicitly** rather than omitted.

`gen-industry-experience.mjs` reads it if present and derives exactly as before
if it is absent. Researched records carry `evidence: "research"` and a
`researchedOn` date, which the profile view uses to say "None found — career
reviewed" instead of the much weaker "None in recorded career."

Two rules the merge enforces:

- A tie the researcher marked `kind: "unresolved"` is **dropped, not downgraded**.
  Lynden Archer is widely reported to have co-founded NOHMs Technologies; this
  query did not confirm it, so it stays a note and never enters the ranked list.
- A researched person is never omitted, even when the corpus has no career
  evidence for them at all. Speaking for those people is the point.

## 10. Recommendation

1. **Run administrative + leadership across all sitting leaders** — 3,150 people,
   ≈5.7M tokens, ≈660 named ties. Board seats in the prompt, every time.
2. **Skip the discipline stratum.** 0/30, and an upper confidence bound of 11%.
   Revisit only if the sector definition changes.
3. **Decide the nonprofit and health-system question before the wave runs**, not
   after. It is the single largest lever on the result, and the pilot cannot
   settle it — it is a product call about what "a connection worth having" means.
4. **Second pass for dates and rank**, on ties that clear a relevance bar only.
5. **Log data-quality defects as a first-class output** of the next wave.
