-- r98 (ITH-155..159): one sign-in method per person, MFA after Microsoft sign-in, 4-hour sessions, department names. Re-runnable.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_method text NOT NULL DEFAULT 'password';
-- people without an IT Hub password can only sign in with Microsoft
UPDATE public.users SET auth_method = 'm365' WHERE password_hash IS NULL AND auth_method = 'password';

-- users keep the department NAME (as shown in Masters), not the internal key ("it" → "Technology")
UPDATE public.users u SET department = m.label
FROM public.masters m
WHERE m.category = 'department' AND u.department IS NOT NULL AND u.department <> m.label
  AND (lower(u.department) = lower(m.key) OR lower(u.department) = lower(m.label))
  AND NOT EXISTS (SELECT 1 FROM public.masters x WHERE x.category = 'department' AND x.label = u.department);

-- sessions end after 4 hours (Admin › Settings › Session timeout). Applied ONCE (marker), so a later admin choice is kept.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.settings WHERE key = 'migr.r98.session4h') THEN
    INSERT INTO public.settings (key, value, description) VALUES ('auth.sessionTimeoutHours', '4', 'Session timeout in hours')
    ON CONFLICT (key) DO UPDATE SET value = '4';
    INSERT INTO public.settings (key, value, description) VALUES ('migr.r98.session4h', 'true', 'r98: session timeout set to 4 hours once');
  END IF;
END $$;

-- second step (emailed code) after Microsoft sign-in: off until switched on in Admin › Settings › Microsoft SSO
INSERT INTO public.settings (key, value, description) VALUES ('sso.mfaEmailOtp', 'false', 'Email a one-time code after Microsoft sign-in')
ON CONFLICT (key) DO NOTHING;
