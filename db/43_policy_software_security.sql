-- ITH-098 end-user device policy · ITH-075 software / licence compliance · ITH-091 agent hardening
CREATE TABLE IF NOT EXISTS device_policies (
  id serial PRIMARY KEY,
  name text NOT NULL,
  description text,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,          -- { ruleKey: { on: bool, severity: 'Warning'|'Critical', value?: any } }
  applies_to text NOT NULL DEFAULT 'Workstation',    -- Workstation | All
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  updated_by text, updated_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO device_policies (name, description) SELECT 'Company end-user device policy', 'Minimum security and configuration every company computer must meet.'
  WHERE NOT EXISTS (SELECT 1 FROM device_policies);
ALTER TABLE asset_agents ADD COLUMN IF NOT EXISTS compliance jsonb;          -- last policy check: state, failed rules, policy version, time
ALTER TABLE asset_agents ADD COLUMN IF NOT EXISTS compliance_state text;     -- compliant | non_compliant | unknown

CREATE TABLE IF NOT EXISTS software_catalog (
  id serial PRIMARY KEY,
  match text NOT NULL,                 -- case-insensitive text in the application name; * = anything
  publisher text,
  status text NOT NULL CHECK (status IN ('Licensed', 'Free', 'Not allowed', 'Review')),
  license_id integer,                  -- asset_licenses.id when Licensed
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by text, created_at timestamptz NOT NULL DEFAULT now(), updated_by text, updated_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS software_catalog_match ON software_catalog (lower(match));
-- tools used to pirate Windows / Office and common cracking tools are never allowed (IT can change this)
INSERT INTO software_catalog (match, status, notes, created_by)
SELECT m, 'Not allowed', 'Piracy / activation-crack tool', 'System' FROM unnest(ARRAY['kmspico', 'kmsauto', 'kms auto', 'aact', 'kms_vl_all', 'microsoft toolkit', 're-loader', 'windows loader', 'kms tools', 'keygen', 'crack']) m
ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION software_catalog_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Software rules cannot be deleted — deactivate them instead'; END $$;
DROP TRIGGER IF EXISTS software_catalog_no_delete ON software_catalog;
CREATE TRIGGER software_catalog_no_delete BEFORE DELETE ON software_catalog FOR EACH ROW EXECUTE FUNCTION software_catalog_no_delete();

-- ITH-091: signed requests (no replay), token rotation, identity checks
ALTER TABLE asset_agents ADD COLUMN IF NOT EXISTS token_next_hash text;      -- new token handed out, becomes current on first use
ALTER TABLE asset_agents ADD COLUMN IF NOT EXISTS token_rotated_at timestamptz;
ALTER TABLE asset_agents ADD COLUMN IF NOT EXISTS signed_at timestamptz;     -- last signed request (agent 1.2.0+)
