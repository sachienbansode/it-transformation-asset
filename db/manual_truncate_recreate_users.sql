-- MANUAL (not run by deploy.sh). Runs as-is in pgAdmin (Query Tool → Execute) or psql.
-- TRUNCATE the users table and re-create the 7 users from users_2026-10-29.csv, then map their roles again.
--  * Users are re-created with the SAME ids as in the CSV, so owners / SPOCs / assets / history that point to
--    these people stay linked. Passwords (and MFA set-up) are carried over, so nobody is locked out.
--  * Role links are truncated and re-mapped from the CSV "roles" column.
--  * Rows that belonged to any other (now deleted) user are removed or cleared; everyone signs in again.
-- One transaction: any error → nothing changes. Safe to re-run.
BEGIN;

CREATE TEMP TABLE _u (id int, employee_code text, name text, email text, mobile text, user_type text, role text, department text, designation text, roles text) ON COMMIT DROP;
INSERT INTO _u VALUES
  (5,  'EMP005',    'Administrator',  'admin@ashikagroup.com',          '+91 98765 00000', 'internal', 'admin',        'it',         'System Administrator',     ''),
  (3,  'EMP003',    'Arunava Nandi',  'nandi@ashikagroup.com',          '+91 98765 00002', 'internal', 'kpi_employee', 'it',         'Head - IT Infra',          'kpi_employee; IT Asset Admin'),
  (6,  'EMP006',    'Avinash Yadav',  'avinash.yadav@ashikagroup.com',  NULL,              'internal', 'kpi_employee', 'it',         'Senior BA',                'IT Asset Admin'),
  (2,  'EMP002',    'Sachin Bansode', 'sachin.bansode@ashikagroup.com', '+91 98765 00001', 'internal', 'admin',        'it',         'Chief Technology Officer', 'cxo'),
  (47, 'EMPAMC001', 'Saurabh Jain',   'saurabh.jain@ashikamf.com',      NULL,              'internal', 'user',         'management', 'CEO',                      'Compliance Team'),
  (7,  'EMP007',    'Srushti Patwa',  'srushti.patwa@ashikagroup.com',  NULL,              'internal', 'user',         'it',         'Data Scientist',           'IT Asset Admin'),
  (48, 'EMPAMC002', 'Vinita Taparia', 'vinita.taparia@ashikamf.com',    NULL,              'internal', 'user',         'management', 'Head- Compliance and Company Secretary -Mutual Fund', 'Compliance Team');

-- keep sign-in details (password, MFA, SSO link, photo) of the people being re-created
CREATE TEMP TABLE _keep ON COMMIT DROP AS
SELECT lower(email) AS email, password_hash, mfa_enabled, mfa_secret, mfa_method, azure_id, photo_url, identity_source, central_sub, central_role, last_login_at, created_at
  FROM users WHERE lower(email) IN (SELECT lower(email) FROM _u);
CREATE TEMP TABLE _gone ON COMMIT DROP AS SELECT id FROM users WHERE id NOT IN (SELECT id FROM _u);

-- rows that only belonged to users who will not come back
DELETE FROM itsm_team_members  WHERE user_id IN (SELECT id FROM _gone);
DELETE FROM cmp_auditor_otps   WHERE user_id IN (SELECT id FROM _gone);
DELETE FROM cmp_auditor_tokens WHERE user_id IN (SELECT id FROM _gone);
DELETE FROM cmp_audit_access   WHERE user_id IN (SELECT id FROM _gone);
DELETE FROM notifications      WHERE user_id IN (SELECT id FROM _gone);
UPDATE cmp_items     SET owner_user_id = NULL        WHERE owner_user_id IN (SELECT id FROM _gone);
UPDATE cmp_items     SET spoc_user_id = NULL         WHERE spoc_user_id IN (SELECT id FROM _gone);
UPDATE cmp_items     SET submitted_by_user_id = NULL WHERE submitted_by_user_id IN (SELECT id FROM _gone);
UPDATE cmp_grids     SET owner_user_id = NULL        WHERE owner_user_id IN (SELECT id FROM _gone);
UPDATE cmp_documents SET owner_user_id = NULL        WHERE owner_user_id IN (SELECT id FROM _gone);
UPDATE itsm_teams    SET lead_user_id = NULL         WHERE lead_user_id IN (SELECT id FROM _gone);
UPDATE assets        SET owner_id = NULL             WHERE owner_id IN (SELECT id FROM _gone);
UPDATE itsm_approval_matrix SET approver_user_ids = ARRAY(SELECT x FROM unnest(approver_user_ids) x WHERE x NOT IN (SELECT id FROM _gone))
 WHERE approver_user_ids && ARRAY(SELECT id FROM _gone);

-- truncate and re-create
TRUNCATE TABLE user_roles, user_sessions;
TRUNCATE TABLE users;

INSERT INTO users (id, email, name, employee_code, mobile, user_type, role, department, designation, is_active, status,
                   password_hash, mfa_enabled, mfa_secret, mfa_method, azure_id, photo_url, identity_source, central_sub, central_role, last_login_at, created_at, updated_at)
SELECT u.id, lower(u.email), u.name, u.employee_code, u.mobile, u.user_type, u.role, u.department, u.designation, true, 'active',
       k.password_hash, coalesce(k.mfa_enabled, false), k.mfa_secret, coalesce(k.mfa_method, 'totp'), k.azure_id, k.photo_url, coalesce(k.identity_source, 'local'), k.central_sub, k.central_role, k.last_login_at, coalesce(k.created_at, now()), now()
  FROM _u u LEFT JOIN _keep k ON k.email = lower(u.email);

-- next new user gets an id after the highest one
SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT max(id) FROM users));

-- map roles again (CSV "roles" column, "; "-separated)
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM _u u JOIN roles r ON r.name = ANY (string_to_array(nullif(u.roles, ''), '; '))
ON CONFLICT DO NOTHING;

-- check 1: roles named in the CSV that do not exist (should be empty)
SELECT u.email, x.role_name AS missing_role FROM _u u, unnest(string_to_array(nullif(u.roles, ''), '; ')) AS x(role_name)
 WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.name = x.role_name);
-- check 2: the users table now
SELECT u.id, u.employee_code, u.name, u.email, u.role AS base_role, (u.password_hash IS NOT NULL) AS has_password,
       (SELECT string_agg(r.name, '; ' ORDER BY r.name) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id) AS roles
  FROM users u ORDER BY u.name;

COMMIT;
-- Everyone is signed out (sessions truncated) and signs in again. A user without a password uses Microsoft /
-- Ashika Portal sign-in, or an admin sets one in User Master.
