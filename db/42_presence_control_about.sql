-- ITH-077 user status · ITH-084 guided remote control
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS presence_mode text NOT NULL DEFAULT 'auto';   -- auto | dnd
ALTER TABLE users ADD COLUMN IF NOT EXISTS dnd_until timestamptz;
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS control_code text;                  -- Quick Assist code sent by IT (encrypted, expires)
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS control_code_at timestamptz;
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS control_started_at timestamptz;      -- employee confirmed IT is connected
DO $$ BEGIN
  ALTER TABLE chat_sessions DROP CONSTRAINT IF EXISTS chat_sessions_control_check;
  ALTER TABLE chat_sessions ADD CONSTRAINT chat_sessions_control_check CHECK (control IN ('none', 'requested', 'granted', 'active', 'denied', 'ended'));
EXCEPTION WHEN others THEN NULL; END $$;
