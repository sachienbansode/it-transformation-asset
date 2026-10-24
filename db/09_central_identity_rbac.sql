-- IT Transformation Hub — migration 09: Central Identity (Ashika API Portal SSO) + module-level RBAC for IT Assets
-- Target DB: it-hub   Run as: root_admin. Re-runnable. Applied by deploy.sh.
BEGIN;
SET search_path TO public;

-- Where a user's identity comes from: 'local' (password in this app) or 'central' (Ashika Portal SSO).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS identity_source text NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS central_sub     text,
  ADD COLUMN IF NOT EXISTS central_role    text;
CREATE INDEX IF NOT EXISTS users_central_sub_idx ON public.users (central_sub);

-- New IT-asset modules get the same access a role already has on the closest existing module,
-- so nobody loses access when Contracts / Depreciation / Physical Audit become separately permissioned.
INSERT INTO public.role_permissions (role_id, module, access_level)
SELECT rp.role_id, m.new_module, rp.access_level
FROM public.role_permissions rp
JOIN (VALUES ('asset_vendors', 'asset_contracts'), ('asset_registry', 'asset_depreciation'), ('asset_registry', 'asset_audits')) AS m(old_module, new_module)
  ON rp.module = m.old_module
WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions x WHERE x.role_id = rp.role_id AND x.module = m.new_module);

COMMIT;
