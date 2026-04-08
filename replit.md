# Ashika Group — IT Transformation Planning Suite

## Project Overview
A full-stack IT Transformation Planning Suite built for the CTO of Ashika Group — a listed Indian financial services conglomerate operating Broking, AIF, Institutional Equities, and NBFC businesses.

**Design aesthetic:** Bloomberg Terminal (dark navy, gold primary, teal accents)  
**Currency:** ₹ INR with lakhs/millions toggle  
**Regulatory context:** SEBI, RBI, BSE, NSE, CDSL, NSDL compliance throughout data

---

## Tech Stack
- **Frontend:** React + Vite + TypeScript + TailwindCSS + shadcn/ui
- **Backend:** Node.js + Express + TypeScript  
- **ORM:** Drizzle ORM
- **Database:** PostgreSQL (Replit managed)
- **Session Store:** connect-pg-simple (user_sessions table in DB)
- **Auth:** bcryptjs (passwords), speakeasy (TOTP MFA), express-session
- **Charts:** Recharts
- **PPT Generation:** pptxgenjs (server-side PPTX generation)
- **API:** REST, auto-generated `@workspace/api-client-react` hooks

---

## Architecture

```
/artifacts/api-server      — Express REST API (port 8080)
/artifacts/it-transformation — React frontend (port 22340, proxied to /)
/lib/db                    — Drizzle schema + seed scripts
/lib/api-client-react      — Auto-generated React Query hooks
```

---

## 7 Data Modules (All Seeded)

| Module | Page | Records |
|--------|------|---------|
| Executive Dashboard | `/` | KPIs + Recharts (pie, bar) |
| IT Master Checklist | `/checklist` | 62 items |
| Transformation Roadmap | `/roadmap` | Custom CSS Gantt chart (with dates + months), hide/show toggle, isActive flag |
| App Retirement Plan | `/retirements` | 15 apps |
| Application Inventory | `/applications` | 20 apps |
| AI Bill of Materials | `/aibom` | 10 AI components |
| Software Bill of Materials | `/sbom` | 15 packages, CVE tracking |

---

## Authentication System

### Credentials
- **Admin:** admin@ashikagroup.com / Ashika@2025
- **Default role:** admin

### Features
- Password login with bcrypt hashing
- TOTP MFA (speakeasy) — users can set up via Profile page
- Microsoft SSO (Azure AD OAuth2 redirect) — configurable via Admin Panel
- Session-based auth (express-session + connect-pg-simple)
- Internal vs External user type classification
- Protected routes redirect to `/login` when unauthenticated
- Admin-only routes for `/admin`

---

## Admin Panel (`/admin`)

### Settings Tab
- Authentication settings (self-registration, MFA requirements)
- Microsoft SSO configuration (clientId, tenantId, clientSecret, redirectUri)
- Branding settings (app name, company name)

### User Management Tab
- CRUD operations for all users
- Role assignment (admin / user)
- User type (internal / external)
- Department assignment
- Active/inactive toggle
- Last login tracking

### Master Data Tab
- 20 categories of dropdown values (vendor, business, app_category, hosting, criticality, license_type, data_classification, priority, etc.)
- 145 seeded records covering Ashika Group context
- Add / Edit / Deactivate any master value
- Color coding for badge rendering

### Business Units Tab
- List all 6 business units (active + inactive)
- Create, edit, activate/deactivate any unit
- Uses `/api/business-units/all` and `/api/admin/business-units` endpoints

---

## Dynamic Dropdowns (MasterSelect)

All module form modals use `<MasterSelect category="..." />` which fetches live from `/api/masters?category=xxx`.  
Categories: vendor, business, app_category, hosting, criticality, support_status, license_type, risk_level, compliance_status, checklist_status, checklist_category, priority, phase, roadmap_status, retirement_reason, retirement_status, migration_effort, ai_type, data_classification, department

---

## Theme System
- `ThemeProvider` context wraps entire app in `App.tsx`
- `useTheme()` → `{ theme, toggleTheme }` — toggles `.light` / `.dark` on `<html>`
- Default: **light** theme
- Persisted in `localStorage` via `theme-preference` key
- Dark theme context file: `src/contexts/theme-context.tsx`
- CSS: `:root` = light, `.dark` = dark; sidebar stays dark navy in both modes

---

## Currency Toggle
- Context: `CurrencyProvider` → `useCurrency()` hook
- 3-way cycle: ₹ Lakhs → ₹ Crores → ₹ Millions (use `cycle()` not `toggle()`)
- Exports: `format(n, decimals)`, `formatShort(n)`, `label`, `unitLabel`, `unit`, `setUnit`
- Toggle button in the layout header, visible on all pages

---

## Business Units
- Separate `business_units` DB table (id, name, code, description, isActive, sortOrder, createdAt)
- Seeded: AIF, IE, Broking (BROKING), MF, IB, NBFC
- Public API: `GET /api/business-units` (active only)
- Admin API: `GET /api/business-units/all`, `POST /admin/business-units`, `PATCH /admin/business-units/:id`
- Admin tab in admin panel: "Business Units" tab for CRUD management
- Route file: `artifacts/api-server/src/routes/business-units.ts`
- Seeded on server startup via `seedBusinessUnits()` (idempotent)

---

## Database Tables

| Table | Purpose |
|-------|---------|
| checklist_items | IT checklist (62 items) |
| roadmap_items | Transformation roadmap |
| applications | Application inventory |
| retirements | App retirement plans |
| aibom_entries | AI components |
| sbom_entries | Software packages + CVEs |
| masters | Dynamic dropdown values (145 records) |
| users | User accounts + MFA secrets |
| settings | Admin configuration (13 keys) |
| user_sessions | Session store (connect-pg-simple) |
| business_units | Business unit structure (6 units) |

---

## Key Files

```
artifacts/it-transformation/src/
  App.tsx                         — Router + ThemeProvider + AuthProvider + CurrencyProvider
  contexts/auth-context.tsx       — Auth state + login/logout/MFA
  contexts/currency-context.tsx   — ₹ Lakhs/Crores/Millions cycle context
  contexts/theme-context.tsx      — Light/dark theme toggle context (default: light)
  hooks/use-masters.ts            — useMasters(category) hook
  components/layout.tsx           — Sidebar + header + theme toggle + currency cycle
  components/master-select.tsx    — Dynamic dropdown component
  lib/api.ts                      — apiFetch helper (credentials: include)
  pages/login.tsx                 — Login page (Internal/External, MFA, SSO)
  pages/admin.tsx                 — Admin panel (settings/users/masters)
  pages/profile.tsx               — Profile + password change + MFA setup

artifacts/api-server/src/routes/
  auth.ts              — Login, logout, MFA setup/enable/disable, SSO, profile
  masters.ts           — CRUD for master data (GET public, write admin-only)
  admin.ts             — Admin settings + user management
  dashboard.ts         — KPI aggregation
  business-units.ts    — Business units CRUD + seed on startup
  [all modules].ts     — CRUD for each data module

lib/db/src/
  schema/index.ts        — All table definitions (Drizzle)
  seed.ts                — Module data seeds
  seed-masters.ts        — 145 master records + admin user + 13 settings
```

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| DATABASE_URL | PostgreSQL connection string |
| SESSION_SECRET | Express session signing secret |
| PORT | App port (set by Replit per artifact) |

---

## Running Seeds

```bash
# Seed module data (checklist, roadmap, applications, retirements, aibom, sbom)
pnpm --filter @workspace/db exec tsx src/seed.ts

# Seed master data + admin user + settings
pnpm --filter @workspace/db exec tsx src/seed-masters.ts
```

---

## Audit Columns (All Data Tables)
All 6 data tables (applications, retirements, roadmap_items, checklist_items, sbom_entries, aibom_entries) now have:
- `created_by TEXT` — populated from session user via `getPerformedBy(userId)` on INSERT
- `modified_by TEXT` — populated from session user via `getPerformedBy(userId)` on UPDATE
- Format: `"Name <email>"` (e.g. `"Sachin B <sachin.b@ashikagroup.com>"`)

CSV import routes (checklist, roadmap) also set `createdBy` to the importing admin.

## Retirement Plan Enhancements
- `application_id INTEGER` column added to `retirements` table to link to Application Inventory
- Form has application dropdown at top — selecting an app auto-fills appName, business (read-only)
- Panel shows vendor, category, hosting, criticality from linked app (read-only metadata)
- When retirement status → "Completed": API auto-updates linked application's `applicationStatus="Retired"` and sets `dateOfRetirement` to the retirement's targetDate (or today)
- Table now shows `created_by` column with user icon

## Theme Fix
- Added inline `<script>` to `artifacts/it-transformation/index.html` that reads `localStorage.getItem("ashika-theme")` and applies `.dark` class to `<html>` BEFORE React loads — prevents flash-of-wrong-theme (FOUC)

## Session Notes
- `user_sessions` table must exist in DB — was manually created (connect-pg-simple does `createTableIfMissing: true` but requires the DB user to have CREATE TABLE rights)
- `session.save()` is explicitly called after login to ensure session is persisted before response
- Zod version is v3 — use `z.string().email()` not `z.email()` (v4 syntax)
- MS SSO is backend-only redirect flow (no MSAL frontend library needed)
- DB schema push uses `echo "No" | pnpm --filter @workspace/db run push` to auto-answer unique constraint prompt (or add columns directly via SQL ALTER TABLE)
