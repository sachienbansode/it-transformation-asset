-- ITH-122..124 (r89): Policy Register as its own module (role permission "policies"), PDF document per policy version,
-- selected-employee audience; master data in Title Case. Re-runnable.

-- ── Title Case for master lists (keys are not changed) ──
CREATE OR REPLACE FUNCTION public.ithub_title_case(t text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE w text; core text; pre text; suf text; m text[]; out text := ''; parts text[]; i int := 0; n int;
  keep CONSTANT text[] := ARRAY['IT','HR','HO','DC','DR','AMC','MF','AIF','IB','IE','NBFC','KPI','CXO','CEO','CTO','CFO','COO','CISO','UPS','PCG','ECM','OEM','AWS','HP','IBM','SAP','ERP','CRM','PMS','RMS','BU','QA','UAT','NOC','SOC','VIP','PC','IP','ID','HQ','LAN','WAN','VPN','PO','GST','TDS','KYC','AML','SEBI','RBI','NSE','BSE','MCX','IRDAI','DP','RTA','CDSL','NSDL','EOL','IDC','LLM','RPA','ML','AI','BI','NLP','API','SAAS','GPL','LGPL','MIT','BSD','PII','PDPA','II','III','IV'];
  small CONSTANT text[] := ARRAY['and','or','of','the','for','to','in','on','at','by','with','a','an'];
BEGIN
  IF t IS NULL OR btrim(t) = '' THEN RETURN t; END IF;
  IF t !~ '[a-z]' AND t ~ '[A-Z]{2,}.*\s' THEN   -- typed in CAPS LOCK: lower-case everything except known acronyms
    SELECT string_agg(CASE WHEN upper(regexp_replace(x, '[^A-Za-z]', '', 'g')) = ANY(keep) THEN x ELSE lower(x) END, ' ') INTO t FROM unnest(string_to_array(t, ' ')) x;
  END IF;
  parts := regexp_split_to_array(btrim(regexp_replace(t, '\s+', ' ', 'g')), '(?=[ /-])|(?<=[ /-])');
  n := array_length(parts, 1);
  FOREACH w IN ARRAY parts LOOP
    i := i + 1;
    IF w ~ '^[ /-]$' THEN out := out || w; CONTINUE; END IF;
    m := regexp_match(w, '^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$'); pre := m[1]; core := m[2]; suf := m[3];   -- keep brackets / punctuation
    IF core = '' THEN out := out || w; CONTINUE; END IF;
    IF upper(core) = ANY(keep) THEN core := upper(core);
    ELSIF core ~ '[a-z][A-Z]' OR (core ~ '^[A-Z0-9&.]+$' AND length(core) BETWEEN 2 AND 6) OR core ~ '^[0-9]' THEN core := core;   -- iPhone, McAfee, ACRONYM, 64-bit
    ELSIF i > 1 AND i < n AND pre = '' AND lower(core) = ANY(small) THEN core := lower(core);
    ELSE core := upper(left(core, 1)) || lower(substr(core, 2)); END IF;
    out := out || pre || core || suf;
  END LOOP;
  RETURN out;
END $$;

DO $$
BEGIN
  -- disable the "no delete / audit" triggers only for this bulk label fix (none delete rows)
  UPDATE public.masters SET label = public.ithub_title_case(label)
  WHERE label IS DISTINCT FROM public.ithub_title_case(label);
  -- two values that only differed in case become duplicates: keep the first, deactivate the rest
  UPDATE public.masters m SET is_active = false
  WHERE EXISTS (SELECT 1 FROM public.masters x WHERE x.category = m.category AND coalesce(x.parent, '') = coalesce(m.parent, '') AND x.label = m.label AND x.id < m.id) AND m.is_active;
END $$;

-- records that hold the department / location TEXT follow the new spelling
UPDATE public.assets a SET department = m.label FROM public.masters m WHERE m.category = 'department' AND lower(a.department) = lower(m.label) AND a.department <> m.label;
UPDATE public.assets a SET location = m.label FROM public.masters m WHERE m.category = 'asset_location' AND lower(a.location) = lower(m.label) AND a.location <> m.label;
UPDATE public.itsm_service_requests a SET department = m.label FROM public.masters m WHERE m.category = 'department' AND lower(a.department) = lower(m.label) AND a.department <> m.label;
-- (r98: users now keep the department NAME — see 60_signin_sessions_dept.sql)

-- ── Policy Register module permission: the existing admin-only screen becomes a role-based module ──
-- Compliance Admin gets it by default (can be changed in Roles & Permissions); Super Admin always has it.
INSERT INTO public.role_permissions (role_id, module, access_level)
SELECT r.id, 'policies', 'admin' FROM public.roles r WHERE r.name = 'Compliance Admin'
  AND NOT EXISTS (SELECT 1 FROM public.role_permissions p WHERE p.role_id = r.id AND p.module = 'policies');

-- ── PDF document per policy (stored in the database: immutable per version, access-controlled, no public file URL) ──
CREATE TABLE IF NOT EXISTS public.policy_documents (
  id          serial PRIMARY KEY,
  policy_id   integer NOT NULL REFERENCES public.policies(id),
  file_name   text NOT NULL,
  size_bytes  integer NOT NULL,
  pages       integer,
  sha256      text NOT NULL,
  data        bytea NOT NULL,
  uploaded_by text,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS policy_documents_policy ON public.policy_documents (policy_id);
ALTER TABLE public.policies        ADD COLUMN IF NOT EXISTS document_id integer REFERENCES public.policy_documents(id);
ALTER TABLE public.policy_versions ADD COLUMN IF NOT EXISTS document_id integer REFERENCES public.policy_documents(id);
-- who opened the document (read-only viewer) — evidence for audits
CREATE TABLE IF NOT EXISTS public.policy_document_views (
  id          bigserial PRIMARY KEY,
  policy_id   integer NOT NULL,
  version     integer,
  document_id integer NOT NULL,
  user_id     integer NOT NULL,
  ip          text,
  viewed_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS policy_document_views_doc ON public.policy_document_views (document_id, user_id);
