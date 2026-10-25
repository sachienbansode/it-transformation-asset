-- IT Transformation Hub — migration 14: employee can send a handover back to IT (wrong / damaged asset etc.)
-- Target DB: it-hub   Run as: root_admin. Re-runnable. Applied by deploy.sh.
BEGIN;
SET search_path TO public;
ALTER TABLE public.asset_allocations ADD COLUMN IF NOT EXISTS dispute_reason       text;
ALTER TABLE public.asset_allocations ADD COLUMN IF NOT EXISTS dispute_note         text;
ALTER TABLE public.asset_allocations ADD COLUMN IF NOT EXISTS disputed_at          timestamptz;
ALTER TABLE public.asset_allocations ADD COLUMN IF NOT EXISTS dispute_count        integer NOT NULL DEFAULT 0;
ALTER TABLE public.asset_allocations ADD COLUMN IF NOT EXISTS dispute_resolution   text;
ALTER TABLE public.asset_allocations ADD COLUMN IF NOT EXISTS dispute_resolved_by  text;
ALTER TABLE public.asset_allocations ADD COLUMN IF NOT EXISTS dispute_resolved_at  timestamptz;
CREATE INDEX IF NOT EXISTS asset_allocations_ack_idx ON public.asset_allocations (ack_status) WHERE status = 'Active';
INSERT INTO public.notification_rules (event_key, label, module, description, attach_excel, sort_order)
SELECT 'asset_handover_issue', 'Handover sent back by employee', 'IT Asset Management', 'An employee reported a problem with an issued asset (wrong asset, damaged, missing accessories…) instead of acknowledging it', false, 12
WHERE NOT EXISTS (SELECT 1 FROM public.notification_rules WHERE event_key = 'asset_handover_issue');
COMMIT;
