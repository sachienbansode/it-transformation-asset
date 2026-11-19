-- ITH-120 (r88): client consent before each deployment + NIYTRI platform console tables. Re-runnable.
-- In every client database: update requests announced by NIYTRI and the client's decision (approve / defer / reject).
CREATE TABLE IF NOT EXISTS public.app_update_requests (
  id              bigserial PRIMARY KEY,
  version         text NOT NULL,
  git_ref         text NOT NULL,
  title           text,
  notes           text,
  planned_at      timestamptz,
  status          text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Deferred', 'Rejected', 'Deployed', 'Withdrawn')),
  requested_by    text,
  requested_at    timestamptz NOT NULL DEFAULT now(),
  decided_by      text,
  decided_by_id   integer,
  decided_at      timestamptz,
  decision_note   text,
  defer_until     date,
  deployed_at     timestamptz,
  emergency_reason text
);
CREATE INDEX IF NOT EXISTS app_update_requests_status ON public.app_update_requests (status, requested_at DESC);
-- Client instances need consent by default (new-tenant.sh sets it); the original instance only if switched on here.
INSERT INTO public.settings (key, value, description)
SELECT 'updates.consent_required', 'true', 'Deployments need the client''s approval (Admin › Updates)'
WHERE EXISTS (SELECT 1 FROM public.settings WHERE key = 'tenant.profile') AND NOT EXISTS (SELECT 1 FROM public.settings WHERE key = 'updates.consent_required');

-- NIYTRI platform console (used only in the console instance; empty elsewhere)
CREATE TABLE IF NOT EXISTS public.platform_clients (
  id            serial PRIMARY KEY,
  code          text NOT NULL UNIQUE,
  name          text NOT NULL,
  domain        text NOT NULL,
  db_name       text NOT NULL,
  folder        text,
  admin_email   text,
  contact_email text,
  status        text NOT NULL DEFAULT 'Active' CHECK (status IN ('Provisioning', 'Active', 'Failed', 'Suspended')),
  notes         text,
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.platform_jobs (
  id          bigserial PRIMARY KEY,
  client_id   integer REFERENCES public.platform_clients(id),
  kind        text NOT NULL CHECK (kind IN ('new_client', 'deploy')),
  params      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status      text NOT NULL DEFAULT 'Queued' CHECK (status IN ('Queued', 'Running', 'Done', 'Failed', 'Cancelled')),
  log         text,
  requested_by text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at  timestamptz,
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS platform_jobs_status ON public.platform_jobs (status, id);
