# Interim rate in the president's chair, by Carnegie tier

Reproduce with `node scripts/analyze-interim-rates.mjs` from `artifacts/dean-dashboard`
(`--swap-vintage` for the tier-assignment sensitivity, `--derived` for the interim-flag
sensitivity, `--json` to dump the numbers).

## Headline

Interim share of chief-executive appointments starting 1996 or later:

| Tier | Institutions | Appointments | Interim | Rate | 95% CI | Sector-standardised |
|---|---|---|---|---|---|---|
| R1 | 160 | 741 | 206 | **27.8%** | 24.7–31.1% | 27.2% |
| R2 | 120 | 556 | 155 | **27.9%** | 24.3–31.7% | 26.1% |
| R3 | 179 | 632 | 126 | **19.9%** | 17.0–23.2% | 22.7% |

R1 and R2 are indistinguishable (0.1pp apart, p = 0.98). R3 sits about 8pp below
both (p = 0.0007 vs R1, p = 0.0013 vs R2). There is no monotonic prestige gradient
here — the break is R1/R2 on one side and R3 on the other.

**Half of the R3 gap is sector, not tier.** R3 is 80% private in this corpus while
R1 and R2 are majority public, and private institutions run lower everywhere
(R1 25.3% private vs 28.5% public; R2 20.5% vs 30.0%; R3 18.5% vs 25.6%).
Standardising all three tiers to the pooled public/private mix lifts R3 to 22.7%
and pulls the gap from 7.9pp down to ~4pp. What is left is a real but modest tier
effect on top of a larger sector effect.

Interim appointments have become more common in every tier:

| Tier | 1996–2005 | 2006–2015 | 2016–2026 |
|---|---|---|---|
| R1 | 23.7% | 27.4% | 31.2% |
| R2 | 22.7% | 30.3% | 29.2% |
| R3 | 15.9% | 18.5% | 23.4% |

## Does it track the B-school dean rate in the same university?

150 of the 151 B-school universities join to a president index (Babson College has
no president row in either). Within those universities, deans go interim **more**
often than presidents: 32.4% of dean appointments since 1996 versus 27.8% of
president appointments.

**As an institutional trait, no.** Interim-proneness does not travel with the
university. Correlating each university's president interim share against its dean
interim share gives r = 0.12 (Spearman 0.15, permutation p = 0.14) across 149
universities, and the correlation goes to zero or below as the minimum appointment
count rises (r = 0.07 at ≥3 each side, r = −0.13 at ≥5). Splitting universities on
whether they had *any* interim president since 1996 moves the dean rate by 1.6pp
(32.9% vs 31.4%, p = 0.67) — essentially nothing.

**As a moment in time, yes.** Labelling each dean appointment by what the
president's chair was doing that year:

| President's chair | Dean appointments | Interim deans | Rate |
|---|---|---|---|
| Interim (sitting that year) | 72 | 33 | **45.8%** |
| Permanent | 659 | 204 | 31.0% |

A 14.9pp gap, p = 0.010. Widening to "an interim president spell overlapping a
±2-year window" keeps it: 40.7% vs 29.9%, a 10.7pp gap at p = 0.008.

The gap survives period stratification, so it is not two independent upward trends
sharing a calendar — though it is concentrated in the middle period:

| Period | Under interim chair | Under permanent chair | Diff |
|---|---|---|---|
| 1996–2005 | 31.0% (9/29) | 25.6% (42/164) | +5.4pp |
| 2006–2015 | 42.9% (24/56) | 26.3% (47/179) | +16.6pp |
| 2016–2026 | 42.4% (39/92) | 36.2% (79/218) | +6.2pp |

The reading: interim leadership is a **synchronised event, not an institutional
disposition**. Universities that churn their president are not, over 30 years,
the universities that churn their dean. But a business school hiring while the
president's chair is empty is about 50% more likely to appoint an interim — which
is what you would expect if the deanship is being held open until whoever runs the
university next can choose the dean.

## Method and caveats

**Which rows are appointments.** Each `*-deans.json` file mixes appointment spells
with the current administrative roster — the sitting VPs, chiefs of staff and
associate deans. Roster rows carry no `startYear` (1378 of 2699 rows in
`r1-university-deans.json`), so `startYear != null` separates them. For presidents
the seat title is checked too, because a few cabinet rows do carry a start year;
`isChiefExecutiveSeat` in `scripts/lib/interim-panel.mjs` does that, and consults
the schools file's `leaderTitle` so the three institutions led by a Dean or a Senior
Vice President and Provost (Albert Einstein, Icahn, OU Health Sciences Center) are
not silently dropped.

**Why 1996.** R2/R3 research was capped at appointments from about 1996 onward
(`research/README.md`); R1 runs to the 1950s. Comparing uncapped would make R1 look
calmer than it is. Every cross-tier number here uses the 1996+ window.

**Interim-to-permanent is two appointments.** 38 presidents in the panel were
appointed interim and then confirmed (Jahanian at Carnegie Mellon 2017→2018,
Harroz at Oklahoma 2019→2020). Deduplication that folds those into one spell
deletes a permanent appointment from the denominator while keeping the interim
one in the numerator; `dedupeSpells` requires interim status to match before it
merges rows.

**Which interim flag these numbers use.** The corpus's own `isInterim`, set by the
original ETL. The succession-panel export re-derives interim status from source
evidence without ever consulting that flag (`scripts/lib/seat-identity.mjs`), and the
two do not agree everywhere: 61 of 11,775 appointments differ, **20 of them R1–R3
president spells inside this window**. They do not miss this analysis, so the script
prints both columns rather than publishing one number while the panel asserts another:

| Tier | Legacy ETL flag (published) | Re-derived from evidence | Gap |
|---|---|---|---|
| R1 | 27.8% (206/741) | 27.9% (207/741) | +0.1pp |
| R2 | 27.9% (155/556) | 27.5% (153/556) | −0.4pp |
| R3 | 19.9% (126/632) | 17.5% (111/633) | **−2.4pp** |

(Each panel is deduplicated on its own flag, because interim status is part of the
dedupe key — an interim-to-permanent conversion is two appointments and must not
collapse into one. The R3 appointment count therefore differs by one between columns.)

The legacy flag stays the published headline, for a stated reason: the divergences are
disagreements awaiting adjudication, not proven ETL errors. Sixteen of the twenty are a
bare "President" or "Chancellor" title with silent notes against an ETL interim flag,
and the ETL's origin coding may well have known something the title does not say.
Publishing the derived column would assert a re-derivation the corpus cannot yet settle.
`--derived` swaps which flag drives the entire analysis, so either reading is one flag
away.

**What moves, and what does not.** R1 and R2 move by a tenth of a point either way. R3
moves 2.4 points — and in the direction the coverage check below already warns about.
The R1-to-R3 gap is the finding here, and it survives the swap (7.9pp legacy, 10.4pp
derived, both far outside their confidence intervals). The **R3 level** does not survive
it, and should be read as the floor the next caveat calls it.

**The R3 rate is a floor.** R3 records 3.53 appointments per institution over the
window against 4.63 for R1 and R2. That is either longer R3 tenures or thinner
research, and single-year interim spells are the first thing thin research misses.

**"Sitting interim now" is the weakest number in the table** (R1 8.1%, R2 7.5%,
R3 5.0%) and is reported only as a truncation-free cross-check. Against
`university-presidents.json` — a curated snapshot of the sitting R1 president at
170 institutions — it disagrees on 9, nearly all of them interim spells the index
never closed out after a permanent successor arrived. That inflates it in every
tier, so the ordering survives but the levels read high.

**Tier vintage.** Eleven institutions sit in both the R1 index and the R2/R3 index,
because the R1 index follows the 2025 Carnegie vintage (which promoted Boise State,
Chapman, TCU, Wake Forest, Stevens, UAH and NC A&T) while the R2/R3 universe is the
2021 vintage. They are counted as R1 here. `--swap-vintage` counts them as R2/R3
instead and moves nothing material: R1 28.2%, R2 27.4%, R3 19.8%.
