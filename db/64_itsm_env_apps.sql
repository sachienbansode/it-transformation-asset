-- 2.03 (ITH-173): environment (Dev / UAT / PROD) and affected applications on every ITSM ticket. Re-runnable.
ALTER TABLE public.itsm_incidents        ADD COLUMN IF NOT EXISTS environment text, ADD COLUMN IF NOT EXISTS affected_apps jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.itsm_service_requests ADD COLUMN IF NOT EXISTS environment text, ADD COLUMN IF NOT EXISTS affected_apps jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.itsm_problems         ADD COLUMN IF NOT EXISTS environment text, ADD COLUMN IF NOT EXISTS affected_apps jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.itsm_changes          ADD COLUMN IF NOT EXISTS environment text, ADD COLUMN IF NOT EXISTS affected_apps jsonb NOT NULL DEFAULT '[]'::jsonb;
-- the two lists (editable in Masters); only added when the list does not exist yet
INSERT INTO public.masters (category, key, label, sort_order, is_active, created_by)
SELECT v.cat, v.key, v.label, v.n, true, 'system'
FROM (VALUES ('itsm.environments', 'dev', 'Dev', 1), ('itsm.environments', 'uat', 'UAT', 2), ('itsm.environments', 'prod', 'PROD', 3),
             ('itsm.applications', 'bloomberg', 'Bloomberg', 1), ('itsm.applications', 'teravista_symphony', 'Teravista Symphony', 2), ('itsm.applications', 'kfin', 'KFIN', 3)) v(cat, key, label, n)
WHERE NOT EXISTS (SELECT 1 FROM public.masters m WHERE m.category = v.cat);
