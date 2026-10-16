-- IT Transformation Hub — clear ALL IT asset module data (start fresh, then re-upload the register)
-- Target DB: it-hub   Run as: root_admin (Query Tool on it-hub)
-- Removes: assets, vendors, categories, licenses, handovers/allocations, maintenance,
--          asset history & comments, physical audits, contracts/AMC, license assignments.
--          Depreciation rules are kept. IDs restart from 1 (tags restart at LAP-0001).
BEGIN;
TRUNCATE TABLE
  public.asset_transactions,
  public.asset_allocations,
  public.maintenance_records,
  public.asset_licenses,
  public.assets,
  public.asset_vendors,
  public.asset_categories
RESTART IDENTITY;

DO $$ BEGIN
  IF to_regclass('public.asset_audit_items') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE public.asset_audit_items, public.asset_audits RESTART IDENTITY';
  END IF;
  IF to_regclass('public.asset_contracts') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE public.asset_contract_assets, public.asset_contracts, public.asset_license_assignments RESTART IDENTITY';
  END IF;
END $$;
COMMIT;

SELECT (SELECT count(*) FROM public.assets)            AS assets,
       (SELECT count(*) FROM public.asset_vendors)     AS vendors,
       (SELECT count(*) FROM public.asset_licenses)    AS licenses,
       (SELECT count(*) FROM public.asset_allocations) AS handovers;
