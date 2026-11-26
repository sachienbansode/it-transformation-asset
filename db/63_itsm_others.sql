-- 2.03 (ITH-171): "Others" in every ITSM category list and under every category that has sub-categories. Re-runnable.
BEGIN;
-- incidents and service requests are routed by the catalog: "Other" becomes "Others"; add "Others" where missing
UPDATE public.itsm_catalog c SET category = 'Others', updated_at = now()
WHERE lower(c.category) = 'other' AND NOT EXISTS (SELECT 1 FROM public.itsm_catalog x WHERE x.ticket_type = c.ticket_type AND lower(x.category) = 'others');
UPDATE public.itsm_catalog c SET subcategory = 'Others', updated_at = now()
WHERE lower(c.subcategory) = 'other' AND NOT EXISTS (SELECT 1 FROM public.itsm_catalog x WHERE x.ticket_type = c.ticket_type AND lower(x.category) = lower(c.category) AND lower(x.subcategory) = 'others');

-- "Others" category → the IT Helpdesk team (else the team that gets the most categories)
INSERT INTO public.itsm_catalog (ticket_type, category, subcategory, team_id, sort_order, is_active, updated_by)
SELECT t.ticket_type, 'Others', NULL,
  coalesce((SELECT id FROM public.itsm_teams WHERE lower(name) = 'it helpdesk' AND is_active ORDER BY id LIMIT 1),
           (SELECT team_id FROM public.itsm_catalog WHERE ticket_type = t.ticket_type AND team_id IS NOT NULL GROUP BY team_id ORDER BY count(*) DESC LIMIT 1)),
  999, true, 'system'
FROM (SELECT DISTINCT ticket_type FROM public.itsm_catalog) t
WHERE NOT EXISTS (SELECT 1 FROM public.itsm_catalog x WHERE x.ticket_type = t.ticket_type AND lower(x.category) = 'others' AND x.subcategory IS NULL);

-- "Others" sub-category under every category that has sub-categories (team / days come from the category)
INSERT INTO public.itsm_catalog (ticket_type, category, subcategory, team_id, sort_order, is_active, updated_by)
SELECT DISTINCT c.ticket_type, c.category, 'Others', NULL::integer, 999, true, 'system'
FROM public.itsm_catalog c
WHERE c.subcategory IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.itsm_catalog x WHERE x.ticket_type = c.ticket_type AND lower(x.category) = lower(c.category) AND lower(x.subcategory) = 'others');

-- problem / change / service-request / incident category lists (Masters): add "Others" where the list exists
INSERT INTO public.masters (category, key, label, sort_order, is_active, created_by)
SELECT l.category, 'others', 'Others', 999, true, 'system'
FROM (SELECT DISTINCT category FROM public.masters WHERE category IN ('itsm.problemCategories', 'itsm.changeCategories', 'itsm.srCategories', 'itsm.incidentCategories')) l
WHERE NOT EXISTS (SELECT 1 FROM public.masters m WHERE m.category = l.category AND lower(m.label) IN ('others', 'other'));
COMMIT;
