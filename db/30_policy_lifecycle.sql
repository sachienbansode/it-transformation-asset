-- Policies: Inactive status (paused without retiring), deadline restart, and settings snapshot per version. Re-runnable.
BEGIN;
ALTER TABLE public.policies DROP CONSTRAINT IF EXISTS policies_status_check;
ALTER TABLE public.policies ADD CONSTRAINT policies_status_check CHECK (status IN ('Draft', 'Published', 'Inactive', 'Retired'));
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS due_from timestamptz;          -- deadline counted from here when later than published_at (resend / reactivate)
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS status_note text;              -- reason given when deactivated / retired
ALTER TABLE public.policy_versions ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.policy_versions ADD COLUMN IF NOT EXISTS settings jsonb;         -- audience, days, halt access … at publish time
COMMIT;
