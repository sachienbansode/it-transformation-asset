-- Device Health: act on health items (ticket, ignore with reason) and IT-initiated support chat with the employee. Re-runnable.
BEGIN;
ALTER TABLE public.asset_agent_alerts ADD COLUMN IF NOT EXISTS incident_id int;
ALTER TABLE public.asset_agent_alerts ADD COLUMN IF NOT EXISTS ticket_no text;
ALTER TABLE public.asset_agent_alerts ADD COLUMN IF NOT EXISTS ticket_auto boolean NOT NULL DEFAULT false;
ALTER TABLE public.asset_agent_alerts ADD COLUMN IF NOT EXISTS ticket_tried_at timestamptz;
ALTER TABLE public.asset_agent_alerts ADD COLUMN IF NOT EXISTS ignored_at timestamptz;
ALTER TABLE public.asset_agent_alerts ADD COLUMN IF NOT EXISTS ignored_by text;
ALTER TABLE public.asset_agent_alerts ADD COLUMN IF NOT EXISTS ignore_reason text;
ALTER TABLE public.asset_agent_alerts ADD COLUMN IF NOT EXISTS ignore_until timestamptz;

CREATE TABLE IF NOT EXISTS public.device_chats (
  id          serial PRIMARY KEY,
  agent_id    int NOT NULL REFERENCES public.asset_agents(id) ON DELETE CASCADE,
  alert_id    int,
  incident_id int,
  user_id     int NOT NULL,                    -- the employee
  subject     text NOT NULL,
  status      text NOT NULL DEFAULT 'Waiting on employee'
              CHECK (status IN ('Waiting on employee', 'Waiting on IT', 'Resolved', 'Closed')),
  opened_by   text NOT NULL, opened_by_id int,
  opened_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz, resolved_by text, resolution text,
  closed_at   timestamptz, closed_by text, close_note text,
  last_msg_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS device_chats_user ON public.device_chats (user_id, last_msg_at DESC);
CREATE INDEX IF NOT EXISTS device_chats_agent ON public.device_chats (agent_id);
CREATE TABLE IF NOT EXISTS public.device_chat_messages (
  id          bigserial PRIMARY KEY,
  chat_id     int NOT NULL REFERENCES public.device_chats(id) ON DELETE CASCADE,
  sender_id   int, sender_name text NOT NULL,
  side        text NOT NULL CHECK (side IN ('IT', 'Employee', 'System')),
  body        text NOT NULL,
  at          timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz
);
CREATE INDEX IF NOT EXISTS device_chat_messages_chat ON public.device_chat_messages (chat_id, at);

INSERT INTO public.settings (key, value, description) VALUES
  ('assetAgent.autoTicket', '"critical"'::jsonb, 'Raise an ITSM incident automatically for device health issues: off / critical / all'),
  ('assetAgent.chatAutoCloseDays', '3'::jsonb, 'Resolved device chats close automatically after this many days unless the employee re-opens them')
ON CONFLICT (key) DO NOTHING;
COMMIT;
