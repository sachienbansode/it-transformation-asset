-- Default "Employee" role: every active INTERNAL user without any IT Hub role gets it, so all employees can sign in
-- (My Assets, My Policies, My Approvals, raise incidents and service requests, read the knowledge base).
-- External users never get it. Re-runnable.
BEGIN;
INSERT INTO public.roles (name, description, is_system, default_dashboard)
VALUES ('Employee', 'Default for all internal employees: My Assets, My Policies, My Approvals, raise incidents / service requests, knowledge base. Given automatically; never to external users.', true, '/my-assets')
ON CONFLICT (name) DO UPDATE SET is_system = true, default_dashboard = '/my-assets';

-- permissions, first time only (admins may adjust them later in Roles & Permissions); My Assets / My Policies /
-- My Approvals need no module permission
INSERT INTO public.role_permissions (role_id, module, access_level)
SELECT r.id, m.module, m.lvl FROM public.roles r
CROSS JOIN (VALUES ('itsm_incidents', 'write'), ('itsm_requests', 'write'), ('itsm_kb', 'read')) AS m(module, lvl)
WHERE r.name = 'Employee' AND NOT EXISTS (SELECT 1 FROM public.role_permissions p WHERE p.role_id = r.id);

INSERT INTO public.settings (key, value, description)
VALUES ('auth.defaultEmployeeRole', '"Employee"'::jsonb, 'Role given automatically to internal users who have no IT Hub role (never to external users)')
ON CONFLICT (key) DO NOTHING;

-- existing internal users with no role get it; external users lose it
INSERT INTO public.user_roles (user_id, role_id)
SELECT u.id, r.id FROM public.users u, public.roles r
WHERE r.name = 'Employee' AND u.is_active AND coalesce(u.user_type, 'internal') = 'internal' AND u.role <> 'admin'
  AND NOT EXISTS (SELECT 1 FROM public.user_roles x WHERE x.user_id = u.id);
DELETE FROM public.user_roles ur USING public.users u, public.roles r
WHERE ur.user_id = u.id AND ur.role_id = r.id AND r.name = 'Employee' AND u.user_type = 'external';
COMMIT;
