-- ITH-101: ITSM workflow designer and engine.
-- A workflow belongs to one ticket type and is chosen by conditions (category, priority …). Each change is a new version:
-- drafts are edited on the canvas, a published version is frozen, and each ticket keeps the version it started on.
CREATE TABLE IF NOT EXISTS itsm_workflows (
  id serial PRIMARY KEY,
  ticket_type text NOT NULL CHECK (ticket_type IN ('incident', 'request', 'problem', 'change')),
  name text NOT NULL,
  description text,
  match jsonb NOT NULL DEFAULT '{}'::jsonb,         -- {category:[..], priority:[..]}; empty = all tickets of the type
  rank int NOT NULL DEFAULT 100,                    -- lower is checked first
  is_active boolean NOT NULL DEFAULT true,
  created_by text, created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS itsm_workflows_name ON itsm_workflows (ticket_type, lower(name));

CREATE TABLE IF NOT EXISTS itsm_workflow_versions (
  id serial PRIMARY KEY,
  workflow_id int NOT NULL REFERENCES itsm_workflows(id),
  version int NOT NULL,
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Published', 'Retired')),
  definition jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  notes text,
  created_by text, created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text, updated_at timestamptz NOT NULL DEFAULT now(),
  published_by text, published_at timestamptz,
  UNIQUE (workflow_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS itsm_workflow_one_published ON itsm_workflow_versions (workflow_id) WHERE status = 'Published';
CREATE UNIQUE INDEX IF NOT EXISTS itsm_workflow_one_draft ON itsm_workflow_versions (workflow_id) WHERE status = 'Draft';

-- a published or retired version is frozen (only Published → Retired is allowed); versions are never deleted
CREATE OR REPLACE FUNCTION itsm_workflow_versions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Workflow versions are kept for audit (DELETE not allowed)'; END IF;
  IF OLD.status <> 'Draft' AND NOT (OLD.status = 'Published' AND NEW.status = 'Retired' AND NEW.definition = OLD.definition) THEN
    RAISE EXCEPTION 'Published workflow versions cannot be changed — create a new draft';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS itsm_workflow_versions_guard ON itsm_workflow_versions;
CREATE TRIGGER itsm_workflow_versions_guard BEFORE UPDATE OR DELETE ON itsm_workflow_versions FOR EACH ROW EXECUTE FUNCTION itsm_workflow_versions_guard();

CREATE OR REPLACE FUNCTION itsm_workflows_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Workflows are kept for audit (DELETE not allowed) — deactivate instead'; END $$;
DROP TRIGGER IF EXISTS itsm_workflows_no_delete ON itsm_workflows;
CREATE TRIGGER itsm_workflows_no_delete BEFORE DELETE ON itsm_workflows FOR EACH ROW EXECUTE FUNCTION itsm_workflows_no_delete();

-- one running workflow per ticket
CREATE TABLE IF NOT EXISTS itsm_ticket_workflows (
  id serial PRIMARY KEY,
  ticket_type text NOT NULL,
  ticket_id int NOT NULL,
  workflow_id int NOT NULL REFERENCES itsm_workflows(id),
  version_id int NOT NULL REFERENCES itsm_workflow_versions(id),
  current_node text,
  entered_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL DEFAULT 'Running' CHECK (state IN ('Running', 'Waiting approval', 'Waiting timer', 'Finished', 'Stopped')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (ticket_type, ticket_id)
);
CREATE INDEX IF NOT EXISTS itsm_ticket_workflows_wait ON itsm_ticket_workflows (state) WHERE state IN ('Waiting approval', 'Waiting timer');

-- every step a ticket takes (append-only)
CREATE TABLE IF NOT EXISTS itsm_workflow_events (
  id bigserial PRIMARY KEY,
  instance_id int NOT NULL REFERENCES itsm_ticket_workflows(id),
  node_id text, node_label text, node_type text,
  event text NOT NULL,           -- entered | left | approved | rejected | timeout | assigned | notified | condition | blocked | stopped | finished
  detail text,
  by_name text NOT NULL DEFAULT 'Workflow',
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS itsm_workflow_events_inst ON itsm_workflow_events (instance_id, at);
CREATE OR REPLACE FUNCTION itsm_workflow_events_ro() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Workflow history is read-only'; END $$;
DROP TRIGGER IF EXISTS itsm_workflow_events_ro ON itsm_workflow_events;
CREATE TRIGGER itsm_workflow_events_ro BEFORE UPDATE OR DELETE ON itsm_workflow_events FOR EACH ROW EXECUTE FUNCTION itsm_workflow_events_ro();

-- approval tasks raised by workflow approval steps
CREATE TABLE IF NOT EXISTS itsm_workflow_tasks (
  id serial PRIMARY KEY,
  instance_id int NOT NULL REFERENCES itsm_ticket_workflows(id),
  node_id text NOT NULL,
  title text NOT NULL,
  approver_ids int[] NOT NULL DEFAULT '{}',
  approver_label text,
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Cancelled')),
  decided_by text, decided_by_id int, decided_at timestamptz, notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS itsm_workflow_tasks_pending ON itsm_workflow_tasks (status) WHERE status = 'Pending';
