-- 2.08 (ITH-188): every active internal user has the default Employee role (next to any other roles). Role mapping only —
-- creates no users. Re-runnable.
INSERT INTO public.user_roles (user_id, role_id)
SELECT u.id, r.id FROM public.users u CROSS JOIN public.roles r
WHERE r.name = coalesce((SELECT value #>> '{}' FROM public.settings WHERE key = 'auth.defaultEmployeeRole'), 'Employee')
  AND u.is_active AND coalesce(u.user_type, 'internal') = 'internal'
  AND NOT EXISTS (SELECT 1 FROM public.user_roles x WHERE x.user_id = u.id AND x.role_id = r.id);
