-- 2.19 (ITH-207): chat attachments stay read-only (audit); the only change allowed is moving the encrypted file from the
-- database to the cloud file storage — same file (same SHA-256, name, size, chat, message), data → NULL, storage + key set. Re-runnable.
CREATE OR REPLACE FUNCTION public.chat_attachments_read_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND coalesce(OLD.storage, 'db') = 'db' AND NEW.storage IN ('azure', 's3') AND NEW.data IS NULL AND NEW.object_key IS NOT NULL
     AND NEW.sha256 = OLD.sha256 AND NEW.file_name = OLD.file_name AND NEW.size_bytes = OLD.size_bytes AND NEW.chat_id = OLD.chat_id
     AND NEW.message_id IS NOT DISTINCT FROM OLD.message_id AND NEW.kind = OLD.kind AND NEW.at = OLD.at AND NEW.uploaded_by IS NOT DISTINCT FROM OLD.uploaded_by THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Chat attachments are kept for audit (% not allowed)', TG_OP;
END $$;
