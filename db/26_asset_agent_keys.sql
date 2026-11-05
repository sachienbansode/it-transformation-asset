-- Device agent: per-user installation keys (single device, bound to a user and optionally an asset), shareable download
-- link, and the device ↔ user link. Re-runnable.
BEGIN;
ALTER TABLE public.asset_agent_codes ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'bulk';
ALTER TABLE public.asset_agent_codes ADD COLUMN IF NOT EXISTS user_id int;
ALTER TABLE public.asset_agent_codes ADD COLUMN IF NOT EXISTS asset_id int;
ALTER TABLE public.asset_agent_codes ADD COLUMN IF NOT EXISTS code_enc text;          -- AES-GCM (server secret) so the installer can be rebuilt / shared
ALTER TABLE public.asset_agent_codes ADD COLUMN IF NOT EXISTS download_hash text;     -- sha256 of the share-link token
ALTER TABLE public.asset_agent_codes ADD COLUMN IF NOT EXISTS used_by_agent int;
ALTER TABLE public.asset_agent_codes ADD COLUMN IF NOT EXISTS used_at timestamptz;
ALTER TABLE public.asset_agent_codes ADD COLUMN IF NOT EXISTS shared_at timestamptz;
ALTER TABLE public.asset_agent_codes ADD COLUMN IF NOT EXISTS shared_by text;
ALTER TABLE public.asset_agent_codes ADD COLUMN IF NOT EXISTS downloads int NOT NULL DEFAULT 0;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asset_agent_codes_kind_chk') THEN
    ALTER TABLE public.asset_agent_codes ADD CONSTRAINT asset_agent_codes_kind_chk CHECK (kind IN ('user', 'bulk'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS asset_agent_codes_download ON public.asset_agent_codes (download_hash) WHERE download_hash IS NOT NULL;
ALTER TABLE public.asset_agents ADD COLUMN IF NOT EXISTS user_id int;
COMMIT;
