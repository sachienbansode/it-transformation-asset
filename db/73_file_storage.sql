-- 2.14 (ITH-151): one cloud file storage (Azure Blob / Amazon S3) for all files, set in Admin › Settings › File storage. Re-runnable.
BEGIN;
-- uploads kept in cloud storage (the browser and the tables keep /objects/uploads/<id>; this says where the file is)
CREATE TABLE IF NOT EXISTS public.stored_files (
  id uuid PRIMARY KEY,
  object_key text NOT NULL,
  store_cfg jsonb NOT NULL,
  file_name text,
  size_bytes bigint,
  content_type text,
  sha256 text,
  folder text,
  ref text,
  uploaded boolean NOT NULL DEFAULT false,
  uploaded_by integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  linked_at timestamptz
);
CREATE INDEX IF NOT EXISTS stored_files_folder_idx ON public.stored_files (folder, created_at);
-- policy PDFs may now be kept in cloud storage instead of the database
ALTER TABLE public.policy_documents ALTER COLUMN data DROP NOT NULL;
ALTER TABLE public.policy_documents ADD COLUMN IF NOT EXISTS object_key text;
ALTER TABLE public.policy_documents ADD COLUMN IF NOT EXISTS store_cfg jsonb;
-- the older recording-storage setting becomes the file storage (main folder from its prefix)
INSERT INTO public.settings (key, value)
SELECT 'storage.config', (s.value::jsonb - 'prefix') || jsonb_build_object('root', coalesce(nullif(regexp_replace(regexp_replace(coalesce(s.value::jsonb->>'prefix', ''), '/?recordings/?$', ''), '[^a-zA-Z0-9-]+', '-', 'g'), ''), 'it-hub'))
FROM public.settings s
WHERE s.key = 'chat.recordingStorage' AND coalesce(s.value::jsonb->>'provider', 'none') <> 'none'
  AND NOT EXISTS (SELECT 1 FROM public.settings x WHERE x.key = 'storage.config');
COMMIT;
