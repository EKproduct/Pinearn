-- Real Pinterest OAuth: token storage, kept out of client reach entirely.
-- No GRANT/policy for `authenticated`/`anon` on purpose — only a service-role
-- client (server-only) may ever read or write this table, so a user's own
-- Pinterest access/refresh token is never exposed to browser-side code.
CREATE TABLE public.pinterest_connections (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pinterest_user_id TEXT,
  username TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  scopes TEXT,
  token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pinterest_connections ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.pinterest_connections TO service_role;

CREATE TRIGGER set_pinterest_connections_updated_at
  BEFORE UPDATE ON public.pinterest_connections
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Idempotency key for pins published to / imported from a real Pinterest Pin.
ALTER TABLE public.pins ADD COLUMN IF NOT EXISTS pinterest_pin_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS pins_pinterest_pin_id_key
  ON public.pins (pinterest_pin_id) WHERE pinterest_pin_id IS NOT NULL;

-- collections.pinterest_board_id already exists (see 20260706071512); make it
-- the idempotency key for board import instead of the old slug-based dedupe.
CREATE UNIQUE INDEX IF NOT EXISTS collections_pinterest_board_id_key
  ON public.collections (pinterest_board_id) WHERE pinterest_board_id IS NOT NULL;
