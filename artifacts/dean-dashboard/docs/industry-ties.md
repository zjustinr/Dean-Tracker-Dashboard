# Industry ties — what the corpus supports, and how the field is built

Schools increasingly want leaders who bring a corporate network they can tap for
gifts, partnerships, executive education and placement. That is the thesis this
field exists to serve, and it decides the field's shape.

## 1. The binary is the wrong container

The obvious ask is a Yes/No on every candidate. For a connections thesis it is
the least useful shape available, because "Yes" collapses exactly the part that
determines whether the connection is worth anything. A Goldman managing director
who left in 2019 and a software engineer who left in 1991 both read `true`, and
only one can make a call that lands.

The unit of value is not a person-attribute, it is a **tie**:

```
person → firm → sector → seniority → recency → kind (employed / board / advisory)
```

The firm is the asset. The sector is only how you group it. So the pass emits
tie records with a score, and `status` (`yes` / `no` / `unknown`) is a by-product
rather than the point.

**And industry and firm are not harder than the binary — they are the same
work.** The only way to know someone has industry experience is to find the
employer; once you have the employer, the firm name is free and the sector is a
lookup. Everything expensive is in finding the employer.

## 2. Architecture: system-wide, and inherited by indices that don't exist yet

Three shared modules under `scripts/lib/`. Nothing in any of them names an index,
so an index added next year is covered by existing.

| module | owns | consumed by |
|---|---|---|
| `indices.mjs` | which dean files exist, dataset ids, labels | all 5 index-wide generators |
| `org-classify.mjs` | org → sector, seniority bands, tie kinds | industry-experience, employer-affinity |
| `school-canon.mjs` | institution-name canonicalization (pre-existing) | affinity, check-school-names, org-classify |

**Why the registry moved.** `FILE_ID` and `INDEX_LABEL` were copy-pasted into
four generators, each carrying a note that the duplication was deliberate. It
drifted anyway: `scout-backtest.mjs` never learned about
`r1-adminleaders-deans.json` — the largest index at 2,264 rows — because a
collection wave added the file to three generators and not the fourth. Nothing
failed. The backtest just silently sampled a corpus missing a fifth of its
people. `assertRegistered(SRC)` now runs at the top of every index-wide pass and
complains about any dean file the registry has not been told about, so a partial
rollout is loud instead of silent.

**Why the taxonomy moved.** `gen-employer-affinity.mjs` had its own
`CATEGORY_PATTERNS`; `gen-industry-experience.mjs` had a fuller one. One
vocabulary now serves both, mapped onto the coarse category names
`employer-affinity.json` already publishes so its shape and its validated
numbers survive.

**Adding an index is now one line** in `indices.mjs`. Extending the vocabulary
(a firm nobody has hired from before, a new school brand) is one line in
`org-classify.mjs`, and every consumer picks it up on its next run.

## 3. What the existing data yields

`node scripts/gen-industry-experience.mjs` — about a second, deterministic,
writes `src/data/industry-experience.json`. Never touches the dean JSONs.

Over 28,250 unique people:

| verdict | people |
|---|---|
| **yes**, with a named firm | 494 |
| **yes**, on a corroborating flag only | 399 |
| **no** — evidence exists, all academic / government / nonprofit / health | 12,658 |
| **unknown** — nothing to classify | 14,699 (52%) |

458 distinct firms. The ranking axes:

| ties by seniority | | ties by kind | |
|---|---|---|---|
| executive | 188 | employment | 530 |
| senior | 108 | advisory | 3 |
| professional | 136 | **board** | **0** |
| unknown | 101 | | |

**The shippable population is 260 sitting leaders with a named-firm tie, 135 of
them at senior or executive rank.** That is small — and it is the real finding.
The research pass is the product here, not the derivation.

### Scoring

Additive and transparent, not fitted — there is no outcome label to fit against,
and a made-up weighting that *looks* learned would be worse than one a user can
read off the page and argue with. Weights live in the output's `scoring` block.

- **Seniority** dominates (executive 45 / senior 32 / professional 14 / unknown 18) because it is what actually determines whether a network transfers.
- **Kind** adds board 18, advisory 8, employment 0.
- **Recency** adds 25 down to 0 by age of the tie, 8 when undated.
- A person's score is their **best single tie, not a sum** — one executive seat at a household-name firm opens more doors than four junior stints.

`asOf` is written into the file so a stored score is auditable and regeneration
is deterministic rather than drifting with the wall clock.

## 4. Two numbers that bound how far derivation can go

**Recall against human ground truth is 27%.** The 293 people hand-labelled
`hasIndustryExp: true` are the only ground truth available. Ignoring that label,
the pass independently reproduces 78 of them from a named employer.
`priorInstitution` records the job *immediately before* the deanship, so six
years at a firm followed by twenty on a faculty is indistinguishable from a
lifelong academic:

| dean | `priorInstitution` on record | researcher's label |
|---|---|---|
| Scott J. Grawe | Iowa State University Ivy College of Business | Academic/Industry |
| Ed Grier | Virginia Commonwealth University School of Business | Academic/Industry |
| James G. Ellis | University of Southern California | Academic and Industry |

**84% of "no" verdicts rest on a single career stop** (10,618 of 12,658). That is
"the one job we recorded was academic", not "never worked in industry".

Under a census framing these numbers are damning. Under a ranking framing they
are much less so — you never had to prove absence, only to rank presence. The
`unknown` half is a backlog, not a defect, provided nothing displays it as `no`.

## 5. Board service is the biggest gap, and an earlier decision here was wrong

The first cut of this pass counted employment only and explicitly rejected board
seats, advisory panels and company-funded chairs as "not industry employment."
That is right for a census and **wrong for this thesis**: a sitting corporate
board seat is a current, named, direct relationship, usually worth more than a
job someone left in 1998.

> **Superseded in part by the August 2026 pilot** — see `industry-ties-pilot.md`.
> Research found five board and advisory seats in 120 people, every one of them
> invisible to a query phrased about employment. Board coverage is no longer
> zero, and a board chair now tops the ranked list.

`tieKindOf()` separates them, and the result was stark: **zero board ties in
the entire corpus** before any research wave ran. Across 28,250 people, board or advisory service appears in
29 research summaries, 5 career steps and 22 dean notes — all prose, none of it
in a structured role field. The pass can represent board ties; the data has none
to give it. That is the single highest-value thing a research pass could collect.

## 6. The demand side already exists

`employer-affinity.json` answers "what kind of place does *this* discipline hire
from," and it survives a leave-one-out validation on two indices:

| index | hit rate | baseline | lift | n |
|---|---|---|---|---|
| R1 business | 5.1% | 1.5% | 3.4× | 157 |
| Admin leaders | 9.4% | 2.4% | 3.9× | 727 |

Consolidating onto the shared taxonomy grew both samples (n 136→157 and
302→727) and added a category: **Industry & Manufacturing** is now distinctive,
worth weak-link slots that previously fell into the discarded "Other" bucket.

So the feature's home is a **two-sided match in Scout Assistant** — this school's
revealed hiring pattern wants Finance & Consulting ties, here are the sitting
leaders elsewhere who carry them, ranked by seniority and recency — not a static
profile badge.

One honest correction: fixing the `technolog` stem bug means Technology is now
*recognized* (20 external hires classify there, previously near-zero), but it
still does not clear the 1.4 lift bar as a *distinctive* category for any
discipline. The bug is fixed; the signal is genuinely not there yet.

## 7. Do not build the trend chart

Do not ship "industry hires are rising" off this data. Coverage varies by index
and collection wave, not by reality — 12 indices have zero values, and the
business and engineering indices were hand-labelled while the rest were not. Any
trend line measures research effort, not hiring behaviour. If proving that trend
matters commercially, it needs a deliberately time-balanced sample.

## 8. The research contract

The `phdInstitution` contamination bug in `PROJECT.md` came from an enrichment
pass with no output contract. This field has the same exposure: the firm name is
a display string that becomes a de-facto grouping key the moment anyone builds a
"deans who worked at McKinsey" view. Any wave collecting industry ties returns:

- **Employer's full name only** — "McKinsey & Company", not "Senior Partner at McKinsey". Role goes in its own field.
- **One entry per employer**, not per title. Three promotions at IBM is one tie.
- **The most senior title held** at that employer — this drives the score, and it is the field most often dropped.
- **Years**, as a span. Recency is an axis, not a footnote.
- **Kind**: employed, board seat, or advisory. Board seats especially — they are currently at zero.
- **Sector** from `INDUSTRY_NAMES` in `org-classify.mjs`, so the taxonomy does not fork.
- **Employment distinguished from affiliation.** Board service, an advisory panel, a consulting engagement while on faculty, and a company-funded chair are all *not* employment — they are their own kinds, and conflating them inflates the field. The free-text mining experiment here returned "the KPMG Academic Research Panel" and "Walton's Walmart-anchored strength in retail" as industry hits; a researcher working from a bio makes the same mistake unless told not to.
- **"None found" explicitly** when a career was entirely academic. It is the only way the corpus ever gets a real No instead of a weak one.

## 9. Priority order

> **Revised by the pilot.** The measured hit rate is 23% in administrative seats
> and 0/30 in discipline deanships, at ≈1,800 tokens per person. Item 3 below
> should be scoped to administrative and leadership seats only: two thirds of the
> cost, 96% of the ties. See `industry-ties-pilot.md`.

1. ~~**Ship the ranked view**~~ **Shipped** (Aug 2026): the Industry Ties module tab
   (`IndustryTies.tsx`) ranks the named-firm pool with industry/seniority/sitting
   filters and opens cross-index profiles. The sidecar is served through both
   ENRICHMENT sets, scope-gated per visitor like leader-research; DeanProfile's badge
   now names the firm, CompareSchools computes "Industry Exp % (of researched)" over
   known verdicts (dash when none — no more fake 0%), and Scout Assistant candidate
   rows carry a named-firm tie chip.
2. **Board-service sweep across sitting leaders.** Highest value per token: currently zero coverage, and a narrower question than a full career history, so cheaper per person.
3. **Career histories for the 5,082 sitting leaders who lack one**, ordered by where `employer-affinity` says the demand is, returning seniority and years — not just the employer name.
4. **Resolve rank on the ~237 ties** currently landing in `professional` or `unknown` seniority. Cheap, and it upgrades records that already exist.

The ~20,900 historical people stay `unknown`, correctly labelled. They are not
worth researching for a field consulted about sitting candidates.

## 10. Known limits

- **`careerBackground` is two different fields.** A short label in business/engineering ("Academic/Industry"), a paragraph-long bio in advancement/nursing/admin. Substring-matching the prose flagged "corporate and foundation relations" and "board-certified family nurse practitioner" as industry experience — 75 false positives, now guarded by requiring a whole label component to match.
- **Hospitals and health systems are excluded** from the yes bucket. In nursing, medical and pharmacy a health system is where a clinical academic normally works, and counting it would flip large parts of those indices on a contested definition. `makeClassifier(..., { countHealthProviderAsIndustry: true })` flips it.
- **~1,065 org strings still match no rule.** `--dump-unclassified` lists them; each is either a vocabulary addition or a genuine unknown.
- **Recency is thin.** Only 44 ties carry explicit years; the rest use the appointment year as the end-of-tie date, which is a real signal but a coarse one.
- **Two upstream bugs, both fixed here, both worth recognizing elsewhere:**
  1. `career-geo.json` is a general *organization* geocoder, not a school list — it contains "mckinsey & company", "goldman sachs" and "boeing". Seeding an academic gazetteer from all its keys marks those firms academic.
  2. `/\b(universit|pricewaterhouse|technolog)\b/i` never matches "University", "PricewaterhouseCoopers" or "Technology" — the trailing `\b` applies to every branch, so a stem only matches when followed by a non-word character. Every pattern in `org-classify.mjs` now compiles through `stems()`, which anchors only the start.
