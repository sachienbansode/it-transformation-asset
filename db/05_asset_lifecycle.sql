-- IT Transformation Hub — migration 05: asset lifecycle, handover & acknowledgement, change/comment trail
-- Target DB: it-hub   Run as: root_admin (Query Tool on it-hub). Safe to run more than once.
BEGIN;

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS owner_email          text,
  ADD COLUMN IF NOT EXISTS owner_employee_code  text,
  ADD COLUMN IF NOT EXISTS disposal_date        text,
  ADD COLUMN IF NOT EXISTS disposal_method      text,
  ADD COLUMN IF NOT EXISTS disposal_reference   text,
  ADD COLUMN IF NOT EXISTS disposal_value       numeric(12,2);

ALTER TABLE public.asset_allocations
  ADD COLUMN IF NOT EXISTS handover_no          text,
  ADD COLUMN IF NOT EXISTS email                text,
  ADD COLUMN IF NOT EXISTS allocation_type      text NOT NULL DEFAULT 'Permanent',
  ADD COLUMN IF NOT EXISTS expected_return_date text,
  ADD COLUMN IF NOT EXISTS issue_condition      text,
  ADD COLUMN IF NOT EXISTS accessories          text,
  ADD COLUMN IF NOT EXISTS issued_by            text,
  ADD COLUMN IF NOT EXISTS ack_status           text NOT NULL DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS ack_at               timestamptz,
  ADD COLUMN IF NOT EXISTS ack_by               text,
  ADD COLUMN IF NOT EXISTS ack_method           text,
  ADD COLUMN IF NOT EXISTS return_condition     text,
  ADD COLUMN IF NOT EXISTS return_accessories   text,
  ADD COLUMN IF NOT EXISTS return_remarks       text,
  ADD COLUMN IF NOT EXISTS received_by          text,
  ADD COLUMN IF NOT EXISTS returned_at          timestamptz;

ALTER TABLE public.asset_transactions
  ADD COLUMN IF NOT EXISTS comment  text,
  ADD COLUMN IF NOT EXISTS changes  jsonb;

-- Handover numbers for any existing allocation rows
UPDATE public.asset_allocations
   SET handover_no = 'HO-' || to_char(created_at, 'YYYY') || '-' || lpad(id::text, 5, '0')
 WHERE handover_no IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS asset_allocations_handover_no_uq ON public.asset_allocations (handover_no);
CREATE INDEX IF NOT EXISTS asset_allocations_asset_status_idx ON public.asset_allocations (asset_id, status);
CREATE INDEX IF NOT EXISTS asset_allocations_email_idx ON public.asset_allocations (lower(email));
CREATE INDEX IF NOT EXISTS asset_transactions_asset_idx ON public.asset_transactions (asset_id, created_at DESC);

COMMIT;
