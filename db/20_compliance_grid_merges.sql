-- Audit & Compliance: keep merged-cell layout of schedule sheets (filled in automatically from the uploaded workbook)
BEGIN;
ALTER TABLE public.cmp_template_grids ADD COLUMN IF NOT EXISTS merges jsonb;
ALTER TABLE public.cmp_grids ADD COLUMN IF NOT EXISTS merges jsonb;
COMMIT;
