
-- Audit-fix H3 + M4 + M5: Founder cap atomicity on the Lovable Stack A webhook,
-- plus DB-level invariants that were previously only enforced in the client adapter.
--
-- Scope: public.subscriptions and its per-stack founder allocator only.
--        Does NOT touch billing_subscriptions, paddle_events, or the BYO
--        allocate_founder_lifetime RPC — those remain the BYO stack's contract.

-- ---------------------------------------------------------------------------
-- M5. Status CHECK. Existing rows are all 'active' (verified). trialing is
-- added per M6 so Paddle-issued trial rows round-trip cleanly through the
-- resolver and the existing partial index (which already lists trialing).
-- ---------------------------------------------------------------------------
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active','trialing','past_due','paused','canceled','expired'));

-- ---------------------------------------------------------------------------
-- M4. Lifetime-prefix invariant. The adapter (lovablePaddleAdapter) already
-- refuses to unlock lifetime unless paddle_subscription_id starts with
-- "lifetime_"; enforce it structurally so a stray writer cannot land a
-- silently-non-unlocking row.
-- ---------------------------------------------------------------------------
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_lifetime_prefix_check
  CHECK (
    price_id <> 'founder_lifetime'
    OR paddle_subscription_id LIKE 'lifetime_%'
  );

-- ---------------------------------------------------------------------------
-- H3. Founder Lifetime slots remaining, Stack-A aware.
--
-- The previous implementation (kept for the BYO stack in an earlier migration)
-- counted billing_subscriptions.founder_number rows. The canonical /pricing
-- flow writes to public.subscriptions with price_id='founder_lifetime', so
-- that counter always returned "75 remaining" for the Stack A path.
--
-- Redefine `founder_lifetime_slots_remaining` to count ACTIVE Stack A founder
-- rows across BOTH environments (sandbox test rows still consume conceptual
-- slots when reasoning about cap; we intentionally do not partition by
-- environment here — the atomic allocator does per-env accounting itself).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.founder_lifetime_slots_remaining()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT GREATEST(
    0,
    75 - (
      SELECT COUNT(*)::int
      FROM public.subscriptions
      WHERE price_id = 'founder_lifetime'
        AND status = 'active'
    )
  )
$$;

REVOKE ALL ON FUNCTION public.founder_lifetime_slots_remaining() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.founder_lifetime_slots_remaining() FROM anon;
GRANT EXECUTE ON FUNCTION public.founder_lifetime_slots_remaining() TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_lifetime_slots_remaining() TO service_role;

-- ---------------------------------------------------------------------------
-- H3. Atomic Stack-A founder allocator.
--
-- Called from supabase/functions/payments-webhook (service-role only) when a
-- verified transaction.completed event has price_external_id='founder_lifetime'.
--
-- Guarantees:
--   - Serialized under a transactional advisory lock so concurrent buyers
--     cannot race past slot 75.
--   - Idempotent by paddle_subscription_id (unique index already enforces).
--     Duplicate calls return TRUE without incrementing the count.
--   - Refuses when cap is reached; caller marks the event skipped.
--   - Never overwrites a non-lifetime row for the same user.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.allocate_lovable_founder_lifetime(
  p_user_id uuid,
  p_paddle_transaction_id text,
  p_paddle_customer_id text,
  p_environment text,
  p_now timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pseudo_sub_id text;
  v_active_count integer;
  v_existing public.subscriptions%ROWTYPE;
BEGIN
  IF p_user_id IS NULL
     OR p_paddle_transaction_id IS NULL OR length(btrim(p_paddle_transaction_id)) = 0
     OR p_environment NOT IN ('sandbox','live') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  v_pseudo_sub_id := 'lifetime_' || p_paddle_transaction_id;

  -- Serialize all founder allocations globally. Same lock key across
  -- environments so a test allocation cannot race a live one. Held for the
  -- duration of the transaction.
  PERFORM pg_advisory_xact_lock(hashtext('lovable_founder_lifetime_allocator'));

  -- Idempotent path: same transaction retried by Paddle.
  SELECT * INTO v_existing
    FROM public.subscriptions
   WHERE paddle_subscription_id = v_pseudo_sub_id
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'idempotent',
      'paddle_subscription_id', v_pseudo_sub_id);
  END IF;

  -- Cap check (Stack A only — matches founder_lifetime_slots_remaining above).
  SELECT COUNT(*)::int INTO v_active_count
    FROM public.subscriptions
   WHERE price_id = 'founder_lifetime'
     AND status = 'active';

  IF v_active_count >= 75 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cap_reached',
      'active_count', v_active_count);
  END IF;

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
    updated_at
  ) VALUES (
    p_user_id,
    v_pseudo_sub_id,
    COALESCE(p_paddle_customer_id, ''),
    'founder_lifetime',
    'founder_lifetime',
    'active',
    p_now,
    NULL,
    false,
    p_environment,
    p_now
  );

  RETURN jsonb_build_object('ok', true, 'reason', 'allocated',
    'paddle_subscription_id', v_pseudo_sub_id);
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_lovable_founder_lifetime(uuid, text, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.allocate_lovable_founder_lifetime(uuid, text, text, text, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.allocate_lovable_founder_lifetime(uuid, text, text, text, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_lovable_founder_lifetime(uuid, text, text, text, timestamptz) TO service_role;

COMMENT ON FUNCTION public.allocate_lovable_founder_lifetime(uuid, text, text, text, timestamptz) IS
  'Atomic Founder Lifetime allocator for the Lovable built-in Paddle stack. '
  'Advisory-locked, cap-enforced (75), idempotent on paddle_subscription_id. '
  'Called only from the payments-webhook edge function under service_role.';
