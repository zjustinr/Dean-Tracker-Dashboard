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
- Source: `attached_assets/dean_appointments_FACTCHECKED_with_departures_multicoded_by_C_1774527122601.xlsx`
- Processed JSON: `artifacts/dean-dashboard/src/data/deans.json` (617 records, 87 schools, 1967–2026)
- Data is embedded client-side — no API needed for this visualization

### Features
1. **School Explorer** — Select a school, see dean tenure timeline (Gantt-style bar chart), click bars to view dean profiles
2. **Cross-School Analysis** — Scatter plots (pick x/y numeric variables, color by category), cross-tabulation tables, grouped bar charts
3. **Aggregate Trends** — KPI cards, stacked area charts (gender over time), bar charts (tenure by era, female % by decade, internal vs external), pie charts (disciplines, origins), post-dean career paths

### Key Fields
- Demographics: gender, discipline, career background
- Career: prior dean experience, assoc. dean role, PhD, industry exp
- Appointment: origin (internal/external/interim), era, tenure length
- Post-dean: next role (faculty, another deanship, provost, retirement, etc.)
- School: US News rank, tier, elite institution status

### Tech
- React + Vite + Tailwind CSS v4 + shadcn/ui
- Recharts for all charts
- Static data (no backend API needed)
- Dark mode toggle

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)
Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

### `artifacts/dean-dashboard` (`@workspace/dean-dashboard`)
Data visualization dashboard. React + Vite frontend with embedded JSON data. No backend dependencies.

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
