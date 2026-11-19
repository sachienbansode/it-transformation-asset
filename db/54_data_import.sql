-- ITH-119 (r87): Admin › Data import — history of every upload (validated preview and import), and the old ticket number
-- kept on imported tickets so they can be traced back to the previous tool. Re-runnable.
CREATE TABLE IF NOT EXISTS public.data_import_batches (
  id          bigserial PRIMARY KEY,
  object      text NOT NULL,
  file_name   text,
  total       integer NOT NULL DEFAULT 0,
  created     integer NOT NULL DEFAULT 0,
  updated     integer NOT NULL DEFAULT 0,
  failed      integer NOT NULL DEFAULT 0,
  status      text NOT NULL CHECK (status IN ('Imported', 'Rejected')),
  errors      jsonb,
  user_id     integer,
  user_name   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS data_import_batches_at ON public.data_import_batches (created_at DESC);
ALTER TABLE public.itsm_incidents        ADD COLUMN IF NOT EXISTS legacy_ref text;
ALTER TABLE public.itsm_service_requests ADD COLUMN IF NOT EXISTS legacy_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS itsm_incidents_legacy_ref ON public.itsm_incidents (lower(legacy_ref)) WHERE legacy_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS itsm_service_requests_legacy_ref ON public.itsm_service_requests (lower(legacy_ref)) WHERE legacy_ref IS NOT NULL;
