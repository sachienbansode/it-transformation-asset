-- Device agent: full activity log per installation key (created, emailed, downloaded, notice accepted, installed, refused, disabled). Re-runnable.
BEGIN;
ALTER TABLE public.asset_agent_codes ADD COLUMN IF NOT EXISTS disabled_at timestamptz;
ALTER TABLE public.asset_agent_codes ADD COLUMN IF NOT EXISTS disabled_by text;
ALTER TABLE public.asset_agent_codes ADD COLUMN IF NOT EXISTS disable_reason text;
ALTER TABLE public.asset_agent_codes ADD COLUMN IF NOT EXISTS last_download_at timestamptz;
CREATE TABLE IF NOT EXISTS public.asset_agent_code_events (
  id         bigserial PRIMARY KEY,
  code_id    int NOT NULL REFERENCES public.asset_agent_codes(id) ON DELETE CASCADE,
  action     text NOT NULL,      -- created / emailed / downloaded / link-opened / notice-accepted / installed / refused / disabled / auto-disabled
  actor      text,               -- person (admin or employee) or device
  ip         text,
  user_agent text,
  detail     text,
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asset_agent_code_events_code ON public.asset_agent_code_events (code_id, at DESC);
-- backfill from what was already recorded (only once per key)
INSERT INTO public.asset_agent_code_events (code_id, action, actor, detail, at)
  SELECT k.id, 'created', k.created_by, CASE WHEN k.kind = 'user' THEN 'Personal key, valid till ' || to_char(k.expires_at, 'DD-Mon-YYYY') ELSE 'Bulk key "' || k.label || '" for ' || k.max_uses || ' devices' END, k.created_at
  FROM public.asset_agent_codes k WHERE NOT EXISTS (SELECT 1 FROM public.asset_agent_code_events e WHERE e.code_id = k.id);
INSERT INTO public.asset_agent_code_events (code_id, action, actor, detail, at)
  SELECT k.id, 'emailed', k.shared_by, 'Installer link emailed (earlier record)', k.shared_at FROM public.asset_agent_codes k
  WHERE k.shared_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.asset_agent_code_events e WHERE e.code_id = k.id AND e.action = 'emailed');
INSERT INTO public.asset_agent_code_events (code_id, action, actor, detail, at)
  SELECT k.id, 'installed', 'Device ' || coalesce(g.hostname, '?'), 'Installed on ' || coalesce(g.hostname, '?') || coalesce(' (serial ' || g.serial_number || ')', ''), k.used_at
  FROM public.asset_agent_codes k LEFT JOIN public.asset_agents g ON g.id = k.used_by_agent
  WHERE k.used_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.asset_agent_code_events e WHERE e.code_id = k.id AND e.action = 'installed');
COMMIT;
