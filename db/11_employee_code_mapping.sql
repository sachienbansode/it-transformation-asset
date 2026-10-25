-- IT Transformation Hub — migration 11: Employee Code is the key that links assets to people (internal or external).
-- Target DB: it-hub   Run as: root_admin. Re-runnable. Applied by deploy.sh.
BEGIN;
SET search_path TO public;

-- 1. User Master: tidy codes, then make them unique (case-insensitive). Duplicates are reported, not guessed.
UPDATE public.users SET employee_code = nullif(trim(employee_code), '') WHERE employee_code IS DISTINCT FROM nullif(trim(employee_code), '');
UPDATE public.users SET user_type = 'internal' WHERE user_type IS NULL OR user_type NOT IN ('internal', 'external');
DO $$
DECLARE dups text;
BEGIN
  SELECT string_agg(code || ' (' || n || ' users)', ', ') INTO dups
  FROM (SELECT lower(employee_code) AS code, count(*) AS n FROM public.users WHERE employee_code IS NOT NULL GROUP BY 1 HAVING count(*) > 1) d;
  IF dups IS NULL THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS users_employee_code_uq ON public.users (lower(employee_code)) WHERE employee_code IS NOT NULL';
  ELSE
    RAISE WARNING 'Duplicate employee codes in User Master — fix them, then re-run deploy: %', dups;
  END IF;
END $$;

-- 2. Handovers remember whether the holder is an internal or external person
ALTER TABLE public.asset_allocations ADD COLUMN IF NOT EXISTS holder_type text;
CREATE INDEX IF NOT EXISTS asset_allocations_emp_code_idx ON public.asset_allocations (lower(employee_code));
CREATE INDEX IF NOT EXISTS assets_owner_emp_code_idx ON public.assets (lower(owner_employee_code));

-- 3. Back-fill links: employee code ↔ user id, both directions
UPDATE public.asset_allocations a SET user_id = u.id
  FROM public.users u WHERE a.user_id IS NULL AND a.employee_code IS NOT NULL AND lower(u.employee_code) = lower(a.employee_code);
UPDATE public.asset_allocations a SET employee_code = u.employee_code
  FROM public.users u WHERE a.employee_code IS NULL AND a.user_id = u.id AND u.employee_code IS NOT NULL;
UPDATE public.asset_allocations a SET holder_type = u.user_type
  FROM public.users u WHERE a.holder_type IS NULL AND a.user_id = u.id;
UPDATE public.assets s SET owner_id = u.id
  FROM public.users u WHERE s.owner_id IS NULL AND s.owner_employee_code IS NOT NULL AND lower(u.employee_code) = lower(s.owner_employee_code);
UPDATE public.assets s SET owner_employee_code = u.employee_code
  FROM public.users u WHERE s.owner_employee_code IS NULL AND s.owner_id = u.id AND u.employee_code IS NOT NULL;

COMMIT;
