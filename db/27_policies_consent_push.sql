-- Policies & notices with versioned, recorded acceptance (mandatory / optional), and browser push notifications.
-- Re-runnable.
BEGIN;

CREATE TABLE IF NOT EXISTS public.policies (
  id            serial PRIMARY KEY,
  code          text NOT NULL UNIQUE,                    -- short id, e.g. POL-0001 or AGENT-NOTICE
  title         text NOT NULL,
  category      text NOT NULL DEFAULT 'Policy' CHECK (category IN ('Policy', 'Notice', 'Consent')),
  body          text NOT NULL DEFAULT '',
  requirement   text NOT NULL DEFAULT 'Mandatory' CHECK (requirement IN ('Mandatory', 'Optional', 'Information')),
  audience      jsonb NOT NULL DEFAULT '{"all": true}'::jsonb,   -- {all} | {roles:[ids], departments:[], userTypes:[]}
  due_days      int  NOT NULL DEFAULT 7,                 -- mandatory: app is locked this many days after publishing if not accepted
  allow_withdraw boolean NOT NULL DEFAULT true,          -- optional consents can be withdrawn later
  push          boolean NOT NULL DEFAULT true,           -- notify users when published (in-app + email + push)
  status        text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Published', 'Retired')),
  version       int  NOT NULL DEFAULT 0,                 -- current published version
  published_at  timestamptz,
  published_by  text,
  system_key    text UNIQUE,                             -- built-in policies used by modules (e.g. 'device_agent')
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.policy_versions (
  policy_id     int NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
  version       int NOT NULL,
  title         text NOT NULL,
  body          text NOT NULL,
  body_sha256   text NOT NULL,
  requirement   text NOT NULL,
  change_note   text,
  published_at  timestamptz NOT NULL DEFAULT now(),
  published_by  text,
  PRIMARY KEY (policy_id, version)
);

-- Every decision is kept (append-only): accepted, declined, withdrawn — with the exact version text hash, time, IP and device.
CREATE TABLE IF NOT EXISTS public.policy_acceptances (
  id           bigserial PRIMARY KEY,
  policy_id    int NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
  version      int NOT NULL,
  user_id      int NOT NULL,
  decision     text NOT NULL CHECK (decision IN ('Accepted', 'Declined', 'Withdrawn')),
  body_sha256  text NOT NULL,
  method       text NOT NULL DEFAULT 'web',             -- web / agent-link / admin-recorded
  ip           text,
  user_agent   text,
  note         text,
  at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS policy_acceptances_user ON public.policy_acceptances (user_id, policy_id, at DESC);
CREATE INDEX IF NOT EXISTS policy_acceptances_policy ON public.policy_acceptances (policy_id, version);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           serial PRIMARY KEY,
  user_id      int NOT NULL,
  endpoint     text NOT NULL UNIQUE,
  p256dh       text NOT NULL,
  auth         text NOT NULL,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_ok_at   timestamptz,
  failures     int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user ON public.push_subscriptions (user_id);

INSERT INTO public.settings (key, value, description) VALUES
  ('push.enabled', 'true'::jsonb, 'Browser push notifications (users opt in per device)'),
  ('push.lastNotificationId', '0'::jsonb, 'Last in-app notification already pushed (internal)')
ON CONFLICT (key) DO NOTHING;

-- Built-in notice: device health agent (accepted before the personal installer downloads)
INSERT INTO public.policies (code, title, category, body, requirement, audience, due_days, allow_withdraw, push, status, version, published_at, published_by, system_key, created_by)
SELECT 'AGENT-NOTICE', 'IT Hub device agent — monitoring notice', 'Notice',
'IT installs the IT Hub device agent on company computers to keep them healthy and secure, and to manage IT assets.

What it records:
• Computer health: CPU, memory and disk use, disk and battery health, antivirus, encryption, firewall and Windows update status.
• Installed software (once a day).
• Daily usage: the signed-in user, first and last activity, active and idle minutes, and minutes per application in use (application name only).

What it does NOT record: keystrokes, screenshots, window titles, websites visited, e-mails, messages or the content of any file.

Why: to fix problems before they affect your work, keep devices secure and patched, plan replacements and re-assign unused devices.
Who can see it: IT administrators only. Data is kept for 180 days. You can ask IT what is held about your device at any time.',
'Mandatory', '{"all": false, "agentUsers": true}'::jsonb, 7, false, false, 'Published', 1, now(), 'System', 'device_agent', 'System'
WHERE NOT EXISTS (SELECT 1 FROM public.policies WHERE system_key = 'device_agent');
INSERT INTO public.policy_versions (policy_id, version, title, body, body_sha256, requirement, change_note, published_by)
SELECT p.id, 1, p.title, p.body, encode(sha256(convert_to(p.body, 'UTF8')), 'hex'), p.requirement, 'Initial version', 'System'
FROM public.policies p WHERE p.system_key = 'device_agent' AND NOT EXISTS (SELECT 1 FROM public.policy_versions v WHERE v.policy_id = p.id);

COMMIT;
