-- ITH-070: device online status, on-demand refresh, and suggestions to close tickets from the latest device data
ALTER TABLE asset_agents ADD COLUMN IF NOT EXISTS last_pulse_at timestamptz;
ALTER TABLE asset_agents ADD COLUMN IF NOT EXISTS refresh_requested_at timestamptz;
ALTER TABLE asset_agents ADD COLUMN IF NOT EXISTS refresh_requested_by text;

CREATE TABLE IF NOT EXISTS ticket_close_suggestions (
  id          serial PRIMARY KEY,
  incident_id integer NOT NULL REFERENCES itsm_incidents(id) ON DELETE CASCADE,
  agent_id    integer NOT NULL REFERENCES asset_agents(id) ON DELETE CASCADE,
  rule        text NOT NULL,                 -- reboot | disk | battery | antivirus | bitlocker | firewall | patches | performance
  reason      text NOT NULL,                 -- why the ticket looks fixed
  evidence    text NOT NULL,                 -- the device values it is based on
  report_at   timestamptz NOT NULL,          -- time of the device report
  hostname    text,
  status      text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Accepted', 'Dismissed', 'Expired')),
  decided_by  text,
  decided_at  timestamptz,
  decision_note text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ticket_close_suggestions_open ON ticket_close_suggestions (incident_id, rule) WHERE status = 'Open';
CREATE INDEX IF NOT EXISTS ticket_close_suggestions_agent ON ticket_close_suggestions (agent_id, status);
