CREATE OR REPLACE FUNCTION public.apply_paddle_subscription_update(
  p_processing_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_processing public.paddle_event_processing%ROWTYPE;
  v_event public.paddle_events%ROWTYPE;
  v_link public.billing_customer_links%ROWTYPE;
  v_existing public.billing_subscriptions%ROWTYPE;
  v_existing_other_user uuid;
  v_status text;
BEGIN
  IF p_processing_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_found', 'reason', 'processing_row_not_found', 'processing_id', NULL, 'user_id', NULL, 'plan_id', NULL, 'subscription_status', NULL);
  END IF;

  SELECT * INTO v_processing FROM public.paddle_event_processing WHERE id = p_processing_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_found', 'reason', 'processing_row_not_found', 'processing_id', p_processing_id, 'user_id', NULL, 'plan_id', NULL, 'subscription_status', NULL);
  END IF;

  SELECT * INTO v_event FROM public.paddle_events WHERE id = v_processing.paddle_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'event_missing', 'processing_id', v_processing.id, 'user_id', NULL, 'plan_id', NULL, 'subscription_status', NULL);
  END IF;

  IF v_event.signature_verified IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'event_not_verified', 'processing_id', v_processing.id, 'user_id', NULL, 'plan_id', NULL, 'subscription_status', NULL);
  END IF;

  IF v_processing.environment <> 'sandbox' OR v_event.environment <> 'sandbox' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'environment_not_allowed', 'processing_id', v_processing.id, 'user_id', NULL, 'plan_id', NULL, 'subscription_status', NULL);
  END IF;

  IF v_processing.status <> 'processed' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'processing_not_processed', 'processing_id', v_processing.id, 'user_id', NULL, 'plan_id', NULL, 'subscription_status', NULL);
  END IF;

  IF v_processing.is_founder_candidate IS TRUE OR v_processing.candidate_plan_id = 'founder_lifetime' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'founder_allocation_deferred', 'processing_id', v_processing.id, 'user_id', NULL, 'plan_id', NULL, 'subscription_status', NULL);
  END IF;

  IF v_processing.candidate_plan_id NOT IN ('pro_monthly', 'pro_annual') THEN
    RETURN jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'unknown_plan', 'processing_id', v_processing.id, 'user_id', NULL, 'plan_id', NULL, 'subscription_status', NULL);
  END IF;

  IF v_processing.candidate_status NOT IN ('active', 'past_due', 'canceled', 'paused', 'expired') THEN
    RETURN jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'unknown_candidate_status', 'processing_id', v_processing.id, 'user_id', NULL, 'plan_id', v_processing.candidate_plan_id, 'subscription_status', NULL);
  END IF;

  IF v_processing.provider_customer_id IS NULL OR length(btrim(v_processing.provider_customer_id)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'missing_provider_customer_id', 'processing_id', v_processing.id, 'user_id', NULL, 'plan_id', v_processing.candidate_plan_id, 'subscription_status', v_processing.candidate_status);
  END IF;

  IF v_processing.provider_subscription_id IS NULL OR length(btrim(v_processing.provider_subscription_id)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'missing_provider_subscription_id', 'processing_id', v_processing.id, 'user_id', NULL, 'plan_id', v_processing.candidate_plan_id, 'subscription_status', v_processing.candidate_status);
  END IF;

  SELECT * INTO v_link
    FROM public.billing_customer_links
   WHERE provider = 'paddle'
     AND provider_customer_id = v_processing.provider_customer_id
     AND provider_subscription_id = v_processing.provider_subscription_id
     AND link_status = 'linked'
     AND confidence = 'verified'
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'missing_verified_customer_link', 'processing_id', v_processing.id, 'user_id', NULL, 'plan_id', v_processing.candidate_plan_id, 'subscription_status', v_processing.candidate_status);
  END IF;

  SELECT user_id INTO v_existing_other_user
    FROM public.billing_subscriptions
   WHERE provider = 'paddle'
     AND provider_subscription_id = v_processing.provider_subscription_id
     AND user_id <> v_link.user_id
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'existing_provider_identifier_conflict', 'processing_id', v_processing.id, 'user_id', v_link.user_id, 'plan_id', v_processing.candidate_plan_id, 'subscription_status', v_processing.candidate_status);
  END IF;

  SELECT * INTO v_existing FROM public.billing_subscriptions WHERE user_id = v_link.user_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.plan_id = 'founder_lifetime' OR v_existing.founder_number IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'founder_row_not_overwritten', 'processing_id', v_processing.id, 'user_id', v_link.user_id, 'plan_id', v_processing.candidate_plan_id, 'subscription_status', v_processing.candidate_status);
    END IF;

    IF v_existing.provider IS NOT NULL AND v_existing.provider <> 'paddle' THEN
      RETURN jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'existing_non_paddle_subscription', 'processing_id', v_processing.id, 'user_id', v_link.user_id, 'plan_id', v_processing.candidate_plan_id, 'subscription_status', v_processing.candidate_status);
    END IF;

    IF v_existing.provider = 'paddle' AND ((v_existing.provider_customer_id IS NOT NULL AND v_existing.provider_customer_id <> v_processing.provider_customer_id) OR (v_existing.provider_subscription_id IS NOT NULL AND v_existing.provider_subscription_id <> v_processing.provider_subscription_id)) THEN
      RETURN jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'existing_provider_identifier_conflict', 'processing_id', v_processing.id, 'user_id', v_link.user_id, 'plan_id', v_processing.candidate_plan_id, 'subscription_status', v_processing.candidate_status);
    END IF;

    IF v_processing.candidate_status = 'active' AND v_existing.current_period_end IS NOT NULL AND v_processing.current_period_end IS NOT NULL AND v_processing.current_period_end < v_existing.current_period_end THEN
      RETURN jsonb_build_object('ok', true, 'status', 'noop', 'reason', 'stale_processing_row', 'processing_id', v_processing.id, 'user_id', v_link.user_id, 'plan_id', v_existing.plan_id, 'subscription_status', v_existing.status);
    END IF;

    IF v_existing.plan_id = v_processing.candidate_plan_id
       AND v_existing.status = v_processing.candidate_status
       AND v_existing.provider IS NOT DISTINCT FROM 'paddle'
       AND v_existing.provider_customer_id IS NOT DISTINCT FROM v_processing.provider_customer_id
       AND v_existing.provider_subscription_id IS NOT DISTINCT FROM v_processing.provider_subscription_id
       AND v_existing.current_period_end IS NOT DISTINCT FROM v_processing.current_period_end
       AND v_existing.cancel_at_period_end IS NOT DISTINCT FROM v_processing.cancel_at_period_end
       AND v_existing.founder_number IS NULL THEN
      RETURN jsonb_build_object('ok', true, 'status', 'noop', 'reason', 'already_applied', 'processing_id', v_processing.id, 'user_id', v_link.user_id, 'plan_id', v_existing.plan_id, 'subscription_status', v_existing.status);
    END IF;

    UPDATE public.billing_subscriptions
       SET plan_id = v_processing.candidate_plan_id,
           status = v_processing.candidate_status,
           provider = 'paddle',
           provider_customer_id = v_processing.provider_customer_id,
           provider_subscription_id = v_processing.provider_subscription_id,
           current_period_end = v_processing.current_period_end,
           cancel_at_period_end = COALESCE(v_processing.cancel_at_period_end, false),
           founder_number = NULL
     WHERE user_id = v_link.user_id;
    v_status := 'updated';
  ELSE
    INSERT INTO public.billing_subscriptions (user_id, plan_id, status, provider, provider_customer_id, provider_subscription_id, current_period_end, cancel_at_period_end, founder_number)
    VALUES (v_link.user_id, v_processing.candidate_plan_id, v_processing.candidate_status, 'paddle', v_processing.provider_customer_id, v_processing.provider_subscription_id, v_processing.current_period_end, COALESCE(v_processing.cancel_at_period_end, false), NULL);
    v_status := 'created';
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', v_status, 'reason', NULL, 'processing_id', v_processing.id, 'user_id', v_link.user_id, 'plan_id', v_processing.candidate_plan_id, 'subscription_status', v_processing.candidate_status);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'status', 'failed', 'reason', 'update_failed', 'processing_id', p_processing_id, 'user_id', NULL, 'plan_id', NULL, 'subscription_status', NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_paddle_subscription_update(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_paddle_subscription_update(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.apply_paddle_subscription_update(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_paddle_subscription_update(uuid) TO service_role;
