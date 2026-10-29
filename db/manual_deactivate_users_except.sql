-- MANUAL (not run by deploy.sh): switch off every user except the keep list.
-- Users are deactivated, not deleted: their ids stay referenced by audit trails, assets, tickets and checkpoint owners.
-- They can no longer sign in; reactivate any time from Admin › User Master. Re-runnable.
BEGIN;
CREATE TEMP TABLE _keep (email text) ON COMMIT DROP;
INSERT INTO _keep VALUES
  ('admin@ashikagroup.com'),
  ('sachin.bansode@ashikagroup.com'),
  ('nandi@ashikagroup.com'),
  ('avinash.yadav@ashikagroup.com'),
  ('srushti.patwa@ashikagroup.com');

-- keep-list addresses that do not exist (check spelling if any show up)
SELECT k.email AS not_found FROM _keep k WHERE NOT EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = lower(k.email));

-- make sure the kept users are active
UPDATE users SET is_active = true, status = 'active', updated_at = now()
 WHERE lower(email) IN (SELECT lower(email) FROM _keep) AND NOT is_active;

-- who is switched off now
SELECT id, name, email, role, user_type FROM users
 WHERE lower(email) NOT IN (SELECT lower(email) FROM _keep) AND is_active ORDER BY name;

UPDATE users SET is_active = false, status = 'inactive', updated_at = now()
 WHERE lower(email) NOT IN (SELECT lower(email) FROM _keep) AND is_active;

-- external auditor access tied to switched-off accounts is revoked too
UPDATE cmp_audit_access x SET is_active = false, revoked_at = coalesce(revoked_at, now()), revoked_by = 'User clean-up'
  FROM users u WHERE u.id = x.user_id AND NOT u.is_active AND x.is_active;

SELECT count(*) FILTER (WHERE is_active) AS active_users, count(*) FILTER (WHERE NOT is_active) AS inactive_users FROM users;
COMMIT;
