-- Audit & Compliance increment 2: external auditor portal (invite, password + email OTP sign-in, audit-scoped
-- read-only evidence, comments, auditor statuses), internal review before sharing, comment visibility. Re-runnable.
BEGIN;

CREATE TABLE IF NOT EXISTS public.cmp_audit_access (
  id serial PRIMARY KEY,
  audit_id integer NOT NULL REFERENCES public.cmp_audits(id) ON DELETE CASCADE,
  user_id integer NOT NULL,
  firm text,
  can_download boolean NOT NULL DEFAULT false,
  valid_from date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  valid_until date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  invited_by text, invited_at timestamptz NOT NULL DEFAULT now(),
  last_access_at timestamptz,
  revoked_by text, revoked_at timestamptz,
  UNIQUE (audit_id, user_id)
);

-- one-time set-password links (only the SHA-256 of the token is stored)
CREATE TABLE IF NOT EXISTS public.cmp_auditor_tokens (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- email one-time passcodes for auditor sign-in (hash only)
CREATE TABLE IF NOT EXISTS public.cmp_auditor_otps (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cmp_auditor_otps_u ON public.cmp_auditor_otps (user_id, created_at DESC);

-- internal review: an item / schedule is visible to the auditor only after it is shared
ALTER TABLE public.cmp_items ADD COLUMN IF NOT EXISTS shared_at timestamptz;
ALTER TABLE public.cmp_items ADD COLUMN IF NOT EXISTS shared_by text;
ALTER TABLE public.cmp_items ADD COLUMN IF NOT EXISTS submitted_by_user_id integer;
ALTER TABLE public.cmp_items ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE public.cmp_items ADD COLUMN IF NOT EXISTS auditor_updated_at timestamptz;
ALTER TABLE public.cmp_grids ADD COLUMN IF NOT EXISTS shared_at timestamptz;
ALTER TABLE public.cmp_grids ADD COLUMN IF NOT EXISTS shared_by text;

-- comment visibility: internal notes never reach the auditor
ALTER TABLE public.cmp_comments ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'internal';  -- internal | auditor
ALTER TABLE public.cmp_access_log ADD COLUMN IF NOT EXISTS detail text;
CREATE INDEX IF NOT EXISTS cmp_access_log_audit ON public.cmp_access_log (audit_id, at DESC);

INSERT INTO public.notification_rules (event_key, label, module, description, attach_excel, sort_order)
SELECT 'compliance_auditor', 'Auditor portal: invitations and sign-in codes', 'Audit & Compliance', 'Invitation links and one-time sign-in codes are emailed to the auditor directly; recipients here are not copied.', false, 31
WHERE NOT EXISTS (SELECT 1 FROM public.notification_rules WHERE event_key = 'compliance_auditor');
INSERT INTO public.notification_rules (event_key, label, module, description, attach_excel, sort_order)
SELECT 'compliance_auditor_activity', 'Auditor comments and decisions', 'Audit & Compliance', 'Sent to the checkpoint owner and SPOC when the auditor comments, requests information or changes a status. Recipients here get a copy.', false, 32
WHERE NOT EXISTS (SELECT 1 FROM public.notification_rules WHERE event_key = 'compliance_auditor_activity');
COMMIT;
