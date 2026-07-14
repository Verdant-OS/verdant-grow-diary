-- =============================================================================
-- Paddle paid-launch gate: event-ordering hardening + Founder Lifetime
-- allocation.
--
-- FILE-ONLY until explicitly approved for the production project. Nothing in
-- this migration enables live mode: every write path below keeps the existing
-- sandbox-only environment gate. Flipping to live remains a separate,
-- explicitly approved migration.
--
-- Contents:
--   1. paddle_event_processing.occurred_at — provider-declared event time.
--   2. billing_subscriptions.last_provider_event_occurred_at — ordering
--      watermark so an older replayed/out-of-order event can never overwrite
--      newer state (the previous guard only covered candidate_status='active'
--      with non-null period ends).
--   3. apply_paddle_subscription_update — CREATE OR REPLACE preserving every
--      existing guard verbatim, adding the occurred_at ordering guard and
--      watermark maintenance.
--   4. allocate_founder_lifetime(_with_audit) — Founder Lifetime is a ONE-TIME
--      paid entitlement (not a recurring subscription): granted only for a
--      verified, signature-checked transaction.completed event, attributed
--      via a verified billing_customer_links row, allocated atomically under
--      an advisory lock, capped at 75 (billing_subscriptions.founder_number
--      CHECK 1..75 + partial unique index), idempotent for duplicate events.
--      service_role-only, like the recurring updater.
--   5. billing_subscription_update_audit append-only hardening: UPDATEs are
--      denied by trigger. (DELETE stays possible only through the existing
--      retention RPC purge_billing_subscription_update_audit.)
-- =============================================================================

ALTER TABLE public.paddle_event_processing
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz;

COMMENT ON COLUMN public.paddle_event_processing.occurred_at IS
  'Provider-declared event occurrence time (payload.occurred_at). NULL for '
  'legacy rows or payloads without it. Used by the subscription updater to '
  'refuse out-of-order application.';

ALTER TABLE public.billing_subscriptions
  ADD COLUMN IF NOT EXISTS last_provider_event_occurred_at timestamptz;

COMMENT ON COLUMN public.billing_subscriptions.last_provider_event_occurred_at IS
  'occurred_at of the newest provider event applied to this row. Ordering '
  'watermark only; never shown to clients as entitlement state.';

-- =============================================================================
-- 3. apply_paddle_subscription_update — existing reviewed guards preserved,
--    plus the occurred_at ordering guard (ALL candidate statuses).
-- =============================================================================
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

  SELECT * INTO v_processing FROM public.paddle_event_processing WHERE id = p_processing_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_found', 'reason', 'processing_row_not_found', 'processing_id', p_processing_id, 'user_id', NULL, 'plan_id', NULL, 'subscription_status', NULL);
  END IF;

  SELECT * INTO v_event FROM public.paddle_events WHERE id = v_processing.paddle_event_id FOR NO KEY UPDATE;
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
   FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'missing_verified_customer_link', 'processing_id', v_processing.id, 'user_id', NULL, 'plan_id', v_processing.candidate_plan_id, 'subscription_status', v_processing.candidate_status);
  END IF;

  SELECT user_id INTO v_existing_other_user
    FROM public.billing_subscriptions
   WHERE provider = 'paddle'
     AND provider_subscription_id = v_processing.provider_subscription_id
     AND user_id <> v_link.user_id
   LIMIT 1
   FOR NO KEY UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'existing_provider_identifier_conflict', 'processing_id', v_processing.id, 'user_id', v_link.user_id, 'plan_id', v_processing.candidate_plan_id, 'subscription_status', v_processing.candidate_status);
  END IF;

  SELECT * INTO v_existing FROM public.billing_subscriptions WHERE user_id = v_link.user_id FOR NO KEY UPDATE;
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

    -- NEW (paid-launch ordering guard): a processing row whose provider event
    -- occurred BEFORE the newest already-applied event is stale, regardless of
    -- candidate_status. This closes the replayed/out-of-order 'canceled' /
    -- 'paused' overwrite of a newer 'active' row. NULLs skip the guard so
    -- legacy rows and payloads without occurred_at keep flowing.
    IF v_processing.occurred_at IS NOT NULL
       AND v_existing.last_provider_event_occurred_at IS NOT NULL
       AND v_processing.occurred_at < v_existing.last_provider_event_occurred_at THEN
      RETURN jsonb_build_object('ok', true, 'status', 'noop', 'reason', 'stale_event_ordering', 'processing_id', v_processing.id, 'user_id', v_link.user_id, 'plan_id', v_existing.plan_id, 'subscription_status', v_existing.status);
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
       AND v_existing.founder_number IS NULL
       AND (v_processing.occurred_at IS NULL
            OR v_existing.last_provider_event_occurred_at IS NOT DISTINCT FROM v_processing.occurred_at) THEN
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
           founder_number = NULL,
           last_provider_event_occurred_at = COALESCE(v_processing.occurred_at, v_existing.last_provider_event_occurred_at)
     WHERE user_id = v_link.user_id;
    v_status := 'updated';
  ELSE
    INSERT INTO public.billing_subscriptions (user_id, plan_id, status, provider, provider_customer_id, provider_subscription_id, current_period_end, cancel_at_period_end, founder_number, last_provider_event_occurred_at)
    VALUES (v_link.user_id, v_processing.candidate_plan_id, v_processing.candidate_status, 'paddle', v_processing.provider_customer_id, v_processing.provider_subscription_id, v_processing.current_period_end, COALESCE(v_processing.cancel_at_period_end, false), NULL, v_processing.occurred_at);
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

-- =============================================================================
-- 4. Founder Lifetime allocation — one-time paid entitlement.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.allocate_founder_lifetime(
  p_processing_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Founder cap. Matches billing_subscriptions.founder_number CHECK (1..75)
  -- and the display-only cap in src/config/pricing.ts. Changing the cap is a
  -- reviewed migration, never a runtime knob.
  c_founder_cap constant integer := 75;
  v_processing public.paddle_event_processing%ROWTYPE;
  v_event public.paddle_events%ROWTYPE;
  v_link public.billing_customer_links%ROWTYPE;
  v_existing public.billing_subscriptions%ROWTYPE;
  v_next integer;
  v_status text;
BEGIN
  IF p_processing_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_found', 'reason', 'processing_row_not_found', 'processing_id', NULL, 'user_id', NULL, 'plan_id', NULL, 'subscription_status', NULL);
  END IF;

  SELECT * INTO v_processing FROM public.paddle_event_processing WHERE id = p_processing_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_found', 'reason', 'processing_row_not_found', 'processing_id', p_processing_id, 'user_id', NULL, 'plan_id', NULL, 'subscription_status', NULL);
  END IF;

  SELECT * INTO v_event FROM public.paddle_events WHERE id = v_processing.paddle_event_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'event_missing', 'processing_id', v_processing.id, 'user_id', NULL, 'plan_id', NULL, 'subscription_status', NULL);
  END IF;

  IF v_event.signature_verified IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'event_not_verified', 'processing_id', v_processing.id, 'user_id', NULL, 'plan_id', NULL, 'subscription_status', NULL);
  END IF;

  -- Same launch posture as the recurring updater: sandbox-only until a
  -- separate, explicitly approved migration enables live.
  IF v_processing.environment <> 'sandbox' OR v_event.environment <> 'sandbox' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'environment_not_allowed', 'processing_id', v_processing.id, 'user_id', NULL, 'plan_id', NULL, 'subscription_status', NULL);
  END IF;

  IF v_processing.status <> 'processed' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'processing_not_processed', 'processing_id', v_processing.id, 'user_id', NULL, 'plan_id', NULL, 'subscription_status', NULL);
  END IF;

  IF v_processing.is_founder_candidate IS NOT TRUE OR v_processing.candidate_plan_id IS DISTINCT FROM 'founder_lifetime' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'not_a_founder_candidate', 'processing_id', v_processing.id, 'user_id', NULL, 'plan_id', v_processing.candidate_plan_id, 'subscription_status', NULL);
  END IF;

  -- Founder is granted only for a COMPLETED PAID TRANSACTION — never for
  -- subscription lifecycle noise, adjustments, or unpaid intents.
  IF v_processing.event_type IS DISTINCT FROM 'transaction.completed' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'founder_requires_completed_transaction', 'processing_id', v_processing.id, 'user_id', NULL, 'plan_id', 'founder_lifetime', 'subscription_status', NULL);
  END IF;

  IF v_processing.provider_customer_id IS NULL OR length(btrim(v_processing.provider_customer_id)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'missing_provider_customer_id', 'processing_id', v_processing.id, 'user_id', NULL, 'plan_id', 'founder_lifetime', 'subscription_status', NULL);
  END IF;

  -- Attribution comes ONLY from a verified customer link (signed checkout
  -- custom_data captured by the webhook) — never email matching. A one-time
  -- founder transaction has no subscription id, so the link is keyed on the
  -- provider customer id.
  SELECT * INTO v_link
    FROM public.billing_customer_links
   WHERE provider = 'paddle'
     AND provider_customer_id = v_processing.provider_customer_id
     AND link_status = 'linked'
     AND confidence = 'verified'
   LIMIT 1
   FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'missing_verified_customer_link', 'processing_id', v_processing.id, 'user_id', NULL, 'plan_id', 'founder_lifetime', 'subscription_status', NULL);
  END IF;

  SELECT * INTO v_existing FROM public.billing_subscriptions WHERE user_id = v_link.user_id FOR NO KEY UPDATE;

  -- Idempotency: a duplicate (or replayed) founder transaction for a user who
  -- is already a founder allocates NOTHING and reports noop.
  IF FOUND AND (v_existing.plan_id = 'founder_lifetime' AND v_existing.founder_number IS NOT NULL) THEN
    RETURN jsonb_build_object('ok', true, 'status', 'noop', 'reason', 'already_founder', 'processing_id', v_processing.id, 'user_id', v_link.user_id, 'plan_id', 'founder_lifetime', 'subscription_status', v_existing.status);
  END IF;

  IF FOUND AND v_existing.provider IS NOT NULL AND v_existing.provider <> 'paddle' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'existing_non_paddle_subscription', 'processing_id', v_processing.id, 'user_id', v_link.user_id, 'plan_id', 'founder_lifetime', 'subscription_status', v_existing.status);
  END IF;

  -- Atomic, race-free allocation: the transaction-scoped advisory lock
  -- serializes ALL founder allocations, so two concurrent verified events can
  -- never both read the same MAX and mint duplicate numbers. The partial
  -- unique index billing_subscriptions_founder_number_uniq is the structural
  -- backstop; the CHECK (1..75) and the cap below enforce the ceiling.
  PERFORM pg_advisory_xact_lock(hashtext('billing_subscriptions_founder_allocation'));

  SELECT COALESCE(MAX(founder_number), 0) + 1 INTO v_next
    FROM public.billing_subscriptions
   WHERE founder_number IS NOT NULL;

  IF v_next > c_founder_cap THEN
    RETURN jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'founder_cap_reached', 'processing_id', v_processing.id, 'user_id', v_link.user_id, 'plan_id', 'founder_lifetime', 'subscription_status', NULL);
  END IF;

  IF FOUND AND v_existing.user_id IS NOT NULL THEN
    UPDATE public.billing_subscriptions
       SET plan_id = 'founder_lifetime',
           status = 'active',
           provider = 'paddle',
           provider_customer_id = v_processing.provider_customer_id,
           current_period_end = NULL,
           cancel_at_period_end = false,
           founder_number = v_next,
           last_provider_event_occurred_at = COALESCE(v_processing.occurred_at, v_existing.last_provider_event_occurred_at)
     WHERE user_id = v_link.user_id;
    v_status := 'updated';
  ELSE
    INSERT INTO public.billing_subscriptions (user_id, plan_id, status, provider, provider_customer_id, provider_subscription_id, current_period_end, cancel_at_period_end, founder_number, last_provider_event_occurred_at)
    VALUES (v_link.user_id, 'founder_lifetime', 'active', 'paddle', v_processing.provider_customer_id, NULL, NULL, false, v_next, v_processing.occurred_at);
    v_status := 'created';
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', v_status, 'reason', NULL, 'processing_id', v_processing.id, 'user_id', v_link.user_id, 'plan_id', 'founder_lifetime', 'subscription_status', 'active');
EXCEPTION WHEN OTHERS THEN
  -- Includes unique_violation backstops: never raises, callers branch on jsonb.
  RETURN jsonb_build_object('ok', false, 'status', 'failed', 'reason', 'founder_allocation_failed', 'processing_id', p_processing_id, 'user_id', NULL, 'plan_id', 'founder_lifetime', 'subscription_status', NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_founder_lifetime(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.allocate_founder_lifetime(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.allocate_founder_lifetime(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_founder_lifetime(uuid) TO service_role;

-- Pre-checkout founder availability. Returns ONLY an aggregate count of
-- remaining founder slots (0..75) — never a row, an id, or any PII.
-- get-paddle-price calls this (as the signed-in caller) to block a sold-out
-- founder checkout BEFORE payment, so a user is never charged for a slot
-- allocate_founder_lifetime would then refuse to entitle. Best-effort:
-- allocate_founder_lifetime's advisory-locked cap check remains the
-- authoritative backstop for the residual race between this read and
-- settlement (operator refund case, documented in the runbook).
-- The 75 here matches billing_subscriptions.founder_number CHECK (1..75) and
-- allocate_founder_lifetime's c_founder_cap; changing the cap is a reviewed
-- migration, never a runtime knob.
CREATE OR REPLACE FUNCTION public.founder_lifetime_slots_remaining()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT GREATEST(
    0,
    75 - (SELECT COUNT(*)::int FROM public.billing_subscriptions WHERE founder_number IS NOT NULL)
  );
$$;

REVOKE ALL ON FUNCTION public.founder_lifetime_slots_remaining() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.founder_lifetime_slots_remaining() FROM anon;
-- Signed-in callers may read the aggregate (the price resolver runs as the
-- verified caller, never service_role). anon stays revoked.
GRANT EXECUTE ON FUNCTION public.founder_lifetime_slots_remaining() TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_lifetime_slots_remaining() TO service_role;

-- Audit wrapper — mirrors apply_paddle_subscription_update_with_audit: one
-- sanitized append-only row per invocation, never provider ids or payloads.
CREATE OR REPLACE FUNCTION public.allocate_founder_lifetime_with_audit(
  p_processing_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
  v_user uuid;
BEGIN
  v_result := public.allocate_founder_lifetime(p_processing_id);
  BEGIN
    v_user := NULLIF(v_result ->> 'user_id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user := NULL;
  END;

  INSERT INTO public.billing_subscription_update_audit (
    processing_id,
    user_id,
    result_status,
    result_reason,
    candidate_plan_id,
    candidate_status,
    subscription_status
  ) VALUES (
    p_processing_id,
    v_user,
    CASE
      WHEN v_result ->> 'status' IN ('created','updated','noop','blocked','failed','skipped') THEN v_result ->> 'status'
      ELSE 'failed'
    END,
    v_result ->> 'reason',
    'founder_lifetime',
    NULLIF(v_result ->> 'subscription_status', ''),
    NULLIF(v_result ->> 'subscription_status', '')
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_founder_lifetime_with_audit(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.allocate_founder_lifetime_with_audit(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.allocate_founder_lifetime_with_audit(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_founder_lifetime_with_audit(uuid) TO service_role;

-- =============================================================================
-- 5. Audit history is append-only: UPDATEs are denied outright. Row DELETE
--    remains possible only via the existing retention RPC
--    purge_billing_subscription_update_audit (service_role-only, >= 90 days).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.billing_subscription_update_audit_deny_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'billing_subscription_update_audit is append-only; updates are not allowed'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS trg_billing_subscription_update_audit_deny_update ON public.billing_subscription_update_audit;
CREATE TRIGGER trg_billing_subscription_update_audit_deny_update
  BEFORE UPDATE ON public.billing_subscription_update_audit
  FOR EACH ROW EXECUTE FUNCTION public.billing_subscription_update_audit_deny_update();
