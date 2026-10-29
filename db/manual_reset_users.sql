-- MANUAL (not run by deploy.sh). Runs as-is in pgAdmin (Query Tool → Execute) or psql.
-- Resets the user list to exactly the 7 people below (from users_2026-10-29.csv):
--   1. deletes every other user and removes what only belonged to them (role links, team membership,
--      auditor access, notifications, open sessions); owner / SPOC / team-lead fields pointing to a
--      deleted user are cleared. Historical records (ticket requester, approvals, asset transactions,
--      audit trail) keep the old id and simply show no name.
--   2. keeps / re-creates these 7 with the details and roles from the CSV (existing ids are kept, so the
--      owners, SPOCs, assets and history already linked to them stay linked)
-- Why not TRUNCATE users: it would re-number everyone and break every link (owners, roles, assets),
-- and the people you keep would lose their roles and history.
-- Safe to re-run. Everything is one transaction: any error → nothing changes.
BEGIN;

CREATE TEMP TABLE _keep (employee_code text, name text, email text, mobile text, user_type text, role text, department text, designation text, roles text) ON COMMIT DROP;
INSERT INTO _keep VALUES
  ('EMP005',    'Administrator',  'admin@ashikagroup.com',          '+91 98765 00000', 'internal', 'admin', 'it',         'System Administrator',     ''),
  ('EMP003',    'Arunava Nandi',  'nandi@ashikagroup.com',          '+91 98765 00002', 'internal', 'kpi_employee', 'it',  'Head - IT Infra',          'kpi_employee; IT Asset Admin'),
  ('EMP006',    'Avinash Yadav',  'avinash.yadav@ashikagroup.com',  NULL,              'internal', 'kpi_employee', 'it',  'Senior BA',                'IT Asset Admin'),
  ('EMP002',    'Sachin Bansode', 'sachin.bansode@ashikagroup.com', '+91 98765 00001', 'internal', 'admin', 'it',         'Chief Technology Officer', 'cxo'),
  ('EMPAMC001', 'Saurabh Jain',   'saurabh.jain@ashikamf.com',      NULL,              'internal', 'user',  'management', 'CEO',                      'Compliance Team'),
  ('EMP007',    'Srushti Patwa',  'srushti.patwa@ashikagroup.com',  NULL,              'internal', 'user',  'it',         'Data Scientist',           'IT Asset Admin'),
  ('EMPAMC002', 'Vinita Taparia', 'vinita.taparia@ashikamf.com',    NULL,              'internal', 'user',  'management', 'Head- Compliance and Company Secretary -Mutual Fund', 'Compliance Team');

CREATE TEMP TABLE _gone ON COMMIT DROP AS SELECT id FROM users WHERE lower(email) NOT IN (SELECT lower(email) FROM _keep);

-- 1. remove what belonged only to the users being deleted
DELETE FROM user_roles          WHERE user_id IN (SELECT id FROM _gone);
DELETE FROM itsm_team_members   WHERE user_id IN (SELECT id FROM _gone);
DELETE FROM cmp_auditor_otps    WHERE user_id IN (SELECT id FROM _gone);
DELETE FROM cmp_auditor_tokens  WHERE user_id IN (SELECT id FROM _gone);
DELETE FROM cmp_audit_access    WHERE user_id IN (SELECT id FROM _gone);
DELETE FROM notifications       WHERE user_id IN (SELECT id FROM _gone);
DELETE FROM user_sessions       WHERE (sess::jsonb ->> 'userId') ~ '^\d+$' AND (sess::jsonb ->> 'userId')::int IN (SELECT id FROM _gone);
UPDATE cmp_items     SET owner_user_id = NULL        WHERE owner_user_id IN (SELECT id FROM _gone);
UPDATE cmp_items     SET spoc_user_id = NULL         WHERE spoc_user_id IN (SELECT id FROM _gone);
UPDATE cmp_items     SET submitted_by_user_id = NULL WHERE submitted_by_user_id IN (SELECT id FROM _gone);
UPDATE cmp_grids     SET owner_user_id = NULL        WHERE owner_user_id IN (SELECT id FROM _gone);
UPDATE cmp_documents SET owner_user_id = NULL        WHERE owner_user_id IN (SELECT id FROM _gone);
UPDATE itsm_teams    SET lead_user_id = NULL         WHERE lead_user_id IN (SELECT id FROM _gone);
UPDATE assets        SET owner_id = NULL             WHERE owner_id IN (SELECT id FROM _gone);
UPDATE itsm_approval_matrix SET approver_user_ids = ARRAY(SELECT x FROM unnest(approver_user_ids) x WHERE x NOT IN (SELECT id FROM _gone))
 WHERE approver_user_ids && ARRAY(SELECT id FROM _gone);

DELETE FROM users WHERE id IN (SELECT id FROM _gone);

-- 2. keep / re-create the 7 (matched on email; password is kept for existing users)
UPDATE users u SET name = k.name, employee_code = k.employee_code, mobile = coalesce(k.mobile, u.mobile), user_type = k.user_type, role = k.role,
       department = k.department, designation = k.designation, is_active = true, status = 'active', updated_at = now()
  FROM _keep k WHERE lower(u.email) = lower(k.email);
INSERT INTO users (email, name, employee_code, mobile, user_type, role, department, designation, is_active, status)
SELECT lower(k.email), k.name, k.employee_code, k.mobile, k.user_type, k.role, k.department, k.designation, true, 'active'
  FROM _keep k WHERE NOT EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = lower(k.email));

-- 3. roles exactly as in the CSV (roles column, "; "-separated)
DELETE FROM user_roles ur USING users u, _keep k
 WHERE ur.user_id = u.id AND lower(u.email) = lower(k.email)
   AND ur.role_id NOT IN (SELECT r.id FROM roles r WHERE r.name = ANY (string_to_array(nullif(k.roles, ''), '; ')));
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM _keep k JOIN users u ON lower(u.email) = lower(k.email)
  JOIN roles r ON r.name = ANY (string_to_array(nullif(k.roles, ''), '; '))
ON CONFLICT DO NOTHING;

-- check: roles named in the CSV that do not exist in this database (fix the name or create the role)
SELECT k.email, x.role_name AS missing_role FROM _keep k, unnest(string_to_array(nullif(k.roles, ''), '; ')) AS x(role_name)
 WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.name = x.role_name);

-- result
SELECT u.id, u.employee_code, u.name, u.email, u.role AS base_role, u.is_active,
       (SELECT string_agg(r.name, '; ' ORDER BY r.name) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id) AS roles
  FROM users u ORDER BY u.name;

COMMIT;
-- New users have no password: they sign in with Microsoft / Ashika Portal SSO, or an admin sets one in User Master.
