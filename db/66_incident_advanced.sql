-- 2.05 (ITH-179..182): advanced incidents — priority from impact × urgency, major incident (bridge, stakeholder updates),
-- parent / child incidents, problem from repeat incidents. Re-runnable.
ALTER TABLE public.itsm_incidents ADD COLUMN IF NOT EXISTS is_major boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS major_declared_at timestamptz, ADD COLUMN IF NOT EXISTS major_declared_by text, ADD COLUMN IF NOT EXISTS major_reason text,
  ADD COLUMN IF NOT EXISTS major_bridge text, ADD COLUMN IF NOT EXISTS major_ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS parent_incident_id integer, ADD COLUMN IF NOT EXISTS priority_manual boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS itsm_incidents_parent ON public.itsm_incidents (parent_incident_id) WHERE parent_incident_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.itsm_major_updates (
  id          serial PRIMARY KEY,
  incident_id integer NOT NULL,
  kind        text NOT NULL DEFAULT 'update',   -- declared | update | ended
  message     text NOT NULL,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS itsm_major_updates_inc ON public.itsm_major_updates (incident_id, created_at);

-- priority matrix (Admin › ITSM settings): impact (rows) × urgency (columns) → priority
INSERT INTO public.settings (key, value) VALUES ('itsm.priorityMatrix', '{
  "Enterprise-wide": {"Critical": "Critical", "High": "Critical", "Medium": "High",   "Low": "Medium"},
  "Department":      {"Critical": "Critical", "High": "High",     "Medium": "Medium", "Low": "Medium"},
  "Team":            {"Critical": "High",     "High": "High",     "Medium": "Medium", "Low": "Low"},
  "Individual":      {"Critical": "High",     "High": "Medium",   "Medium": "Low",    "Low": "Low"}}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- email alerts for major incidents (recipients / templates editable in ITSM Setup › Email alerts)
INSERT INTO public.itsm_email_rules (event_key, label, description, sort_order, to_requester, to_assignee, to_team, to_lead, to_escalation1, to_escalation2, to_admins, subject, body) VALUES
 ('major_declared', 'Major incident declared', 'Sent when an incident is declared a major incident', 11, false, true, true, true, true, true, true,
  'MAJOR INCIDENT {{no}} — {{title}}',
  '<p><b style="color:#b91c1c">A major incident has been declared.</b></p><p>{{reason}}</p>{{details}}<p>Bridge / war room: {{bridge}}</p><p><a href="{{link}}">Open {{no}}</a></p>'),
 ('major_update', 'Major incident update', 'Each stakeholder update on a major incident', 12, true, true, true, true, true, true, true,
  'Update on major incident {{no}} — {{title}}',
  '<p><b>Update:</b> {{reason}}</p><p>Status: <b>{{status}}</b> · with {{assignee}} ({{team}})</p><p>Bridge / war room: {{bridge}}</p><p><a href="{{link}}">Open {{no}}</a></p>'),
 ('major_ended', 'Major incident stood down', 'When the major incident is over', 13, true, true, true, true, true, true, true,
  'Major incident {{no}} stood down — {{title}}',
  '<p>The major incident <b>{{no}}</b> has been stood down.</p><p>{{reason}}</p>{{details}}<p><a href="{{link}}">Open {{no}}</a></p>')
ON CONFLICT (event_key) DO NOTHING;
