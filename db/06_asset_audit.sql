-- IT Transformation Hub — migration 06: physical asset audit (stock verification)
-- Target DB: it-hub   Run as: root_admin (Query Tool on it-hub). Safe to run more than once.
BEGIN;

CREATE TABLE IF NOT EXISTS public.asset_audits (
  id                serial PRIMARY KEY,
  audit_no          text,
  name              text NOT NULL,
  scope_locations   text,
  scope_departments text,
  scope_types       text,
  status            text NOT NULL DEFAULT 'Planned',
  due_date          text,
  auditors          text,
  notes             text,
  started_at        timestamptz,
  completed_at      timestamptz,
  completed_by      text,
  summary           jsonb,
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS asset_audits_audit_no_uq ON public.asset_audits (audit_no);

CREATE TABLE IF NOT EXISTS public.asset_audit_items (
  id                serial PRIMARY KEY,
  audit_id          integer NOT NULL,
  asset_id          integer,
  asset_tag         text NOT NULL,
  asset_name        text,
  serial_number     text,
  expected_location text,
  expected_holder   text,
  expected_status   text,
  in_scope          boolean NOT NULL DEFAULT true,
  result            text NOT NULL DEFAULT 'Pending',
  found_location    text,
  condition         text,
  remarks           text,
  scanned_at        timestamptz,
  scanned_by        text,
  method            text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asset_audit_items_audit_idx ON public.asset_audit_items (audit_id, result);
CREATE INDEX IF NOT EXISTS asset_audit_items_tag_idx ON public.asset_audit_items (audit_id, upper(asset_tag));

COMMIT;
