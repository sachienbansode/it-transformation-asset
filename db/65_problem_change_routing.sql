-- 2.04 (ITH-176): problems and changes are routed like incidents and requests — category → team (assignment group),
-- assignee from that team, expected closure date, requester. Re-runnable.
ALTER TABLE public.itsm_problems ADD COLUMN IF NOT EXISTS team_id integer, ADD COLUMN IF NOT EXISTS subcategory text, ADD COLUMN IF NOT EXISTS requester_user_id integer,
  ADD COLUMN IF NOT EXISTS expected_closure_date date, ADD COLUMN IF NOT EXISTS first_response_at timestamptz, ADD COLUMN IF NOT EXISTS reported_by text, ADD COLUMN IF NOT EXISTS reporter_email text;
ALTER TABLE public.itsm_changes ADD COLUMN IF NOT EXISTS team_id integer, ADD COLUMN IF NOT EXISTS assigned_to text, ADD COLUMN IF NOT EXISTS assigned_group text, ADD COLUMN IF NOT EXISTS subcategory text, ADD COLUMN IF NOT EXISTS requester_user_id integer,
  ADD COLUMN IF NOT EXISTS expected_closure_date date, ADD COLUMN IF NOT EXISTS first_response_at timestamptz;

-- catalog rows for problems (10 working days) and changes (5 working days) from the category lists in Masters,
-- all mapped to IT Helpdesk (else the team that already gets most incident categories); only when none exist yet
DO $$
DECLARE tid int;
BEGIN
  SELECT id INTO tid FROM public.itsm_teams WHERE lower(name) = 'it helpdesk' AND is_active ORDER BY id LIMIT 1;
  IF tid IS NULL THEN SELECT team_id INTO tid FROM public.itsm_catalog WHERE team_id IS NOT NULL GROUP BY team_id ORDER BY count(*) DESC LIMIT 1; END IF;
  IF tid IS NULL THEN SELECT id INTO tid FROM public.itsm_teams WHERE is_active ORDER BY id LIMIT 1; END IF;
  IF tid IS NULL THEN RETURN; END IF;   -- no teams yet: the admin maps categories in ITSM Setup
  IF NOT EXISTS (SELECT 1 FROM public.itsm_catalog WHERE ticket_type = 'Problem') THEN
    INSERT INTO public.itsm_catalog (ticket_type, category, subcategory, team_id, resolution_days, sort_order, is_active, updated_by)
    SELECT 'Problem', l.label, NULL, tid, 10, row_number() OVER (ORDER BY l.o), true, 'system'
    FROM (SELECT label, CASE WHEN lower(label) IN ('others', 'other') THEN 999 ELSE sort_order END AS o FROM public.masters WHERE category = 'itsm.problemCategories' AND is_active
          UNION SELECT x, n FROM unnest(ARRAY['Application', 'Infrastructure', 'Network', 'Hardware', 'Security', 'Process', 'Database', 'Cloud', 'Operations', 'Others']) WITH ORDINALITY AS d(x, n)
            WHERE NOT EXISTS (SELECT 1 FROM public.masters WHERE category = 'itsm.problemCategories')) l
    ON CONFLICT DO NOTHING;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.itsm_catalog WHERE ticket_type = 'Change Request') THEN
    INSERT INTO public.itsm_catalog (ticket_type, category, subcategory, team_id, resolution_days, sort_order, is_active, updated_by)
    SELECT 'Change Request', l.label, NULL, tid, 5, row_number() OVER (ORDER BY l.o), true, 'system'
    FROM (SELECT label, CASE WHEN lower(label) IN ('others', 'other') THEN 999 ELSE sort_order END AS o FROM public.masters WHERE category = 'itsm.changeCategories' AND is_active
          UNION SELECT x, n FROM unnest(ARRAY['Software', 'Hardware', 'Network', 'Security', 'Process', 'Infrastructure', 'Database', 'Cloud', 'End-User', 'Others']) WITH ORDINALITY AS d(x, n)
            WHERE NOT EXISTS (SELECT 1 FROM public.masters WHERE category = 'itsm.changeCategories')) l
    ON CONFLICT DO NOTHING;
  END IF;
  -- existing problems / changes: link them to the team of their assigned group (or of their category)
  UPDATE public.itsm_problems p SET team_id = coalesce((SELECT id FROM public.itsm_teams t WHERE lower(t.name) = lower(p.assigned_group) LIMIT 1),
    (SELECT team_id FROM public.itsm_catalog c WHERE c.ticket_type = 'Problem' AND lower(c.category) = lower(p.category) AND c.subcategory IS NULL LIMIT 1), tid) WHERE p.team_id IS NULL;
  UPDATE public.itsm_changes p SET team_id = coalesce((SELECT team_id FROM public.itsm_catalog c WHERE c.ticket_type = 'Change Request' AND lower(c.category) = lower(p.category) AND c.subcategory IS NULL LIMIT 1), tid) WHERE p.team_id IS NULL;
  UPDATE public.itsm_problems p SET assigned_group = t.name FROM public.itsm_teams t WHERE t.id = p.team_id AND p.assigned_group IS DISTINCT FROM t.name;
  UPDATE public.itsm_changes p SET assigned_group = t.name FROM public.itsm_teams t WHERE t.id = p.team_id AND p.assigned_group IS DISTINCT FROM t.name;
END $$;
