-- Device agent: per-employee tracking level set by an administrator. Re-runnable.
--   standard = follow the global setting (active time; apps if assetAgent.trackApps is on)
--   usage    = active / idle time only, never applications
--   detailed = active time and applications, even when application tracking is off globally
--   excluded = no usage or application tracking at all (device health only)
BEGIN;
CREATE TABLE IF NOT EXISTS public.agent_tracking_rules (
  user_id    int PRIMARY KEY,
  level      text NOT NULL CHECK (level IN ('usage', 'detailed', 'excluded')),
  reason     text NOT NULL,
  set_by     text NOT NULL,
  set_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asset_usage_daily_day ON public.asset_usage_daily (day DESC);
CREATE INDEX IF NOT EXISTS asset_software_name ON public.asset_software (lower(name));
COMMIT;
