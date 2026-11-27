-- 2.06 (ITH-183): "Policy Owner" role — full rights on the Policy Register (create, edit, publish, retire policies, consent
-- reports). Can be given together with other roles (a person's access is the highest level of all their roles). Re-runnable.
INSERT INTO public.roles (name, description, is_system, default_dashboard)
VALUES ('Policy Owner', 'Policy Register: full control — create, edit, publish and retire policies, choose who must accept them, consent reports', false, '/')
ON CONFLICT (name) DO NOTHING;
INSERT INTO public.role_permissions (role_id, module, access_level)
SELECT r.id, 'policies', 'admin' FROM public.roles r
WHERE r.name = 'Policy Owner' AND NOT EXISTS (SELECT 1 FROM public.role_permissions p WHERE p.role_id = r.id AND p.module = 'policies');
UPDATE public.role_permissions p SET access_level = 'admin' FROM public.roles r WHERE r.id = p.role_id AND r.name = 'Policy Owner' AND p.module = 'policies' AND p.access_level <> 'admin';
