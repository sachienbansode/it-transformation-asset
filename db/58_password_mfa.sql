-- r94 (ITH-146/147): change own password, temporary passwords, two-step sign-in by authenticator app or emailed code. Re-runnable.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;
-- the first Super Admin created on a new server has a generated password: change it at first sign-in
UPDATE public.users SET must_change_password = true
WHERE designation LIKE 'Initial Super Admin%' AND password_changed_at IS NULL AND must_change_password = false AND password_hash IS NOT NULL;
-- alerts for the new emails show up in Admin › Email, alerts & archive like any other email
INSERT INTO public.settings (key, value, description) VALUES
  ('auth.passwordPolicy', '"12+ characters with upper and lower case, a number and a symbol"', 'Password rule shown to users (enforced by the app)')
ON CONFLICT (key) DO NOTHING;

-- every IT Hub needs at least the IT department (the first Super Admin is in it); blank clients add their own departments
INSERT INTO public.masters (category, key, label, sort_order, is_active, created_by)
SELECT 'department', 'it', 'IT', 0, true, 'system'
WHERE NOT EXISTS (SELECT 1 FROM public.masters WHERE category = 'department' AND key = 'it');
