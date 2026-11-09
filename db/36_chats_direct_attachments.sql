-- Chats: person-to-person (direct) chats besides IT support chats, members, attachments (encrypted, admin-defined types). Re-runnable.
BEGIN;
ALTER TABLE public.device_chats ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'support';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'device_chats_kind_chk') THEN
    ALTER TABLE public.device_chats ADD CONSTRAINT device_chats_kind_chk CHECK (kind IN ('support', 'direct'));
  END IF;
END $$;
ALTER TABLE public.device_chats ALTER COLUMN agent_id DROP NOT NULL;
ALTER TABLE public.device_chats DROP CONSTRAINT IF EXISTS device_chats_status_check;
ALTER TABLE public.device_chats ADD CONSTRAINT device_chats_status_check CHECK (status IN ('Active', 'Waiting on employee', 'Waiting on IT', 'Resolved', 'Closed'));

-- who is in a chat: direct = the two people; support = the employee (IT staff see support chats by role)
CREATE TABLE IF NOT EXISTS public.chat_members (
  chat_id   int NOT NULL REFERENCES public.device_chats(id) ON DELETE RESTRICT,
  user_id   int NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, user_id)
);
CREATE INDEX IF NOT EXISTS chat_members_user ON public.chat_members (user_id);
INSERT INTO public.chat_members (chat_id, user_id) SELECT id, user_id FROM public.device_chats c WHERE NOT EXISTS (SELECT 1 FROM public.chat_members m WHERE m.chat_id = c.id);

ALTER TABLE public.device_chat_messages DROP CONSTRAINT IF EXISTS device_chat_messages_side_check;
ALTER TABLE public.device_chat_messages ADD CONSTRAINT device_chat_messages_side_check CHECK (side IN ('IT', 'Employee', 'System', 'Member'));

CREATE TABLE IF NOT EXISTS public.chat_attachments (
  id          serial PRIMARY KEY,
  chat_id     int NOT NULL REFERENCES public.device_chats(id) ON DELETE RESTRICT,
  message_id  bigint,
  file_name   text NOT NULL,
  mime        text NOT NULL,
  size_bytes  int NOT NULL,
  sha256      text NOT NULL,
  data        bytea NOT NULL,          -- AES-256-GCM encrypted
  kind        text NOT NULL DEFAULT 'file' CHECK (kind IN ('file', 'recording')),
  uploaded_by_id int, uploaded_by text NOT NULL,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_attachments_chat ON public.chat_attachments (chat_id);
CREATE OR REPLACE FUNCTION public.chat_attachments_read_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Chat attachments are kept for audit (% not allowed)', TG_OP; END $$;
DROP TRIGGER IF EXISTS chat_attachments_read_only ON public.chat_attachments;
CREATE TRIGGER chat_attachments_read_only BEFORE UPDATE OR DELETE ON public.chat_attachments FOR EACH ROW EXECUTE FUNCTION public.chat_attachments_read_only();

INSERT INTO public.settings (key, value, description) VALUES
  ('chat.maxAttachmentMB', '10'::jsonb, 'Largest file that can be attached in Chats (MB)'),
  ('chat.attachmentExtensions', '"pdf,png,jpg,jpeg,gif,txt,log,csv,docx,xlsx,pptx,zip"'::jsonb, 'File types allowed as chat attachments (comma separated)'),
  ('chat.directEnabled', 'true'::jsonb, 'Allow person-to-person chats between users')
ON CONFLICT (key) DO NOTHING;
COMMIT;
