-- 2.08 (ITH-189): policy notification emails — on / off and editable subject + HTML per event (Policy Register › Email templates).
-- Each person gets their own email (never a shared To: list). Re-runnable.
CREATE TABLE IF NOT EXISTS public.policy_email_templates (
  event_key  text PRIMARY KEY,
  label      text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  enabled    boolean NOT NULL DEFAULT true,
  subject    text NOT NULL,
  body       text NOT NULL,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.policy_email_templates (event_key, label, description, sort_order, subject, body) VALUES
 ('policy_new', 'New policy published', 'When a policy / notice / consent is published for the first time', 1,
  '{{action}}: {{policyTitle}}',
  '<p>Dear {{name}},</p><p>A new {{type}} has been published: <b>{{policyTitle}}</b> ({{code}}, version {{version}}).</p><p>{{message}}</p><p><a href="{{link}}">Open {{policyTitle}}</a></p><p>Regards,<br/>{{company}}</p>'),
 ('policy_updated', 'Policy updated (new version)', 'When a new version is published', 2,
  'Updated — {{action}}: {{policyTitle}}',
  '<p>Dear {{name}},</p><p><b>{{policyTitle}}</b> ({{code}}) has been updated to version {{version}}.</p><p><b>What changed:</b> {{changeNote}}</p><p>{{message}}</p><p><a href="{{link}}">Open {{policyTitle}}</a></p><p>Regards,<br/>{{company}}</p>'),
 ('policy_reminder', 'Reminder', 'Reminder to people who have not accepted yet', 3,
  'Reminder — {{action}}: {{policyTitle}}',
  '<p>Dear {{name}},</p><p>This is a reminder about <b>{{policyTitle}}</b> ({{code}}).</p><p>{{message}}</p><p><a href="{{link}}">Open {{policyTitle}}</a></p><p>Regards,<br/>{{company}}</p>'),
 ('policy_resent', 'Please read again', 'When the policy owner asks everyone to read it again', 4,
  'Please read again: {{policyTitle}}',
  '<p>Dear {{name}},</p><p>Please read <b>{{policyTitle}}</b> ({{code}}, version {{version}}) again.</p><p>{{message}}</p><p><a href="{{link}}">Open {{policyTitle}}</a></p><p>Regards,<br/>{{company}}</p>')
ON CONFLICT (event_key) DO NOTHING;
