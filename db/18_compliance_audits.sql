-- Audit & Compliance module: companies, audit templates (imported from Excel), audits, checkpoints, policy register,
-- information schedules (grids), evidence library (versioned files) and comments. Re-runnable.
BEGIN;

CREATE TABLE IF NOT EXISTS public.cmp_companies (
  id serial PRIMARY KEY,
  name text NOT NULL,
  short_name text,
  business_line text,              -- e.g. Mutual Fund / AMC, Broking, AIF
  regulator text,                  -- e.g. SEBI
  registration_no text,
  address text,
  is_active boolean NOT NULL DEFAULT true,
  created_by text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cmp_companies_name_uq ON public.cmp_companies (lower(name));

CREATE TABLE IF NOT EXISTS public.cmp_templates (
  id serial PRIMARY KEY,
  name text NOT NULL,
  framework text,                  -- e.g. SEBI MF System Audit, SEBI CSCRF, ISO 27001
  version text,
  description text,
  source_file text,
  source_object text,
  is_active boolean NOT NULL DEFAULT true,
  created_by text, created_at timestamptz NOT NULL DEFAULT now()
);

-- kind: checklist (tracked checkpoint) | policy (policy / procedure register line)
CREATE TABLE IF NOT EXISTS public.cmp_template_items (
  id serial PRIMARY KEY,
  template_id integer NOT NULL REFERENCES public.cmp_templates(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'checklist',
  sheet text NOT NULL,
  source_row integer,
  ref_no text,
  seq integer NOT NULL DEFAULT 1,
  area text,
  sub_area text,
  checkpoint text NOT NULL,
  evidence_required text,
  doc_type text,                   -- policy rows: Policy / Procedure
  sort_order integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS cmp_template_items_t ON public.cmp_template_items (template_id, sort_order);

-- Other sheets (IT environment, in-scope applications, vendor agreements, samples …) kept as editable grids
CREATE TABLE IF NOT EXISTS public.cmp_template_grids (
  id serial PRIMARY KEY,
  template_id integer NOT NULL REFERENCES public.cmp_templates(id) ON DELETE CASCADE,
  sheet text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  grid jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS public.cmp_audits (
  id serial PRIMARY KEY,
  audit_no text UNIQUE,
  company_id integer NOT NULL REFERENCES public.cmp_companies(id),
  template_id integer REFERENCES public.cmp_templates(id),
  title text NOT NULL,
  audit_type text,                 -- e.g. SEBI System Audit (pre-inspection)
  period_from date, period_to date,
  audit_firm text,
  auditor_contact text,
  status text NOT NULL DEFAULT 'Planning',   -- Planning / Fieldwork / Reporting / Closed
  target_date date,
  scope jsonb NOT NULL DEFAULT '{"applications":[],"vendors":[]}'::jsonb,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cmp_items (
  id serial PRIMARY KEY,
  audit_id integer NOT NULL REFERENCES public.cmp_audits(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'checklist',
  sheet text NOT NULL,
  source_row integer,
  ref_no text,
  seq integer NOT NULL DEFAULT 1,
  area text,
  sub_area text,
  checkpoint text NOT NULL,
  evidence_required text,
  doc_type text,
  owner_user_id integer,
  spoc_user_id integer,
  target_date date,
  management_reply text,
  auditor_remarks text,
  last_review_date date,
  status text NOT NULL DEFAULT 'Pending',
  sort_order integer NOT NULL DEFAULT 0,
  updated_by text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cmp_items_audit ON public.cmp_items (audit_id, kind, sort_order);

CREATE TABLE IF NOT EXISTS public.cmp_grids (
  id serial PRIMARY KEY,
  audit_id integer NOT NULL REFERENCES public.cmp_audits(id) ON DELETE CASCADE,
  sheet text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  template_grid jsonb NOT NULL DEFAULT '[]'::jsonb,   -- labels from the template (read-only cells)
  grid jsonb NOT NULL DEFAULT '[]'::jsonb,            -- current values
  status text NOT NULL DEFAULT 'Pending',
  owner_user_id integer,
  updated_by text, updated_at timestamptz NOT NULL DEFAULT now()
);

-- Evidence / policy library. company_id NULL = group-wide document usable by every company.
CREATE TABLE IF NOT EXISTS public.cmp_documents (
  id serial PRIMARY KEY,
  company_id integer REFERENCES public.cmp_companies(id),
  category text NOT NULL DEFAULT 'Evidence',  -- Policy / Procedure / Evidence / Report / Agreement / Other
  title text NOT NULL,
  description text,
  owner_user_id integer,
  approved_by text,
  approved_on date,
  last_review_date date,
  next_review_date date,
  confidential boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.cmp_document_files (
  id serial PRIMARY KEY,
  document_id integer NOT NULL REFERENCES public.cmp_documents(id) ON DELETE CASCADE,
  version integer NOT NULL,
  object_path text NOT NULL,
  file_name text NOT NULL,
  file_size integer,
  content_type text,
  note text,
  uploaded_by text, uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cmp_document_files_d ON public.cmp_document_files (document_id, version DESC);

CREATE TABLE IF NOT EXISTS public.cmp_item_documents (
  item_id integer NOT NULL REFERENCES public.cmp_items(id) ON DELETE CASCADE,
  document_id integer NOT NULL REFERENCES public.cmp_documents(id) ON DELETE CASCADE,
  linked_by text, linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, document_id)
);
CREATE TABLE IF NOT EXISTS public.cmp_grid_documents (
  grid_id integer NOT NULL REFERENCES public.cmp_grids(id) ON DELETE CASCADE,
  document_id integer NOT NULL REFERENCES public.cmp_documents(id) ON DELETE CASCADE,
  linked_by text, linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (grid_id, document_id)
);

-- Comments and status history on checkpoints (system = true for automatic history lines)
CREATE TABLE IF NOT EXISTS public.cmp_comments (
  id serial PRIMARY KEY,
  item_id integer NOT NULL REFERENCES public.cmp_items(id) ON DELETE CASCADE,
  user_id integer,
  author text,
  is_external boolean NOT NULL DEFAULT false,
  system boolean NOT NULL DEFAULT false,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cmp_comments_item ON public.cmp_comments (item_id, created_at);

-- File views / downloads (who saw which evidence, when)
CREATE TABLE IF NOT EXISTS public.cmp_access_log (
  id bigserial PRIMARY KEY,
  user_id integer, user_name text, action text NOT NULL, document_id integer, file_id integer, audit_id integer,
  ip text, at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.notification_rules (event_key, label, module, description, attach_excel, sort_order)
SELECT 'compliance_assignment', 'Audit checkpoint assigned', 'Audit & Compliance', 'Sent to the owner and SPOC when audit checkpoints are assigned to them. They are emailed directly; recipients here get a copy.', false, 30
WHERE NOT EXISTS (SELECT 1 FROM public.notification_rules WHERE event_key = 'compliance_assignment');
COMMIT;
