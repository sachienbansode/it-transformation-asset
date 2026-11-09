-- Chats: screen sharing / remote help sessions (employee consent, recorded) and WebRTC signalling. Re-runnable.
BEGIN;
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id              serial PRIMARY KEY,
  chat_id         int NOT NULL REFERENCES public.device_chats(id) ON DELETE RESTRICT,
  requested_by_id int NOT NULL, requested_by text NOT NULL,
  sharer_id       int NOT NULL,                       -- the employee whose screen is shared
  status          text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'declined', 'live', 'ended')),
  control         text NOT NULL DEFAULT 'none' CHECK (control IN ('none', 'requested', 'granted', 'denied', 'ended')),
  consent_at      timestamptz, control_granted_at timestamptz, control_ended_at timestamptz,
  started_at      timestamptz, ended_at timestamptz, ended_by text,
  recording_attachment_id int,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_sessions_chat ON public.chat_sessions (chat_id, created_at DESC);
CREATE TABLE IF NOT EXISTS public.chat_signals (
  id          bigserial PRIMARY KEY,
  session_id  int NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  from_id     int NOT NULL,
  type        text NOT NULL CHECK (type IN ('offer', 'answer', 'ice')),
  payload     jsonb NOT NULL,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_signals_session ON public.chat_signals (session_id, id);
INSERT INTO public.settings (key, value, description) VALUES
  ('chat.maxRecordingMB', '300'::jsonb, 'Largest screen-session recording kept (MB)'),
  ('chat.iceServers', '[]'::jsonb, 'WebRTC STUN/TURN servers for screen sharing, e.g. [{"urls":"stun:stun.example.com:3478"}] — empty works inside the office network / VPN')
ON CONFLICT (key) DO NOTHING;
COMMIT;
