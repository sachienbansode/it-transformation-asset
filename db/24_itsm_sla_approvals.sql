-- ITSM: SLA engine (response + resolution targets, business hours, pause on hold), SLA alerts,
-- approval reminders / escalation / delegation, KB link on incidents. Re-runnable.
BEGIN;

-- SLA tracking on incidents and service requests
ALTER TABLE public.itsm_incidents        ADD COLUMN IF NOT EXISTS response_due_at timestamptz;
ALTER TABLE public.itsm_incidents        ADD COLUMN IF NOT EXISTS sla_paused_at timestamptz;
ALTER TABLE public.itsm_incidents        ADD COLUMN IF NOT EXISTS sla_paused_mins int NOT NULL DEFAULT 0;
ALTER TABLE public.itsm_incidents        ADD COLUMN IF NOT EXISTS sla_warn_sent_at timestamptz;
ALTER TABLE public.itsm_incidents        ADD COLUMN IF NOT EXISTS sla_breach_sent_at timestamptz;
ALTER TABLE public.itsm_incidents        ADD COLUMN IF NOT EXISTS response_breach_sent_at timestamptz;
ALTER TABLE public.itsm_incidents        ADD COLUMN IF NOT EXISTS kb_article_id int;

ALTER TABLE public.itsm_service_requests ADD COLUMN IF NOT EXISTS sla_id int;
ALTER TABLE public.itsm_service_requests ADD COLUMN IF NOT EXISTS sla_breach_at timestamptz;
ALTER TABLE public.itsm_service_requests ADD COLUMN IF NOT EXISTS response_due_at timestamptz;
ALTER TABLE public.itsm_service_requests ADD COLUMN IF NOT EXISTS sla_paused_at timestamptz;
ALTER TABLE public.itsm_service_requests ADD COLUMN IF NOT EXISTS sla_paused_mins int NOT NULL DEFAULT 0;
ALTER TABLE public.itsm_service_requests ADD COLUMN IF NOT EXISTS sla_warn_sent_at timestamptz;
ALTER TABLE public.itsm_service_requests ADD COLUMN IF NOT EXISTS sla_breach_sent_at timestamptz;
ALTER TABLE public.itsm_service_requests ADD COLUMN IF NOT EXISTS response_breach_sent_at timestamptz;

-- Open tickets already waiting (On Hold / Pending Approval) start paused from now
UPDATE public.itsm_incidents        SET sla_paused_at = now() WHERE is_active AND sla_paused_at IS NULL AND status IN ('On Hold', 'Pending Approval');
UPDATE public.itsm_service_requests SET sla_paused_at = now() WHERE is_active AND sla_paused_at IS NULL AND status IN ('On Hold', 'Pending Approval');

-- Approval reminders / escalation
ALTER TABLE public.itsm_approvals ADD COLUMN IF NOT EXISTS reminder_count int NOT NULL DEFAULT 0;
ALTER TABLE public.itsm_approvals ADD COLUMN IF NOT EXISTS last_reminded_at timestamptz;
ALTER TABLE public.itsm_approvals ADD COLUMN IF NOT EXISTS escalated_at timestamptz;
ALTER TABLE public.itsm_approvals ADD COLUMN IF NOT EXISTS on_behalf_of text;

-- Approval delegation (out of office): the delegate can decide the approver's steps between the dates
CREATE TABLE IF NOT EXISTS public.itsm_approval_delegates (
  id               serial PRIMARY KEY,
  user_id          int  NOT NULL,
  delegate_user_id int  NOT NULL,
  start_date       date NOT NULL,
  end_date         date NOT NULL,
  reason           text,
  is_active        boolean NOT NULL DEFAULT true,
  created_by       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  CHECK (user_id <> delegate_user_id)
);
CREATE INDEX IF NOT EXISTS itsm_approval_delegates_user ON public.itsm_approval_delegates (user_id) WHERE is_active;

-- Service-request SLA policies (same targets as incidents, longer resolution) — only when none exist yet
INSERT INTO public.itsm_sla_policies (name, ticket_type, priority, response_time_hours, resolution_time_hours, escalation_enabled, business_hours, sla_type, status, is_active)
SELECT v.name, 'Service Request', v.priority, v.resp, v.res, true, true, 'Business Hours', 'Active', true
FROM (VALUES ('SR Critical', 'Critical', 1, 8), ('SR High', 'High', 2, 16), ('SR Medium', 'Medium', 4, 24), ('SR Low', 'Low', 8, 40)) AS v(name, priority, resp, res)
WHERE NOT EXISTS (SELECT 1 FROM public.itsm_sla_policies p WHERE p.ticket_type = 'Service Request' AND p.is_active);

-- One SLA type field: '24x7' or 'Business Hours' (business_hours flag kept in step)
UPDATE public.itsm_sla_policies SET business_hours = (sla_type = 'Business Hours') WHERE business_hours IS DISTINCT FROM (sla_type = 'Business Hours');

-- Settings (Admin › ITSM config)
INSERT INTO public.settings (key, value, description) VALUES
  ('itsm.slaCalendar', '{"start":"09:30","end":"18:30","days":[1,2,3,4,5],"holidays":[]}'::jsonb, 'Business hours for Business Hours SLAs (IST). days: 0=Sun … 6=Sat; holidays: YYYY-MM-DD'),
  ('itsm.slaWarnPercent', '75'::jsonb, 'Alert the assignee / team lead when this % of the SLA time is used'),
  ('itsm.slaPauseStatuses', '["On Hold","Pending Approval"]'::jsonb, 'SLA clock stops while a ticket is in these statuses'),
  ('itsm.approvalReminderHours', '24'::jsonb, 'Remind approvers when a step waits this many hours (again every same interval)'),
  ('itsm.approvalEscalateAfter', '2'::jsonb, 'After this many reminders, escalate the pending approval to admins / team lead'),
  ('itsm.autoApprove', '{"lowPriority":true,"standardChange":true}'::jsonb, 'Skip approval for Low priority tickets and Standard (pre-approved) changes')
ON CONFLICT (key) DO NOTHING;

COMMIT;
