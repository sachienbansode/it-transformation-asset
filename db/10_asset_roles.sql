-- IT Transformation Hub — migration 10: standard IT Asset roles for local (password) users.
-- Same roles as the "Portal Setup & Page Keys" sheet; Ashika Portal users get theirs from the Portal.
-- Re-runnable: creates missing roles / permissions only, never changes ones an admin has edited.
BEGIN;
SET search_path TO public;

INSERT INTO public.roles (name, description, is_system, default_dashboard)
SELECT v.n, v.d, false, '/assets' FROM (VALUES
  ('IT Asset Manager', 'Runs the asset desk: register, handovers, contracts, licenses, vendors, audits'),
  ('Asset Auditor',    'Physical verification team: plans and runs audits, read-only elsewhere'),
  ('Finance (Assets)', 'Fixed-asset register, depreciation rules, AMC spend'),
  ('Asset Viewer',     'Management / auditors: read-only asset register and dashboard')
) AS v(n, d)
WHERE NOT EXISTS (SELECT 1 FROM public.roles r WHERE lower(r.name) = lower(v.n));

INSERT INTO public.role_permissions (role_id, module, access_level)
SELECT r.id, p.module, p.level
FROM (VALUES
  ('IT Asset Manager','assets','read'), ('IT Asset Manager','asset_registry','write'), ('IT Asset Manager','asset_allocations','write'),
  ('IT Asset Manager','asset_contracts','write'), ('IT Asset Manager','asset_licenses','write'), ('IT Asset Manager','asset_vendors','write'),
  ('IT Asset Manager','asset_audits','write'), ('IT Asset Manager','asset_depreciation','read'),
  ('Asset Auditor','assets','read'), ('Asset Auditor','asset_registry','read'), ('Asset Auditor','asset_audits','write'),
  ('Finance (Assets)','assets','read'), ('Finance (Assets)','asset_registry','read'), ('Finance (Assets)','asset_depreciation','write'), ('Finance (Assets)','asset_contracts','read'),
  ('Asset Viewer','assets','read'), ('Asset Viewer','asset_registry','read')
) AS p(role, module, level)
JOIN public.roles r ON lower(r.name) = lower(p.role)
WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions x WHERE x.role_id = r.id AND x.module = p.module);

COMMIT;
