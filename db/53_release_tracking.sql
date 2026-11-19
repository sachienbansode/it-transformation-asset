-- ITH-118 (r86): release tracking per client database — which migration files ran (with checksum) and every deployment
-- (version, git commit, result). Written by deploy.sh; shown on the About page. Re-runnable.
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename         text PRIMARY KEY,
  checksum         text NOT NULL,
  app_version      text,
  first_applied_at timestamptz NOT NULL DEFAULT now(),
  last_applied_at  timestamptz NOT NULL DEFAULT now(),
  runs             integer NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS public.app_deployments (
  id            bigserial PRIMARY KEY,
  tenant        text,
  version       text,
  git_commit    text,
  git_ref       text,
  status        text NOT NULL DEFAULT 'Done' CHECK (status IN ('Running', 'Done', 'Failed')),
  migrations_changed integer NOT NULL DEFAULT 0,
  deployed_by   text,
  notes         text,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);
CREATE INDEX IF NOT EXISTS app_deployments_started ON public.app_deployments (started_at DESC);
