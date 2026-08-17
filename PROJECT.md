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

### Features (8 tabs)
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

### Key Fields
- Demographics: gender, discipline, career background
- Career: prior dean experience, assoc. dean role, PhD, industry exp
- Appointment: origin (internal/external/interim — interim always a separate category, never merged), era, tenure length
- Post-dean: next role (faculty, another deanship, provost, retirement, etc.)
- School: US News rank, tier, elite institution status
- New: appt_origin_4, surprise_departure, from_elite_institution, had_prior_connection, source_url

### Meet the Dean sidebar (front page)
Portraits come primarily from `src/data/dean-photos.json` (keyed `"<dean lower>|<university lower>"`) — 244 are MIRRORED locally as 320px JPEG thumbnails in `public/deans/<slug>.jpg` (~3 MB total, served by Vercel's CDN; original university URL kept in `source`). Fallback chain: local mirror → original remote URL → Wikipedia → monogram. Re-mirror script: scratchpad verify/mirror_photos.py. Succession drift found during the hunt is queued in scratchpad photo_succession_review.json (16 items, mostly engineering schools).
`MeetTheDean.tsx` renders beside the tab cards (right on lg+, stacked below on mobile): a random currently-serving dean per page load (shuffle button ↻). Portrait via Wikipedia REST summary (direct title, then title-search fallback for disambiguated pages; academic-keyword guard) with a colored monogram fallback. Shows name, school/university, since-year + discipline, "View full profile →" (switches to Individual Search with names prefilled via the `prefill` prop and opens the current spell's DeanProfile), and the dean's sourceUrl as "{school} announcement ↗". DeanProfile now also displays sourceUrl.

### Breaking-news banner + confirmation loop
`BreakingNews.tsx` renders a red "BREAKING" banner under the header from `src/data/breaking-news.json` (items ≤14 days old, one line each, dismissible via localStorage). The scout writes two item types: "applied" (auto-added appointments, links to the story) and "question" (ambiguous events — the scout opens a GitHub issue labeled `news-review` with numbered choices; the banner links to it with "Answer →"). When the repo owner comments on the issue (a name, `1`/`yes`, or `skip`/`no`), workflow `news-confirm.yml` runs `scripts/news-resolve.mjs` to apply the answer via `scripts/news-lib.mjs`, regenerates data, pushes (deploys), replies, and closes the issue.

### Dean News & Market integration (Jul 2026)
Scout-applied appointments (breaking-news.json, ≤60 days) appear in the Dean News & Market tab as purple "New Appointment" listings (map + list), coords from SCHOOL_COORDS or r1-bschool-schools.json. The scout also maintains `jobmarket.json` daily: appointment at a listed university → opening removed; dean-search news at a tracked university → opening added/updated with source URL. All openings were URL-verified Jul 2026 (`urlVerified` field); 7 concluded searches removed. A caption under the filters shows the last scan date.

### phdInstitution research contract
No ETL/build script writes `phdInstitution` — it's only ever set by ad-hoc research/enrichment sessions editing the R1 JSONs directly, with no schema guard. That's how the "Field, University" contamination bug happened (306 records / 167 distinct broken values, fixed in commit `8c21cc2`: a field-of-study prefix got concatenated onto the institution name, or the university prefix got dropped leaving a bare city/campus fragment, e.g. "Berkeley" instead of "University of California, Berkeley"). Any future agent researching or filling in `phdInstitution` must follow this output contract:
- Return the **full official institution name only** — no field-of-study prefix or suffix (never "Agricultural Education, Texas A&M University", just "Texas A&M University").
- No truncation and no bare abbreviations — expand "MIT" → "Massachusetts Institute of Technology", "UCLA" → "University of California, Los Angeles".
- For multi-campus systems (UC, SUNY, UT, Nebraska, Penn State, etc.), specify the campus, matching the existing spelling convention in `career-geo.json` (e.g. "University of California, Berkeley", not bare "Berkeley" or bare "University of California").
- Before writing a new value, check `career-geo.json` for an existing entry with the same institution (case-insensitive) and reuse its exact spelling — CareerMap/DeanProfile/DeanTimeline all look up alma maters via `name.toLowerCase().trim()` against that file, so a spelling mismatch silently fails to geocode.
- Run `node scripts/check-phd-institution.mjs` after any research/enrichment pass touching `phdInstitution` — it flags comma-contamination patterns, bare abbreviations/fragments, and anything that fails the same geocode lookup, so a repeat of the bug gets caught before commit instead of sitting undetected for months.

### Institution-name contract (join key — read before adding an index or wave)
`university` is a **join key**, not a label. Affinity, Scout Assistant, School Explorer, the geo lookups, and `dean-photos.json` (keyed `"<dean lower>|<university lower>"`) all match on the raw string. Two spellings of one school therefore split it into two half-populated entries with no error anywhere — which is exactly what happened: the education / nursing / pharmacy / public-health / ag / creative-arts waves wrote comma style (`"University of California, Berkeley"`) while the admin / arts / business / provost / university / law waves wrote space style (`"University of California Berkeley"`). 45 institutions were split, including Berkeley, Buffalo, Albany, Ohio State, Wisconsin–Madison and West Chester. Affinity is cross-index by construction, so each half only ever saw about half its own bench.

- `scripts/lib/school-canon.mjs` is the single place that decides "these two strings are the same school". `buildCanon(records)` returns `toCanon(freeTextOrg)` plus the canonical display name per institution.
- It folds diacritics (`Mānoa` → `manoa`, `Hawaiʻi` → `hawaii`), the en/em-dash family, a leading "the", comma-vs-space, and the connectives `at`/`in`; resolves sub-units to their parent (`Harvard Law School` → Harvard University) and `"<Unit>, <Parent>"` forms; and applies a curated `MERGE` map for verified same-institution spellings.
- **Campuses and system offices stay distinct** — Rutgers-Camden is not Rutgers, the LSU System is not LSU, Indiana University of Pennsylvania is not Indiana University. Only add to `MERGE` after confirming two names are one institution.
- `gen-affinity.mjs` writes ties under one canonical key per school, then **aliases every observed variant spelling onto the same array**. That alias layer is load-bearing: consumers look up `affinityMap[school]` using the raw `university` string of whichever dataset they are showing, and `api/data.js`'s `filteredAffinity()` calls `.filter` on every value — so aliases must be real arrays, never a reserved key. It costs ~1.1 MB in the generated file.
- Run `node scripts/check-school-names.mjs` after any collection wave. It reports which spellings were auto-folded and lists prefix near-misses to confirm are genuinely different schools. It exits 0 by design (the near-miss list is dominated by real campuses); read it, don't gate on it.

### Daily news scout (automated dataset updates)
GitHub Action `.github/workflows/news-scout.yml` runs daily (13:00 UTC) + manual dispatch: `scripts/news-scout.mjs` scans Google News RSS + Poets&Quants for dean events, matches against tracked universities/unique school names, and AUTO-APPLIES high-confidence appointments (max 5/run, ≤30 days old) to the v7 Excel + deans.json, closes the predecessor's open spell, then regenerates R1 JSONs and pushes (Vercel auto-deploys). Medium-confidence hits go to `attached_assets/news_scout_review.json`; every action logs to `news_scout_log.csv`; dedup state in `news_scout_state.json`. New rows carry `verification_sweep_2026 = "news-scout"` and origin/discipline "Unknown" pending review.

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
