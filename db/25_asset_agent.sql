-- IT Hub device agent: enrolment codes, enrolled devices, health snapshots, daily usage, software inventory, alerts.
-- Re-runnable.
BEGIN;

CREATE TABLE IF NOT EXISTS public.asset_agent_codes (
  id          serial PRIMARY KEY,
  code_hash   text NOT NULL UNIQUE,          -- sha256 of the enrolment code (code itself is shown once)
  code_hint   text NOT NULL,                 -- last 4 characters, for the list
  label       text NOT NULL,
  max_uses    int  NOT NULL DEFAULT 500,
  uses        int  NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.asset_agents (
  id              serial PRIMARY KEY,
  device_id       text NOT NULL UNIQUE,      -- GUID generated on the device
  token_hash      text NOT NULL,             -- sha256 of the device token
  asset_id        int,                       -- linked register asset (by serial / tag / admin)
  match_note      text,
  hostname        text,
  serial_number   text,
  manufacturer    text,
  model           text,
  platform        text NOT NULL DEFAULT 'Workstation' CHECK (platform IN ('Workstation', 'Server')),
  os_name         text,
  os_version      text,
  agent_version   text,
  last_user       text,
  last_ip         text,
  latest          jsonb,                     -- last health payload (fast fleet view)
  health_state    text NOT NULL DEFAULT 'Unknown',  -- Healthy / Warning / Critical / Offline / Unknown
  enrolled_by_code int,
  enrolled_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz,
  software_at     timestamptz,
  status          text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Revoked')),
  revoked_at      timestamptz,
  revoked_by      text
);
CREATE INDEX IF NOT EXISTS asset_agents_asset ON public.asset_agents (asset_id);

CREATE TABLE IF NOT EXISTS public.asset_health_snapshots (
  id         bigserial PRIMARY KEY,
  agent_id   int NOT NULL REFERENCES public.asset_agents(id) ON DELETE CASCADE,
  asset_id   int,
  at         timestamptz NOT NULL DEFAULT now(),
  cpu_pct    numeric(5,1),
  mem_pct    numeric(5,1),
  disk_min_free_pct numeric(5,1),
  battery_health_pct numeric(5,1),
  data       jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS asset_health_snapshots_agent_at ON public.asset_health_snapshots (agent_id, at DESC);

CREATE TABLE IF NOT EXISTS public.asset_usage_daily (
  agent_id    int  NOT NULL REFERENCES public.asset_agents(id) ON DELETE CASCADE,
  day         date NOT NULL,
  user_name   text NOT NULL,
  asset_id    int,
  first_seen  timestamptz,
  last_seen   timestamptz,
  active_mins int  NOT NULL DEFAULT 0,
  idle_mins   int  NOT NULL DEFAULT 0,
  apps        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { "EXCEL.EXE": minutes, ... }
  PRIMARY KEY (agent_id, day, user_name)
);
CREATE INDEX IF NOT EXISTS asset_usage_daily_asset_day ON public.asset_usage_daily (asset_id, day DESC);

CREATE TABLE IF NOT EXISTS public.asset_software (
  agent_id     int  NOT NULL REFERENCES public.asset_agents(id) ON DELETE CASCADE,
  name         text NOT NULL,
  version      text,
  publisher    text,
  install_date text,
  PRIMARY KEY (agent_id, name, version)
);

CREATE TABLE IF NOT EXISTS public.asset_agent_alerts (
  id         serial PRIMARY KEY,
  agent_id   int NOT NULL REFERENCES public.asset_agents(id) ON DELETE CASCADE,
  asset_id   int,
  kind       text NOT NULL,
  severity   text NOT NULL CHECK (severity IN ('Warning', 'Critical')),
  message    text NOT NULL,
  opened_at  timestamptz NOT NULL DEFAULT now(),
  closed_at  timestamptz,
  notified_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS asset_agent_alerts_open ON public.asset_agent_alerts (agent_id, kind) WHERE closed_at IS NULL;

INSERT INTO public.settings (key, value, description) VALUES
  ('assetAgent.checkinMinutes', '15'::jsonb, 'How often devices report health (minutes)'),
  ('assetAgent.retentionDays', '180'::jsonb, 'Keep health snapshots and daily usage for this many days'),
  ('assetAgent.trackApps', 'true'::jsonb, 'Record time per application (foreground app only; no window titles, keystrokes or screenshots)'),
  ('assetAgent.thresholds', '{"diskFreePct":10,"batteryHealthPct":60,"patchDays":30,"offlineDays":7,"rebootDays":14,"idleDays":14}'::jsonb, 'Alert thresholds')
ON CONFLICT (key) DO NOTHING;

COMMIT;
