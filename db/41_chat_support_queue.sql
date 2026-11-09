-- ITH-079: IT support chats go to the support team an ITSM Admin maps; team members pick them up from a queue.
ALTER TABLE device_chats ADD COLUMN IF NOT EXISTS team_id integer;
ALTER TABLE device_chats ADD COLUMN IF NOT EXISTS assigned_to_id integer;
ALTER TABLE device_chats ADD COLUMN IF NOT EXISTS assigned_to text;
ALTER TABLE device_chats ADD COLUMN IF NOT EXISTS picked_at timestamptz;
CREATE INDEX IF NOT EXISTS device_chats_queue ON device_chats (team_id, assigned_to_id, status);
