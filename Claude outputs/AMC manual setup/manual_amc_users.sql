-- ONE-TIME (re-runnable, manual — not part of deploy) — Ashika AMC:
-- users from users_AMC list + additional role mapping. Nothing is duplicated; existing users keep their password / sign-in history.
--   * Users sign in with Microsoft 365 (their @ashikamf.com account); two-step sign-in by emailed code is on.
--   * Every internal user has the Employee role. Additional roles are given ONLY to the people listed in `extra_roles`
--     below (approved internally) — not by designation. Add / remove lines there and run again; removals are not done
--     by this script (remove a role in Admin › Users).
--   * Skipped: the existing Super Admin accounts, and "Pravin Chavhan" (no email address in the list).
DO $$
DECLARE
  ppl jsonb := '[
    {"code":"EGA01","name":"Saurabh Jain","email":"saurabh.jain@ashikamf.com","mobile":"9810933340","dept":"Mutual Fund","desig":"CEO"},
    {"code":"EGA02","name":"Vinita Taparia","email":"vinita.taparia@ashikamf.com","mobile":"9833912390","dept":"Compliance","desig":"CCO"},
    {"code":"EGA03","name":"Om Dokania","email":"om.dokania@ashikamf.com","mobile":"7039019061","dept":"Investment","desig":"Research Analyst"},
    {"code":"EGA04","name":"Sharad Dwivedi","email":"sharad.dwivedi@ashikamf.com","mobile":"9773435727","dept":"Risk","desig":"CRO"},
    {"code":"EGA06","name":"Chandan Bhatnagar","email":"chandan.bhatnagar@ashikamf.com","mobile":"9867565774","dept":"Operation","desig":"COO"},
    {"code":"EGA07","name":"Sunil Surana","email":"sunil.surana@ashikamf.com","mobile":"9820580560","dept":"Investment","desig":"Dealer"},
    {"code":"EGA08","name":"Tejas Shah","email":"tejas.shah@ashikamf.com","mobile":"9820147478","dept":"Information Security","desig":"CISO"},
    {"code":"EGA09","name":"Nirali Shah","email":"niralishah@ashikamf.com","mobile":"7021094104","dept":"Investment","desig":"Research Analyst"},
    {"code":"EGA10","name":"Akshaj Shah","email":"akshaj.shah@ashikamf.com","mobile":"9167653485","dept":"Investment","desig":"Research Analyst"}]';
  -- additional roles, approved internally (email → role name)
  extra_roles jsonb := '[
    {"email":"vinita.taparia@ashikamf.com","role":"Policy Owner"},
    {"email":"tejas.shah@ashikamf.com","role":"Policy Owner"},
    {"email":"sharad.dwivedi@ashikamf.com","role":"Policy Owner"}]';
  p jsonb; uid int; emp int; rid int; n_new int := 0; n_upd int := 0;
BEGIN
  SELECT id INTO emp FROM roles WHERE name = 'Employee';
  IF NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Policy Owner') THEN RAISE EXCEPTION 'Role "Policy Owner" not found — deploy 2.06 first'; END IF;
  -- departments used by the list (Masters › Department), Title Case
  INSERT INTO masters (category, key, label, sort_order, is_active, created_by)
  SELECT DISTINCT 'department', lower(regexp_replace(x->>'dept', '[^A-Za-z0-9]+', '_', 'g')), x->>'dept', 10, true, 'system'
  FROM jsonb_array_elements(ppl) x
  WHERE NOT EXISTS (SELECT 1 FROM masters m WHERE m.category = 'department' AND lower(m.label) = lower(x->>'dept'));

  FOR p IN SELECT * FROM jsonb_array_elements(ppl) LOOP
    SELECT id INTO uid FROM users WHERE lower(email) = lower(p->>'email');
    IF uid IS NULL THEN SELECT id INTO uid FROM users WHERE employee_code = p->>'code'; END IF;
    IF uid IS NULL THEN
      INSERT INTO users (email, name, role, user_type, department, designation, employee_code, mobile, auth_method, identity_source, mfa_enabled, mfa_method, is_active, status)
      VALUES (lower(p->>'email'), p->>'name', 'user', 'internal', (SELECT label FROM masters WHERE category = 'department' AND lower(label) = lower(p->>'dept') LIMIT 1),
              p->>'desig', p->>'code', p->>'mobile', 'm365', 'local', true, 'email', true, 'active') RETURNING id INTO uid;
      n_new := n_new + 1;
    ELSE
      UPDATE users SET name = p->>'name', employee_code = p->>'code', mobile = p->>'mobile', designation = p->>'desig',
        department = (SELECT label FROM masters WHERE category = 'department' AND lower(label) = lower(p->>'dept') LIMIT 1), updated_at = now()
      WHERE id = uid;
      n_upd := n_upd + 1;
    END IF;
    IF emp IS NOT NULL THEN INSERT INTO user_roles (user_id, role_id) SELECT uid, emp WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = uid AND role_id = emp); END IF;
  END LOOP;

  FOR p IN SELECT * FROM jsonb_array_elements(extra_roles) LOOP
    SELECT id INTO uid FROM users WHERE lower(email) = lower(p->>'email') AND is_active;
    SELECT id INTO rid FROM roles WHERE name = p->>'role';
    IF uid IS NULL OR rid IS NULL THEN RAISE NOTICE 'Skipped % → % (user or role not found)', p->>'email', p->>'role'; CONTINUE; END IF;
    INSERT INTO user_roles (user_id, role_id) SELECT uid, rid WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = uid AND role_id = rid);
  END LOOP;
  RAISE NOTICE 'Users created: %, updated: %', n_new, n_upd;
  INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, summary) VALUES ('User', 0, 'BULK_SETUP', 'db-admin', 'AMC users created / updated from users_AMC list; Policy Owner role mapped to the approved people');
END $$;

-- check: everyone with their roles
SELECT u.employee_code, u.name, u.email, u.department, u.designation, u.auth_method,
  (SELECT string_agg(r.name, ' + ' ORDER BY r.name) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id) AS roles
FROM users u WHERE u.email LIKE '%@ashikamf.com' ORDER BY u.employee_code NULLS FIRST, u.name;
