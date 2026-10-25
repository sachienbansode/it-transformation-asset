-- IT Transformation Hub — migration 15: ITSM approvals linked to people (IT Hub role or named users), approver inbox.
-- Target DB: it-hub   Run as: root_admin. Re-runnable. Applied by deploy.sh.
BEGIN;
SET search_path TO public;
ALTER TABLE public.itsm_approval_matrix ADD COLUMN IF NOT EXISTS approver_role_id  integer;
ALTER TABLE public.itsm_approval_matrix ADD COLUMN IF NOT EXISTS approver_user_ids integer[] NOT NULL DEFAULT '{}';
ALTER TABLE public.itsm_approvals       ADD COLUMN IF NOT EXISTS approver_role_id  integer;
ALTER TABLE public.itsm_approvals       ADD COLUMN IF NOT EXISTS approver_user_ids integer[] NOT NULL DEFAULT '{}';
ALTER TABLE public.itsm_approvals       ADD COLUMN IF NOT EXISTS acted_by_user_id  integer;
ALTER TABLE public.itsm_approvals       ADD COLUMN IF NOT EXISTS admin_override    boolean NOT NULL DEFAULT false;
ALTER TABLE public.itsm_approvals       ADD COLUMN IF NOT EXISTS requested_at      timestamptz;
UPDATE public.itsm_approvals SET requested_at = created_at WHERE requested_at IS NULL;
CREATE INDEX IF NOT EXISTS itsm_approvals_pending_idx ON public.itsm_approvals (status, ticket_type, ticket_id);
-- Existing free-text rules: link to an IT Hub role of the same name when one exists
UPDATE public.itsm_approval_matrix m SET approver_role_id = r.id
  FROM public.roles r WHERE m.approver_role_id IS NULL AND cardinality(m.approver_user_ids) = 0 AND lower(r.name) = lower(m.approver_role);
INSERT INTO public.notification_rules (event_key, label, module, description, attach_excel, sort_order)
SELECT 'itsm_approvals', 'ITSM approval decisions (copy)', 'ITSM', 'Copy of every ITSM approval request and final decision. Approvers and requesters are emailed directly anyway.', false, 20
WHERE NOT EXISTS (SELECT 1 FROM public.notification_rules WHERE event_key = 'itsm_approvals');
COMMIT;
