-- Founder Lifetime: retire the seat-cap refusal and the public seats-remaining counter.
--
-- Owner decision (Matthew Cheek, 2026-10-27; PR B authorized 2026-10-29):
-- Founder Lifetime is no longer sold (#2028, #2570). Existing holders keep
-- access forever; a refund still revokes; a late or replayed pre-cutoff
-- purchase event still grants. A verified purchase must therefore never be
-- refused because 100 seats were consumed.
--
-- Changes:
--   * allocate_lovable_founder_lifetime: identical to 20260915193000 except
--     the pre-insert cap_reached refusal is removed. The lifetime
--     subscriptions row (the entitlement) is always written. The Founders
--     Wall seat is still minted only while founders_seats_consumed() < 100,
--     exactly as the existing post-insert path already did, so refunded
--     seats are not reopened and founders_number_range (1..100) is never
--     violated. Signature, SECURITY DEFINER, search_path, advisory lock,
--     refund barrier, idempotent replay and grants are unchanged
--     (CREATE OR REPLACE keeps the existing ACL).
--   * lovable_paddle_events: deliveries the old cap refused were recorded as
--     terminal (processing_status 'skipped', skip_reason 'founder_cap_reached')
--     and a Paddle redelivery short-circuits to duplicate_skipped before the
--     allocator runs (payments-webhook/orchestrator.ts). Exactly those rows are
--     reopened as retryable ('failed', with last_error naming this migration)
--     so a redelivery or operator replay reaches the allocator and grants.
--     Nothing is granted by this file: the webhook still re-runs the event.
--     Paddle live carried zero transactions on 2026-10-29, so this is a no-op
--     in production today; it is kept so the contract holds anywhere such a
--     row exists.
--   * DROP FUNCTION public.founder_lifetime_slots_remaining(): nothing in the
--     repository calls it after #2570; the deployed edge function is deleted
--     by the operator before this migration is applied.
--
-- Kept on purpose: founders_seats_consumed() and founders_wall_count() (the
-- Founders Wall stays), revoke_lovable_founder_lifetime_by_transaction (no
-- change needed: refunded rows were never reopened), and the legacy
-- sandbox-only allocate_founder_lifetime family (separate retirement).
--
-- Applied by the operator only; this file is not auto-applied on merge.

BEGIN;

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

  -- The seat cap no longer refuses a verified purchase (Matthew, 2026-10-27):
  -- the lifetime entitlement below is always granted. A Founders Wall seat is
  -- still minted only while numbers 1..100 remain (founders_number_range), so
  -- refunded seats are never reopened and no seat beyond 100 is invented.

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

-- Reopen only the historical cap refusals. Other skipped and processed rows
-- (refund barriers, credit-pack skips, successful grants) are untouched.
UPDATE public.lovable_paddle_events
SET processing_status = 'failed',
    processed_ok      = false,
    skip_reason       = NULL,
    last_error        = 'founder_cap_retired_20261029: cap refusal reopened for replay'
WHERE processing_status = 'skipped'
  AND skip_reason = 'founder_cap_reached';

DROP FUNCTION IF EXISTS public.founder_lifetime_slots_remaining();

COMMIT;
