-- IT Transformation Hub — migration 13: asset finance controls
--   maker-checker requests, financial-year close & lock, disposal profit / loss, GL ledgers for the monthly journal.
-- Target DB: it-hub   Run as: root_admin. Re-runnable. Applied by deploy.sh.
BEGIN;
SET search_path TO public;

/* Maker-checker: depreciation rule changes, cost / purchase uploads and asset cost edits wait for a second person. */
CREATE TABLE IF NOT EXISTS public.asset_finance_requests (
  id                   serial PRIMARY KEY,
  request_no           text NOT NULL,
  kind                 text NOT NULL,            -- rule_update | rule_create | finance_upload | asset_edit | gl_settings
  title                text NOT NULL,
  payload              jsonb NOT NULL,
  preview              jsonb,                    -- field-level changes shown to the approver
  file_name            text,
  status               text NOT NULL DEFAULT 'Pending',   -- Pending | Approved | Rejected | Cancelled
  requested_by         text NOT NULL,
  requested_by_user_id integer,
  requested_at         timestamptz NOT NULL DEFAULT now(),
  request_note         text,
  decided_by           text,
  decided_by_user_id   integer,
  decided_at           timestamptz,
  decision_note        text,
  result               jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS asset_finance_requests_no_uq ON public.asset_finance_requests (request_no);
CREATE INDEX IF NOT EXISTS asset_finance_requests_status_idx ON public.asset_finance_requests (status, requested_at DESC);

/* Financial-year close: the register of a closed year is frozen (snapshot) and nothing can be back-dated into it. */
CREATE TABLE IF NOT EXISTS public.asset_fy_closes (
  id            serial PRIMARY KEY,
  fy            integer NOT NULL,                -- 2025 = FY 2025-26
  status        text NOT NULL DEFAULT 'Closed',  -- Closed | Reopened
  lock_date     text NOT NULL,                   -- last day of the FY (YYYY-MM-DD)
  closed_by     text NOT NULL,
  closed_at     timestamptz NOT NULL DEFAULT now(),
  close_note    text,
  reopened_by   text,
  reopened_at   timestamptz,
  reopen_reason text,
  totals        jsonb,
  register      jsonb NOT NULL,                  -- frozen register lines for the year
  carry         jsonb NOT NULL,                  -- per asset: frozen schedule rows, closing book value, life used
  archive_batch_id integer
);
CREATE INDEX IF NOT EXISTS asset_fy_closes_fy_idx ON public.asset_fy_closes (fy, status);

/* GL ledgers for the monthly journal (per asset type) and global ledgers / settings */
ALTER TABLE public.asset_depreciation_rules ADD COLUMN IF NOT EXISTS asset_ledger   text;
ALTER TABLE public.asset_depreciation_rules ADD COLUMN IF NOT EXISTS acc_dep_ledger text;
ALTER TABLE public.asset_depreciation_rules ADD COLUMN IF NOT EXISTS expense_ledger text;
CREATE TABLE IF NOT EXISTS public.asset_finance_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.asset_finance_settings (key, value) VALUES
  ('ledger_disposal_proceeds', 'Sale of Fixed Assets (Receivable)'),
  ('ledger_gain',              'Profit on Sale of Fixed Assets'),
  ('ledger_loss',              'Loss on Sale / Write-off of Fixed Assets'),
  ('voucher_type',             'Journal')
ON CONFLICT (key) DO NOTHING;

/* Disposal profit / loss recorded when the asset is disposed or written off */
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS disposal_book_value numeric(12,2);
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS disposal_gain_loss  numeric(12,2);

/* New email events */
INSERT INTO public.notification_rules (event_key, label, module, description, attach_excel, sort_order)
SELECT v.k, v.l, v.m, v.d, v.a, v.s FROM (VALUES
  ('asset_finance_approval', 'Finance change approvals',     'IT Asset Management', 'A rule / cost change was submitted, approved or rejected (maker-checker)', false, 9),
  ('asset_fy_close',         'Financial year closed / reopened', 'IT Asset Management', 'A financial year was closed (register attached) or reopened', true, 10),
  ('asset_journal_export',   'Monthly depreciation journal', 'IT Asset Management', 'Monthly depreciation / disposal journal exported — Tally-ready Excel attached', true, 11)
) AS v(k, l, m, d, a, s)
WHERE NOT EXISTS (SELECT 1 FROM public.notification_rules r WHERE r.event_key = v.k);

COMMIT;
