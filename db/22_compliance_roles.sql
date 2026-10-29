-- Audit & Compliance roles (Admin › Roles & Permissions). Re-runnable: creates missing roles / permissions only,
-- never changes a role an admin has edited.
--  Internal users (module key "compliance"):
--    Compliance Admin  – full control: companies, checklist templates, audits, invite / revoke auditors, export
--    Compliance Team   – audit coordinators and checkpoint owners / SPOCs: replies, evidence, status, sharing
--    Compliance Viewer – management / CXO / internal audit: read-only dashboards, checkpoints and evidence
--  External auditors:
--    External Auditor  – no access to any IT Hub module. Auditors reach only the auditor portal, and only for
--                        audits they are invited to (password + emailed OTP). Given automatically on invitation.
BEGIN;
SET search_path TO public;

INSERT INTO public.roles (name, description, is_system, default_dashboard)
SELECT v.n, v.d, v.s, v.h FROM (VALUES
  ('Compliance Admin',  'Audit & Compliance: full control — companies, templates, audits, auditor access, exports', false, '/compliance'),
  ('Compliance Team',   'Audit & Compliance: coordinators, checkpoint owners and SPOCs — replies, evidence, status, sharing', false, '/compliance'),
  ('Compliance Viewer', 'Audit & Compliance: read-only dashboards, checkpoints and evidence (management, CXO, internal audit)', false, '/compliance'),
  ('External Auditor',  'Auditor portal only, for invited audits (password + email OTP). No IT Hub modules. Assigned on invitation.', true, '/auditor')
) AS v(n, d, s, h)
WHERE NOT EXISTS (SELECT 1 FROM public.roles r WHERE lower(r.name) = lower(v.n));

INSERT INTO public.role_permissions (role_id, module, access_level)
SELECT r.id, p.module, p.level
FROM (VALUES
  ('Compliance Admin', 'compliance', 'admin'),
  ('Compliance Team', 'compliance', 'write'),
  ('Compliance Viewer', 'compliance', 'read'),
  ('External Auditor', 'compliance', 'none')
) AS p(role, module, level)
JOIN public.roles r ON lower(r.name) = lower(p.role)
WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions x WHERE x.role_id = r.id AND x.module = p.module);

-- auditors already invited get the External Auditor role
INSERT INTO public.user_roles (user_id, role_id)
SELECT DISTINCT x.user_id, r.id FROM public.cmp_audit_access x JOIN public.users u ON u.id = x.user_id AND u.user_type = 'external'
JOIN public.roles r ON r.name = 'External Auditor'
ON CONFLICT DO NOTHING;

COMMIT;
