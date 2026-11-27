-- 2.17 (ITH-205): field-level edit trail on tickets — what changed, from what, to what. Re-runnable.
ALTER TABLE public.itsm_ticket_history ADD COLUMN IF NOT EXISTS changes jsonb;
CREATE INDEX IF NOT EXISTS itsm_ticket_history_ticket_idx ON public.itsm_ticket_history (ticket_type, ticket_id, created_at DESC);
-- comments by the resolver are part of the trail
ALTER TABLE public.itsm_ticket_history ADD COLUMN IF NOT EXISTS entry_type text NOT NULL DEFAULT 'event';
