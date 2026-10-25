-- IT Transformation Hub — migration 16: ITSM teams (assignment groups with members), category / sub-category
-- catalog with routing and expected-closure days, ticket fields for routing. Target DB: it-hub. Re-runnable.
BEGIN;
SET search_path TO public;

CREATE TABLE IF NOT EXISTS public.itsm_teams (
  id           serial PRIMARY KEY,
  name         text NOT NULL,
  description  text,
  email        text,                       -- optional team mailbox (also emailed on new tickets)
  lead_user_id integer,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS itsm_teams_name_uq ON public.itsm_teams (lower(name));

CREATE TABLE IF NOT EXISTS public.itsm_team_members (
  team_id  integer NOT NULL REFERENCES public.itsm_teams(id) ON DELETE CASCADE,
  user_id  integer NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX IF NOT EXISTS itsm_team_members_user_idx ON public.itsm_team_members (user_id);

-- Catalog: a category row (subcategory NULL) holds the team and days; a sub-category row may override them.
CREATE TABLE IF NOT EXISTS public.itsm_catalog (
  id              serial PRIMARY KEY,
  ticket_type     text NOT NULL,               -- Incident | Service Request
  category        text NOT NULL,
  subcategory     text,
  team_id         integer REFERENCES public.itsm_teams(id),
  resolution_days integer,                     -- business days (Mon–Fri); NULL = default T+2
  sort_order      integer NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  updated_by      text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS itsm_catalog_uq ON public.itsm_catalog (ticket_type, lower(category), lower(coalesce(subcategory, '')));

-- Ticket routing fields
ALTER TABLE public.itsm_service_requests ADD COLUMN IF NOT EXISTS subcategory           text;
ALTER TABLE public.itsm_service_requests ADD COLUMN IF NOT EXISTS team_id               integer;
ALTER TABLE public.itsm_service_requests ADD COLUMN IF NOT EXISTS requester_user_id     integer;
ALTER TABLE public.itsm_service_requests ADD COLUMN IF NOT EXISTS expected_closure_date date;
ALTER TABLE public.itsm_service_requests ADD COLUMN IF NOT EXISTS first_response_at     timestamptz;
ALTER TABLE public.itsm_incidents        ADD COLUMN IF NOT EXISTS team_id               integer;
ALTER TABLE public.itsm_incidents        ADD COLUMN IF NOT EXISTS requester_user_id     integer;
ALTER TABLE public.itsm_incidents        ADD COLUMN IF NOT EXISTS expected_closure_date date;
ALTER TABLE public.itsm_incidents        ADD COLUMN IF NOT EXISTS first_response_at     timestamptz;
-- "Due date" on service requests becomes the expected closure date
UPDATE public.itsm_service_requests SET expected_closure_date = due_date::date WHERE expected_closure_date IS NULL AND due_date ~ '^\d{4}-\d{2}-\d{2}$';

-- Teams: defaults + any IT groups already configured in Settings
INSERT INTO public.itsm_teams (name) SELECT v FROM unnest(ARRAY['IT Helpdesk', 'Infrastructure Team', 'Network Team', 'Security Team', 'Applications Team', 'Database Team', 'Cloud Team', 'Desktop Support', 'Development Team', 'Operations Team']) AS v
  WHERE NOT EXISTS (SELECT 1 FROM public.itsm_teams t WHERE lower(t.name) = lower(v));
INSERT INTO public.itsm_teams (name)
  SELECT DISTINCT g FROM public.settings s, jsonb_array_elements_text(CASE WHEN jsonb_typeof(s.value) = 'string' THEN (s.value #>> '{}')::jsonb ELSE s.value END) AS g
  WHERE s.key = 'itsm.itGroups' AND NOT EXISTS (SELECT 1 FROM public.itsm_teams t WHERE lower(t.name) = lower(g));

-- Catalog seed (only when empty)
INSERT INTO public.itsm_catalog (ticket_type, category, subcategory, team_id, resolution_days, sort_order)
SELECT v.tt, v.cat, v.sub, (SELECT id FROM public.itsm_teams WHERE lower(name) = lower(v.team)), v.days, v.so
FROM (VALUES
  ('Service Request', 'Access Request', NULL, 'Security Team', NULL, 0),
  ('Service Request', 'Access Request', 'Application access', NULL, NULL, 1),
  ('Service Request', 'Access Request', 'Shared folder access', NULL, NULL, 2),
  ('Service Request', 'Access Request', 'Admin rights', NULL, NULL, 3),
  ('Service Request', 'Access Request', 'Remove access', NULL, NULL, 4),
  ('Service Request', 'Software Install', NULL, 'IT Helpdesk', 3, 10),
  ('Service Request', 'Software Install', 'Standard software', NULL, NULL, 11),
  ('Service Request', 'Software Install', 'Licensed software', NULL, NULL, 12),
  ('Service Request', 'Software Install', 'Browser plug-in', NULL, NULL, 13),
  ('Service Request', 'Hardware Request', NULL, 'Desktop Support', 5, 20),
  ('Service Request', 'Hardware Request', 'Laptop / Desktop', NULL, NULL, 21),
  ('Service Request', 'Hardware Request', 'Monitor', NULL, NULL, 22),
  ('Service Request', 'Hardware Request', 'Keyboard / Mouse', NULL, NULL, 23),
  ('Service Request', 'Hardware Request', 'Headset', NULL, NULL, 24),
  ('Service Request', 'Hardware Request', 'Docking station', NULL, NULL, 25),
  ('Service Request', 'Account Setup', NULL, 'IT Helpdesk', NULL, 30),
  ('Service Request', 'Account Setup', 'New user ID', NULL, NULL, 31),
  ('Service Request', 'Account Setup', 'Email ID', NULL, NULL, 32),
  ('Service Request', 'Account Setup', 'Domain account unlock', NULL, NULL, 33),
  ('Service Request', 'Password Reset', NULL, 'IT Helpdesk', 1, 40),
  ('Service Request', 'Password Reset', 'Windows / domain', NULL, NULL, 41),
  ('Service Request', 'Password Reset', 'Email', NULL, NULL, 42),
  ('Service Request', 'Password Reset', 'Application', NULL, NULL, 43),
  ('Service Request', 'VPN Access', NULL, 'Network Team', NULL, 50),
  ('Service Request', 'VPN Access', 'New VPN access', NULL, NULL, 51),
  ('Service Request', 'VPN Access', 'VPN token issue', NULL, NULL, 52),
  ('Service Request', 'Email Setup', NULL, 'IT Helpdesk', NULL, 60),
  ('Service Request', 'Email Setup', 'Distribution list', NULL, NULL, 61),
  ('Service Request', 'Email Setup', 'Shared mailbox', NULL, NULL, 62),
  ('Service Request', 'Email Setup', 'Mailbox size increase', NULL, NULL, 63),
  ('Service Request', 'Mobile Device', NULL, 'Desktop Support', NULL, 70),
  ('Service Request', 'Mobile Device', 'Email on mobile', NULL, NULL, 71),
  ('Service Request', 'Mobile Device', 'Company mobile', NULL, NULL, 72),
  ('Service Request', 'Printer Setup', NULL, 'Desktop Support', NULL, 80),
  ('Service Request', 'Printer Setup', 'Add printer', NULL, NULL, 81),
  ('Service Request', 'Printer Setup', 'Scanner setup', NULL, NULL, 82),
  ('Service Request', 'Data Export / Report', NULL, 'Applications Team', NULL, 90),
  ('Service Request', 'Data Export / Report', 'One-time report', NULL, NULL, 91),
  ('Service Request', 'Data Export / Report', 'Data extract', NULL, NULL, 92),
  ('Service Request', 'New Joinee Onboarding', NULL, 'IT Helpdesk', 3, 100),
  ('Service Request', 'New Joinee Onboarding', 'IT kit and accounts', NULL, NULL, 101),
  ('Service Request', 'Offboarding / Exit', NULL, 'IT Helpdesk', NULL, 110),
  ('Service Request', 'Offboarding / Exit', 'Access removal and asset return', NULL, NULL, 111),
  ('Service Request', 'Other', NULL, 'IT Helpdesk', NULL, 120),
  ('Incident', 'Application', NULL, 'Applications Team', NULL, 0),
  ('Incident', 'Application', 'Performance', NULL, NULL, 1),
  ('Incident', 'Application', 'Error / Exception', NULL, NULL, 2),
  ('Incident', 'Application', 'Access Denied', NULL, NULL, 3),
  ('Incident', 'Application', 'Data Issue', NULL, NULL, 4),
  ('Incident', 'Application', 'Integration Failure', NULL, NULL, 5),
  ('Incident', 'Infrastructure', NULL, 'Infrastructure Team', 1, 10),
  ('Incident', 'Infrastructure', 'Server Down', NULL, NULL, 11),
  ('Incident', 'Infrastructure', 'Disk Space', NULL, NULL, 12),
  ('Incident', 'Infrastructure', 'CPU / Memory', NULL, NULL, 13),
  ('Incident', 'Infrastructure', 'Backup Failure', NULL, NULL, 14),
  ('Incident', 'Infrastructure', 'VM / Container Issue', NULL, NULL, 15),
  ('Incident', 'Infrastructure', 'Storage', NULL, NULL, 16),
  ('Incident', 'Network', NULL, 'Network Team', 1, 20),
  ('Incident', 'Network', 'Connectivity', NULL, NULL, 21),
  ('Incident', 'Network', 'DNS', NULL, NULL, 22),
  ('Incident', 'Network', 'VPN', NULL, NULL, 23),
  ('Incident', 'Network', 'Firewall', NULL, NULL, 24),
  ('Incident', 'Network', 'WiFi', NULL, NULL, 25),
  ('Incident', 'Network', 'Bandwidth', NULL, NULL, 26),
  ('Incident', 'Hardware', NULL, 'Desktop Support', NULL, 30),
  ('Incident', 'Hardware', 'Printer', NULL, NULL, 31),
  ('Incident', 'Hardware', 'Laptop / Desktop', NULL, NULL, 32),
  ('Incident', 'Hardware', 'Monitor', NULL, NULL, 33),
  ('Incident', 'Hardware', 'Peripherals', NULL, NULL, 34),
  ('Incident', 'Hardware', 'Battery / Power', NULL, NULL, 35),
  ('Incident', 'Security', NULL, 'Security Team', 1, 40),
  ('Incident', 'Security', 'Phishing', NULL, NULL, 41),
  ('Incident', 'Security', 'Malware', NULL, NULL, 42),
  ('Incident', 'Security', 'Unauthorized Access', NULL, NULL, 43),
  ('Incident', 'Security', 'Data Leak', NULL, NULL, 44),
  ('Incident', 'Security', 'Vulnerability', NULL, NULL, 45),
  ('Incident', 'Security', 'MFA Issue', NULL, NULL, 46),
  ('Incident', 'Database', NULL, 'Database Team', NULL, 50),
  ('Incident', 'Database', 'Slow Query', NULL, NULL, 51),
  ('Incident', 'Database', 'Connection Failure', NULL, NULL, 52),
  ('Incident', 'Database', 'Corruption', NULL, NULL, 53),
  ('Incident', 'Database', 'Backup', NULL, NULL, 54),
  ('Incident', 'Database', 'Replication Lag', NULL, NULL, 55),
  ('Incident', 'Cloud', NULL, 'Cloud Team', NULL, 60),
  ('Incident', 'Cloud', 'Instance Down', NULL, NULL, 61),
  ('Incident', 'Cloud', 'Storage', NULL, NULL, 62),
  ('Incident', 'Cloud', 'Permissions', NULL, NULL, 63),
  ('Incident', 'Cloud', 'Auto-scaling', NULL, NULL, 64),
  ('Incident', 'Cloud', 'Cost Alert', NULL, NULL, 65),
  ('Incident', 'End-User', NULL, 'IT Helpdesk', NULL, 70),
  ('Incident', 'End-User', 'Outlook / Email', NULL, NULL, 71),
  ('Incident', 'End-User', 'Teams', NULL, NULL, 72),
  ('Incident', 'End-User', 'SharePoint', NULL, NULL, 73),
  ('Incident', 'End-User', 'Printing', NULL, NULL, 74),
  ('Incident', 'End-User', 'Account Lock', NULL, NULL, 75),
  ('Incident', 'Operations', NULL, 'Operations Team', NULL, 80),
  ('Incident', 'Operations', 'Scheduled Job', NULL, NULL, 81),
  ('Incident', 'Operations', 'Maintenance', NULL, NULL, 82),
  ('Incident', 'Operations', 'Deployment', NULL, NULL, 83),
  ('Incident', 'Operations', 'Monitoring Alert', NULL, NULL, 84)
) AS v(tt, cat, sub, team, days, so)
WHERE NOT EXISTS (SELECT 1 FROM public.itsm_catalog);

-- Existing tickets: link to the team by name
UPDATE public.itsm_service_requests r SET team_id = t.id FROM public.itsm_teams t WHERE r.team_id IS NULL AND lower(r.assigned_group) = lower(t.name);
UPDATE public.itsm_incidents        r SET team_id = t.id FROM public.itsm_teams t WHERE r.team_id IS NULL AND lower(r.assigned_group) = lower(t.name);

INSERT INTO public.notification_rules (event_key, label, module, description, attach_excel, sort_order)
SELECT 'itsm_tickets', 'ITSM new tickets / transfers (copy)', 'ITSM', 'Copy of new-ticket and team-transfer emails. Team members and assignees are emailed directly anyway.', false, 21
WHERE NOT EXISTS (SELECT 1 FROM public.notification_rules WHERE event_key = 'itsm_tickets');
COMMIT;
