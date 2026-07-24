
-- 1) Additive columns on the existing Paddle-mirror subscriptions table.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS scheduled_change_action text,
  ADD COLUMN IF NOT EXISTS scheduled_change_at timestamptz;

-- 2) Raw Paddle customer mirror. Keyed on paddle_customer_id (the natural
--    unique id from the provider). Not a replacement for public.profiles —
--    profiles remain the app identity; this table is a verbatim mirror of
--    what the provider tells us about a Paddle-side customer so the webhook
--    can persist customer.created / customer.updated events without
--    trusting the client.
CREATE TABLE IF NOT EXISTS public.paddle_customers (
  paddle_customer_id text PRIMARY KEY,
  environment text NOT NULL,
  email text,
  name text,
  locale text,
  status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Service-role-only writes (webhook). No anon/authenticated grants: the
-- mirror is server-side infrastructure, not user-facing data.
GRANT ALL ON public.paddle_customers TO service_role;

ALTER TABLE public.paddle_customers ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated: RLS is on and no policy allows
-- non-service-role access, which is exactly what we want.

CREATE INDEX IF NOT EXISTS idx_paddle_customers_email
  ON public.paddle_customers (email);
