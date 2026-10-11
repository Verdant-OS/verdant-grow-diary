-- GDP-REFUND-003: serialize lifetime grants/refunds and recheck durable refunds.
-- Additive repair only. No table, preference, cap, or founder-number changes.
BEGIN;

CREATE OR REPLACE FUNCTION public.revoke_lovable_founder_lifetime_by_transaction(
  p_paddle_transaction_id text,
  p_environment           text,
  p_now                   timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pseudo_sub_id text := 'lifetime_' || p_paddle_transaction_id;
  v_subs_updated  int  := 0;
  v_founders_updated int := 0;
BEGIN
  IF p_paddle_transaction_id IS NULL OR btrim(p_paddle_transaction_id) = '' OR p_now IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;
  IF p_environment IS NULL OR p_environment NOT IN ('sandbox','live') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_environment');
  END IF;

  -- A transaction snapshot taken before waiting can miss a committed refund.
  -- The webhook RPC contract uses Read Committed; fail closed otherwise.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unsupported_transaction_isolation');
  END IF;

  -- Share the allocator's transaction lock so an in-flight grant finishes
  -- before this refund reads and retires the resulting rows.
  PERFORM pg_advisory_xact_lock(hashtext('lovable_founder_lifetime_allocator'));

  UPDATE public.subscriptions
     SET status               = 'canceled',
         current_period_end   = p_now,
         cancel_at_period_end = false,
         updated_at           = p_now
   WHERE paddle_subscription_id = v_pseudo_sub_id
     AND environment            = p_environment
     AND price_id               = 'founder_lifetime'
     AND status IS DISTINCT FROM 'canceled';
  GET DIAGNOSTICS v_subs_updated = ROW_COUNT;

  -- Founders are live-only. The allocator stores the lifetime subscription
  -- reference here; founders has neither transaction_id nor environment.
  UPDATE public.founders AS f
     SET status     = 'refunded',
         updated_at = p_now
   WHERE p_environment = 'live'
     AND f.paddle_subscription_ref = v_pseudo_sub_id
     AND f.status <> 'refunded'
     AND EXISTS (
       SELECT 1
         FROM public.subscriptions AS s
        WHERE s.paddle_subscription_id = v_pseudo_sub_id
          AND s.environment = 'live'
          AND s.price_id = 'founder_lifetime'
          AND s.user_id = f.user_id
     );
  GET DIAGNOSTICS v_founders_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'subscriptions_updated', v_subs_updated,
    'founders_updated',      v_founders_updated
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_lovable_founder_lifetime_by_transaction(text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_lovable_founder_lifetime_by_transaction(text, text, timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION public.allocate_lovable_founder_lifetime(
  p_user_id                uuid,
  p_paddle_transaction_id  text,
  p_paddle_customer_id     text,
  p_environment            text,
  p_now                    timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pseudo_sub_id   text;
  v_seats_consumed  integer;
  v_existing_sub    public.subscriptions%ROWTYPE;
  v_existing_fnd    public.founders%ROWTYPE;
  v_next_number     integer;
  v_assigned_number integer;
  v_refund_result   jsonb;
BEGIN
  IF p_user_id IS NULL
     OR p_paddle_transaction_id IS NULL OR length(btrim(p_paddle_transaction_id)) = 0
     OR p_environment NOT IN ('sandbox','live') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  v_pseudo_sub_id := 'lifetime_' || p_paddle_transaction_id;

  -- A transaction snapshot taken before waiting can miss a committed refund.
  -- The webhook RPC contract uses Read Committed; fail closed otherwise.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unsupported_transaction_isolation');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('lovable_founder_lifetime_allocator'));

  -- Re-read the authoritative durable barrier AFTER the lock, including on
  -- idempotent replay. A failed/received barrier is still an approved refund.
  IF EXISTS (
    SELECT 1 FROM public.lovable_paddle_events
     WHERE paddle_event_id = 'internal:founder-refund:' || p_environment || ':' || p_paddle_transaction_id
  ) THEN
    -- Reconcile any earlier grant before making the purchase terminal. This
    -- re-enters the same transaction lock; errors roll back the entire call.
    v_refund_result := public.revoke_lovable_founder_lifetime_by_transaction(
      p_paddle_transaction_id, p_environment, p_now
    );
    IF (v_refund_result->>'ok') IS DISTINCT FROM 'true' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'founder_refund_reconcile_failed');
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'founder_refund_precedes_purchase');
  END IF;

  -- Idempotent path: Paddle retried the same transaction.
  SELECT * INTO v_existing_sub
    FROM public.subscriptions
   WHERE paddle_subscription_id = v_pseudo_sub_id
   LIMIT 1;
  IF FOUND THEN
    IF p_environment = 'live' THEN
      SELECT * INTO v_existing_fnd FROM public.founders WHERE user_id = p_user_id LIMIT 1;
      IF NOT FOUND THEN
        SELECT public.founders_seats_consumed() INTO v_seats_consumed;
        IF v_seats_consumed < 100 THEN
          SELECT COALESCE(MAX(founder_number), 0) + 1 INTO v_next_number FROM public.founders;
          INSERT INTO public.founders
            (user_id, founder_number, paddle_subscription_ref, status)
          VALUES
            (p_user_id, v_next_number, v_pseudo_sub_id, 'confirmed')
          RETURNING founder_number INTO v_assigned_number;
        END IF;
      ELSE
        v_assigned_number := v_existing_fnd.founder_number;
      END IF;
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'reason', 'idempotent',
      'paddle_subscription_id', v_pseudo_sub_id,
      'founder_number', v_assigned_number
    );
  END IF;

  -- Cap check uses seats-consumed so refunds cannot reopen the pool.
  SELECT public.founders_seats_consumed() INTO v_seats_consumed;
  IF p_environment = 'live' AND v_seats_consumed >= 100 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cap_reached',
      'seats_consumed', v_seats_consumed);
  END IF;

  INSERT INTO public.subscriptions (
    user_id, paddle_subscription_id, paddle_customer_id,
    product_id, price_id, status,
    current_period_start, current_period_end, cancel_at_period_end,
    environment, updated_at
  ) VALUES (
    p_user_id, v_pseudo_sub_id, COALESCE(p_paddle_customer_id, ''),
    'founder_lifetime', 'founder_lifetime', 'active',
    p_now, NULL, false,
    p_environment, p_now
  );

  IF p_environment = 'live' THEN
    SELECT * INTO v_existing_fnd FROM public.founders WHERE user_id = p_user_id LIMIT 1;
    IF FOUND THEN
      v_assigned_number := v_existing_fnd.founder_number;
    ELSE
      -- Re-check after taking the subscription slot; still guard by seats.
      SELECT public.founders_seats_consumed() INTO v_seats_consumed;
      IF v_seats_consumed < 100 THEN
        SELECT COALESCE(MAX(founder_number), 0) + 1 INTO v_next_number FROM public.founders;
        INSERT INTO public.founders
          (user_id, founder_number, paddle_subscription_ref, status)
        VALUES
          (p_user_id, v_next_number, v_pseudo_sub_id, 'confirmed')
        RETURNING founder_number INTO v_assigned_number;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'reason', 'allocated',
    'paddle_subscription_id', v_pseudo_sub_id,
    'founder_number', v_assigned_number
  );
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_lovable_founder_lifetime(uuid, text, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_lovable_founder_lifetime(uuid, text, text, text, timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.allocate_lovable_founder_lifetime(uuid, text, text, text, timestamptz) IS
  'Service-only lifetime allocator. Shares a transaction lock with refunds and rechecks durable environment/transaction refund barriers before allocation or replay. Requires Read Committed; preserves consumed seats and founder preferences.';
COMMENT ON FUNCTION public.revoke_lovable_founder_lifetime_by_transaction(text, text, timestamptz) IS
  'Service-only lifetime refund. Shares the allocator transaction lock, retires matching environment/transaction access, and preserves founder number, consumed seat and preferences. Requires Read Committed.';

COMMIT;
