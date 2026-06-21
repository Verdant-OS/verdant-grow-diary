-- L2-H4E-3 runtime harness for public.apply_paddle_subscription_update(uuid)
--
-- Run only against local or disposable staging databases.
-- This file is intentionally not wired to webhook, checkout, or app runtime.
-- It verifies the RPC using database-local seed rows and rolls back everything.

BEGIN;

DO $$
DECLARE
  v_run text := replace(gen_random_uuid()::text, '-', '');
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_event_id uuid;
  v_processing_id uuid;
  v_result jsonb;
  v_customer text;
  v_subscription text;
  v_count int;
BEGIN
  RAISE NOTICE 'L2-H4E-3 harness run %', v_run;

  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
  VALUES
    (v_user_a, 'h4e3-a-' || v_run || '@verdant.test', crypt('harness-password', gen_salt('bf')), now(), now(), now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
    (v_user_b, 'h4e3-b-' || v_run || '@verdant.test', crypt('harness-password', gen_salt('bf')), now(), now(), now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated');

  -- 1. Pro Monthly create.
  v_customer := 'ctm_' || v_run || '_monthly';
  v_subscription := 'sub_' || v_run || '_monthly';

  INSERT INTO public.billing_customer_links (
    user_id, provider, provider_customer_id, provider_subscription_id, provider_checkout_id,
    link_status, link_source, confidence, last_paddle_event_id
  ) VALUES (
    v_user_a, 'paddle', v_customer, v_subscription, NULL,
    'linked', 'operator', 'verified', 'harness_' || v_run
  );

  INSERT INTO public.paddle_events (event_id, event_type, environment, signature_verified, payload)
  VALUES (
    'evt_' || v_run || '_monthly',
    'subscription.updated',
    'sandbox',
    true,
    jsonb_build_object('event_id', 'evt_' || v_run || '_monthly', 'event_type', 'subscription.updated')
  ) RETURNING id INTO v_event_id;

  INSERT INTO public.paddle_event_processing (
    paddle_event_id, event_id, event_type, environment, status, reason,
    candidate_plan_id, candidate_status, provider_customer_id, provider_subscription_id,
    provider_price_id, current_period_end, cancel_at_period_end, is_founder_candidate, details
  ) VALUES (
    v_event_id, 'evt_' || v_run || '_monthly', 'subscription.updated', 'sandbox', 'processed', NULL,
    'pro_monthly', 'active', v_customer, v_subscription,
    'pri_monthly_' || v_run, '2026-07-21T00:00:00Z', false, false,
    jsonb_build_object('harness', 'h4e3')
  ) RETURNING id INTO v_processing_id;

  SELECT public.apply_paddle_subscription_update(v_processing_id) INTO v_result;
  IF NOT (v_result->>'ok' = 'true' AND v_result->>'status' = 'created' AND v_result->>'plan_id' = 'pro_monthly') THEN
    RAISE EXCEPTION 'Pro Monthly create failed: %', v_result;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.billing_subscriptions
  WHERE user_id = v_user_a
    AND plan_id = 'pro_monthly'
    AND provider = 'paddle'
    AND provider_customer_id = v_customer
    AND provider_subscription_id = v_subscription
    AND founder_number IS NULL;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected one Pro Monthly subscription row, got %', v_count;
  END IF;

  -- 2. Replay no-op.
  SELECT public.apply_paddle_subscription_update(v_processing_id) INTO v_result;
  IF NOT (v_result->>'ok' = 'true' AND v_result->>'status' = 'noop' AND v_result->>'reason' = 'already_applied') THEN
    RAISE EXCEPTION 'Replay no-op failed: %', v_result;
  END IF;

  -- 3. Pro Annual update on same provider subscription.
  INSERT INTO public.paddle_events (event_id, event_type, environment, signature_verified, payload)
  VALUES ('evt_' || v_run || '_annual', 'subscription.updated', 'sandbox', true, '{}'::jsonb)
  RETURNING id INTO v_event_id;

  INSERT INTO public.paddle_event_processing (
    paddle_event_id, event_id, event_type, environment, status, reason,
    candidate_plan_id, candidate_status, provider_customer_id, provider_subscription_id,
    provider_price_id, current_period_end, cancel_at_period_end, is_founder_candidate, details
  ) VALUES (
    v_event_id, 'evt_' || v_run || '_annual', 'subscription.updated', 'sandbox', 'processed', NULL,
    'pro_annual', 'active', v_customer, v_subscription,
    'pri_annual_' || v_run, '2027-07-21T00:00:00Z', false, false, '{}'::jsonb
  ) RETURNING id INTO v_processing_id;

  SELECT public.apply_paddle_subscription_update(v_processing_id) INTO v_result;
  IF NOT (v_result->>'ok' = 'true' AND v_result->>'status' = 'updated' AND v_result->>'plan_id' = 'pro_annual') THEN
    RAISE EXCEPTION 'Pro Annual update failed: %', v_result;
  END IF;

  -- 4. Missing link blocks.
  INSERT INTO public.paddle_events (event_id, event_type, environment, signature_verified, payload)
  VALUES ('evt_' || v_run || '_missing_link', 'subscription.updated', 'sandbox', true, '{}'::jsonb)
  RETURNING id INTO v_event_id;

  INSERT INTO public.paddle_event_processing (
    paddle_event_id, event_id, event_type, environment, status, reason,
    candidate_plan_id, candidate_status, provider_customer_id, provider_subscription_id,
    provider_price_id, current_period_end, cancel_at_period_end, is_founder_candidate, details
  ) VALUES (
    v_event_id, 'evt_' || v_run || '_missing_link', 'subscription.updated', 'sandbox', 'processed', NULL,
    'pro_monthly', 'active', 'ctm_' || v_run || '_missing', 'sub_' || v_run || '_missing',
    'pri_missing_' || v_run, '2026-07-21T00:00:00Z', false, false, '{}'::jsonb
  ) RETURNING id INTO v_processing_id;

  SELECT public.apply_paddle_subscription_update(v_processing_id) INTO v_result;
  IF NOT (v_result->>'ok' = 'false' AND v_result->>'status' = 'blocked' AND v_result->>'reason' = 'missing_verified_customer_link') THEN
    RAISE EXCEPTION 'Missing link block failed: %', v_result;
  END IF;

  -- 5. Founder candidate blocks and does not create user B row.
  v_customer := 'ctm_' || v_run || '_founder';
  v_subscription := 'sub_' || v_run || '_founder';

  INSERT INTO public.billing_customer_links (
    user_id, provider, provider_customer_id, provider_subscription_id, provider_checkout_id,
    link_status, link_source, confidence, last_paddle_event_id
  ) VALUES (
    v_user_b, 'paddle', v_customer, v_subscription, NULL,
    'linked', 'operator', 'verified', 'harness_' || v_run
  );

  INSERT INTO public.paddle_events (event_id, event_type, environment, signature_verified, payload)
  VALUES ('evt_' || v_run || '_founder', 'subscription.updated', 'sandbox', true, '{}'::jsonb)
  RETURNING id INTO v_event_id;

  INSERT INTO public.paddle_event_processing (
    paddle_event_id, event_id, event_type, environment, status, reason,
    candidate_plan_id, candidate_status, provider_customer_id, provider_subscription_id,
    provider_price_id, current_period_end, cancel_at_period_end, is_founder_candidate, details
  ) VALUES (
    v_event_id, 'evt_' || v_run || '_founder', 'subscription.updated', 'sandbox', 'processed', NULL,
    'founder_lifetime', 'active', v_customer, v_subscription,
    'pri_founder_' || v_run, NULL, false, true, '{}'::jsonb
  ) RETURNING id INTO v_processing_id;

  SELECT public.apply_paddle_subscription_update(v_processing_id) INTO v_result;
  IF NOT (v_result->>'ok' = 'false' AND v_result->>'status' = 'blocked' AND v_result->>'reason' = 'founder_allocation_deferred') THEN
    RAISE EXCEPTION 'Founder block failed: %', v_result;
  END IF;

  SELECT count(*) INTO v_count FROM public.billing_subscriptions WHERE user_id = v_user_b;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Blocked Founder candidate created unexpected subscription row count %', v_count;
  END IF;

  RAISE NOTICE 'L2-H4E-3 harness passed';
END $$;

ROLLBACK;
