-- =============================================================================
-- Paddle paid-launch review hardening (follow-up to the merged gate migration
-- 20260714230000_paddle_paid_launch_ordering_and_founder.sql, PR #234).
--
-- FILE-ONLY until explicitly approved for the production project, exactly like
-- the gate migration it amends. The gate migration is treated as IMMUTABLE now
-- that it is merged: every change here is a NEW statement that supersedes it,
-- so this file is safe whether or not the gate migration has been applied.
--
-- Contents:
--   1. allocate_founder_lifetime — advisory lock moved BEFORE the existing-row
--      read, making same-buyer duplicate deliveries converge on the
--      already_founder noop under concurrency instead of a unique-violation
--      'failed' (which would force a pointless webhook retry).
--   2. billing_subscription_update_audit_deny_update — the append-only trigger
--      now permits the ONLY legitimate UPDATE on the table: PostgreSQL's own
--      FK maintenance (processing_id / user_id are ON DELETE SET NULL), so
--      account deletion and Paddle event/processing cleanup are not blocked.
--      Every other UPDATE is still denied.
--   3. billing_subscription_update_audit — direct DELETE/TRUNCATE revoked from
--      service_role (the original audit migration granted ALL). Retention
--      flows exclusively through the reviewed SECURITY DEFINER
--      purge_billing_subscription_update_audit(integer), which runs as the
--      function owner and is unaffected.
-- =============================================================================

-- =============================================================================
-- 1. Founder allocation: serialize BEFORE the existing-row read.
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

  -- Atomic, race-free allocation: the transaction-scoped advisory lock is
  -- taken BEFORE the existing-row read. A concurrent duplicate for the SAME
  -- buyer therefore waits, then observes the committed row and exits through
  -- the already_founder noop — never through a unique-violation 'failed' —
  -- and two different buyers can never both read the same MAX and mint
  -- duplicate numbers. The partial unique index
  -- billing_subscriptions_founder_number_uniq is the structural backstop; the
  -- CHECK (1..75) and the cap enforced below are the ceiling.
  PERFORM pg_advisory_xact_lock(hashtext('billing_subscriptions_founder_allocation'));

  SELECT * INTO v_existing FROM public.billing_subscriptions WHERE user_id = v_link.user_id FOR NO KEY UPDATE;

  -- Idempotency: a duplicate (or replayed) founder transaction for a user who
  -- is already a founder allocates NOTHING and reports noop.
  IF FOUND AND (v_existing.plan_id = 'founder_lifetime' AND v_existing.founder_number IS NOT NULL) THEN
    RETURN jsonb_build_object('ok', true, 'status', 'noop', 'reason', 'already_founder', 'processing_id', v_processing.id, 'user_id', v_link.user_id, 'plan_id', 'founder_lifetime', 'subscription_status', v_existing.status);
  END IF;

  IF FOUND AND v_existing.provider IS NOT NULL AND v_existing.provider <> 'paddle' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'existing_non_paddle_subscription', 'processing_id', v_processing.id, 'user_id', v_link.user_id, 'plan_id', 'founder_lifetime', 'subscription_status', v_existing.status);
  END IF;

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

-- =============================================================================
-- 2. Append-only audit trigger: allow ONLY null-only FK maintenance.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.billing_subscription_update_audit_deny_update()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  -- FK-maintenance exception: this table's foreign keys (processing_id →
  -- paddle_event_processing, user_id → auth.users) are ON DELETE SET NULL,
  -- which PostgreSQL applies as an UPDATE on this table. Deleting a user or
  -- purging event/processing rows must not be blocked by the append-only
  -- rule, so an UPDATE is permitted ONLY when it does nothing except null one
  -- or both FK columns and leaves every audit fact byte-identical. Anything
  -- else is a history rewrite and is denied.
  IF (NEW.user_id IS NULL OR NEW.user_id IS NOT DISTINCT FROM OLD.user_id)
     AND (NEW.processing_id IS NULL OR NEW.processing_id IS NOT DISTINCT FROM OLD.processing_id)
     AND (NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.processing_id IS DISTINCT FROM OLD.processing_id)
     AND NEW.id = OLD.id
     AND NEW.result_status IS NOT DISTINCT FROM OLD.result_status
     AND NEW.result_reason IS NOT DISTINCT FROM OLD.result_reason
     AND NEW.candidate_plan_id IS NOT DISTINCT FROM OLD.candidate_plan_id
     AND NEW.candidate_status IS NOT DISTINCT FROM OLD.candidate_status
     AND NEW.subscription_status IS NOT DISTINCT FROM OLD.subscription_status
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'billing_subscription_update_audit is append-only; updates are not allowed'
    USING ERRCODE = 'insufficient_privilege';
END;
$fn$;

-- =============================================================================
-- 3. Audit rows cannot be destroyed directly, even by service_role.
-- =============================================================================
REVOKE DELETE, TRUNCATE ON TABLE public.billing_subscription_update_audit FROM service_role;
