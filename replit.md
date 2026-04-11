# Ashika Group — IT Transformation Planning Suite

## Overview
This project is an IT Transformation Planning Suite designed for the CTO of Ashika Group, a prominent Indian financial services conglomerate. It aims to provide comprehensive tools for managing IT operations, strategy, and compliance across various business units including Broking, AIF, Institutional Equities, and NBFC. The suite offers modules for IT master checklist, transformation roadmap, application management (retirement, inventory), AI/software bill of materials, IT asset management, IT service management, and enterprise-wide KPI management. The goal is to streamline IT planning, enhance regulatory compliance (SEBI, RBI, BSE, NSE, CDSL, NSDL), and provide a centralized platform for strategic IT decision-making.

## User Preferences
I prefer the design aesthetic of a Bloomberg Terminal (dark navy, gold primary, teal accents). The currency should be ₹ INR with a toggle for lakhs/millions. I need to manage 9 data modules: Executive Dashboard, IT Master Checklist, Transformation Roadmap, App Retirement Plan, Application Inventory, AI Bill of Materials, Software Bill of Materials, IT Asset Management, and IT Service Management. I need to be able to export reports to Excel and Word documents with specific branding. I expect dynamic dropdowns for various categories and a robust authentication system supporting MFA and Microsoft SSO. I also need an Admin Panel for user and master data management. I prefer a global search functionality and in-app notifications for key events. I want to be able to customize my dashboard widgets.

## System Architecture
The application is a full-stack project utilizing React, Vite, TypeScript, TailwindCSS, and shadcn/ui for the frontend, and Node.js, Express, TypeScript for the backend. Drizzle ORM is used with a PostgreSQL database. Authentication is session-based with `express-session` and `connect-pg-simple`, featuring bcrypt for password hashing, `speakeasy` for TOTP MFA, and Microsoft SSO (Azure AD OAuth2). Data visualization is handled by Recharts, and server-side PPTX generation uses `pptxgenjs`. The API is RESTful, with auto-generated React Query hooks.

The architecture is divided into an Express REST API (`/artifacts/api-server`) and a React frontend (`/artifacts/it-transformation`). Core features include a comprehensive authentication system with admin/user roles and protected routes, an Admin Panel for managing users, master data (20 categories), and business units (6 seeded). A dynamic `MasterSelect` component fetches live data for dropdowns. The application supports a theme system (light/dark with `ThemeProvider`) and a currency toggle (`CurrencyProvider`).

Key features include:
- **9 Data Modules:** Each with specific functionalities and data models.
- **Enterprise KPI Management:** A new module for managing CXO and employee KPIs, including Excel upload, version history, and a status workflow.
- **Global Search:** Cmd+K triggered search across multiple modules with debounced results.
- **BU-wise Completion % Bars:** Live computed completion percentages for the Checklist module.
- **Checklist Item Comments & History:** Discussion threads and audit logs for checklist items.
- **In-app Notifications:** Real-time alerts with unread counts and auto-refresh.
- **PDF Export:** `window.print()` functionality with custom print CSS for the Executive Dashboard.
- **Dashboard Widget Customization:** Toggable widgets with preferences saved in `localStorage`.
- **IT Asset Management (Separate Pages):** 14 DB tables covering asset categories, vendors, licenses, allocations, and transactions. Each sub-entity has its own dedicated page with sidebar navigation: Asset Dashboard (`/assets`), Asset Registry (`/asset-registry`), Vendors (`/asset-vendors`), Licenses (`/asset-licenses`), Allocations (`/asset-allocations`). Each page has StatCard summaries, working filters/search, full CRUD with view/edit/delete modals, and pagination.
- **IT Service Management (ITSM - Separate Pages):** ITIL v4 aligned modules each on dedicated pages: ITSM Dashboard (`/itsm`), Incidents (`/itsm-incidents`), Problems (`/itsm-problems`), Changes (`/itsm-changes`), Knowledge Base (`/itsm-kb`), SLA Policies (`/itsm-sla`), Service Requests (`/itsm-requests`). Each has StatCard summaries, filters, full CRUD, pagination, and admin-only delete.
- **Word Document Export:** NIYTRI-branded DOCX exports for Asset Management and ITSM using the `docx` npm module.
- **Audit Columns:** All data tables include `created_by` and `modified_by` fields, populated with user information.
- **Retirement Plan Enhancements:** Linking retirement plans to application inventory, auto-filling details, and updating application status upon completion.
- **Theme Fix:** Inline script to prevent Flash of Unstyled Content (FOUC) for the dark theme.

Database schema is managed by Drizzle ORM, with seed scripts for initial data population. All tables are designed with specific purposes, including `checklist_items`, `roadmap_items`, `applications`, `retirements`, `aibom_entries`, `sbom_entries`, `masters`, `users`, `settings`, `user_sessions`, `business_units`, `kpi_persons`, `kpi_sets`, `kpi_set_versions`, `kpi_set_items`, `notifications`, and `checklist_comments`.

## External Dependencies
- **Frontend:** React, Vite, TypeScript, TailwindCSS, shadcn/ui
- **Backend:** Node.js, Express, TypeScript
- **ORM:** Drizzle ORM
- **Database:** PostgreSQL (Replit managed)
- **Session Store:** `connect-pg-simple`
- **Authentication:** `bcryptjs` (passwords), `speakeasy` (TOTP MFA), `express-session`, Microsoft Azure AD OAuth2
- **Charts:** Recharts
- **PPT Generation:** `pptxgenjs`
- **Document Export:** `docx` npm module (for Word exports)
- **API Client:** `@workspace/api-client-react` (auto-generated)

## Recent Changes
- **Admin Masters Module-Wise Grouping:** The Masters tab in Admin now organizes 37+ master categories into 6 module groups: General, Applications, Transformation, AI/SBOM, IT Asset Management, IT Service Management. Includes a search filter and breadcrumb path in the table header. The `business` category was removed from masters (managed via dedicated Business Units tab).
- **ITSM Dashboard Improvements:** Custom tooltip components for all charts (CustomTooltip, PieTooltip) with dark popover styling. Resolution rate now uses backend stats total for accuracy. Dot markers added to area chart. All charts use consistent themed tooltips.
- **Master Data Seeded:** 244 master entries across 38 categories, including 18 new Asset/ITSM categories (asset_type, asset_status, asset_license_type, asset_license_status, incident_priority, incident_severity, incident_status, incident_category, problem_status, change_type, change_risk, change_status, change_approval, kb_category, kb_status, sr_category, sr_status, sla_priority).