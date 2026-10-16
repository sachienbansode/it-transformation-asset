-- IT Transformation Hub — migration 08: contracts / AMC / warranty, depreciation, license compliance
-- Target DB: it-hub   Run as: root_admin. Re-runnable (IF NOT EXISTS / WHERE NOT EXISTS). Applied by deploy.sh.
BEGIN;
SET search_path TO public;

/* ── Assets: finance & depreciation fields ───────────────────────────────── */
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS invoice_no          text,
  ADD COLUMN IF NOT EXISTS warranty_start      text,
  ADD COLUMN IF NOT EXISTS depreciation_method text,          -- NULL = use the rule for the asset type
  ADD COLUMN IF NOT EXISTS useful_life_years   numeric(5,2),  -- NULL = use the rule
  ADD COLUMN IF NOT EXISTS salvage_value       numeric(12,2); -- NULL = rule's salvage %

/* ── Depreciation rules per asset type (Companies Act 2013, Schedule II defaults) ── */
CREATE TABLE IF NOT EXISTS public.asset_depreciation_rules (
  id                serial PRIMARY KEY,
  asset_type        text NOT NULL,
  method            text NOT NULL DEFAULT 'SLM',   -- SLM | WDV | None
  useful_life_years numeric(5,2) NOT NULL DEFAULT 3,
  salvage_pct       numeric(5,2) NOT NULL DEFAULT 5,
  notes             text,
  updated_by        text,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS asset_depreciation_rules_type_uq ON public.asset_depreciation_rules (lower(asset_type));

INSERT INTO public.asset_depreciation_rules (asset_type, method, useful_life_years, salvage_pct, notes)
SELECT v.t, v.m, v.l, 5, v.n FROM (VALUES
  ('Laptop',         'SLM', 3, 'Computers – end-user devices (Sch. II: 3 yrs)'),
  ('Desktop',        'SLM', 3, 'Computers – end-user devices (Sch. II: 3 yrs)'),
  ('Tablet',         'SLM', 3, 'Computers – end-user devices (Sch. II: 3 yrs)'),
  ('Mobile',         'SLM', 3, 'Computers – end-user devices (Sch. II: 3 yrs)'),
  ('Printer',        'SLM', 3, 'Computers – end-user devices (Sch. II: 3 yrs)'),
  ('Server',         'SLM', 6, 'Servers and networks (Sch. II: 6 yrs)'),
  ('Network Switch', 'SLM', 6, 'Servers and networks (Sch. II: 6 yrs)'),
  ('Firewall',       'SLM', 6, 'Servers and networks (Sch. II: 6 yrs)'),
  ('Access Point',   'SLM', 6, 'Servers and networks (Sch. II: 6 yrs)'),
  ('Storage',        'SLM', 6, 'Servers and networks (Sch. II: 6 yrs)'),
  ('UPS',            'SLM', 10, 'Electrical installations (Sch. II: 10 yrs)'),
  ('Others',         'SLM', 5, 'Default')
) AS v(t, m, l, n)
WHERE NOT EXISTS (SELECT 1 FROM public.asset_depreciation_rules r WHERE lower(r.asset_type) = lower(v.t));

/* ── Contracts: AMC, extended warranty, support, lease, insurance ───────── */
CREATE TABLE IF NOT EXISTS public.asset_contracts (
  id                  serial PRIMARY KEY,
  contract_no         text NOT NULL,
  title               text NOT NULL,
  contract_type       text NOT NULL DEFAULT 'AMC',
  vendor_id           integer,
  vendor_name         text,
  start_date          text NOT NULL,
  end_date            text NOT NULL,
  value               numeric(14,2),
  billing_cycle       text DEFAULT 'Annual',
  coverage            text,          -- what is covered (parts, labour, on-site, etc.)
  sla_terms           text,          -- response / resolution commitments
  renewal_notice_days integer NOT NULL DEFAULT 30,
  auto_renew          boolean NOT NULL DEFAULT false,
  po_number           text,
  vendor_contact      text,
  vendor_email        text,
  vendor_phone        text,
  owner_name          text,          -- internal contract owner
  status              text NOT NULL DEFAULT 'Active',  -- Draft | Active | Renewed | Terminated (Expired/Expiring are computed)
  renewed_from_id     integer,
  notes               text,
  is_active           boolean NOT NULL DEFAULT true,
  created_by          text,
  updated_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS asset_contracts_no_uq ON public.asset_contracts (contract_no);
CREATE INDEX IF NOT EXISTS asset_contracts_end_idx ON public.asset_contracts (end_date);

CREATE TABLE IF NOT EXISTS public.asset_contract_assets (
  id          serial PRIMARY KEY,
  contract_id integer NOT NULL,
  asset_id    integer NOT NULL,
  added_by    text,
  added_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS asset_contract_assets_uq ON public.asset_contract_assets (contract_id, asset_id);
CREATE INDEX IF NOT EXISTS asset_contract_assets_asset_idx ON public.asset_contract_assets (asset_id);

/* ── Licenses: entitlement details + assignments ────────────────────────── */
ALTER TABLE public.asset_licenses
  ADD COLUMN IF NOT EXISTS edition        text,
  ADD COLUMN IF NOT EXISTS start_date     text,
  ADD COLUMN IF NOT EXISTS po_number      text,
  ADD COLUMN IF NOT EXISTS billing_cycle  text,
  ADD COLUMN IF NOT EXISTS renewal_cost   numeric(12,2),
  ADD COLUMN IF NOT EXISTS auto_renew     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS owner_name     text,
  ADD COLUMN IF NOT EXISTS reminder_days  integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS contract_id    integer;

CREATE TABLE IF NOT EXISTS public.asset_license_assignments (
  id            serial PRIMARY KEY,
  license_id    integer NOT NULL,
  assignee_type text NOT NULL DEFAULT 'User',   -- User | Device
  asset_id      integer,
  user_id       integer,
  user_name     text,
  user_email    text,
  employee_code text,
  department    text,
  status        text NOT NULL DEFAULT 'Active', -- Active | Revoked
  assigned_by   text,
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  revoked_by    text,
  revoked_at    timestamptz,
  revoke_reason text,
  notes         text
);
CREATE INDEX IF NOT EXISTS asset_license_assignments_lic_idx ON public.asset_license_assignments (license_id, status);
CREATE INDEX IF NOT EXISTS asset_license_assignments_asset_idx ON public.asset_license_assignments (asset_id);

/* ── Masters ─────────────────────────────────────────────────────────────── */
INSERT INTO public.masters (category, key, label, color, sort_order, is_active)
SELECT 'asset_contract_type', v.k, v.l, NULL, v.s, true FROM (VALUES
  ('amc_comprehensive', 'Comprehensive AMC', 1), ('amc_non_comprehensive', 'Non-comprehensive AMC', 2),
  ('extended_warranty', 'Extended Warranty', 3), ('support', 'Support & Subscription', 4),
  ('lease', 'Lease / Rental', 5), ('insurance', 'Insurance', 6)
) AS v(k, l, s)
WHERE NOT EXISTS (SELECT 1 FROM public.masters m WHERE m.category = 'asset_contract_type' AND lower(m.label) = lower(v.l));

INSERT INTO public.masters (category, key, label, color, sort_order, is_active)
SELECT 'asset_license_type', v.k, v.l, NULL, (SELECT COALESCE(max(sort_order), 0) + 1 FROM public.masters WHERE category = 'asset_license_type'), true
FROM (VALUES ('concurrent', 'Concurrent'), ('enterprise', 'Enterprise Agreement')) AS v(k, l)
WHERE NOT EXISTS (SELECT 1 FROM public.masters m WHERE m.category = 'asset_license_type' AND lower(m.label) = lower(v.l));

COMMIT;
