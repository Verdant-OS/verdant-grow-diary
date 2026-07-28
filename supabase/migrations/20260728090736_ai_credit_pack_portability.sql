-- Credit-pack portability after plan settlement.
--
-- The checkout resolver still limits new pack purchases to an active paid
-- plan, but a completed Paddle transaction can settle after that plan lapses.
-- A purchased grant is durable value: once the current plan allowance is
-- exhausted, the authoritative service spend path must be able to draw that
-- grant under either the per-grow Free scope or a paid per-month scope.
--
-- Forward-only and function-only. Published migrations remain immutable.
-- Legacy overloads are conditionally removed from every API role so only the
-- environment-bound service contracts remain executable.

DO $preflight$
BEGIN
  IF to_regclass('public.ai_credit_grants') IS NULL
     OR to_regclass('public.ai_credit_spends') IS NULL
     OR to_regclass('public.ai_credit_spend_results') IS NULL
     OR to_regprocedure('public.ai_credit_allowance(text)') IS NULL
     OR to_regprocedure(
       'public.ai_credit_spend(uuid,text,text,uuid,text,text,jsonb)'
     ) IS NULL
     OR to_regprocedure(
       'public.ai_credit_refund(uuid,uuid,text,text)'
     ) IS NULL THEN
    RAISE EXCEPTION
      'ai-credit pack portability blocked: required grant, spend, result, allowance, service spend, or refund contract is missing';
  END IF;
END;
$preflight$;

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
  v_pack_granted int := 0;
  v_pack_used int := 0;
  v_pack_balance int := 0;
  v_funded_by text;
  v_receipt_snapshot jsonb;
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

  -- Serialize all allowance and grant-pool decisions for this user. Different
  -- idempotency keys therefore cannot race the same remaining pack balance.
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
      spend.meta -> 'receipt_snapshot' AS receipt_snapshot,
      spend.meta ->> 'plan_id' AS legacy_plan_id,
      spend.meta ->> 'scope' AS legacy_scope,
      spend.meta ->> 'funded_by' AS legacy_funded_by,
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
      -- Rehydrate the receipt captured when the spend committed. Never
      -- recompute time-dependent allowance or pack balances during replay.
      -- Older rows without receipt_snapshot retain their known provenance and
      -- omit unavailable numeric fields instead of inventing current values.
      RETURN jsonb_strip_nulls(jsonb_build_object(
          'plan_id', COALESCE(
            v_existing.receipt_snapshot ->> 'plan_id',
            v_existing.legacy_plan_id
          ),
          'scope', COALESCE(
            v_existing.receipt_snapshot ->> 'scope',
            v_existing.legacy_scope
          ),
          'scope_used', v_existing.receipt_snapshot -> 'scope_used',
          'scope_limit', v_existing.receipt_snapshot -> 'scope_limit',
          'remaining', v_existing.receipt_snapshot -> 'remaining',
          'funded_by', COALESCE(
            v_existing.receipt_snapshot ->> 'funded_by',
            v_existing.legacy_funded_by
          ),
          'pack_balance', v_existing.receipt_snapshot -> 'pack_balance'
        ))
        || jsonb_build_object(
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
         s.price_id IN ('pro_monthly','pro_annual','craft_monthly','craft_annual')
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
    -- Grant-funded rows never count against the included per-grow allowance.
    SELECT COALESCE(SUM(weight), 0) INTO v_used
      FROM public.ai_credit_spends
     WHERE user_id = v_uid AND grow_id = p_grow_id
       AND (meta ->> 'funded_by') IS DISTINCT FROM 'pack';
  ELSIF v_per_month IS NOT NULL THEN
    v_scope := 'per_month';
    v_limit := v_per_month;
    SELECT COALESCE(SUM(weight), 0) INTO v_used
      FROM public.ai_credit_spends
     WHERE user_id = v_uid AND period_key = v_period_key
       AND (meta ->> 'funded_by') IS DISTINCT FROM 'pack';
  ELSE
    RETURN jsonb_build_object(
      'ok', false, 'status', 'denied', 'reason', 'unknown_plan',
      'plan_id', v_plan_id, 'scope_limit', 0, 'remaining', 0);
  END IF;

  -- The grant ledger is a portable, per-user overflow pool, but environments
  -- stay isolated. Refund rows inherit funded_by='pack' without copying the
  -- billing environment, so derive their environment from the original spend.
  SELECT COALESCE(SUM(grant_row.credits), 0) INTO v_pack_granted
    FROM public.ai_credit_grants grant_row
   WHERE grant_row.user_id = v_uid
     AND grant_row.environment = p_billing_environment
     AND (grant_row.expires_at IS NULL OR grant_row.expires_at > now());

  SELECT COALESCE(SUM(spend_row.weight), 0) INTO v_pack_used
    FROM public.ai_credit_spends spend_row
    LEFT JOIN public.ai_credit_spends original_spend
      ON original_spend.id = spend_row.refund_of
   WHERE spend_row.user_id = v_uid
     AND (spend_row.meta ->> 'funded_by') = 'pack'
     AND COALESCE(
       spend_row.meta ->> 'server_billing_environment',
       original_spend.meta ->> 'server_billing_environment',
       'live'
     ) = p_billing_environment;

  v_pack_balance := v_pack_granted - v_pack_used;

  -- Every plan keeps its included allowance first. Only overflow draws the
  -- separately purchased/granted pool.
  IF v_used + v_weight <= v_limit THEN
    v_funded_by := 'allowance';
  ELSIF v_pack_balance >= v_weight THEN
    v_funded_by := 'pack';
  ELSE
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'denied',
      'reason', 'limit_reached',
      'plan_id', v_plan_id,
      'scope', v_scope,
      'scope_used', v_used,
      'scope_limit', v_limit,
      'remaining', GREATEST(v_limit - v_used, 0),
      'pack_balance', GREATEST(v_pack_balance, 0),
      'period_key', v_period_key
    );
  END IF;

  IF v_funded_by = 'pack' THEN
    v_pack_balance := v_pack_balance - v_weight;
  ELSE
    v_used := v_used + v_weight;
  END IF;

  -- This immutable snapshot is the authoritative receipt for both the fresh
  -- response and every same-key replay. It captures post-spend values once.
  v_receipt_snapshot := jsonb_build_object(
    'plan_id', v_plan_id,
    'scope', v_scope,
    'scope_used', v_used,
    'scope_limit', v_limit,
    'remaining', GREATEST(v_limit - v_used, 0),
    'funded_by', v_funded_by,
    'pack_balance', GREATEST(v_pack_balance, 0)
  );

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
       'entitlement_environment', v_entitlement_environment,
       'funded_by', v_funded_by,
       'receipt_snapshot', v_receipt_snapshot
     ))
  RETURNING id, created_at INTO v_new_id, v_new_created_at;

  RETURN v_receipt_snapshot
    || jsonb_build_object(
      'ok', true,
      'status', 'spent',
      'spend_id', v_new_id,
      'weight', v_weight,
      'period_key', v_period_key,
      'model_tier', p_model_tier,
      'feature', p_feature,
      'grow_id', p_grow_id,
      'spend_created_at', v_new_created_at,
      'spend_age_ms', 0
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.ai_credit_spend(uuid, text, text, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_credit_spend(uuid, text, text, uuid, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.ai_credit_spend(uuid, text, text, uuid, text, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ai_credit_spend(uuid, text, text, uuid, text, text, jsonb) TO service_role;

DO $legacy_acl$
BEGIN
  IF to_regprocedure('public.ai_credit_spend(text,uuid,text,text,jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb) FROM authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb) FROM service_role';
  END IF;

  IF to_regprocedure('public.ai_credit_refund(uuid,text,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.ai_credit_refund(uuid, text, text) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.ai_credit_refund(uuid, text, text) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.ai_credit_refund(uuid, text, text) FROM authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION public.ai_credit_refund(uuid, text, text) FROM service_role';
  END IF;
END;
$legacy_acl$;

COMMENT ON FUNCTION public.ai_credit_spend(uuid, text, text, uuid, text, text, jsonb) IS
  'Authoritative service-only AI credit spend. Included plan allowance is consumed first; environment-bound grant balance is portable across per-grow and per-month scopes. Fresh and replayed responses return the immutable post-spend receipt snapshot.';
