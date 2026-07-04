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
│   └── dean-dashboard/     # Business School Dean Leadership Dashboard (React + Vite)
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

## Dean Leadership Dashboard

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
2. **Aggregate Trends** — KPI cards (including interim %), stacked area charts (gender over time), bar charts (tenure by era, female % by decade, internal/external/interim by decade), pie charts (disciplines, origins), post-dean career paths
3. **Correlation Analysis** — Scatter plots (pick x/y numeric variables, color by category), cross-tabulation tables, grouped bar charts
4. **Interim Analysis** — "Try Before You Buy" infographic: hero KPIs (2020s interim %, conversion rate, surprise departure rate), interim trend by era, conversion by discipline, surprise departure comparison, gender breakdown, tenure comparison, success stories cards
5. **Individual Search** — Name-based dean lookup with combo box dropdowns (type-to-filter or browse alphabetically), results list with profile drill-down using shared DeanProfile component
6. **Discipline Search** (tab: "discipline", between Interim Analysis and Individual Search) — Dynamic US map colored by the academic discipline of the dean serving in the selected year. Year slider (dataset min–2026, default 2026) with Play animation (1 yr / 350 ms), dean last-name labels (toggleable), hover tooltip, click marker → DeanProfile. Legend shows per-year counts by discipline (top-9 by frequency get chart colors; rest fold into "Other"; "Unknown" light gray). Below: stacked-area chart of discipline composition of sitting deans over time with a ReferenceLine tracking the slider year, a Legend, and a "Download CSV" button exporting the chart data (year, total sitting deans, per-discipline % and counts; UTF-8 BOM for Excel). Component: `DisciplineSearch.tsx`. Note: react-simple-maps' Marker `style` prop is ignored — put cursor styles on the `<circle>` itself.
7. **Compare Datasets** (tab: "compare") — Cross-dataset comparison of all three datasets side by side (independent of the dataset switcher): head-to-head metrics table (appointments, schools, tenure, female/internal/external/interim/first-time/PhD/industry/prior-dean %, interim conversion rate), metric-selectable trend-by-decade line chart (1970+), appointment shares grouped bars, post-dean career path comparison. Component: `CompareDatasets.tsx`.
8. **Dean News & Market** (tab: "jobmarket") — Current dean openings from curated spreadsheet data (23 positions). KPI cards (5 columns when news hires present), searchable/filterable list with expand-for-details, status badges (Active Search, Interim in Place, Opening, New Appointment), links to news articles and position descriptions. Data: `artifacts/dean-dashboard/src/data/jobmarket.json`. Layout: KPIs → filters → Map → News feed. **P&Q News Feed**: Auto-scans Poets & Quants RSS feed every 24 hours via `/api/pq-news`.

### Key Fields
- Demographics: gender, discipline, career background
- Career: prior dean experience, assoc. dean role, PhD, industry exp
- Appointment: origin (internal/external/interim — interim always a separate category, never merged), era, tenure length
- Post-dean: next role (faculty, another deanship, provost, retirement, etc.)
- School: US News rank, tier, elite institution status
- New: appt_origin_4, surprise_departure, from_elite_institution, had_prior_connection, source_url

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
