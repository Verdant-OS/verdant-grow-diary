-- Preserve AI-credit ledger history when a grow is deleted, while keeping
-- every new spend and replay bound to a grow the authenticated user owns at
-- request time. A supplied grow is locked through transaction end so it
-- cannot disappear between validation and the append-only ledger insert.
--
-- This migration deliberately drops the grow foreign key without replacing
-- it. ai_credit_spends.grow_id remains an immutable historical UUID. Account
-- deletion still cascades through ai_credit_spends.user_id, and the result
-- cache still cascades through its spend_id parent.

DO $preflight$
DECLARE
  v_legacy_spend regprocedure :=
    to_regprocedure('public.ai_credit_spend(text,uuid,text,text,jsonb)');
  v_server_spend regprocedure :=
    to_regprocedure('public.ai_credit_spend(uuid,text,text,uuid,text,text,jsonb)');
  v_spends regclass := to_regclass('public.ai_credit_spends');
  v_result_cache regclass := to_regclass('public.ai_credit_spend_results');
  v_evidence_receipts regclass :=
    to_regclass('public.ai_doctor_review_evidence_receipts');
  v_grows regclass := to_regclass('public.grows');
  v_users regclass := to_regclass('auth.users');
BEGIN
  IF v_legacy_spend IS NULL THEN
    RAISE EXCEPTION
      'ai-credit grow-scope integrity blocked: missing legacy five-argument spend overload';
  END IF;
  IF v_server_spend IS NULL THEN
    RAISE EXCEPTION
      'ai-credit grow-scope integrity blocked: missing service seven-argument spend overload';
  END IF;
  IF v_spends IS NULL THEN
    RAISE EXCEPTION
      'ai-credit grow-scope integrity blocked: missing public.ai_credit_spends';
  END IF;
  IF v_result_cache IS NULL THEN
    RAISE EXCEPTION
      'ai-credit grow-scope integrity blocked: missing public.ai_credit_spend_results';
  END IF;
  IF v_evidence_receipts IS NULL THEN
    RAISE EXCEPTION
      'ai-credit grow-scope integrity blocked: missing public.ai_doctor_review_evidence_receipts';
  END IF;
  IF v_grows IS NULL OR v_users IS NULL THEN
    RAISE EXCEPTION
      'ai-credit grow-scope integrity blocked: missing ownership parent table';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint c
     WHERE c.conname = 'ai_credit_spends_grow_id_fkey'
       AND c.contype = 'f'
       AND c.conrelid = v_spends
       AND c.confrelid = v_grows
       AND c.confdeltype = 'c'
       AND c.conkey = ARRAY[
         (
           SELECT a.attnum::smallint
             FROM pg_catalog.pg_attribute a
            WHERE a.attrelid = v_spends
              AND a.attname = 'grow_id'
              AND NOT a.attisdropped
         )
       ]::smallint[]
       AND c.confkey = ARRAY[
         (
           SELECT a.attnum::smallint
             FROM pg_catalog.pg_attribute a
            WHERE a.attrelid = v_grows
              AND a.attname = 'id'
              AND NOT a.attisdropped
         )
       ]::smallint[]
  ) THEN
    RAISE EXCEPTION
      'ai-credit grow-scope integrity blocked: expected grow_id ON DELETE CASCADE foreign key is absent or drifted';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint c
     WHERE c.conname = 'ai_credit_spends_user_id_fkey'
       AND c.contype = 'f'
       AND c.conrelid = v_spends
       AND c.confrelid = v_users
       AND c.confdeltype = 'c'
       AND c.conkey = ARRAY[
         (
           SELECT a.attnum::smallint
             FROM pg_catalog.pg_attribute a
            WHERE a.attrelid = v_spends
              AND a.attname = 'user_id'
              AND NOT a.attisdropped
         )
       ]::smallint[]
       AND c.confkey = ARRAY[
         (
           SELECT a.attnum::smallint
             FROM pg_catalog.pg_attribute a
            WHERE a.attrelid = v_users
              AND a.attname = 'id'
              AND NOT a.attisdropped
         )
       ]::smallint[]
  ) THEN
    RAISE EXCEPTION
      'ai-credit grow-scope integrity blocked: expected user_id account cascade is absent or drifted';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint c
     WHERE c.conname = 'ai_credit_spend_results_spend_id_fkey'
       AND c.contype = 'f'
       AND c.conrelid = v_result_cache
       AND c.confrelid = v_spends
       AND c.confdeltype = 'c'
       AND c.conkey = ARRAY[
         (
           SELECT a.attnum::smallint
             FROM pg_catalog.pg_attribute a
            WHERE a.attrelid = v_result_cache
              AND a.attname = 'spend_id'
              AND NOT a.attisdropped
         )
       ]::smallint[]
       AND c.confkey = ARRAY[
         (
           SELECT a.attnum::smallint
             FROM pg_catalog.pg_attribute a
            WHERE a.attrelid = v_spends
              AND a.attname = 'id'
              AND NOT a.attisdropped
         )
       ]::smallint[]
  ) THEN
    RAISE EXCEPTION
      'ai-credit grow-scope integrity blocked: expected result-cache spend cascade is absent or drifted';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint c
     WHERE c.conname = 'ai_doctor_review_evidence_receipts_spend_id_fkey'
       AND c.contype = 'f'
       AND c.conrelid = v_evidence_receipts
       AND c.confrelid = v_spends
       AND c.confdeltype = 'c'
       AND c.conkey = ARRAY[
         (
           SELECT a.attnum::smallint
             FROM pg_catalog.pg_attribute a
            WHERE a.attrelid = v_evidence_receipts
              AND a.attname = 'spend_id'
              AND NOT a.attisdropped
         )
       ]::smallint[]
       AND c.confkey = ARRAY[
         (
           SELECT a.attnum::smallint
             FROM pg_catalog.pg_attribute a
            WHERE a.attrelid = v_spends
              AND a.attname = 'id'
              AND NOT a.attisdropped
         )
       ]::smallint[]
  ) THEN
    RAISE EXCEPTION
      'ai-credit grow-scope integrity blocked: expected evidence-receipt spend cascade is absent or drifted';
  END IF;
END;
$preflight$;

ALTER TABLE public.ai_credit_spends
  DROP CONSTRAINT ai_credit_spends_grow_id_fkey;

-- Service-only overload used by verified edge functions. This is the latest
-- result-cache-aware implementation from 20260719043000, with the grow trust
-- boundary moved ahead of replay resolution.
CREATE OR REPLACE FUNCTION public.ai_credit_spend(
  p_user_id uuid,
  p_billing_environment text,
  p_feature text,
  p_grow_id uuid,
  p_model_tier text,
  p_idempotency_key text,
  p_result jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := current_setting('role', true);
  v_uid uuid := p_user_id;
  v_plan_id text;
  v_lov_plan text;
  v_entitlement_environment text;
  v_per_grow int;
  v_per_month int;
  v_weight int := 1;
  v_period_key text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
  v_scope text;
  v_limit int;
  v_used int;
  v_existing record;
  v_new_id uuid;
  v_new_created_at timestamptz;
  v_is_staff boolean := false;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'not_authorized');
  END IF;
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'user_id_required');
  END IF;
  IF p_billing_environment NOT IN ('live', 'sandbox') THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'invalid_billing_environment');
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
  IF p_result IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'inline_result_not_allowed');
  END IF;

  v_weight := CASE p_model_tier WHEN 'escalated' THEN 5 ELSE 1 END;

  -- Keep one lock order across both overloads: user serialization first,
  -- optional owned-grow row lock second, then idempotency replay resolution.
  PERFORM pg_advisory_xact_lock(hashtext(v_uid::text));

  IF p_grow_id IS NOT NULL THEN
    PERFORM 1
      FROM public.grows grow_row
     WHERE grow_row.id = p_grow_id
       AND grow_row.user_id = v_uid
     FOR SHARE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'ok', false, 'status', 'invalid', 'reason', 'grow_not_owned');
    END IF;
  END IF;

  SELECT
      spend.id,
      spend.status,
      spend.weight,
      spend.model_tier,
      spend.feature,
      spend.grow_id,
      spend.period_key,
      spend.created_at,
      COALESCE(spend.meta ->> 'server_billing_environment', 'live') AS server_billing_environment,
      COALESCE(cache.result, spend.result) AS cached_result,
      EXISTS (
        SELECT 1
          FROM public.ai_credit_spends reversal
         WHERE reversal.refund_of = spend.id
           AND reversal.status = 'refunded'
      ) AS has_refund
    INTO v_existing
    FROM public.ai_credit_spends spend
    LEFT JOIN public.ai_credit_spend_results cache
      ON cache.spend_id = spend.id AND cache.feature = spend.feature
   WHERE spend.user_id = v_uid AND spend.idempotency_key = p_idempotency_key
   LIMIT 1;
  IF FOUND THEN
    IF v_existing.feature IS DISTINCT FROM p_feature
       OR v_existing.grow_id IS DISTINCT FROM p_grow_id
       OR v_existing.model_tier IS DISTINCT FROM p_model_tier
       OR v_existing.server_billing_environment IS DISTINCT FROM p_billing_environment THEN
      RETURN jsonb_build_object(
        'ok', false,
        'status', 'invalid',
        'reason', 'idempotency_key_conflict',
        'spend_id', v_existing.id,
        'spend_created_at', v_existing.created_at,
        'spend_age_ms', GREATEST(
          0,
          floor(EXTRACT(EPOCH FROM (clock_timestamp() - v_existing.created_at)) * 1000)::bigint
        )
      );
    END IF;
    IF v_existing.has_refund THEN
      RETURN jsonb_build_object(
        'ok', false,
        'status', 'invalid',
        'reason', 'spend_refunded',
        'spend_id', v_existing.id,
        'feature', v_existing.feature,
        'spend_created_at', v_existing.created_at,
        'spend_age_ms', GREATEST(
          0,
          floor(EXTRACT(EPOCH FROM (clock_timestamp() - v_existing.created_at)) * 1000)::bigint
        )
      );
    END IF;
    IF v_existing.status = 'spent' THEN
      RETURN jsonb_build_object(
        'ok', true,
        'status', 'replayed',
        'spend_id', v_existing.id,
        'weight', v_existing.weight,
        'period_key', v_existing.period_key,
        'model_tier', v_existing.model_tier,
        'feature', v_existing.feature,
        'grow_id', v_existing.grow_id,
        'result', v_existing.cached_result,
        'spend_created_at', v_existing.created_at,
        'spend_age_ms', GREATEST(
          0,
          floor(EXTRACT(EPOCH FROM (clock_timestamp() - v_existing.created_at)) * 1000)::bigint
        )
      );
    END IF;
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'invalid',
      'reason', 'spend_not_replayable',
      'spend_id', v_existing.id,
      'feature', v_existing.feature,
      'spend_created_at', v_existing.created_at,
      'spend_age_ms', GREATEST(
        0,
        floor(EXTRACT(EPOCH FROM (clock_timestamp() - v_existing.created_at)) * 1000)::bigint
      )
    );
  END IF;

  SELECT s.price_id, s.environment
    INTO v_lov_plan, v_entitlement_environment
    FROM public.subscriptions s
   WHERE s.user_id = v_uid
     AND (
       s.environment = 'live'
       OR (p_billing_environment = 'sandbox' AND s.environment = 'sandbox')
     )
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
   ORDER BY
     CASE s.environment WHEN 'live' THEN 0 ELSE 1 END,
     CASE s.price_id WHEN 'founder_lifetime' THEN 0 ELSE 1 END,
     s.created_at DESC,
     s.paddle_subscription_id DESC
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
     p_idempotency_key, NULL,
     jsonb_build_object(
       'plan_id', v_plan_id,
       'scope', v_scope,
       'staff', v_is_staff,
       'server_billing_environment', p_billing_environment,
       'entitlement_environment', v_entitlement_environment
     ))
  RETURNING id, created_at INTO v_new_id, v_new_created_at;

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
    'feature', p_feature,
    'grow_id', p_grow_id,
    'spend_created_at', v_new_created_at,
    'spend_age_ms', 0
  );
END;
$function$;

-- Legacy authenticated overload retained during the expand phase. It keeps
-- the existing live-only entitlement and inline-result compatibility while
-- enforcing the same grow ownership boundary before replay.
CREATE OR REPLACE FUNCTION public.ai_credit_spend(
  p_feature text,
  p_grow_id uuid,
  p_model_tier text,
  p_idempotency_key text,
  p_result jsonb DEFAULT NULL::jsonb
)
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

  PERFORM pg_advisory_xact_lock(hashtext(v_uid::text));

  IF p_grow_id IS NOT NULL THEN
    PERFORM 1
      FROM public.grows grow_row
     WHERE grow_row.id = p_grow_id
       AND grow_row.user_id = v_uid
     FOR SHARE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'ok', false, 'status', 'invalid', 'reason', 'grow_not_owned');
    END IF;
  END IF;

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

-- CREATE OR REPLACE preserves the legacy overload's existing expand-stage
-- grants. Reassert the explicit-user/environment overload as service-only.
REVOKE ALL ON FUNCTION public.ai_credit_spend(uuid, text, text, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_credit_spend(uuid, text, text, uuid, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.ai_credit_spend(uuid, text, text, uuid, text, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ai_credit_spend(uuid, text, text, uuid, text, text, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
