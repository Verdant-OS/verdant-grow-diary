-- =========================================================================
-- L2-H1: AI credit effective entitlement hardening.
--
-- Before this migration, ai_credit_spend resolved allowance from the raw
-- billing_subscriptions.plan_id. That was not sufficient for paid-launch
-- safety because canceled / past_due / paused / expired / elapsed-period rows
-- must degrade to Free semantics, matching src/lib/entitlements/resolveEntitlements.ts.
--
-- This migration adds a small deterministic SQL helper and rewires
-- ai_credit_spend to use the EFFECTIVE credit plan, not the raw billing plan.
-- No schema/RLS/Edge/client checkout changes. No sensor, alert, Action Queue,
-- automation, or device-control changes.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.ai_credit_effective_credit_plan_id(
  p_plan_id text,
  p_status text,
  p_current_period_end timestamptz,
  p_now timestamptz
) RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_plan_id NOT IN ('free','pro_monthly','pro_annual','founder_lifetime') THEN 'free'
    WHEN p_status <> 'active' THEN 'free'
    WHEN p_current_period_end IS NOT NULL AND p_current_period_end <= p_now THEN 'free'
    ELSE p_plan_id
  END;
$$;

REVOKE ALL ON FUNCTION public.ai_credit_effective_credit_plan_id(text, text, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_credit_effective_credit_plan_id(text, text, timestamptz, timestamptz) TO authenticated, service_role;

-- =========================================================================
-- ai_credit_spend: replace raw plan_id allowance lookup with effective-plan
-- lookup using plan_id + status + current_period_end.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.ai_credit_spend(
  p_feature text,
  p_grow_id uuid,
  p_model_tier text,
  p_idempotency_key text,
  p_result jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_billing_plan_id text := 'free';
  v_billing_status text := 'active';
  v_current_period_end timestamptz := NULL;
  v_effective_plan_id text := 'free';
  v_per_grow int;
  v_per_month int;
  v_weight int := 1;
  v_period_key text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
  v_scope text;
  v_limit int;
  v_used int;
  v_existing record;
  v_new_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'not_authenticated');
  END IF;
  IF p_feature NOT IN ('ai_doctor_review','ai_coach') THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'invalid_feature');
  END IF;
  IF p_model_tier NOT IN ('standard','escalated') THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'invalid_model_tier');
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 OR length(p_idempotency_key) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'invalid_idempotency_key');
  END IF;

  v_weight := CASE p_model_tier WHEN 'escalated' THEN 5 ELSE 1 END;

  -- Idempotent replay: if (user, key) already exists, return prior row.
  -- Replay never opens a new spend or accidentally double-charges.
  SELECT id, status, weight, model_tier, feature, grow_id, period_key, result
    INTO v_existing
    FROM public.ai_credit_spends
   WHERE user_id = v_uid AND idempotency_key = p_idempotency_key
   LIMIT 1;
  IF FOUND THEN
    -- Recompute remaining for the original scope (best-effort, for caller UX).
    RETURN jsonb_build_object(
      'ok', v_existing.status = 'spent',
      'status', CASE WHEN v_existing.status = 'spent' THEN 'replayed' ELSE 'invalid' END,
      'spend_id', v_existing.id,
      'weight', v_existing.weight,
      'period_key', v_existing.period_key,
      'model_tier', v_existing.model_tier,
      'feature', v_existing.feature,
      'result', v_existing.result
    );
  END IF;

  -- Serialize per-user to prevent two concurrent spends both passing the
  -- check. Released automatically at txn end.
  PERFORM pg_advisory_xact_lock(hashtext(v_uid::text));

  -- Resolve EFFECTIVE credit plan from billing_subscriptions.
  -- Absence of row = Free. Non-active status or elapsed period = Free.
  -- This mirrors src/lib/entitlements/resolveEntitlements.ts for AI credits.
  SELECT plan_id, status, current_period_end
    INTO v_billing_plan_id, v_billing_status, v_current_period_end
    FROM public.billing_subscriptions
   WHERE user_id = v_uid
   LIMIT 1;

  v_billing_plan_id := COALESCE(v_billing_plan_id, 'free');
  v_billing_status := COALESCE(v_billing_status, 'active');
  v_effective_plan_id := public.ai_credit_effective_credit_plan_id(
    v_billing_plan_id,
    v_billing_status,
    v_current_period_end,
    now()
  );

  SELECT per_grow, per_month INTO v_per_grow, v_per_month
    FROM public.ai_credit_allowance(v_effective_plan_id);

  -- Determine scope: per-grow if per_grow defined, else per-month.
  IF v_per_grow IS NOT NULL THEN
    v_scope := 'per_grow';
    v_limit := v_per_grow;
    IF p_grow_id IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'status', 'invalid', 'reason', 'grow_id_required_for_plan',
        'plan_id', v_effective_plan_id,
        'billing_plan_id', v_billing_plan_id,
        'billing_status', v_billing_status);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.grows WHERE id = p_grow_id AND user_id = v_uid) THEN
      RETURN jsonb_build_object(
        'ok', false, 'status', 'invalid', 'reason', 'grow_not_owned',
        'plan_id', v_effective_plan_id,
        'billing_plan_id', v_billing_plan_id,
        'billing_status', v_billing_status);
    END IF;
    SELECT COALESCE(SUM(weight), 0) INTO v_used
      FROM public.ai_credit_spends
     WHERE user_id = v_uid AND grow_id = p_grow_id;
  ELSIF v_per_month IS NOT NULL THEN
    v_scope := 'per_month';
    v_limit := v_per_month;
    SELECT COALESCE(SUM(weight), 0) INTO v_used
      FROM public.ai_credit_spends
     WHERE user_id = v_uid AND period_key = v_period_key;
  ELSE
    -- Fail-closed unknown/effective plan.
    RETURN jsonb_build_object(
      'ok', false, 'status', 'denied', 'reason', 'unknown_plan',
      'plan_id', v_effective_plan_id, 'scope_limit', 0, 'remaining', 0);
  END IF;

  IF v_used + v_weight > v_limit THEN
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'denied',
      'reason', 'limit_reached',
      'plan_id', v_effective_plan_id,
      'billing_plan_id', v_billing_plan_id,
      'billing_status', v_billing_status,
      'scope', v_scope,
      'scope_used', v_used,
      'scope_limit', v_limit,
      'remaining', GREATEST(v_limit - v_used, 0),
      'period_key', v_period_key
    );
  END IF;

  INSERT INTO public.ai_credit_spends
    (user_id, grow_id, period_key, weight, model_tier, feature, status,
     idempotency_key, result, meta)
  VALUES
    (v_uid,
     CASE WHEN v_scope = 'per_grow' THEN p_grow_id ELSE p_grow_id END,
     v_period_key, v_weight, p_model_tier, p_feature, 'spent',
     p_idempotency_key, p_result,
     jsonb_build_object(
       'plan_id', v_effective_plan_id,
       'billing_plan_id', v_billing_plan_id,
       'billing_status', v_billing_status,
       'scope', v_scope
     ))
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'spent',
    'spend_id', v_new_id,
    'weight', v_weight,
    'plan_id', v_effective_plan_id,
    'billing_plan_id', v_billing_plan_id,
    'billing_status', v_billing_status,
    'scope', v_scope,
    'scope_used', v_used + v_weight,
    'scope_limit', v_limit,
    'remaining', v_limit - (v_used + v_weight),
    'period_key', v_period_key,
    'model_tier', p_model_tier,
    'feature', p_feature
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb) TO authenticated, service_role;
