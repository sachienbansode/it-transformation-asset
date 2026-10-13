-- IT Transformation Hub — clear ALL asset management data (one-off)
-- Target DB: it-hub   Run as: root_admin
-- Removes assets, vendors, licenses, allocations, maintenance records and asset history.
-- Asset categories are kept. Same effect as Asset Registry -> "Clear All Data" (admin).
BEGIN;
TRUNCATE TABLE public.asset_transactions, public.asset_allocations, public.maintenance_records,
               public.asset_licenses, public.assets, public.asset_vendors RESTART IDENTITY;
COMMIT;
SELECT (SELECT count(*) FROM public.assets) AS assets, (SELECT count(*) FROM public.asset_vendors) AS vendors;
