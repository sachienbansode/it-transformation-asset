-- 2.11 (ITH-195 / ITH-196): advanced change management (risk score, implementation window, freeze windows,
-- review after go-live) and advanced problem management (root cause analysis, known errors in the knowledge base). Re-runnable.
BEGIN;
ALTER TABLE public.itsm_changes ADD COLUMN IF NOT EXISTS risk_answers jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.itsm_changes ADD COLUMN IF NOT EXISTS risk_score integer;
ALTER TABLE public.itsm_changes ADD COLUMN IF NOT EXISTS planned_start timestamptz;
ALTER TABLE public.itsm_changes ADD COLUMN IF NOT EXISTS planned_end timestamptz;
ALTER TABLE public.itsm_changes ADD COLUMN IF NOT EXISTS pir_outcome text;
ALTER TABLE public.itsm_changes ADD COLUMN IF NOT EXISTS pir_notes text;
ALTER TABLE public.itsm_changes ADD COLUMN IF NOT EXISTS pir_lessons text;
ALTER TABLE public.itsm_changes ADD COLUMN IF NOT EXISTS pir_incidents text;
ALTER TABLE public.itsm_changes ADD COLUMN IF NOT EXISTS pir_by text;
ALTER TABLE public.itsm_changes ADD COLUMN IF NOT EXISTS pir_at timestamptz;
CREATE INDEX IF NOT EXISTS itsm_changes_window_idx ON public.itsm_changes (planned_start, planned_end);

-- change freeze (blackout) windows: no Normal / Standard change may be planned inside one
CREATE TABLE IF NOT EXISTS public.itsm_change_freezes (
  id serial PRIMARY KEY,
  name text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  environment text,            -- NULL = every environment
  reason text,
  is_active boolean NOT NULL DEFAULT true,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

ALTER TABLE public.itsm_problems ADD COLUMN IF NOT EXISTS rca_method text;
ALTER TABLE public.itsm_problems ADD COLUMN IF NOT EXISTS rca jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.itsm_problems ADD COLUMN IF NOT EXISTS root_cause_category text;
ALTER TABLE public.itsm_problems ADD COLUMN IF NOT EXISTS permanent_fix text;
ALTER TABLE public.itsm_problems ADD COLUMN IF NOT EXISTS known_error boolean NOT NULL DEFAULT false;
ALTER TABLE public.itsm_problems ADD COLUMN IF NOT EXISTS known_error_at timestamptz;
ALTER TABLE public.itsm_problems ADD COLUMN IF NOT EXISTS kb_article_id integer;

ALTER TABLE public.itsm_knowledge_base ADD COLUMN IF NOT EXISTS article_type text NOT NULL DEFAULT 'Article';
ALTER TABLE public.itsm_knowledge_base ADD COLUMN IF NOT EXISTS problem_id integer;
ALTER TABLE public.itsm_knowledge_base ADD COLUMN IF NOT EXISTS symptoms text;
ALTER TABLE public.itsm_knowledge_base ADD COLUMN IF NOT EXISTS workaround text;
ALTER TABLE public.itsm_knowledge_base ADD COLUMN IF NOT EXISTS root_cause text;
ALTER TABLE public.itsm_knowledge_base ADD COLUMN IF NOT EXISTS permanent_fix text;
CREATE INDEX IF NOT EXISTS itsm_kb_known_error_idx ON public.itsm_knowledge_base (article_type) WHERE is_active;

COMMIT;
