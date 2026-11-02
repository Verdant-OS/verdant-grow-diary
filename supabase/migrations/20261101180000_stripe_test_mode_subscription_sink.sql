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
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

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

-- A canceled Stripe subscription id stays canceled even when the cancel
-- event arrived before the subscription row existed.
CREATE TABLE public.stripe_test_mode_canceled_subscriptions (
  stripe_subscription_id text PRIMARY KEY,
  environment text NOT NULL DEFAULT 'sandbox' CHECK (environment = 'sandbox'),
  canceled_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE public.stripe_test_mode_canceled_subscriptions FROM PUBLIC;
REVOKE ALL ON TABLE public.stripe_test_mode_canceled_subscriptions FROM anon;
REVOKE ALL ON TABLE public.stripe_test_mode_canceled_subscriptions FROM authenticated;
GRANT ALL ON TABLE public.stripe_test_mode_canceled_subscriptions TO service_role;

ALTER TABLE public.stripe_test_mode_canceled_subscriptions ENABLE ROW LEVEL SECURITY;

-- Sanitized audit rows for the Stripe test-mode subscription writer.
-- No provider ids. service_role only; no anon or authenticated policies.
CREATE TABLE public.stripe_test_mode_subscription_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  result_status text NOT NULL,
  result_reason text NULL,
  candidate_plan_id text NULL,
  candidate_status text NULL,
  subscription_status text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stripe_test_mode_subscription_audit_result_status_chk
    CHECK (result_status IN ('created', 'updated', 'noop', 'blocked', 'failed', 'skipped')),
  CONSTRAINT stripe_test_mode_subscription_audit_candidate_plan_id_chk
    CHECK (
      candidate_plan_id IS NULL
      OR candidate_plan_id IN ('pro_monthly', 'pro_annual', 'craft_monthly', 'craft_annual')
    ),
  CONSTRAINT stripe_test_mode_subscription_audit_candidate_status_chk
    CHECK (
      candidate_status IS NULL
      OR candidate_status IN ('active', 'trialing', 'past_due', 'canceled', 'paused')
    ),
  CONSTRAINT stripe_test_mode_subscription_audit_subscription_status_chk
    CHECK (
      subscription_status IS NULL
      OR subscription_status IN ('active', 'trialing', 'past_due', 'canceled', 'paused')
    )
);

REVOKE ALL ON TABLE public.stripe_test_mode_subscription_audit FROM PUBLIC;
REVOKE ALL ON TABLE public.stripe_test_mode_subscription_audit FROM anon;
REVOKE ALL ON TABLE public.stripe_test_mode_subscription_audit FROM authenticated;
GRANT ALL ON TABLE public.stripe_test_mode_subscription_audit TO service_role;

ALTER TABLE public.stripe_test_mode_subscription_audit ENABLE ROW LEVEL SECURITY;

-- Audited writer for public.subscriptions. apply_stripe_test_mode_event calls
-- this function and does not write that table itself.
-- apply_paddle_subscription_update_with_audit remains the Paddle processing
-- path. It takes a processing id and cannot store a Stripe sandbox row, so
-- this function is the audited path for the test-mode sink.
CREATE OR REPLACE FUNCTION public.apply_stripe_test_mode_subscription_with_audit(
  p_action text,
  p_user_id uuid,
  p_plan_id text,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_status text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_status text;
  v_terminal boolean;
  v_count int;
  v_ok boolean := false;
  v_result_status text := 'failed';
  v_reason text := 'subscription_write_failed';
  v_subscription_status text;
  v_plan text;
  v_candidate_status text;
BEGIN
  v_plan := CASE
    WHEN p_plan_id IN ('pro_monthly', 'pro_annual', 'craft_monthly', 'craft_annual') THEN p_plan_id
    ELSE NULL
  END;
  v_candidate_status := CASE
    WHEN p_status IN ('active', 'trialing', 'past_due', 'canceled', 'paused') THEN p_status
    ELSE NULL
  END;

  IF p_action NOT IN (
    'grant_subscription',
    'update_subscription',
    'cancel_subscription',
    'mark_past_due'
  ) OR p_stripe_subscription_id IS NULL OR length(btrim(p_stripe_subscription_id)) = 0 THEN
    v_result_status := 'skipped';
    v_reason := 'malformed';
  ELSIF p_action = 'grant_subscription' AND (
    p_user_id IS NULL
    OR v_plan IS NULL
    OR p_stripe_customer_id IS NULL
    OR p_status NOT IN ('active', 'trialing')
    OR p_period_end IS NULL
  ) THEN
    v_result_status := 'skipped';
    v_reason := 'period_required';
  ELSE
    PERFORM pg_advisory_xact_lock(hashtext('stripe_test_mode_sub:' || p_stripe_subscription_id));

    v_existing_status := NULL;
    SELECT status INTO v_existing_status
      FROM public.subscriptions
     WHERE provider = 'stripe'
       AND environment = 'sandbox'
       AND stripe_subscription_id = p_stripe_subscription_id
     FOR UPDATE;

    SELECT EXISTS (
      SELECT 1
        FROM public.stripe_test_mode_canceled_subscriptions
       WHERE stripe_subscription_id = p_stripe_subscription_id
         AND environment = 'sandbox'
    ) INTO v_terminal;

    IF p_action = 'cancel_subscription' THEN
      INSERT INTO public.stripe_test_mode_canceled_subscriptions (stripe_subscription_id, environment)
      VALUES (p_stripe_subscription_id, 'sandbox')
      ON CONFLICT (stripe_subscription_id) DO NOTHING;

      IF v_existing_status IS NULL THEN
        v_ok := true;
        v_result_status := 'noop';
        v_reason := 'cancel_recorded';
        v_subscription_status := 'canceled';
      ELSE
        UPDATE public.subscriptions
           SET status = 'canceled',
               updated_at = now()
         WHERE provider = 'stripe'
           AND environment = 'sandbox'
           AND stripe_subscription_id = p_stripe_subscription_id;
        v_ok := true;
        v_result_status := 'updated';
        v_reason := 'applied';
        v_subscription_status := 'canceled';
      END IF;
    ELSIF v_terminal OR v_existing_status = 'canceled' THEN
      -- A late grant, renewal, or failed invoice must not restore access.
      v_ok := true;
      v_result_status := 'blocked';
      v_reason := 'canceled_terminal';
      v_subscription_status := 'canceled';
    ELSIF p_action = 'grant_subscription' AND v_existing_status IS NULL THEN
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
        stripe_subscription_id
      ) VALUES (
        p_user_id,
        'stripe:' || p_stripe_subscription_id,
        'stripe:' || p_stripe_customer_id,
        v_plan,
        v_plan,
        p_status,
        p_period_start,
        p_period_end,
        COALESCE(p_cancel_at_period_end, false),
        'sandbox',
        'stripe',
        p_stripe_customer_id,
        p_stripe_subscription_id
      );
      v_ok := true;
      v_result_status := 'created';
      v_reason := 'applied';
      v_subscription_status := p_status;
    ELSIF p_action = 'grant_subscription' THEN
      UPDATE public.subscriptions
         SET user_id = p_user_id,
             paddle_subscription_id = 'stripe:' || p_stripe_subscription_id,
             paddle_customer_id = 'stripe:' || p_stripe_customer_id,
             product_id = v_plan,
             price_id = v_plan,
             status = p_status,
             current_period_start = p_period_start,
             current_period_end = p_period_end,
             cancel_at_period_end = COALESCE(p_cancel_at_period_end, false),
             stripe_customer_id = p_stripe_customer_id,
             provider = 'stripe',
             environment = 'sandbox',
             updated_at = now()
       WHERE provider = 'stripe'
         AND environment = 'sandbox'
         AND stripe_subscription_id = p_stripe_subscription_id
         AND status IS DISTINCT FROM 'canceled';
      GET DIAGNOSTICS v_count = ROW_COUNT;
      IF v_count = 0 THEN
        v_ok := true;
        v_result_status := 'blocked';
        v_reason := 'canceled_terminal';
        v_subscription_status := 'canceled';
      ELSE
        v_ok := true;
        v_result_status := 'updated';
        v_reason := 'applied';
        v_subscription_status := p_status;
      END IF;
    ELSIF p_action = 'update_subscription' THEN
      UPDATE public.subscriptions
         SET status = COALESCE(p_status, status),
             current_period_start = COALESCE(p_period_start, current_period_start),
             current_period_end = COALESCE(p_period_end, current_period_end),
             cancel_at_period_end = COALESCE(p_cancel_at_period_end, cancel_at_period_end),
             updated_at = now()
       WHERE provider = 'stripe'
         AND environment = 'sandbox'
         AND stripe_subscription_id = p_stripe_subscription_id
         AND status IS DISTINCT FROM 'canceled';
      GET DIAGNOSTICS v_count = ROW_COUNT;
      IF v_count = 0 THEN
        v_ok := true;
        v_result_status := 'noop';
        v_reason := 'no_matching_row';
        v_subscription_status := v_existing_status;
      ELSE
        v_ok := true;
        v_result_status := 'updated';
        v_reason := 'applied';
        v_subscription_status := COALESCE(p_status, v_existing_status);
      END IF;
    ELSIF p_action = 'mark_past_due' THEN
      UPDATE public.subscriptions
         SET status = 'past_due',
             updated_at = now()
       WHERE provider = 'stripe'
         AND environment = 'sandbox'
         AND stripe_subscription_id = p_stripe_subscription_id
         AND status IS DISTINCT FROM 'canceled';
      GET DIAGNOSTICS v_count = ROW_COUNT;
      IF v_count = 0 THEN
        v_ok := true;
        v_result_status := 'noop';
        v_reason := 'no_matching_row';
        v_subscription_status := v_existing_status;
      ELSE
        v_ok := true;
        v_result_status := 'updated';
        v_reason := 'applied';
        v_subscription_status := 'past_due';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.stripe_test_mode_subscription_audit (
    user_id,
    result_status,
    result_reason,
    candidate_plan_id,
    candidate_status,
    subscription_status
  ) VALUES (
    p_user_id,
    v_result_status,
    v_reason,
    v_plan,
    v_candidate_status,
    CASE
      WHEN v_subscription_status IN ('active', 'trialing', 'past_due', 'canceled', 'paused')
        THEN v_subscription_status
      ELSE NULL
    END
  );

  RETURN jsonb_build_object('ok', v_ok, 'reason', v_reason, 'status', v_result_status);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_stripe_test_mode_subscription_with_audit(text, uuid, text, text, text, text, timestamptz, timestamptz, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_stripe_test_mode_subscription_with_audit(text, uuid, text, text, text, text, timestamptz, timestamptz, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.apply_stripe_test_mode_subscription_with_audit(text, uuid, text, text, text, text, timestamptz, timestamptz, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stripe_test_mode_subscription_with_audit(text, uuid, text, text, text, text, timestamptz, timestamptz, boolean) TO service_role;

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
  p_livemode boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_id text;
  v_credits int;
  v_grant jsonb;
  v_subscription jsonb;
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

  IF p_action IN (
    'grant_subscription',
    'update_subscription',
    'cancel_subscription',
    'mark_past_due'
  ) THEN
    v_subscription := public.apply_stripe_test_mode_subscription_with_audit(
      p_action,
      p_user_id,
      p_plan_id,
      p_stripe_customer_id,
      p_stripe_subscription_id,
      p_status,
      p_period_start,
      p_period_end,
      p_cancel_at_period_end
    );
    IF (v_subscription->>'ok') IS DISTINCT FROM 'true' THEN
      -- Roll the event row back so a retry can apply the write.
      RAISE EXCEPTION 'stripe_test_mode_subscription_write_failed'
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_action = 'grant_credit_pack' THEN
    -- Credits are derived here. A caller-supplied credit count is not accepted.
    v_credits := CASE p_plan_id
      WHEN 'credit_pack_50' THEN 50
      WHEN 'credit_pack_150' THEN 150
      ELSE NULL
    END;
    IF v_credits IS NULL THEN
      RAISE EXCEPTION 'stripe_test_mode_credit_grant_failed'
        USING ERRCODE = 'P0001';
    END IF;
    v_grant := public.grant_lovable_credit_pack(
      p_user_id,
      p_checkout_session_id,
      v_credits,
      p_plan_id,
      'sandbox'
    );
    IF (v_grant->>'ok') IS DISTINCT FROM 'true' THEN
      -- A returned failure must not commit the event row. Stripe retries on 500.
      RAISE EXCEPTION 'stripe_test_mode_credit_grant_failed'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.stripe_webhook_events
     SET result = 'applied'
   WHERE event_id = p_event_id;

  RETURN jsonb_build_object('ok', true, 'reason', 'applied');
END;
$$;

REVOKE ALL ON FUNCTION public.apply_stripe_test_mode_event(text, text, text, uuid, text, text, text, text, timestamptz, timestamptz, boolean, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_stripe_test_mode_event(text, text, text, uuid, text, text, text, text, timestamptz, timestamptz, boolean, text, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.apply_stripe_test_mode_event(text, text, text, uuid, text, text, text, text, timestamptz, timestamptz, boolean, text, text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stripe_test_mode_event(text, text, text, uuid, text, text, text, text, timestamptz, timestamptz, boolean, text, text, boolean) TO service_role;
