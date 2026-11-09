-- ITH-105: one direct chat thread per pair of people.
-- Existing duplicate threads for the same two people are merged into the oldest one: messages, files, sessions
-- move across unchanged (sender, time, text), the merge is written to the audit trail, and a unique key stops new duplicates.
ALTER TABLE device_chats ADD COLUMN IF NOT EXISTS pair_key text;

UPDATE device_chats c SET pair_key = x.k
FROM (SELECT chat_id, min(user_id) || ':' || max(user_id) AS k FROM chat_members GROUP BY chat_id HAVING count(*) = 2) x
WHERE x.chat_id = c.id AND c.kind = 'direct' AND c.pair_key IS NULL;

DO $$
DECLARE r record; n_msgs int; n_files int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM (SELECT pair_key FROM device_chats WHERE kind = 'direct' AND pair_key IS NOT NULL GROUP BY 1 HAVING count(*) > 1) d) THEN RETURN; END IF;
  ALTER TABLE device_chat_messages DISABLE TRIGGER device_chat_messages_read_only;
  ALTER TABLE device_chats DISABLE TRIGGER device_chats_no_delete;
  FOR r IN
    SELECT d.id AS dup, k.keep FROM device_chats d
    JOIN (SELECT pair_key, min(id) AS keep FROM device_chats WHERE kind = 'direct' AND pair_key IS NOT NULL GROUP BY 1 HAVING count(*) > 1) k ON k.pair_key = d.pair_key
    WHERE d.kind = 'direct' AND d.id <> k.keep ORDER BY d.id
  LOOP
    UPDATE device_chat_messages SET chat_id = r.keep WHERE chat_id = r.dup; GET DIAGNOSTICS n_msgs = ROW_COUNT;
    UPDATE chat_attachments SET chat_id = r.keep WHERE chat_id = r.dup; GET DIAGNOSTICS n_files = ROW_COUNT;
    UPDATE chat_sessions SET chat_id = r.keep WHERE chat_id = r.dup;
    UPDATE device_chats SET last_msg_at = (SELECT max(at) FROM device_chat_messages WHERE chat_id = r.keep) WHERE id = r.keep;
    DELETE FROM chat_members WHERE chat_id = r.dup;
    INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, summary)
      VALUES ('device_chat', r.keep, 'merge_direct', 'System (migration 44)', format('Direct chat #%s merged into #%s (one thread per pair): %s messages, %s files moved', r.dup, r.keep, n_msgs, n_files));
    DELETE FROM device_chats WHERE id = r.dup;
  END LOOP;
  UPDATE device_chats c SET status = 'Active', closed_at = NULL, closed_by = NULL
    WHERE c.kind = 'direct' AND c.status = 'Closed' AND EXISTS (SELECT 1 FROM audit_logs a WHERE a.action = 'merge_direct' AND a.entity_id = c.id AND a.entity_type = 'device_chat');
  ALTER TABLE device_chats ENABLE TRIGGER device_chats_no_delete;
  ALTER TABLE device_chat_messages ENABLE TRIGGER device_chat_messages_read_only;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS device_chats_direct_pair ON device_chats (pair_key) WHERE kind = 'direct';
