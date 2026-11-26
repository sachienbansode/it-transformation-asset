-- ONE-TIME (re-runnable) — Ashika AMC: IT Helpdesk team, its people, escalation levels and ticket routing.
-- Run in pgAdmin on it_hub_ashika_amc AFTER deploying 2.0 (needs db/62). Safe to run again: nothing is duplicated.
--
--   * Users Sounak Ghosh, Darshan Jadhav (agents) and Arunava Nandi (lead + escalation level 1) are created if missing,
--     with placeholder email / employee code / mobile — the admin corrects them in Admin › Users (sign-in: Microsoft 365).
--   * Escalation level 2 = the user whose email is in l2_email below. Leave it as is and the first active Super Admin is used.
--   * Every incident and service-request category / sub-category is routed to IT Helpdesk; IT support chat uses it too.
--   * All three get the ITSM Agent role; the lead also gets ITSM Admin.
DO $$
DECLARE
  l2_email text := 'REPLACE_WITH_L2_EMAIL';   -- e.g. the escalation level 2 person's sign-in email
  ppl jsonb := '[
    {"name":"Sounak Ghosh",  "email":"sounak.ghosh@ashikamf.com",  "code":"TMP-ITH-001", "desig":"IT Support Engineer"},
    {"name":"Darshan Jadhav","email":"darshan.jadhav@ashikamf.com","code":"TMP-ITH-002", "desig":"IT Support Engineer"},
    {"name":"Arunava Nandi", "email":"arunava.nandi@ashikamf.com", "code":"TMP-ITH-003", "desig":"IT Support Lead"}]';
  p jsonb; uid int; tid int; l1 int; l2 int; agent int; itadm int; n int;
BEGIN
  SELECT id INTO tid FROM itsm_teams WHERE lower(name) = 'it helpdesk' ORDER BY id LIMIT 1;
  IF tid IS NULL THEN INSERT INTO itsm_teams (name, description) VALUES ('IT Helpdesk', 'First line IT support — all incidents and service requests') RETURNING id INTO tid; END IF;
  UPDATE itsm_teams SET is_active = true, description = 'First line IT support — all incidents and service requests', updated_at = now() WHERE id = tid;
  SELECT id INTO agent FROM roles WHERE name = 'ITSM Agent';
  SELECT id INTO itadm FROM roles WHERE name = 'ITSM Admin';

  FOR p IN SELECT * FROM jsonb_array_elements(ppl) LOOP
    SELECT id INTO uid FROM users WHERE lower(name) = lower(p->>'name') AND is_active ORDER BY id LIMIT 1;
    IF uid IS NULL THEN SELECT id INTO uid FROM users WHERE lower(email) = lower(p->>'email') LIMIT 1; END IF;
    IF uid IS NULL THEN
      INSERT INTO users (email, name, role, department, designation, employee_code, mobile, auth_method, identity_source, is_active, status)
      VALUES (p->>'email', p->>'name', 'user', 'IT', p->>'desig', p->>'code', '9000000000', 'm365', 'local', true, 'active') RETURNING id INTO uid;
      RAISE NOTICE 'Created % (%) — update email / code / mobile in Admin › Users', p->>'name', p->>'email';
    ELSE RAISE NOTICE '% already exists (id %) — kept as is', p->>'name', uid; END IF;
    INSERT INTO itsm_team_members (team_id, user_id) SELECT tid, uid WHERE NOT EXISTS (SELECT 1 FROM itsm_team_members WHERE team_id = tid AND user_id = uid);
    IF agent IS NOT NULL THEN INSERT INTO user_roles (user_id, role_id) SELECT uid, agent WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = uid AND role_id = agent); END IF;
    IF p->>'name' = 'Arunava Nandi' THEN l1 := uid;
      IF itadm IS NOT NULL THEN INSERT INTO user_roles (user_id, role_id) SELECT uid, itadm WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = uid AND role_id = itadm); END IF;
    END IF;
  END LOOP;

  SELECT id INTO l2 FROM users WHERE lower(email) = lower(l2_email) AND is_active;
  IF l2 IS NULL THEN SELECT id INTO l2 FROM users WHERE role = 'admin' AND is_active ORDER BY id LIMIT 1; END IF;
  UPDATE itsm_teams SET lead_user_id = l1, escalation1_user_id = l1, escalation2_user_id = l2, updated_at = now() WHERE id = tid;
  RAISE NOTICE 'IT Helpdesk (team %): lead + escalation 1 = %, escalation 2 = %', tid, (SELECT name FROM users WHERE id = l1), (SELECT name || ' <' || email || '>' FROM users WHERE id = l2);

  UPDATE itsm_catalog SET team_id = tid, updated_at = now() WHERE (team_id IS DISTINCT FROM tid) AND (subcategory IS NULL OR team_id IS NOT NULL);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'Routing: % categories / sub-categories now go to IT Helpdesk', n;
  INSERT INTO settings (key, value) VALUES ('chat.supportTeamId', to_jsonb(tid)) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
END $$;

-- check
SELECT t.name AS team, l.name AS lead, e1.name AS escalation_1, e2.name AS escalation_2,
  (SELECT string_agg(u.name, ', ' ORDER BY u.name) FROM itsm_team_members m JOIN users u ON u.id = m.user_id WHERE m.team_id = t.id) AS members,
  (SELECT count(*) FROM itsm_catalog c WHERE c.team_id = t.id) AS routed_categories
FROM itsm_teams t LEFT JOIN users l ON l.id = t.lead_user_id LEFT JOIN users e1 ON e1.id = t.escalation1_user_id LEFT JOIN users e2 ON e2.id = t.escalation2_user_id
WHERE lower(t.name) = 'it helpdesk';
