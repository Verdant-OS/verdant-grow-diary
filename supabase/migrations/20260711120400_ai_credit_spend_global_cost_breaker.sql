-- Trust-boundary hardening — Slice 5: global AI-cost circuit breaker.
--
-- ai_credit_spend enforces PER-USER caps (per-grow / per-month via
-- ai_credit_allowance) but there is no GLOBAL ceiling or kill switch, so a
-- pricing/abuse/runaway scenario has no backstop. This adds a global daily
-- weight ceiling plus a hard-stop kill switch, both read from a single-row
-- config table, checked inside the existing SECURITY DEFINER chokepoint.
--
-- The function body is reproduced verbatim from the live definition; the ONLY
-- additions are (a) three locals, and (b) the breaker check inserted after the
-- idempotency-replay short-circuit and before the per-user advisory lock. The
-- entitlement resolution is intentionally left byte-for-byte unchanged (its
-- single-source unification is a separate, behaviour-affecting change gated on
-- the Paddle live/sandbox cutover decision).

-- Config singleton: only reachable by the SECURITY DEFINER function (owner) and
-- service_role; RLS with no policies denies all direct client access.
CREATE TABLE IF NOT EXISTS public.ai_cost_circuit_breaker (
  singleton               boolean PRIMARY KEY DEFAULT true,
  hard_stop               boolean NOT NULL DEFAULT false,
  daily_global_weight_cap int,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_cost_circuit_breaker_singleton_chk CHECK (singleton)
);

ALTER TABLE public.ai_cost_circuit_breaker ENABLE ROW LEVEL SECURITY;

-- Generous default ceiling: well above legitimate use (4 pre-launch users each
-- capped at 100 weight/month) while bounding a runaway to 2000 weight/day.
INSERT INTO public.ai_cost_circuit_breaker (singleton, hard_stop, daily_global_weight_cap)
VALUES (true, false, 2000)
ON CONFLICT (singleton) DO NOTHING;

-- Supports the global daily-sum probe.
CREATE INDEX IF NOT EXISTS ai_credit_spends_positive_weight_created_idx
  ON public.ai_credit_spends (created_at)
  WHERE weight > 0;

CREATE OR REPLACE FUNCTION public.ai_credit_spend(
  p_feature text,
  p_grow_id uuid,
  p_model_tier text,
  p_idempotency_key text,
  p_result jsonb DEFAULT NULL::jsonb
) RETURNS jsonb
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
  -- Slice 5 additions:
  v_breaker_stop boolean;
  v_breaker_cap  int;
  v_global_used  bigint;
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

  -- ---- Slice 5: global AI-cost circuit breaker --------------------------
  -- Runs before per-user metering. A replay above returns early and is never
  -- counted (it does not consume fresh budget). Idempotency-replays therefore
  -- bypass the ceiling by design; only genuinely new spends are gated.
  SELECT hard_stop, daily_global_weight_cap
    INTO v_breaker_stop, v_breaker_cap
    FROM public.ai_cost_circuit_breaker
   LIMIT 1;
  IF v_breaker_stop IS TRUE THEN
    RETURN jsonb_build_object('ok', false, 'status', 'denied',
      'reason', 'ai_globally_paused');
  END IF;
  IF v_breaker_cap IS NOT NULL THEN
    SELECT COALESCE(SUM(weight), 0) INTO v_global_used
      FROM public.ai_credit_spends
     WHERE weight > 0 AND created_at >= date_trunc('day', now());
    IF v_global_used + v_weight > v_breaker_cap THEN
      RETURN jsonb_build_object('ok', false, 'status', 'denied',
        'reason', 'global_daily_ceiling',
        'scope', 'global',
        'scope_used', v_global_used,
        'scope_limit', v_breaker_cap);
    END IF;
  END IF;
  -- -----------------------------------------------------------------------

  PERFORM pg_advisory_xact_lock(hashtext(v_uid::text));

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

  v_plan_id := CASE
    WHEN v_eff_byo IS NOT NULL AND v_eff_byo <> 'free' THEN v_eff_byo
    WHEN v_lov_plan IS NOT NULL THEN v_lov_plan
    ELSE 'free'
  END;

  SELECT per_grow, per_month INTO v_per_grow, v_per_month
    FROM public.ai_credit_allowance(v_plan_id);

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

NOTIFY pgrst, 'reload schema';
