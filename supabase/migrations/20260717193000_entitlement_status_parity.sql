-- Keep customer-visible entitlement status and server-side enforcement in
-- lockstep. Paddle's `past_due` state is dunning, not an immediate downgrade:
-- customers retain their paid capabilities while payment recovery is active.
-- A canceled subscription remains entitled only through its paid-through end.

CREATE OR REPLACE FUNCTION public.has_pheno_tracker_entitlement(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := current_setting('role', true);
  v_uid  uuid := auth.uid();
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    IF v_uid IS NULL OR _user_id IS NULL OR _user_id <> v_uid THEN
      RETURN false;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = _user_id
      AND s.environment = 'live'
      AND (
        (
          s.price_id IN ('pro_monthly','pro_annual')
          AND s.current_period_end IS NOT NULL
          AND (
            (s.status IN ('active','trialing') AND s.current_period_end > now())
            OR s.status = 'past_due'
            OR (s.status = 'canceled' AND s.current_period_end > now())
          )
        )
        OR (
          s.price_id = 'founder_lifetime'
          AND left(s.paddle_subscription_id, 9) = 'lifetime_'
          AND s.status = 'active'
          AND s.current_period_end IS NULL
        )
      )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.has_pheno_tracker_entitlement(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_pheno_tracker_entitlement(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_pheno_tracker_entitlement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_pheno_tracker_entitlement(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.ai_credit_spend(p_feature text, p_grow_id uuid, p_model_tier text, p_idempotency_key text, p_result jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_plan_id text;
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

  SELECT s.price_id
    INTO v_lov_plan
    FROM public.subscriptions s
   WHERE s.user_id = v_uid
     AND s.environment = 'live'
     AND (
       (
         s.price_id IN ('pro_monthly','pro_annual')
         AND s.current_period_end IS NOT NULL
         AND (
           (s.status IN ('active','trialing') AND s.current_period_end > now())
           OR s.status = 'past_due'
           OR (s.status = 'canceled' AND s.current_period_end > now())
         )
       )
       OR (
         s.price_id = 'founder_lifetime'
         AND left(s.paddle_subscription_id, 9) = 'lifetime_'
         AND s.status = 'active'
         AND s.current_period_end IS NULL
       )
     )
   ORDER BY s.created_at DESC
   LIMIT 1;

  v_plan_id := COALESCE(v_lov_plan, 'free');

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

REVOKE ALL ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb) TO service_role;
