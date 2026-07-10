-- ai_credit_spend: restore effective-plan hardening AND read BOTH billing
-- sources (union), fixing two regressions introduced by 20260709015647:
--
--   1. SINGLE-TABLE READ: the function read plan_id ONLY from
--      public.billing_subscriptions (legacy BYO Paddle). Customers who pay
--      through the live /pricing checkout land in public.subscriptions
--      (Lovable Paddle) — they were metered as FREE (3 credits/grow) despite
--      "100 AI credits/month" being the top-billed Pro benefit.
--   2. DROPPED HARDENING: the raw plan_id was trusted with no status /
--      current_period_end check, so a canceled/expired/past_due BYO pro row
--      kept 100 credits/month forever. 20260620231000 had fixed exactly
--      this; the later CREATE OR REPLACE silently undid it.
--
-- Resolution rules (mirrors public.has_pheno_tracker_entitlement's union —
-- 20260709193855 — with the STRICTER credits precedent from 20260620231000:
-- credits honor only status='active' with an unexpired period; no
-- canceled-grace, no trialing):
--   * BYO row      -> public.ai_credit_effective_credit_plan_id(plan, status,
--                     period_end, now())  [existing helper, unchanged]
--   * Lovable row  -> newest live-environment row whose price_id is a known
--                     plan, status='active', period NULL or in the future.
--   * Union        -> first non-free of (BYO, Lovable), else 'free'.
--
-- Everything else (idempotent replay, per-user advisory lock, staff
-- monthly metering, grow ownership check, append-only ledger, return shape)
-- is byte-compatible with 20260709015647 so the edge functions'
-- contract is unchanged.

CREATE OR REPLACE FUNCTION public.ai_credit_spend(p_feature text, p_grow_id uuid, p_model_tier text, p_idempotency_key text, p_result jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_plan_id text;
  v_byo_plan text;
  v_byo_status text;
  v_byo_period_end timestamptz;
  v_eff_byo text;
  v_lov_plan text;
  v_per_grow int;
  v_per_month int;
  v_weight int := 1;
  v_period_key text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
  v_scope text;
  v_limit int;
  v_used int;
  v_existing record;
  v_new_id uuid;
  v_is_staff boolean := false;
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

  -- Idempotent replay: an existing key returns the original outcome.
  SELECT id, status, weight, model_tier, feature, grow_id, period_key, result
    INTO v_existing
    FROM public.ai_credit_spends
   WHERE user_id = v_uid AND idempotency_key = p_idempotency_key
   LIMIT 1;
  IF FOUND THEN
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

  PERFORM pg_advisory_xact_lock(hashtext(v_uid::text));

  -- BYO (legacy Paddle) row, hardened through the effective-plan helper:
  -- inactive / expired / unknown all degrade to 'free'.
  SELECT bs.plan_id, bs.status, bs.current_period_end
    INTO v_byo_plan, v_byo_status, v_byo_period_end
    FROM public.billing_subscriptions bs
   WHERE bs.user_id = v_uid
   LIMIT 1;
  v_eff_byo := public.ai_credit_effective_credit_plan_id(
    COALESCE(v_byo_plan, 'free'),
    COALESCE(v_byo_status, 'active'),
    v_byo_period_end,
    now());

  -- Lovable checkout row (live environment; price_id maps 1:1 onto known
  -- plan ids). Only an active, unexpired row counts — same strictness the
  -- helper applies to the BYO row.
  SELECT s.price_id
    INTO v_lov_plan
    FROM public.subscriptions s
   WHERE s.user_id = v_uid
     AND s.environment = 'live'
     AND s.price_id IN ('pro_monthly','pro_annual','founder_lifetime')
     AND s.status = 'active'
     AND (s.current_period_end IS NULL OR s.current_period_end > now())
   ORDER BY s.created_at DESC
   LIMIT 1;

  -- Union: first non-free source wins (all pro tiers share one allowance).
  v_plan_id := CASE
    WHEN v_eff_byo IS NOT NULL AND v_eff_byo <> 'free' THEN v_eff_byo
    WHEN v_lov_plan IS NOT NULL THEN v_lov_plan
    ELSE 'free'
  END;

  SELECT per_grow, per_month INTO v_per_grow, v_per_month
    FROM public.ai_credit_allowance(v_plan_id);

  -- Staff override: monthly-scoped, generous but STILL CAPPED and metered.
  v_is_staff := public.has_role(v_uid, 'staff'::public.app_role);
  IF v_is_staff THEN
    v_per_grow := NULL;
    v_per_month := 10000;
    v_plan_id := 'staff';
  END IF;

  IF v_per_grow IS NOT NULL THEN
    v_scope := 'per_grow';
    v_limit := v_per_grow;
    IF p_grow_id IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'status', 'invalid', 'reason', 'grow_id_required_for_plan',
        'plan_id', v_plan_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.grows WHERE id = p_grow_id AND user_id = v_uid) THEN
      RETURN jsonb_build_object(
        'ok', false, 'status', 'invalid', 'reason', 'grow_not_owned',
        'plan_id', v_plan_id);
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
    RETURN jsonb_build_object(
      'ok', false, 'status', 'denied', 'reason', 'unknown_plan',
      'plan_id', v_plan_id, 'scope_limit', 0, 'remaining', 0);
  END IF;

  IF v_used + v_weight > v_limit THEN
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'denied',
      'reason', 'limit_reached',
      'plan_id', v_plan_id,
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
     p_grow_id,
     v_period_key, v_weight, p_model_tier, p_feature, 'spent',
     p_idempotency_key, p_result,
     jsonb_build_object('plan_id', v_plan_id, 'scope', v_scope, 'staff', v_is_staff))
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'spent',
    'spend_id', v_new_id,
    'weight', v_weight,
    'plan_id', v_plan_id,
    'scope', v_scope,
    'scope_used', v_used + v_weight,
    'scope_limit', v_limit,
    'remaining', v_limit - (v_used + v_weight),
    'period_key', v_period_key,
    'model_tier', p_model_tier,
    'feature', p_feature
  );
END;
$function$;

-- Re-assert grant posture: authenticated callers + service_role only.
REVOKE ALL ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb) TO service_role;
