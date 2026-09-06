# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS v4 + shadcn/ui + Recharts

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── dean-dashboard/     # Baton Index dashboard (React + Vite)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts
├── attached_assets/        # User-uploaded data files
│   └── dean_appointments...xlsx  # Source Excel data
├── pnpm-workspace.yaml     # pnpm workspace
├── tsconfig.base.json      # Shared TS options
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## Baton Index dashboard

Interactive data visualization dashboard for studying leadership changes at top business schools.

### Data
Three datasets selectable via top-level switcher pills (DatasetContext):
- **Top-100 B-school** (default): `deans.json` (586 records, 92 schools), `schools-bsq.json` (BSQ research)
- **R1 B-school**: `r1-bschool-deans.json` (826 records, 152 schools), `r1-bschool-bsq.json` (BSQ), `r1-bschool-schools.json` (geo lookup)
- **R1 Engineering**: `r1-eschool-deans.json` (586 records, 131 schools), `r1-eschool-research.json` (HERD/IPEDS engineering R&D), `r1-eschool-schools.json`
- ETL: `scripts/build-r1-data.mjs` from `attached_assets/Dean_Data_Collection_R1_v7_verified.xlsx` (v7 = July 2026 full web-verification sweep of all 826 B-School rows: 351 corrections, 39 added dean/interim spells, 4 duplicate rows flagged via is_duplicate_row and excluded by ETL; audit trail in `attached_assets/Dean_R1_v7_corrections_log.csv` and `Dean_R1_v7_added_rows_log.csv`; per-row status in `verification_sweep_2026` column). Top-100 `deans.json` had the overlapping corrections ported (66 records updated, 13 interim spells added).
- Geo coords: combined from existing schools.ts + R1_GEO lookup table (~150 R1 universities)
- Data is embedded client-side — no API needed for this visualization
- "Operations Management" and "Information Systems" are separate first-class discipline categories throughout the data (Excel + JSONs) — never bundled. `datasets.ts` keeps a `splitOperationsFromIS` guard that re-splits any legacy "Operations & IS"/"Operations" values at load time. Discipline taxonomy (Jul 2026 cleanup): Finance & Accounting, Strategy & Management, Marketing, Operations Management, Information Systems, Economics & Social Science, Industry/Practitioner, Other, Unknown (12 R1 / 8 Top-100 residual).
- All 6 sub-tabs work for each dataset; engineering view substitutes HERD/IPEDS metrics for BSQ
- New fields: appt_origin_4, surprise_departure, from_elite_institution, had_prior_connection, source_url
- Removed fields: avgAnnualGifts, totalGifts, maxAnnualGifts, avgEndowment, fundraisingYears, enrollmentStart, gradEnrollment, estBizEnrollment, businessPctStart

### Features (7 module tabs)
1. **School Explorer** — Unified school exploration view combining dean data with BSQ research
   - List View: dropdown school selector with rank/alpha sort toggle, school info badges
   - Map View: interactive US map with clickable school markers (sized by faculty count) via react-simple-maps
   - Dean tenure timeline (Gantt-style bar chart, color-coded: blue=male, pink=female, gray=interim)
   - Click bars to view detailed dean profiles
   - School-Level Analytics: KPIs (total deans, avg tenure, female %, internal %, interim %), gender/origin/discipline pie charts, tenure bars, post-dean roles
   - AACSB BSQ Profile: embedded infographic with enrollment, admissions, gender, FT/PT, degrees, classroom & faculty metrics
   - Research Map: bubble map of all schools (bubble size = BSQ headcount, linear scale min=3 max=22)
2. **Aggregate Trends** — KPI cards (including interim %), stacked area charts (gender over time), bar charts (tenure by era, female % by decade, internal/external/interim by decade), pie charts (disciplines, origins), post-dean career paths, and an interim-to-permanent conversion section. An **"Interim appointments only"** toggle narrows every chart to interim appointments; conversion lookups read from an unfiltered `convPool` so conversion rates stay correct when the toggle is on. (This replaced the standalone Interim Analysis tab.)
3. **Correlation Analysis** — Scatter plots (pick x/y numeric variables, color by category), cross-tabulation tables, grouped bar charts
4. **Individual Search** — Name-based dean lookup with combo box dropdowns (type-to-filter or browse alphabetically), results list with profile drill-down using shared DeanProfile component
5. **Discipline Search** (tab: "discipline", between Aggregate Trends and Individual Search) — Dynamic US map colored by the academic discipline of the dean serving in the selected year. Year slider (dataset min–2026, default 2026) with Play animation (1 yr / 350 ms), dean last-name labels (toggleable), hover tooltip, click marker → DeanProfile. Legend shows per-year counts by discipline (top-9 by frequency get chart colors; rest fold into "Other"; "Unknown" light gray). Below: stacked-area chart of discipline composition of sitting deans over time with a ReferenceLine tracking the slider year and a Legend. Component: `DisciplineSearch.tsx`. Note: react-simple-maps' Marker `style` prop is ignored — put cursor styles on the `<circle>` itself.
6. **Dean News & Market** (tab: "jobmarket") — Current dean openings from curated spreadsheet data (23 positions). KPI cards (5 columns when news hires present), searchable/filterable list with expand-for-details, status badges (Active Search, Interim in Place, Opening, New Appointment), links to news articles and position descriptions. Data: `artifacts/dean-dashboard/src/data/jobmarket.json`. Layout: KPIs → filters → Map → News feed. **P&Q News Feed**: Auto-scans Poets & Quants RSS feed every 24 hours via `/api/pq-news`.

7. **Non-academic Experience** — **no module card.** The signal belongs in candidate
   research, not a browsing surface of its own, so it reaches users through the
   always-present row on `DeanProfile` (which lists EVERY tie, ranked — organisation,
   role, category, years, and a board/advisory chip) and the "Non-academic tie" filter
   in Slate Builder and Scout Assistant. `NonAcademicExperience.tsx` and its
   `buildTabContent` entry stay in place; restoring the standalone ranked view is a
   one-line uncomment in `DEFAULT_TABS`, the same convention Discipline Search uses.
   What that retired view did, for reference: ranked view of leaders with a
   NAMED-ORGANISATION tie outside the academy, from `nonacademic-experience.json`
   (runtime-loaded, scope-gated like leader-research). "Outside the academy" means
   company, government, nonprofit, foundation OR health system — an earlier cut
   counted companies only and scored a health-system board chair, a state budget
   director and a foundation trustee at zero. Only Academic is the baseline;
   Unclassified stays out because "no rule matched" is an open question, not a
   finding. Rank = tie score (seniority-dominant, recency-decayed, board/advisory
   weighted above past employment; weights ship inside the data file and the in-app
   "How the ranking works" panel reads them from there). **Sector is deliberately not
   a scoring input** — weighting it would re-introduce the hierarchy the widened
   definition removes; the category filter is there for anyone who wants to weigh
   sectors differently. Filters: search, category, seniority chips, sitting-only
   toggle. "Open profile" uses the record's `indices[0]` (sitting-seat index first)
   via App's `openLeaderCrossIndex`. Coverage note is load-bearing: absence from the
   list is never evidence of no non-academic background. Component:
   `NonAcademicExperience.tsx`.
   A **"Non-academic tie" credential checkbox** also filters Slate Builder and Scout
   Assistant to leaders with a named-organisation tie (confidence "high" only — a
   flag-only yes has no employer, so a matching row could not explain itself).

### Key Fields
- Demographics: gender, discipline, career background
- Career: prior dean experience, assoc. dean role, PhD, industry exp — but the legacy
  `hasIndustryExp` boolean is unpopulated in 12 of 21 indices and cannot say "nobody
  looked"; the live signal is `nonacademic-experience.json` (see the non-academic
  experience contract below)
- Appointment: origin (internal/external/interim — interim always a separate category, never merged), era, tenure length
- Post-dean: next role (faculty, another deanship, provost, retirement, etc.)
- School: US News rank, tier, elite institution status
- New: appt_origin_4, surprise_departure, from_elite_institution, had_prior_connection, source_url

### Meet the Dean sidebar (front page)
Portraits come primarily from `src/data/dean-photos.json` (keyed `"<dean lower>|<university lower>"`) — 244 are MIRRORED locally as 320px JPEG thumbnails in `public/deans/<slug>.jpg` (~3 MB total, served by Vercel's CDN; original university URL kept in `source`). Fallback chain: local mirror → original remote URL → Wikipedia → monogram. Re-mirror script: scratchpad verify/mirror_photos.py. Succession drift found during the hunt is queued in scratchpad photo_succession_review.json (16 items, mostly engineering schools).
`MeetTheDean.tsx` renders beside the tab cards (right on lg+, stacked below on mobile): a random currently-serving dean per page load (shuffle button ↻). Portrait via Wikipedia REST summary (direct title, then title-search fallback for disambiguated pages; academic-keyword guard) with a colored monogram fallback. Shows name, school/university, since-year + discipline, "View full profile →" (switches to Individual Search with names prefilled via the `prefill` prop and opens the current spell's DeanProfile), and the dean's sourceUrl as "{school} announcement ↗". DeanProfile now also displays sourceUrl.

### Breaking-news banner + confirmation loop
`BreakingNews.tsx` renders a red "BREAKING" banner under the header from `src/data/breaking-news.json` (items ≤14 days old, one line each, dismissible via localStorage). The scout writes two item types: "applied" (auto-added appointments, links to the story) and "question" (ambiguous events — the scout opens a GitHub issue labeled `news-review` with numbered choices; the banner links to it with "Answer →"). When the repo owner comments on the issue (a name, `1`/`yes`, or `skip`/`no`), workflow `news-confirm.yml` runs `scripts/news-resolve.mjs` to apply the answer via `scripts/news-lib.mjs`, regenerates data, pushes (deploys), replies, and closes the issue.

### Story dedupe (Aug 2026)
One appointment is written up by a dozen outlets and followed up for days, and article-id dedupe (`news_scout_state.json` `seen`) only ever stops the same URL twice — so U-M's Aug 2026 presidential pick alone put ~20 lines on the banner, ~20 rows in the review queue and filled the news feed. `scripts/news-dedupe.mjs` collapses articles to the STORY behind them:
- **Story keys** — `p:<kind>:<surname>-<initial>` (person) and `u:<kind>:<role>:<schoolType>:<university>`, matched within a rolling 21 days. `schoolType` keeps two different deanships at one university apart; `*` (index unresolved) wildcard-matches a resolved one. A headline-similarity bridge (Jaccard, stricter when neither school is recognised) catches the name-less items, and never merges two entries naming different people.
- **Where it applies** — `dedupeEvents()` collapses each run's articles and flags the ones continuing a story an earlier run already surfaced (`state.stories`, so tomorrow's follow-ups fold into today's item); the review queue and banner only ever see fresh stories, while auto-apply still sees repeats (yesterday's vague mention can be today's confirmed appointment; `applyEvent()` has its own record-level duplicate check). `pushBreaking()` is the last write-side guard, and a confirmed appointment replaces the "pending confirmation" line it resolves. `BreakingNews.tsx` also dedupes at render.
- **Role fix** — `appointedRole()` reads the role the appointment points at ("Michigan hires Vanderbilt **provost** … as next **president**" is a president story), so one event no longer splits across two roles and lands in the wrong index. Shared by the scout's `classify()`.
- **Maintenance** — `node scripts/news-dedupe.mjs [--dry-run]` collapses the already-shipped feeds (banner, latest-news, review queue) and corrects legacy roles; safe to re-run. First run: banner 36 → 13, latest-news 40 → 14, review queue 22 → 3. Suppressions are logged to `news_scout_log.csv` as `skip_dup_story` / `skip_story_seen`.

### Dean News & Market integration (Jul 2026)
Scout-applied appointments (breaking-news.json, ≤60 days) appear in the Dean News & Market tab as purple "New Appointment" listings (map + list), coords from SCHOOL_COORDS or r1-bschool-schools.json. The scout also maintains `jobmarket.json` daily: appointment at a listed university → opening removed; dean-search news at a tracked university → opening added/updated with source URL. All openings were URL-verified Jul 2026 (`urlVerified` field); 7 concluded searches removed. A caption under the filters shows the last scan date.

### phdInstitution research contract
No ETL/build script writes `phdInstitution` — it's only ever set by ad-hoc research/enrichment sessions editing the R1 JSONs directly, with no schema guard. That's how the "Field, University" contamination bug happened (306 records / 167 distinct broken values, fixed in commit `8c21cc2`: a field-of-study prefix got concatenated onto the institution name, or the university prefix got dropped leaving a bare city/campus fragment, e.g. "Berkeley" instead of "University of California, Berkeley"). Any future agent researching or filling in `phdInstitution` must follow this output contract:
- Return the **full official institution name only** — no field-of-study prefix or suffix (never "Agricultural Education, Texas A&M University", just "Texas A&M University").
- No truncation and no bare abbreviations — expand "MIT" → "Massachusetts Institute of Technology", "UCLA" → "University of California, Los Angeles".
- For multi-campus systems (UC, SUNY, UT, Nebraska, Penn State, etc.), specify the campus, matching the existing spelling convention in `career-geo.json` (e.g. "University of California, Berkeley", not bare "Berkeley" or bare "University of California").
- **A coordinate is only US-projectable if the COORDINATE says so.** `CareerMap`
  renders with `geoAlbersUsa`, which returns `null` for anything outside the
  contiguous states plus the Alaska/Hawaii insets — and a null coordinate throws
  inside react-simple-maps' `<Marker>`, blanking the entire page. Do not trust a
  `country` field to decide: `career-roots.json` omits `country` on 21,387 of its
  22,961 located roots, so a country-only check read 801 foreign alma maters
  (Toulouse, Mannheim, Rio de Janeiro) as American and took down every profile that
  touched one. `projectableUS` in `CareerMap.tsx` bounds-checks lat/lng against the
  Albers domain; keep any new plotted coordinate behind it.
- Before writing a new value, check `career-geo.json` for an existing entry with the same institution (case-insensitive) and reuse its exact spelling — CareerMap/DeanProfile/DeanTimeline all look up alma maters via `name.toLowerCase().trim()` against that file, so a spelling mismatch silently fails to geocode.
- Run `node scripts/check-phd-institution.mjs` after any research/enrichment pass touching `phdInstitution` — it flags comma-contamination patterns, bare abbreviations/fragments, and anything that fails the same geocode lookup, so a repeat of the bug gets caught before commit instead of sitting undetected for months.

### hasIndustryExp contract (admin-leaders index)
Like `phdInstitution`, this flag has **no schema guard** and no ETL writes it — it shipped `false` on all 4,514 admin-leaders records, which meant an "Industry Experience" filter over that index returned an empty result rather than a thin one. It is now derived by `scripts/backfill-industry-exp.mjs` from the officer's `priorInstitution`, classified by `scripts/employer-sector.mjs`.
- **Only private-sector employers set the flag.** "Not a university" is *not* "industry": this index is full of officers hired out of city government, police departments, the armed forces, hospital systems and foundations. The classifier matches those sectors *before* the corporate patterns for exactly that reason.
- **The classifier is curated, not clever.** Named employers live in an explicit `OVERRIDES` list that beats every heuristic. Add to it rather than widening a pattern — single tempting words cause real damage here: "System" flagged *Nevada System of Higher Education*, "Financial" flagged a *state Department of Administrative and Financial Services*, "Energy" flagged *National Renewable Energy Laboratory*, and "Corporation" flagged two public benefit corporations.
- **Never write `\b` after a truncated stem, and always allow plurals.** `universit\b` cannot match "University" and silently sent every university to `UNKNOWN`; `Health System\b` misses "Health Systems". Run `node scripts/employer-sector.mjs --selftest` (44 cases, singular *and* plural) after touching any pattern.
- **It undercounts by design.** `priorInstitution` records only the *immediately* prior employer, so an officer with fifteen years in industry behind an intervening university role is missed. 3,076 of 4,514 records carry no prior employer at all. Current coverage is 133 officers (2.9%) across 100 institutions — never quote it as a complete census of industry background.
- Run `node scripts/check-industry-exp.mjs` after any wave touching the admin index. It re-derives the flag and reports disagreements; audit trail for the original pass is `attached_assets/industry_exp_backfill_log.csv`.

### Institution-name contract (join key — read before adding an index or wave)
`university` is a **join key**, not a label. Affinity, Scout Assistant, School Explorer, the geo lookups, and `dean-photos.json` (keyed `"<dean lower>|<university lower>"`) all match on the raw string. Two spellings of one school therefore split it into two half-populated entries with no error anywhere — which is exactly what happened: the education / nursing / pharmacy / public-health / ag / creative-arts waves wrote comma style (`"University of California, Berkeley"`) while the admin / arts / business / provost / university / law waves wrote space style (`"University of California Berkeley"`). 45 institutions were split, including Berkeley, Buffalo, Albany, Ohio State, Wisconsin–Madison and West Chester. Affinity is cross-index by construction, so each half only ever saw about half its own bench.

- `scripts/lib/school-canon.mjs` is the single place that decides "these two strings are the same school". `buildCanon(records)` returns `toCanon(freeTextOrg)` plus the canonical display name per institution.
- It folds diacritics (`Mānoa` → `manoa`, `Hawaiʻi` → `hawaii`), the en/em-dash family, a leading "the", comma-vs-space, and the connectives `at`/`in`; resolves sub-units to their parent (`Harvard Law School` → Harvard University) and `"<Unit>, <Parent>"` forms; and applies a curated `MERGE` map for verified same-institution spellings.
- **Campuses and system offices stay distinct** — Rutgers-Camden is not Rutgers, the LSU System is not LSU, Indiana University of Pennsylvania is not Indiana University. Only add to `MERGE` after confirming two names are one institution.
- `gen-affinity.mjs` writes ties under one canonical key per school, then **aliases every observed variant spelling onto the same array**. That alias layer is load-bearing: consumers look up `affinityMap[school]` using the raw `university` string of whichever dataset they are showing, and `api/data.js`'s `filteredAffinity()` calls `.filter` on every value — so aliases must be real arrays, never a reserved key. It costs ~1.1 MB in the generated file.
- Run `node scripts/check-school-names.mjs` after any collection wave. It reports which spellings were auto-folded and lists prefix near-misses to confirm are genuinely different schools. It exits 0 by design (the near-miss list is dominated by real campuses); read it, don't gate on it.

### Shared script libraries (read before adding an index)

Three modules under `artifacts/dean-dashboard/scripts/lib/` are the single source
of truth for anything that spans indices. None of them names an index, so an
index added later inherits all of it.

- **`indices.mjs`** — `FILE_ID`, `INDEX_LABEL`, `deanFiles()`, `assertRegistered()`.
  **Adding an index is one line here**, and that is the only place it belongs.
  This map used to be copy-pasted into `gen-affinity.mjs`,
  `gen-employer-affinity.mjs`, `gen-scout-insights.mjs` and `scout-backtest.mjs`
  with a note in each saying the duplication was deliberate. It drifted:
  `scout-backtest.mjs` never learned about `r1-adminleaders-deans.json`, the
  largest index, so the backtest silently sampled a corpus missing a fifth of
  its people and nothing failed. Every index-wide pass now calls
  `assertRegistered(SRC)`, which warns about any dean file the registry has not
  been told about — a partial rollout is loud instead of silent.
- **`org-classify.mjs`** — the organization taxonomy: org string → sector
  (Academic / Government / Nonprofit / Healthcare Provider / Industry+industry /
  Unclassified), seniority bands, tie kinds, and `affinityCategory()` mapping the
  fine sectors onto the coarse names `employer-affinity.json` publishes.
  **Vocabulary grows here and every consumer picks it up on its next run.**
  Two traps it exists to not repeat:
  - Every pattern compiles through `stems()`, which anchors a word boundary at
    the START of a term only. Written the obvious way — `/\b(universit|technolog)\b/i`
    — the trailing `\b` applies to every branch, so a stem only matches when
    followed by a non-word character: `universit` never matches "University",
    `technolog` never matches "Technology". Terms needing a closing boundary
    (bare abbreviations like `mit`, `ge`, `bcg`) carry their own `\b`.
  - `career-geo.json` is a general **organization** geocoder, not a list of
    schools — it holds "mckinsey & company", "goldman sachs" and "boeing"
    alongside the alma maters. `buildAcademicIndex()` takes only its
    academically-worded entries; seeding from all its keys marks those firms
    academic.
- **`school-canon.mjs`** — institution-name canonicalization (see the
  institution-name contract above).

### Filter controls (Slate Builder + Scout Assistant)

`src/components/FilterControls.tsx` is the shared filter vocabulary for both
screens. Before it, each had grown its own copy of the same block and between
them they used five idioms for one question — pills, segmented bars, checkboxes,
square state chips, dropdowns — with labels sometimes inline and sometimes above,
and hint text in three styles.

**One idiom per behaviour, and no exceptions:**

| behaviour | component |
|---|---|
| pick exactly one of N | `SegGroup` — a segmented bar |
| pick any of N, empty set = "All" | `PillGroup` — pills with an All escape |
| independent yes/no switches | `PillToggles` — pills that latch (`aria-pressed`) |

`FilterRow` gives every control one label column, so rows start at the same x and
a label can no longer be orphaned from its control by wrapping (which is what
happened to "Region", sharing a flex row with Appointment). Hints live under
their own control — never a trailing parenthetical, never floated right.

`FilterGroup` collapses related rows into **Role / Person / Institution /
Location**, each carrying a one-line summary of what it is currently doing, so a
closed group is never a place a filter can hide. Role opens by default; the rest
open when they hold something. `ActiveFilterBar` renders what is narrowing the
list as removable chips plus the result count — the answer to "why am I seeing
this many" without reconstructing it from the controls.

**Accent colours are semantic, not decorative:** navy is an ordinary filter, teal
marks a non-academic tie, maroon marks affinity to the target school. Do not
introduce a fourth for variety.

**No control selects candidates on a protected characteristic.** An
"Include: All / Women / Men" segmented filter used to sit in the Person group of
BOTH Slate Builder and Scout Assistant. Framed as widening the pool, it was still
a selection filter on gender, and screening people in or out that way is the
practice our buyers consult against. It is gone from both.
`PoolComposition.tsx` replaces it with a read-only audit — slate, results and
eligible pool side by side, unrecorded gender counted rather than dropped — so
composition stays visible and unfilterable. Do not reintroduce the control in
another form.

**A filter says what it can see.** Coverage belongs on the control, not in a
support reply: a screen that silently returns nothing because the underlying
field is empty reads as "no such people". The years-in-seat range reports how
much of the current pool has a start date at all (`SeatCoverageNote`), and names
the feeder bench as the gap where it is one — 37 of 11,930 associate/vice-dean
records corpus-wide carry a start date, so any range over that cohort returns
almost nothing however the sliders are set.

**The job-description keyword match re-ranks; it never filters.** At the
strictest Scout tier a zero-keyword candidate used to be excluded outright. No
other tier excludes anyone, so it contradicted the interface's own claim that the
tiers are one ranked list truncated at different depths; it rested on the one
input here that is not validated (a fuzzy text overlap on a flat 0.5 per match,
not the log-lift scale everything else uses); and it dropped people whose brief
is thin, which is a coverage artefact rather than a fact about them. It is a soft
additive score at every tier now, labelled as exploratory where it is offered.

**Every row carries its source.** `SourceLink.tsx` renders the domain behind a
record on the row itself in both result lists — the domain rather than the word
"source", because which domain it is *is* the signal — and says "no source" out
loud for the 2.5% of records that have none rather than rendering nothing.

### The tenure contract (`src/data/tenure.ts` + `scripts/lib/tenure.mjs`)

No screen reads `tenureLength` off a record. It asks `completedTenure()`, which
returns a number only for a spell that actually finished and whose arithmetic can
be true, and null otherwise. Two errors motivated this and both are the same
mistake: treating a stored length as a completed spell. **Right-censoring** — a
sitting leader has no completed tenure, and four indices carried a frozen one on
359 people who never left, so every screen filtering on "has a tenure length"
averaged still-serving snapshots in with finished appointments. **Impossible
arithmetic** — 31 records with negative spans, a start year of zero (one read as a
2,004-year tenure), and 80-to-136-year spells whose end year was a placeholder for
"not documented".

### Feeder-bench start dates (`scripts/bench-start-dates.mjs`)

A resumable pipeline that brackets when an associate/vice dean first appeared on their school's
archived leadership page, because nobody announces those appointments and 37 of 11,930 bench records
carry a start date. ~43h of archive fetching for the full corpus, ordered so the first hours deliver
the most records; `apply-bench-start-dates.mjs` merges only tight brackets, and only with
`startPrecision: "bracketed"` and a label naming the window. Full write-up:
`docs/bench-start-dates.md`.

**Until it lands, the product makes no tenure or movability claim about the bench** — `tenureInfoFor`
returns no reading for a `roleType: "subdean"` row, both because the cohort median is a *dean* norm
and because almost no bench row has a start date to band. Two related facts a future change should
address: bench rows have no usable ids (they are addressed by a natural key, see `lib/bench.mjs`), and
a `startPrecision` marker exists only on rows this pipeline wrote — generalising it is F15.

### Out-of-sample validation (`scripts/scout-holdout.mjs`)

`pnpm scout-holdout` trains the Scout ranking on appointments before a cutoff and tests it on every
appointment since — a split by TIME, not by row, which is the only split that supports a claim about
the future. `scout-backtest.mjs` answers a different question (leave-one-out over a sample from any
year) and both now share one scorer in `scripts/lib/scout-model.mjs`, so they cannot drift into
testing two different models.

Current result, and the way to state it: of the last three years' appointments the model would have
shown the actual hire in its top ten **15.8%** of the time, about twice a shuffled list — with the
ceiling set by coverage, since only **27.5%** of those hires were in the candidate pool at all, and
among those it ranked them top ten **57.5%** of the time. Full report, per-index table and
approximations: `docs/out-of-sample-validation.md`. Two rules when quoting it: the per-index spread is
wide (R1 medical 11.6× chance, community college at chance — check the table before quoting the
corpus figure for one index), and the shipped tie/employer components make the ranking *worse*
out-of-sample, which is a finding to investigate rather than a number to publish.

### Departure outcomes (`src/data/departure.ts` + `scripts/lib/departure.mjs`)

One closed, mutually exclusive set of destinations — promotion, another deanship,
other senior administration, faculty, retirement, external, death, continued,
other, not recorded — derived from `nextRole` rather than collected afresh.
Competing risks needs this: leaving for a provostship, retiring, and being pushed
out are different events with different predictors, and one "departed" outcome
hides that.

**Read the coverage before the distribution.** `nextRole` is populated on 94.5% of
completed spells, but 62.2% of them say "Unknown" or nothing at all — the
destination is genuinely recorded for **37.8%**. Both charts that use these
categories say so on the card. `unknown` means unknown and must never be read as
"voluntary": involuntary exit carries 32 rows in the entire corpus and no re-coding
of what is already written down will recover it.

The category is NOT stored. It is a pure function of `nextRole`, so every consumer
derives it — the frontend through `departure.ts`, scripts through `departure.mjs`,
and the two must stay in step (same categories, same rules, same precedence, and
precedence *is* the logic). Storing it would add a second copy to keep in step for
no reader that could not call the function.

**Conversions are stored**, because a conversion is a property of a *pair* of
spells and a consumer holding one record cannot compute it:
`convertedToPermanent` on the interim spell, `fromInterim` on the permanent one
(present only where true). `scripts/derive-departures.mjs` writes them,
`scripts/validate-departures.mjs` fails CI when they drift. Two rules matter:
the derivation only ever ADDS — a conversion recorded by hand in a spell's notes,
with no second row to rebuild it from, is carried forward, never overwritten —
and it reads `fromInterim` as well as `convertedToPermanent` so it is a fixed
point under its own output rather than a one-way trip.

### The movability definition is versioned (`src/data/movability.ts`)

`MOVABILITY_VERSION` plus `MOVABILITY_CHANGELOG` stamp the definition, and the
stamp renders beside every reading. The definition has already moved twice — D1
recomputed every cohort median on a censoring-aware basis, moving them by one to
three and a half years, and v2.0 collapsed three bands to two — so a reading
quoted last month is not necessarily the reading today, and until the stamp
existed there was nothing in the product to explain the difference. Bump the
version and add an entry for any change to the bands, the boundary, or the cohort
the median is taken from. Changelog dates carry a `dateNote` wherever the date is
not the date of the change itself; do not quietly invent a precise one.

The storage invariant is the same rule at write time: generators call
`normalizeTenureFields()` before writing, `scripts/validate-tenure.mjs` fails CI on
any violation anywhere in the corpus (not diff-based — the corpus is clean, so any
violation is a regression), and `scripts/fix-tenure-invariants.mjs` re-applies the
rule to existing files. An undocumented boundary is `null` plus an `"unknown"`
label; `isSitting()` distinguishes that from a leader still in the seat, so a
19th-century founding dean never counts as sitting.

### Non-academic experience contract (research/enrichment waves)

`nonacademic-experience.json` is generated by `scripts/gen-nonacademic-experience.mjs`
(part of `gen-data`/`predev`/`prebuild`) from `priorInstitution`/`priorTitle`,
`leader-research.json` career steps, `careerBackground` and `hasConsultingBg`.
It is a regenerable sidecar keyed `"<name lower>|<university lower>"` and never
writes into the dean JSONs. It is SERVED: registered in both ENRICHMENT sets
(`lib/dataset-assembly.mjs` for the dev server, `api/data.js` for prod, where
`filteredNonAcademic` scope-gates the `people` map like research — so every
count shown in the UI must be computed from received `people`, never from the
pass-through `counts` block). Consumers: `NonAcademicExperience.tsx` (ranked view),
`DeanProfile.tsx` (named-organisation badge PLUS an always-rendered "Non-academic
Experience" row reporting all four states — named / flagged / none / not researched;
before that row existed 1,199 of 1,267 R1 B-school profiles said nothing at all,
which reads as "no non-academic background" when the truth is usually
"nobody researched it"), `CompareSchools.tsx` ("Non-academic Exp % (of researched)"
over known verdicts, dash when none), `ScoutCandidateList.tsx` (tie chip on
candidate rows), and a "Non-academic tie" filter checkbox in `IndividualSearch.tsx`
(Slate Builder) and `ScoutAssistantPage.tsx`. Full evaluation: `docs/nonacademic-experience.md`;
measured research economics: `docs/nonacademic-experience-pilot.md`.

**The research ledger.** `artifacts/dean-dashboard/research/nonacademic-ties.jsonl` is
an append-only JSONL file (one record per person per wave, last wave wins) that the
generator reads if present and ignores if absent. Researched records **override**
derived ones and carry `evidence: "research"` plus `researchedOn`, so consumers can
tell "someone looked and found nothing" from "the one job we recorded was academic".
Draw a reproducible research sample with
`node scripts/sample-nonacademic-research.mjs --per 30 --seed <n>`, which stratifies the
frame by seat type — administrative / professional / leadership / discipline — because
an unstratified hit rate measures the sampler, not the population.

The purpose is a **connections** signal — which leaders carry a network a school can
tap — so it models **ties**, not a boolean: person → organisation → category →
seniority → recency → kind. Companies, governments, nonprofits, foundations and
health systems all count; only Academic is the baseline. `hasIndustryExp` (the legacy boolean on the `Dean`
interface) is unpopulated in 12 of 21 indices and cannot distinguish "no" from
"nobody looked"; do not build percentages on it.

Any wave collecting non-academic experience must return:

- **Organisation's full name only** — "McKinsey & Company" or "W.K. Kellogg Foundation", never "Senior Partner at McKinsey". Role is its own field.
- **One entry per employer**, not per title. Three promotions at IBM is one tie.
- **The most senior title held** at that employer. This drives the score and is the field most often dropped.
- **Years** as a span. Recency is a scoring axis.
- **Kind**: `employment`, `board`, or `advisory`. **Ask about board seats explicitly, in every query** — the August 2026 pilot turned up 24 of them where the corpus previously held zero, and not one appeared in a bio the person's own institution publishes. They are invisible to a question phrased about employment, and most of them are nonprofit.
- **Seniority** as a field the researcher sets, from `SENIORITY_BANDS`. Do not leave it to be inferred: `seniorityOf` reads "Science Advisory Board member" as executive and "Chair of the Scientific Advisory Board" as unknown, so inference ranks board ties backwards.
- **Category** from `CATEGORY_NAMES` in `org-classify.mjs`, so the taxonomy does not fork. Government, nonprofit, foundation and health-system employers all count — only Academic is the baseline.
- **Employment distinguished from affiliation** — board service, advisory panels, consulting while on faculty and company-funded chairs are separate kinds, not employment.
- **"None found" explicitly** when a career was entirely academic. Without it a "no" only means "the one job we recorded was academic" — which is 85% of today's negatives, and which the pilot showed to be wrong for 9 of the 13 people who turned out to have a nameable firm.
- **`kind: "unresolved"`** when the relationship is reported but unconfirmed. The merge DROPS these rather than downgrading them, keeping the note as a lead for the next wave.

Cost, measured rather than estimated: **≈1,800 tokens per person** for a
name-level verdict, one query each. Hit rate under the non-academic definition is
**53% in administrative seats, 47% in institutional leadership, 20% in discipline
deanships and 13% in professional schools** (pooled 33%, and that is a FLOOR — the
pilot's queries asked about industry and boards, so government and nonprofit
employers only turned up incidentally). Start with administrative + leadership:
2,808 people, ≈5.1M tokens, ~85% of the yield for ~67% of the cost. Dates are the
expensive part — only 17 of 75 pilot ties carried a year — so budget a second pass
for recency and rank rather than paying for completeness up front.

Run `node scripts/gen-nonacademic-experience.mjs --dump-unclassified` after any wave:
every org it lists is either a vocabulary addition for `org-classify.mjs` or a
genuine unknown.

### Daily news scout (automated dataset updates)
GitHub Action `.github/workflows/news-scout.yml` runs daily (13:00 UTC) + manual dispatch: `scripts/news-scout.mjs` scans Google News RSS + Poets&Quants for dean events, matches against tracked universities/unique school names, and AUTO-APPLIES high-confidence appointments (max 5/run, ≤30 days old) to the v7 Excel + deans.json, closes the predecessor's open spell, then regenerates R1 JSONs and pushes (Vercel auto-deploys). Medium-confidence hits go to `attached_assets/news_scout_review.json`; every action logs to `news_scout_log.csv`; article-id + story dedup state in `news_scout_state.json` (see Story dedupe above). New rows carry `verification_sweep_2026 = "news-scout"` and origin/discipline "Unknown" pending review.

### Key Components
- `SchoolExplorer.tsx` — Main school exploration view with list/map toggle
- `USMap.tsx` — Interactive US map component using react-simple-maps
- `SchoolAnalytics.tsx` — Per-school analytics charts and KPIs
- `CrossSchoolAnalysis.tsx` — Multi-variable analysis tools
- `AggregateTrends.tsx` — Dataset-wide trend charts
- `SchoolResearch.tsx` — AACSB BSQ school-level infographics with charts and KPIs

### Data Files
- `schools.ts` — SCHOOL_INFO array (50 schools with lat/lng, faculty, type, departments) + SCHOOL_NAME_MAP for deterministic matching between map markers and dean data school names
- `types.ts` — Dean interface, field types, color constants, label maps
- `useData.ts` — React hooks for dean data access
- `nonacademic-experience.json` — generated NON-ACADEMIC TIES (person → organisation →
  category → seniority → recency → kind) with a transparent score, plus `asOf` and the
  scoring weights. Wrapped as `{asOf, scoring, categories, counts, people}` rather than
  a bare person map, so meta never sits beside person records the way a reserved key
  would. Categories are the industry sub-sectors plus Government & Public Sector,
  Nonprofit & Foundations and Healthcare Providers.
  Regenerate with `node scripts/gen-nonacademic-experience.mjs`.

### Tech
- React + Vite + Tailwind CSS v4 + shadcn/ui
- Recharts for all charts
- react-simple-maps for US map
- Static data (no backend API needed)
- Dark mode toggle

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)
Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence. Key routes:
- `GET /api/healthz` — health check
- `GET /api/pq-news` — P&Q RSS feed scanner (24h cache, dean keyword filtering, `fast-xml-parser`)
- `GET /api/pq-news/refresh` — force refresh (5-min cooldown)

### `artifacts/dean-dashboard` (`@workspace/dean-dashboard`)
Data visualization dashboard. React + Vite frontend with embedded JSON data. Vite proxy routes `/api` to the API server (port 8080) in development.

### `lib/db` (`@workspace/db`)
Database layer using Drizzle ORM with PostgreSQL.

### `lib/api-spec` (`@workspace/api-spec`)
Owns the OpenAPI 3.1 spec and Orval codegen config.

### `lib/api-zod` (`@workspace/api-zod`)
Generated Zod schemas from the OpenAPI spec.

### `lib/api-client-react` (`@workspace/api-client-react`)
Generated React Query hooks and fetch client from the OpenAPI spec.

### `scripts` (`@workspace/scripts`)
Utility scripts package.

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`.
