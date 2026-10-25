-- IT Transformation Hub — remove the demo ITSM tickets (seeded on the old Replit build).
-- Run ONCE, manually (deploy.sh never runs this file). Nothing is lost: every row is first copied into one
-- archive batch (Admin › Archive & Notifications, kind itsm_demo_clear) in the same transaction.
-- Kept: SLA policies and the approval matrix (configuration).
BEGIN;
SET search_path TO public;
DO $$
DECLARE
  t text; n int; total int := 0; bid int; counts jsonb := '{}'::jsonb;
  tabs text[] := ARRAY['itsm_incidents','itsm_problems','itsm_changes','itsm_service_requests','itsm_knowledge_base','itsm_approvals','itsm_attachments','itsm_ticket_history'];
BEGIN
  INSERT INTO data_archive_batches (batch_no, kind, module, title, row_count, summary, created_by)
  VALUES ('TMP-' || clock_timestamp(), 'itsm_demo_clear', 'ITSM', 'Demo ITSM tickets removed (archived)', 0, '{}'::jsonb, 'Database script')
  RETURNING id INTO bid;
  UPDATE data_archive_batches SET batch_no = 'ARC-' || to_char(now(), 'YYYY') || '-' || lpad(bid::text, 5, '0') WHERE id = bid;
  FOREACH t IN ARRAY tabs LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    counts := counts || jsonb_build_object(t, n); total := total + n;
    EXECUTE format('INSERT INTO data_archive_items (batch_id, section, row_count, payload) SELECT %s, %L, count(*), coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id), ''[]''::jsonb) FROM public.%I x', bid, 'table:' || t, t);
  END LOOP;
  UPDATE data_archive_batches SET row_count = total, summary = counts WHERE id = bid;
  EXECUTE 'TRUNCATE TABLE public.itsm_approvals, public.itsm_attachments, public.itsm_ticket_history, public.itsm_incidents, public.itsm_problems, public.itsm_changes, public.itsm_service_requests, public.itsm_knowledge_base RESTART IDENTITY';
  RAISE NOTICE 'Archived % ITSM rows as batch id % and cleared the tables: %', total, bid, counts;
END $$;
COMMIT;
