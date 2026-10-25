-- IT Transformation Hub — migration 12: data archive (upload / clear batches), email notification rules + outbox,
-- read-only asset history. Target DB: it-hub   Run as: root_admin. Re-runnable. Applied by deploy.sh.
BEGIN;
SET search_path TO public;

/* Every upload and every "Clear all" is kept as one archive batch — nothing is lost. */
CREATE TABLE IF NOT EXISTS public.data_archive_batches (
  id          serial PRIMARY KEY,
  batch_no    text NOT NULL,
  kind        text NOT NULL,          -- asset_register_upload | asset_bulk_assign | asset_finance_upload | asset_clear | kpi_upload
  module      text NOT NULL,          -- IT Asset Management | KPI
  title       text NOT NULL,
  file_name   text,
  row_count   integer NOT NULL DEFAULT 0,
  summary     jsonb,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  restored_at timestamptz,
  restored_by text
);
CREATE UNIQUE INDEX IF NOT EXISTS data_archive_batches_no_uq ON public.data_archive_batches (batch_no);
CREATE INDEX IF NOT EXISTS data_archive_batches_kind_idx ON public.data_archive_batches (kind, created_at DESC);

CREATE TABLE IF NOT EXISTS public.data_archive_items (
  id       serial PRIMARY KEY,
  batch_id integer NOT NULL REFERENCES public.data_archive_batches(id) ON DELETE CASCADE,
  section  text NOT NULL,             -- uploaded | before | after | changes | table:<name>
  row_count integer NOT NULL DEFAULT 0,
  payload  jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS data_archive_items_batch_idx ON public.data_archive_items (batch_id);

/* Who gets an email for which event (comma-separated addresses, configurable in Admin › Notifications) */
CREATE TABLE IF NOT EXISTS public.notification_rules (
  event_key   text PRIMARY KEY,
  label       text NOT NULL,
  module      text NOT NULL,
  description text,
  recipients  text,
  enabled     boolean NOT NULL DEFAULT true,
  attach_excel boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  updated_by  text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.notification_rules (event_key, label, module, description, attach_excel, sort_order)
SELECT v.k, v.l, v.m, v.d, v.a, v.s FROM (VALUES
  ('asset_register_upload', 'Asset register upload',          'IT Asset Management', 'Assets imported from Excel — change summary, new and old register attached', true, 1),
  ('asset_bulk_assign',     'Bulk assignment upload',         'IT Asset Management', 'Assets issued / reassigned from Excel — change summary, new and old register attached', true, 2),
  ('asset_finance_upload',  'Purchase / cost / warranty upload','IT Asset Management', 'Finance data updated from Excel — change summary, new and old register attached', true, 3),
  ('asset_clear',           'Asset data cleared (archived)',  'IT Asset Management', 'All asset data moved to the archive — full register attached', true, 4),
  ('asset_disposed',        'Asset disposed / lost',          'IT Asset Management', 'An asset was disposed of or reported lost / stolen', false, 5),
  ('asset_audit_completed', 'Physical audit completed',       'IT Asset Management', 'An audit closed — found / missing / mismatch counts', false, 6),
  ('asset_contract_renewed','Contract renewed',               'IT Asset Management', 'An AMC / warranty / support contract was renewed', false, 7),
  ('kpi_upload',            'KPI upload',                     'KPI',                 'A KPI set was uploaded — change summary, new and old KPI set attached', true, 8)
) AS v(k, l, m, d, a, s)
WHERE NOT EXISTS (SELECT 1 FROM public.notification_rules r WHERE r.event_key = v.k);

CREATE TABLE IF NOT EXISTS public.email_outbox (
  id          serial PRIMARY KEY,
  event_key   text NOT NULL,
  recipients  text,
  subject     text NOT NULL,
  body_html   text,
  attachment_name text,
  batch_id    integer,
  status      text NOT NULL DEFAULT 'Queued',   -- Queued | Sent | Failed | Skipped
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz
);
CREATE INDEX IF NOT EXISTS email_outbox_created_idx ON public.email_outbox (created_at DESC);

/* Asset history is read-only: entries can be added, never edited or deleted (TRUNCATE for archive/clear only). */
CREATE OR REPLACE FUNCTION public.asset_history_read_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Asset history is read-only (% not allowed on asset_transactions)', TG_OP;
END $$;
DROP TRIGGER IF EXISTS asset_transactions_read_only ON public.asset_transactions;
CREATE TRIGGER asset_transactions_read_only BEFORE UPDATE OR DELETE ON public.asset_transactions
  FOR EACH ROW EXECUTE FUNCTION public.asset_history_read_only();
CREATE INDEX IF NOT EXISTS asset_transactions_asset_created_idx ON public.asset_transactions (asset_id, created_at DESC);

COMMIT;
