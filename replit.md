# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Preferred Technology Stack

The user's preferred stack for all applications in this project:
- **Cloud**: AWS (EC2, RDS, S3, CloudFront, etc.)
- **Backend**: Node.js + Express
- **Frontend**: React.js + Vite
- **Database**: PostgreSQL (via Drizzle ORM)
- **File Storage**: AWS S3 (for exports, uploads, documents)

Always use this stack when building new applications unless the user explicitly requests otherwise.

## Monorepo Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **File Storage**: AWS S3 (via `@aws-sdk/client-s3`)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Applications Built

### IT Transformation Planning Suite (`artifacts/it-transformation/`)
Full-stack planning tool for the CTO of Ashika Group — a listed Indian financial services conglomerate (Broking, AIF, Institutional Equities, NBFC).

**Theme**: Dark Bloomberg Terminal aesthetic (navy/gold/teal). INR (₹ Lakhs) throughout. SEBI/RBI/NSE/BSE/CDSL/NSDL context.

**7 modules**:
1. **Executive Dashboard** — KPI cards, pie chart (checklist status), bar charts (roadmap budget by phase, checklist by BU), security score
2. **IT Master Checklist** — 62+ items tagged by category/business/status/priority. Search, filter, inline CRUD.
3. **Transformation Roadmap** — 16 initiatives across 3 phases, Gantt-style bar chart, phase tabs, budget tracking (₹1520L total)
4. **App Retirement Plan** — 8 retirements planned (₹373L), successor apps, migration effort tracking
5. **Application Inventory** — 20 applications with vendor, hosting, criticality, license, cost data
6. **AI Bill of Materials (AIBOM)** — 10 AI/ML components with risk & SEBI/RBI compliance governance
7. **Software Bill of Materials (SBOM)** — 15 OSS packages with CVE tracking, 3 critical CVEs flagged

**Architecture**:
- Frontend: React + Vite + Wouter + TanStack Query + Recharts + shadcn/ui
- API: Express 5 + Zod validation from OpenAPI spec (Orval codegen)
- DB: PostgreSQL + Drizzle ORM, 6 tables: checklist_items, roadmap_items, applications, retirements, aibom_entries, sbom_entries
- Seed script: `lib/db/src/seed.ts` (run via `pnpm --filter @workspace/db exec tsx src/seed.ts`)

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
