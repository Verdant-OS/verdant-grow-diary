-- Phase 2a: Lovable built-in Paddle sink. Isolated from BYO billing_subscriptions/paddle_events.

-- 1. subscriptions: canonical Lovable Paddle destination per Lovable Paddle spec.
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paddle_subscription_id text NOT NULL UNIQUE,
  paddle_customer_id text NOT NULL,
  product_id text NOT NULL,
  price_id text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  environment text NOT NULL DEFAULT 'sandbox'
    CHECK (environment IN ('sandbox','live')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_paddle_id ON public.subscriptions(paddle_subscription_id);
CREATE INDEX idx_subscriptions_user_env_active
  ON public.subscriptions(user_id, environment)
  WHERE status IN ('active','trialing','past_due');

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies for authenticated: all writes are service_role only.

-- Reuse existing updated_at trigger function (set_updated_at) if present; create if not.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at' AND pronamespace = 'public'::regnamespace
  ) THEN
    CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql SET search_path = public AS $fn$
    BEGIN NEW.updated_at = now(); RETURN NEW; END;
    $fn$;
  END IF;
END $$;

CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. lovable_paddle_events: idempotency + audit log, isolated from BYO paddle_events.
CREATE TABLE public.lovable_paddle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paddle_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('sandbox','live')),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  paddle_subscription_id text,
  paddle_transaction_id text,
  price_external_id text,
  product_external_id text,
  processed_ok boolean NOT NULL DEFAULT false,
  skip_reason text,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lovable_paddle_events_user ON public.lovable_paddle_events(user_id);
CREATE INDEX idx_lovable_paddle_events_type ON public.lovable_paddle_events(event_type);

-- No authenticated grants: append-only, service-role only. Operator audit for this
-- source will be built on top of this table in a separate reviewed slice if needed.
GRANT ALL ON public.lovable_paddle_events TO service_role;

ALTER TABLE public.lovable_paddle_events ENABLE ROW LEVEL SECURITY;

-- Deliberately no policies: with RLS enabled and zero policies, authenticated/anon
-- get zero rows. service_role bypasses RLS.