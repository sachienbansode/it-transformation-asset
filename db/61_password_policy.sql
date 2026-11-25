-- r99 (ITH-160): password policy set by the Super Admin (Admin › Settings › Password policy). Re-runnable.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_history jsonb NOT NULL DEFAULT '[]'::jsonb;
-- start the expiry clock today for passwords that have no change date yet (so nobody is forced to change at once)
UPDATE public.users SET password_changed_at = now() WHERE password_changed_at IS NULL AND password_hash IS NOT NULL;
INSERT INTO public.settings (key, value, description) VALUES ('auth.passwordPolicy',
  '{"minLength":12,"upper":true,"lower":true,"number":true,"symbol":true,"notEmailName":true,"expiryDays":90,"history":3}',
  'Password policy: length, character types, expiry (days, 0 = never), remembered passwords')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description
  WHERE jsonb_typeof(public.settings.value::jsonb) <> 'object';   -- replaces only the old text description, never a saved policy
