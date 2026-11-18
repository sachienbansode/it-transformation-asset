-- ITH-110: customer satisfaction ratings and links between ITSM records.
CREATE TABLE IF NOT EXISTS itsm_csat (
  id serial PRIMARY KEY,
  ticket_type text NOT NULL CHECK (ticket_type IN ('incident', 'request')),
  ticket_id int NOT NULL,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  user_id int REFERENCES users(id),
  user_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticket_type, ticket_id)
);
CREATE TABLE IF NOT EXISTS itsm_links (
  id serial PRIMARY KEY,
  a_type text NOT NULL CHECK (a_type IN ('incident', 'request', 'problem', 'change')),
  a_id int NOT NULL,
  b_type text NOT NULL CHECK (b_type IN ('incident', 'request', 'problem', 'change')),
  b_id int NOT NULL,
  relation text NOT NULL DEFAULT 'related',
  created_by text, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT (a_type = b_type AND a_id = b_id))
);
CREATE UNIQUE INDEX IF NOT EXISTS itsm_links_pair ON itsm_links (least(a_type || ':' || a_id, b_type || ':' || b_id), greatest(a_type || ':' || a_id, b_type || ':' || b_id));
