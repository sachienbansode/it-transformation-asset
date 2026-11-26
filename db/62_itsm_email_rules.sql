-- r101 (ITH-163/164): team escalation levels and ITSM email alerts with recipients and templates the admin can change. Re-runnable.
ALTER TABLE public.itsm_teams ADD COLUMN IF NOT EXISTS escalation1_user_id integer;
ALTER TABLE public.itsm_teams ADD COLUMN IF NOT EXISTS escalation2_user_id integer;

CREATE TABLE IF NOT EXISTS public.itsm_email_rules (
  event_key      text PRIMARY KEY,
  label          text NOT NULL,
  description    text,
  sort_order     integer NOT NULL DEFAULT 0,
  enabled        boolean NOT NULL DEFAULT true,
  to_requester   boolean NOT NULL DEFAULT false,
  to_assignee    boolean NOT NULL DEFAULT false,
  to_team        boolean NOT NULL DEFAULT false,
  to_lead        boolean NOT NULL DEFAULT false,
  to_escalation1 boolean NOT NULL DEFAULT false,
  to_escalation2 boolean NOT NULL DEFAULT false,
  to_admins      boolean NOT NULL DEFAULT false,
  extra          text,                      -- more addresses, comma separated
  skip_actor     boolean NOT NULL DEFAULT true,   -- the person who made the change is not emailed about it
  subject        text NOT NULL,
  body           text NOT NULL,
  updated_by     text,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.itsm_email_rules (event_key, label, description, sort_order, to_requester, to_assignee, to_team, to_lead, to_escalation1, to_escalation2, to_admins, subject, body) VALUES
 ('ticket_created_requester', 'Ticket received (to the person who raised it)', 'Sent when a ticket is logged', 1, true, false, false, false, false, false, false,
  'We have received your {{type}} {{no}} — {{title}}',
  '<p>Hello {{requester}},</p><p>Your {{type}} <b>{{no}}</b> has been logged and sent to <b>{{team}}</b>. Expected closure: {{expectedClosure}}.</p>{{details}}<p>You can follow it in IT Hub: <a href="{{link}}">{{no}}</a></p><p>Regards,<br/>{{team}}</p>'),
 ('ticket_created_team', 'New ticket in the team queue', 'Sent to the team when a ticket arrives in its queue', 2, false, false, true, true, false, false, false,
  'New {{type}} {{no}} in {{team}} queue — {{title}} ({{priority}})',
  '<p>A new {{type}} <b>{{no}}</b> is waiting in the <b>{{team}}</b> queue.</p>{{details}}<p><a href="{{link}}">Open {{no}}</a> and assign it.</p>'),
 ('ticket_assigned', 'Ticket assigned', 'Sent to the person it is assigned to', 3, false, true, false, false, false, false, false,
  '{{no}} assigned to you — {{title}} ({{priority}})',
  '<p>Hello {{assignee}},</p><p>{{type}} <b>{{no}}</b> has been assigned to you.</p>{{details}}<p><a href="{{link}}">Open {{no}}</a></p>'),
 ('ticket_transferred', 'Ticket passed to another team', 'Sent to the new team', 4, false, false, true, true, false, false, false,
  '{{no}} passed to {{team}} — {{title}}',
  '<p>{{type}} <b>{{no}}</b> has been passed to <b>{{team}}</b>.</p><p>Reason: {{reason}}</p>{{details}}<p><a href="{{link}}">Open {{no}}</a></p>'),
 ('ticket_status', 'Status changed (to the person who raised it)', 'Sent when the status changes (not for resolved / closed — see below)', 5, true, false, false, false, false, false, false,
  'Your {{type}} {{no}} is now {{status}}',
  '<p>Hello {{requester}},</p><p>Your {{type}} <b>{{no}}</b> — {{title}} — is now <b>{{status}}</b>{{assigneeLine}}.</p><p><a href="{{link}}">View {{no}}</a></p><p>Regards,<br/>{{team}}</p>'),
 ('ticket_resolved', 'Resolved / completed (to the person who raised it)', 'Sent when the ticket is resolved or completed', 6, true, false, false, false, false, false, false,
  'Your {{type}} {{no}} has been {{status}}',
  '<p>Hello {{requester}},</p><p>Your {{type}} <b>{{no}}</b> — {{title}} — has been <b>{{status}}</b>.</p><p>Resolution: {{resolution}}</p><p>If the problem is not fixed, reopen it in IT Hub within a few days: <a href="{{link}}">{{no}}</a></p><p>Regards,<br/>{{team}}</p>'),
 ('ticket_reopened', 'Ticket reopened', 'Sent to the assignee and team lead when a ticket is reopened', 7, false, true, false, true, false, false, false,
  '{{no}} reopened — {{title}}',
  '<p>{{type}} <b>{{no}}</b> has been reopened.</p><p>Reason: {{reason}}</p>{{details}}<p><a href="{{link}}">Open {{no}}</a></p>'),
 ('sla_response_overdue', 'Response overdue (not picked up in time)', 'Sent once when nobody has picked the ticket up within the response target', 8, false, false, true, true, true, false, false,
  'Response overdue: {{no}} — {{title}}',
  '<p>{{type}} <b>{{no}}</b> has not been picked up within the response target.</p>{{details}}<p><a href="{{link}}">Open {{no}}</a></p>'),
 ('sla_at_risk', 'SLA at risk — escalation level 1', 'Sent once when most of the resolution time is used', 9, false, true, false, true, true, false, false,
  'SLA at risk: {{no}} — {{slaLeft}} left',
  '<p>{{type}} <b>{{no}}</b> is at risk of missing its resolution target — <b>{{slaLeft}}</b> left.</p>{{details}}<p><a href="{{link}}">Open {{no}}</a></p>'),
 ('sla_breached', 'SLA breached — escalation level 2', 'Sent once when the resolution target is missed', 10, false, true, false, true, true, true, false,
  'SLA breached: {{no}} — {{title}}',
  '<p>{{type}} <b>{{no}}</b> has <b>breached</b> its resolution target ({{slaLeft}}).</p>{{details}}<p><a href="{{link}}">Open {{no}}</a></p>')
ON CONFLICT (event_key) DO NOTHING;
