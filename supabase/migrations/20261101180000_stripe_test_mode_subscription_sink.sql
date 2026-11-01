-- Stripe test-mode subscription sink (issue #2669, slice 1).
-- NOT APPLIED by the pull request that adds this file. Do not run it against
-- production until a separate founder authorization names this migration.
-- Test mode only: provider stripe rows must be environment sandbox, and this
-- function refuses livemode and Founder Lifetime before any write.
-- Existing public.subscriptions rows stay provider paddle via the column default.
-- Entitlement reads keep their current column list until this migration is applied.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'paddle',
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS last_provider_event_occurred_at timestamptz;

COMMENT ON COLUMN public.subscriptions.last_provider_event_occurred_at IS
  'Occurred time of the newest provider event applied to this row. A Stripe test-mode event older than this value must not overwrite status, and a canceled row stays canceled.';

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_provider_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_provider_check
  CHECK (provider IN ('paddle', 'stripe'));

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_stripe_provider_shape_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_stripe_provider_shape_check
  CHECK (
    provider <> 'stripe'
    OR (
      paddle_subscription_id LIKE 'stripe:%'
      AND environment = 'sandbox'
      AND price_id <> 'founder_lifetime'
      AND stripe_subscription_id IS NOT NULL
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_subscription_id_uidx
  ON public.subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE TABLE public.stripe_test_customers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL UNIQUE,
  environment text NOT NULL DEFAULT 'sandbox' CHECK (environment = 'sandbox'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE public.stripe_test_customers FROM PUBLIC;
REVOKE ALL ON TABLE public.stripe_test_customers FROM anon;
REVOKE ALL ON TABLE public.stripe_test_customers FROM authenticated;
GRANT ALL ON TABLE public.stripe_test_customers TO service_role;

ALTER TABLE public.stripe_test_customers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.stripe_webhook_events (
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  action text NOT NULL,
  result text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  environment text NOT NULL CHECK (environment = 'sandbox'),
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id)
);

REVOKE ALL ON TABLE public.stripe_webhook_events FROM PUBLIC;
REVOKE ALL ON TABLE public.stripe_webhook_events FROM anon;
REVOKE ALL ON TABLE public.stripe_webhook_events FROM authenticated;
GRANT ALL ON TABLE public.stripe_webhook_events TO service_role;

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.apply_stripe_test_mode_event(
  p_event_id text,
  p_event_type text,
  p_action text,
  p_user_id uuid,
  p_plan_id text,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_status text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_checkout_session_id text,
  p_environment text,
  p_livemode boolean,
  p_occurred_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_id text;
  v_credits int;
  v_grant jsonb;
BEGIN
  -- Refusals return before any insert. Live mode and Founder Lifetime
  -- must not leave an event row or a subscription row.
  IF p_livemode IS TRUE OR p_environment IS DISTINCT FROM 'sandbox' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'live_mode_refused');
  END IF;

  IF p_plan_id IN ('founder_lifetime', 'founder-lifetime') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'plan_retired');
  END IF;

  IF p_event_id IS NULL OR length(btrim(p_event_id)) = 0 OR p_event_type IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'malformed');
  END IF;

  IF p_action NOT IN (
    'grant_subscription',
    'update_subscription',
    'cancel_subscription',
    'mark_past_due',
    'grant_credit_pack',
    'record_only'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'malformed');
  END IF;

  IF p_action = 'grant_subscription' AND (
    p_user_id IS NULL
    OR p_plan_id NOT IN ('pro_monthly', 'pro_annual', 'craft_monthly', 'craft_annual')
    OR p_stripe_subscription_id IS NULL
    OR p_stripe_customer_id IS NULL
    OR p_status NOT IN ('active', 'trialing')
    OR p_period_end IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'period_required');
  END IF;

  IF p_action = 'grant_credit_pack' AND (
    p_user_id IS NULL
    OR p_plan_id NOT IN ('credit_pack_50', 'credit_pack_150')
    OR p_checkout_session_id IS NULL
    OR length(btrim(p_checkout_session_id)) = 0
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'malformed');
  END IF;

  IF p_action IN ('cancel_subscription', 'mark_past_due', 'update_subscription')
     AND (p_stripe_subscription_id IS NULL OR length(btrim(p_stripe_subscription_id)) = 0) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'malformed');
  END IF;

  INSERT INTO public.stripe_webhook_events (event_id, event_type, action, result, details, environment)
  VALUES (
    p_event_id,
    p_event_type,
    p_action,
    'received',
    jsonb_build_object('plan_id', p_plan_id, 'action', p_action),
    'sandbox'
  )
  ON CONFLICT (event_id) DO NOTHING
  RETURNING event_id INTO v_event_id;

  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'idempotent');
  END IF;

  IF p_user_id IS NOT NULL AND p_stripe_customer_id IS NOT NULL THEN
    INSERT INTO public.stripe_test_customers (user_id, stripe_customer_id, environment)
    VALUES (p_user_id, p_stripe_customer_id, 'sandbox')
    ON CONFLICT (user_id) DO UPDATE
      SET stripe_customer_id = EXCLUDED.stripe_customer_id,
          updated_at = now()
    WHERE public.stripe_test_customers.environment = 'sandbox';
  END IF;

  IF p_action = 'grant_subscription' THEN
    INSERT INTO public.subscriptions (
      user_id,
      paddle_subscription_id,
      paddle_customer_id,
      product_id,
      price_id,
      status,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      environment,
      provider,
      stripe_customer_id,
      stripe_subscription_id,
      last_provider_event_occurred_at
    ) VALUES (
      p_user_id,
      'stripe:' || p_stripe_subscription_id,
      'stripe:' || p_stripe_customer_id,
      p_plan_id,
      p_plan_id,
      p_status,
      p_period_start,
      p_period_end,
      COALESCE(p_cancel_at_period_end, false),
      'sandbox',
      'stripe',
      p_stripe_customer_id,
      p_stripe_subscription_id,
      p_occurred_at
    )
    -- A canceled Stripe subscription id is terminal. An older event must not
    -- replace a newer status. past_due still entitles, so a late failure after
    -- cancel would restore access if this guard were missing.
    ON CONFLICT (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
      paddle_subscription_id = EXCLUDED.paddle_subscription_id,
      paddle_customer_id = EXCLUDED.paddle_customer_id,
      product_id = EXCLUDED.product_id,
      price_id = EXCLUDED.price_id,
      status = EXCLUDED.status,
      current_period_start = EXCLUDED.current_period_start,
      current_period_end = EXCLUDED.current_period_end,
      cancel_at_period_end = EXCLUDED.cancel_at_period_end,
      stripe_customer_id = EXCLUDED.stripe_customer_id,
      provider = 'stripe',
      environment = 'sandbox',
      last_provider_event_occurred_at = COALESCE(
        EXCLUDED.last_provider_event_occurred_at,
        public.subscriptions.last_provider_event_occurred_at
      ),
      updated_at = now()
    WHERE public.subscriptions.provider = 'stripe'
      AND public.subscriptions.environment = 'sandbox'
      AND public.subscriptions.status IS DISTINCT FROM 'canceled'
      AND (
        EXCLUDED.last_provider_event_occurred_at IS NULL
        OR public.subscriptions.last_provider_event_occurred_at IS NULL
        OR EXCLUDED.last_provider_event_occurred_at >= public.subscriptions.last_provider_event_occurred_at
      );
  ELSIF p_action = 'update_subscription' THEN
    UPDATE public.subscriptions
       SET status = COALESCE(p_status, status),
           current_period_start = COALESCE(p_period_start, current_period_start),
           current_period_end = COALESCE(p_period_end, current_period_end),
           cancel_at_period_end = COALESCE(p_cancel_at_period_end, cancel_at_period_end),
           last_provider_event_occurred_at = COALESCE(p_occurred_at, last_provider_event_occurred_at),
           updated_at = now()
     WHERE provider = 'stripe'
       AND environment = 'sandbox'
       AND stripe_subscription_id = p_stripe_subscription_id
       AND status IS DISTINCT FROM 'canceled'
       AND (
         p_occurred_at IS NULL
         OR last_provider_event_occurred_at IS NULL
         OR p_occurred_at >= last_provider_event_occurred_at
       );
  ELSIF p_action = 'cancel_subscription' THEN
    UPDATE public.subscriptions
       SET status = 'canceled',
           last_provider_event_occurred_at = COALESCE(p_occurred_at, last_provider_event_occurred_at),
           updated_at = now()
     WHERE provider = 'stripe'
       AND environment = 'sandbox'
       AND stripe_subscription_id = p_stripe_subscription_id
       AND (
         p_occurred_at IS NULL
         OR last_provider_event_occurred_at IS NULL
         OR p_occurred_at >= last_provider_event_occurred_at
       );
  ELSIF p_action = 'mark_past_due' THEN
    UPDATE public.subscriptions
       SET status = 'past_due',
           last_provider_event_occurred_at = COALESCE(p_occurred_at, last_provider_event_occurred_at),
           updated_at = now()
     WHERE provider = 'stripe'
       AND environment = 'sandbox'
       AND stripe_subscription_id = p_stripe_subscription_id
       AND status IS DISTINCT FROM 'canceled'
       AND (
         p_occurred_at IS NULL
         OR last_provider_event_occurred_at IS NULL
         OR p_occurred_at >= last_provider_event_occurred_at
       );
  ELSIF p_action = 'grant_credit_pack' THEN
    -- Credits are derived here. A caller-supplied credit count is not accepted.
    v_credits := CASE p_plan_id
      WHEN 'credit_pack_50' THEN 50
      WHEN 'credit_pack_150' THEN 150
      ELSE NULL
    END;
    IF v_credits IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'unknown_plan');
    END IF;
    v_grant := public.grant_lovable_credit_pack(
      p_user_id,
      p_checkout_session_id,
      v_credits,
      p_plan_id,
      'sandbox'
    );
    IF (v_grant->>'ok') IS DISTINCT FROM 'true' THEN
      RETURN jsonb_build_object('ok', false, 'reason', COALESCE(v_grant->>'reason', 'grant_failed'));
    END IF;
  END IF;

  UPDATE public.stripe_webhook_events
     SET result = 'applied'
   WHERE event_id = p_event_id;

  RETURN jsonb_build_object('ok', true, 'reason', 'applied');
END;
$$;

REVOKE ALL ON FUNCTION public.apply_stripe_test_mode_event(text, text, text, uuid, text, text, text, text, timestamptz, timestamptz, boolean, text, text, boolean, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_stripe_test_mode_event(text, text, text, uuid, text, text, text, text, timestamptz, timestamptz, boolean, text, text, boolean, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.apply_stripe_test_mode_event(text, text, text, uuid, text, text, text, text, timestamptz, timestamptz, boolean, text, text, boolean, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stripe_test_mode_event(text, text, text, uuid, text, text, text, text, timestamptz, timestamptz, boolean, text, text, boolean, timestamptz) TO service_role;
