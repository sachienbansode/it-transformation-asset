-- Roles: ITSM Admin (whole ITSM module) and ITSM Agent; device health items keep the note of the report that cleared them. Re-runnable.
BEGIN;
ALTER TABLE public.asset_agent_alerts ADD COLUMN IF NOT EXISTS closed_note text;

INSERT INTO public.roles (name, description, default_dashboard) VALUES
  ('ITSM Admin', 'Whole ITSM module: incidents, requests, problems, changes, knowledge base, SLA, approvals, setup. Re-opens closed tickets. Sees all support chats.', '/itsm'),
  ('ITSM Agent', 'Works tickets (incidents, requests, problems, changes), writes knowledge articles, starts and sees support chats.', '/itsm')
ON CONFLICT (name) DO NOTHING;

-- ITSM Admin: admin on every ITSM module, read on assets (to see the device behind a ticket)
INSERT INTO public.role_permissions (role_id, module, access_level)
SELECT r.id, m.module, m.level FROM public.roles r
CROSS JOIN (VALUES ('itsm_dashboard','admin'),('itsm_incidents','admin'),('itsm_problems','admin'),('itsm_changes','admin'),('itsm_kb','admin'),
                   ('itsm_sla','admin'),('itsm_requests','admin'),('itsm_approval','admin'),('itsm_setup','admin'),('assets','read'),('asset_registry','read')) AS m(module, level)
WHERE r.name = 'ITSM Admin' AND NOT EXISTS (SELECT 1 FROM public.role_permissions p WHERE p.role_id = r.id AND p.module = m.module);

-- ITSM Agent: write on ticket modules, read on setup screens
INSERT INTO public.role_permissions (role_id, module, access_level)
SELECT r.id, m.module, m.level FROM public.roles r
CROSS JOIN (VALUES ('itsm_dashboard','read'),('itsm_incidents','write'),('itsm_problems','write'),('itsm_changes','write'),('itsm_kb','write'),
                   ('itsm_sla','read'),('itsm_requests','write'),('itsm_approval','read'),('assets','read'),('asset_registry','read')) AS m(module, level)
WHERE r.name = 'ITSM Agent' AND NOT EXISTS (SELECT 1 FROM public.role_permissions p WHERE p.role_id = r.id AND p.module = m.module);
COMMIT;
