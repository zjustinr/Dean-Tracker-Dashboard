# Backfilling industry experience — what the corpus can and cannot support

Evaluation of the request: *backfill every candidate's industry experience so we
can build an "Industry Experience" view; binary Yes/No is enough for now, but is
adding **which industry** and/or **which firms** too hard?*

Short answer to the second question first, because it inverts the assumption in
it: **industry and firm are not harder than the binary — they are the same
work.** The only way to know someone has industry experience is to find the
employer, and once you have the employer you have the firm name for free and the
industry from a lookup table. The pass built for this evaluation
(`scripts/gen-industry-experience.mjs`) emits all three from one derivation, and
the industry/firm half cost nothing extra.

The expensive part is the half that looked cheap: getting to *every* candidate.

## 1. The field already exists, and it is mostly an empty cell

`hasIndustryExp` is on the `Dean` interface today. It drives a badge in
`DeanProfile.tsx` and `DeanTimeline.tsx`, `industryExpPct` in
`CompareSchools.tsx`, a `BooleanField` filter in Correlation Analysis, and a
feature in `gen-scout-insights.mjs`. So the surface is built.

It is also, across most of the corpus, never populated:

| | indices | rows | `hasIndustryExp: true` |
|---|---|---|---|
| whole corpus | 21 | 29,638 | **341** |
| indices where the field is never once `true` | **12** | 17,013 | **0** |

The twelve with nothing at all: admin leaders, advancement, ag, creative arts,
education, graduate college, medical, nursing, pharmacy, provost, public health,
university presidents.

`build-publichealth.mjs` and `news-lib.mjs` write `hasIndustryExp: false`
literally. The committed admin, nursing, medical, university and provost JSONs
carry zero `true` values — including on rows whose `priorInstitution` plainly
names a company. (`research/etl_leaders.mjs` does contain a derivation regex, but
it was not the producer for those committed files: its pattern would fire on
22 admin rows and 49 university rows that are all `false` on disk.)

**This is the finding that matters most, and it is not a data-volume problem —
it is a schema problem.** A boolean has no way to say "nobody looked". Today's
`false` reads as a researched No when it is really a blank, so every percentage
built on the field silently understates. `CompareSchools`' industry-experience
KPI is currently comparing schools on a field that is empty for most of them.

## 2. What the existing data can actually yield

`scripts/gen-industry-experience.mjs` derives the field from everything the repo
already holds — `priorInstitution` + `priorTitle` on every row across all 21
indices, the ~8.2k dated career stops in `leader-research.json`, the
`careerBackground` label, and the existing `hasConsultingBg` flag — and writes
`src/data/industry-experience.json`, a sidecar keyed
`"<name lower>|<university lower>"` like `leader-research.json` and
`dean-photos.json`. It does not touch the dean JSONs. It runs in about a second.

Result over 26,740 unique people:

| verdict | people | share |
|---|---|---|
| **yes**, with a named firm and industry | 474 | 1.8% |
| **yes**, on a corroborating flag only (no employer to point at) | 398 | 1.5% |
| **no** — evidence exists, all of it academic / government / nonprofit | 12,240 | 45.8% |
| **unknown** — nothing to classify at all | 13,628 | **51.0%** |

442 distinct firms, spread across nine industries: Other industry 178, Law
(private practice) 91, Technology 50, Consulting 47, Financial Services 41,
Consumer & Retail 36, Energy & Industrials 21, Healthcare & Pharma 21, Media &
Entertainment 13.

Of those 474 firm-backed cases, **395 are people not currently flagged at all** —
against 293 people carrying a hand-set `true` today. So the derivation more than
doubles the confirmed population, and every new case arrives with the firm and the
industry attached rather than a bare boolean. It is still a long way from "every
candidate".

## 3. Two numbers that bound how far this can go

**Recall against human ground truth is 27%.** The 293 people a researcher hand-
labelled `hasIndustryExp: true` in the business and engineering indices are the
only ground truth available. Ignoring that label, the derivation independently
reproduces just 79 of them from a named employer. The other 214 are invisible in
the structured data.

The mechanism is straightforward once you see it. `priorInstitution` records the
job *immediately before* the deanship. Someone who spent six years at a firm and
then twenty on a faculty shows a university there, identical to a lifelong
academic:

| dean | `priorInstitution` | hand-labelled |
|---|---|---|
| Scott J. Grawe | Iowa State University Ivy College of Business | Academic/Industry |
| Ed Grier | Virginia Commonwealth University School of Business | Academic/Industry |
| James G. Ellis | University of Southern California | Academic and Industry |
| David Spalding | Dartmouth College | Industry (finance), Academic |

**84% of the "no" verdicts rest on a single career stop.** Of 12,240 people
classified "no", 10,274 have exactly one piece of evidence. That verdict is not
"never worked in industry" — it is "the one job we recorded before this one was
academic". Only 16% have the multi-stop history that would make a No meaningful.

So the honest reading of the derivation output is: the 474 firm-backed yeses are
solid, the "no" bucket is a weak no, and half the corpus is genuinely unknown.

## 4. What would close the gap, and what it costs

The bottleneck is evidence acquisition, not classification. Three tiers:

**Tier 0 — derivation (done).** `gen-industry-experience.mjs`, regenerable in a
second, 474 firm-backed cases. Already committed. Zero ongoing cost.

**Tier 1 — make the field three-state (small, high value).** Replace the boolean
read with `"yes" | "no" | "unknown"` at the consumer sites. This is a few hours
of work and it fixes the misleading-percentage problem immediately, independent
of any research: `CompareSchools` can compute over the denominator that actually
has data, and the profile badge can distinguish "no industry background" from
"not researched". **Recommend doing this first regardless of what follows** — it
is the change that makes every later increment measurable.

**Tier 2 — research the sitting bench (the recommended investment).** Full
coverage of 26,740 people is not a sensible target: most are historical records
whose industry background nobody will filter on. The people who matter for a
scouting product are the 5,223 currently sitting leaders. Of those, 2,238
already have a researched multi-stop career in `leader-research.json` — that pass
has partly happened. **2,985 sitting leaders need a fresh career-research pass**,
and that is the whole ask for a credible "Industry Experience" view of the live
bench. The rest of the corpus stays "unknown", correctly labelled.

For scale, `research/README.md` records that the R2 discovery wave cost roughly
460k subagent tokens for 139 institutions. Per-person career research is deeper
than per-institution discovery, so budget accordingly and run it in waves, with
`--dump-unclassified` as the tuning loop between them.

**Tier 3 — the rest of the corpus.** Not recommended. ~21,000 historical people
at the same per-person cost, to populate a field that is mostly consulted for
sitting candidates.

## 5. If the research pass runs, what it should return

The `phdInstitution` contamination bug documented in `PROJECT.md` came from an
enrichment pass with no output contract. This field has the same exposure — the
firm name is a display string and would become a de-facto grouping key the moment
anyone builds a "deans who worked at McKinsey" view. So:

- Return the **employer's full name only** — "McKinsey & Company", not "Senior
  Partner at McKinsey". Role goes in its own field.
- One entry per **employer**, not per title. Three promotions at IBM is one stop.
- Include **years** where known. Industry experience twenty-five years ago and
  industry experience last year are different signals and users will want to
  separate them.
- Say **which sector**, using the nine categories the pass already emits, so the
  taxonomy does not fork.
- Distinguish **employment from affiliation**. Board service, an advisory panel,
  a consulting engagement while on faculty, and a named professorship funded by a
  company are all not industry employment. The free-text mining experiment for
  this evaluation returned "the KPMG Academic Research Panel" and "Walton's
  Walmart-anchored strength in retail" as industry hits — a researcher working
  from a bio will make the same mistake unless told not to.
- Return **"none found" explicitly** when a career was entirely academic. That is
  the only way the corpus ever gets a real No instead of a weak one, and it is
  the difference between 16% and 100% meaningful negatives.

## 6. Known limits of the current pass

- **`careerBackground` is two different fields.** In business/engineering it is a
  short label ("Academic/Industry"); in advancement/nursing/admin it is a
  paragraph-long bio. Substring-matching the prose flagged "corporate and
  foundation relations" and "board-certified family nurse practitioner" as
  industry experience — 75 false positives. The pass now requires a whole label
  component to match, which fixes it, but the underlying field is overloaded.
- **Hospitals and health systems are deliberately excluded** from the yes bucket
  (`COUNT_HEALTH_PROVIDER_AS_INDUSTRY = false`). In the nursing, medical and
  pharmacy indices a health system is where a clinical academic normally works,
  and counting it would flip large parts of those indices on a definition their
  own users would dispute. Flip the constant if the intended reading is "worked
  outside the university" rather than "worked in a company".
- **1,035 org strings still match no rule** — mostly courts, medical centres and
  informally-named schools. `--dump-unclassified` lists them; each one is either
  a gazetteer addition or a genuine unknown.
- **Two upstream bugs surfaced while building this**, both worth knowing about
  because the same pattern appears elsewhere in the codebase:
  1. `career-geo.json` is a general *organization* geocoder, not a list of
     schools — it contains "mckinsey & company", "goldman sachs" and "boeing"
     alongside the alma maters. Seeding an academic gazetteer from all its keys
     marks those firms academic.
  2. A regex of the form `/\b(universit|pricewaterhouse)\b/i` never matches
     "University" or "PricewaterhouseCoopers": the trailing `\b` applies to every
     branch, so a stem only matches when followed by a non-word character.
     `gen-employer-affinity.mjs`'s categorizer is written this way. Most of its
     terms are complete words and so are unaffected, but two are stems and do
     misfire today — `technolog` never matches "Technology" or "Technologies"
     (so its `Technology` bucket only fires on the named-company list), and
     `philanthrop` never matches "Philanthropy". Worth a one-line fix there;
     this pass compiles every pattern through a `stems()` helper that anchors
     only the start.
