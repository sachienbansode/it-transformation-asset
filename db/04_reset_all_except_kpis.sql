-- IT Transformation Hub — clear ALL module data except KPIs, to start again from the front end
-- Target DB: it-hub   Run as: root_admin (Query Tool on it-hub)
--
-- KEPT (not touched):
--   KPI module ........ kpis, kpi_actuals, kpi_approvals, kpi_categories, kpi_persons,
--                       kpi_set_items, kpi_set_versions, kpi_sets, kpi_settings, kpi_targets, kpi_years
--   Login & access .... users, roles, user_roles, role_permissions, user_sessions
--   Configuration ..... settings (app name, logo, SSO, ITSM dropdown config), masters, business_units
--
-- CLEARED (TRUNCATE ... RESTART IDENTITY, so IDs start again from 1):
--   IT Drishti ........ checklist, roadmap, retirements, applications, AIBOM, SBOM
--   IT Assets ......... assets, categories, vendors, licenses, allocations, maintenance, history
--   ITSM .............. incidents, problems, changes, service requests, KB, SLA policies,
--                       approval matrix, approvals, attachments, ticket history
--   Other ............. notifications, audit trail
--
-- Deploy the app version with SEED_DEMO_ITSM / SEED_DEMO_ASSETS guards BEFORE running this,
-- otherwise the old server re-inserts demo ITSM/asset data on its next restart.

BEGIN;

TRUNCATE TABLE
  -- IT Drishti
  public.checklist_comments, public.checklist_items,
  public.roadmap_items, public.roadmap_upload_batches,
  public.retirement_documents, public.retirements,
  public.applications, public.aibom_entries, public.sbom_entries,
  -- IT Assets
  public.asset_transactions, public.asset_allocations, public.maintenance_records,
  public.asset_licenses, public.assets, public.asset_vendors, public.asset_categories,
  -- ITSM
  public.itsm_ticket_history, public.itsm_approvals, public.itsm_approval_matrix,
  public.itsm_incidents, public.itsm_problems, public.itsm_changes,
  public.itsm_service_requests, public.itsm_knowledge_base, public.itsm_sla_policies,
  -- Other
  public.notifications, public.audit_logs
RESTART IDENTITY;

-- itsm_attachments is created by the app on first use, so truncate it only if it exists
DO $$ BEGIN
  IF to_regclass('public.itsm_attachments') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE public.itsm_attachments RESTART IDENTITY';
  END IF;
END $$;

COMMIT;

-- Check: every cleared table should show 0; KPI and user counts unchanged
SELECT 'checklist_items' AS tbl, count(*) FROM public.checklist_items
UNION ALL SELECT 'roadmap_items', count(*) FROM public.roadmap_items
UNION ALL SELECT 'applications', count(*) FROM public.applications
UNION ALL SELECT 'assets', count(*) FROM public.assets
UNION ALL SELECT 'itsm_incidents', count(*) FROM public.itsm_incidents
UNION ALL SELECT 'audit_logs', count(*) FROM public.audit_logs
UNION ALL SELECT 'kpis (kept)', count(*) FROM public.kpis
UNION ALL SELECT 'kpi_set_items (kept)', count(*) FROM public.kpi_set_items
UNION ALL SELECT 'users (kept)', count(*) FROM public.users;
