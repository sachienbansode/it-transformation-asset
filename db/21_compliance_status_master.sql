-- Audit & Compliance: checkpoint status master (Admin › Master Data › Audit & Compliance), audit start date,
-- auto-share on Submitted. Safe to re-run.
BEGIN;

CREATE TABLE IF NOT EXISTS public.cmp_statuses (
  name        text PRIMARY KEY,
  stage       text NOT NULL CHECK (stage IN ('team', 'auditor')),                                  -- who sets it
  grp         text NOT NULL CHECK (grp IN ('pending', 'inprog', 'submitted', 'review', 'closed')), -- dashboard bucket; closed = counts as closure
  color       text NOT NULL DEFAULT 'slate',
  sort_order  int  NOT NULL DEFAULT 100,
  is_active   boolean NOT NULL DEFAULT true,
  is_system   boolean NOT NULL DEFAULT false,   -- built-in statuses the workflow depends on: cannot be removed
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.cmp_statuses (name, stage, grp, color, sort_order, is_system, description) VALUES
  ('Pending',          'team',    'pending',   'slate',   10, true, 'Not started'),
  ('In Progress',      'team',    'inprog',    'blue',    20, true, 'Team is working on it, or the auditor asked for more information'),
  ('Submitted',        'team',    'submitted', 'indigo',  30, true, 'Reply and evidence ready for the auditor'),
  ('Under Review',     'auditor', 'review',    'amber',   40, true, 'Auditor is reviewing'),
  ('Partially Closed', 'auditor', 'inprog',    'cyan',    50, true, 'Auditor accepted part of it'),
  ('Closed',           'auditor', 'closed',    'emerald', 60, true, 'Auditor closed it'),
  ('Closed-Obs',       'auditor', 'closed',    'teal',    70, true, 'Closed with an observation'),
  ('Not Applicable',   'auditor', 'closed',    'zinc',    80, true, 'Not applicable to this entity')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.cmp_audits ADD COLUMN IF NOT EXISTS start_date date;

-- Submitted checkpoints are shared with the auditor automatically (Admin › Master Data › Audit & Compliance can switch it off)
INSERT INTO public.settings (key, value, description)
VALUES ('compliance.autoShareOnSubmit', 'true'::jsonb, 'Share a checkpoint with the auditor as soon as it is Submitted')
ON CONFLICT (key) DO NOTHING;

COMMIT;
