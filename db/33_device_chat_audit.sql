-- Device chat records are kept for audit: messages cannot be edited or deleted (only the read time is set once);
-- chats cannot be deleted, and a device with chats cannot be hard-deleted. Re-runnable.
BEGIN;
CREATE OR REPLACE FUNCTION public.device_chat_messages_read_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.read_at IS NULL AND NEW.read_at IS NOT NULL
     AND (NEW.chat_id, NEW.sender_id, NEW.sender_name, NEW.side, NEW.body, NEW.at) IS NOT DISTINCT FROM (OLD.chat_id, OLD.sender_id, OLD.sender_name, OLD.side, OLD.body, OLD.at) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Device chat messages are read-only (% not allowed)', TG_OP;
END $$;
DROP TRIGGER IF EXISTS device_chat_messages_read_only ON public.device_chat_messages;
CREATE TRIGGER device_chat_messages_read_only BEFORE UPDATE OR DELETE ON public.device_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.device_chat_messages_read_only();

CREATE OR REPLACE FUNCTION public.device_chats_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Device chats are kept for audit (DELETE not allowed)'; END $$;
DROP TRIGGER IF EXISTS device_chats_no_delete ON public.device_chats;
CREATE TRIGGER device_chats_no_delete BEFORE DELETE ON public.device_chats FOR EACH ROW EXECUTE FUNCTION public.device_chats_no_delete();

ALTER TABLE public.device_chats DROP CONSTRAINT IF EXISTS device_chats_agent_id_fkey;
ALTER TABLE public.device_chats ADD CONSTRAINT device_chats_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.asset_agents(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS device_chat_messages_unread ON public.device_chat_messages (chat_id) WHERE read_at IS NULL;
COMMIT;
