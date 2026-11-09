-- ITH-088: screen-session recordings live in Amazon S3 or Azure Blob (encrypted by IT Hub), never in the database.
ALTER TABLE chat_attachments ADD COLUMN IF NOT EXISTS storage text NOT NULL DEFAULT 'db';   -- db | s3 | azure
ALTER TABLE chat_attachments ADD COLUMN IF NOT EXISTS object_key text;                      -- key in the bucket / container
ALTER TABLE chat_attachments ALTER COLUMN data DROP NOT NULL;
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS recorded boolean NOT NULL DEFAULT true;  -- false: storage not configured, not recorded
INSERT INTO settings (key, value) VALUES ('chat.recordingStorage', '{"provider":"none"}') ON CONFLICT (key) DO NOTHING;
ALTER TABLE chat_attachments ADD COLUMN IF NOT EXISTS store_cfg jsonb;                    -- where it was saved (bucket / container), no secrets
