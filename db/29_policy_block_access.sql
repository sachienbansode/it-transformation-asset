-- Policies: explicit option to halt IT Hub access for people who have not accepted a mandatory policy / notice. Re-runnable.
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS block_access boolean NOT NULL DEFAULT true;
