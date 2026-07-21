-- =========================================================================
-- AI credit packs — PR2: Craft credit wiring + pack overflow in ai_credit_spend.
--
-- Two coordinated changes to the money-critical spend path (both overloads):
--   1. CRAFT: recognize craft_monthly/craft_annual as recurring paid plans in
--      the entitlement resolver, and give them a 300/month allowance. (Craft is
--      already 300 in PLAN_CATALOG; the SQL↔TS parity test requires the mirror.)
--   2. PACKS: spend included MONTHLY allowance FIRST, then draw purchased packs
--      (public.ai_credit_grants) as overflow above it. Packs are per-user and
--      paid-only (the per-grow Free scope never dips into them).
--
-- Correctness invariants (the subtle, money-load-bearing bits):
--   * Pack-funded spends are tagged meta.funded_by = 'pack' and are EXCLUDED
--     from the plan-scope usage SUM, so a pack spend never double-charges the
--     monthly bucket. Rows without the tag (all pre-existing rows) count as
--     allowance, preserving history.
--   * Balance stays DERIVED: pack_balance = SUM(grant credits, unexpired) −
--     SUM(weight of pack-funded spends). Never a mutated counter — so idempotent
--     replay and refunds compose.
--   * REFUND propagates the original spend's funded_by. A refund of a pack-funded
--     spend therefore restores PACK balance (not the monthly allowance); a refund
--     of an allowance-funded spend restores the monthly allowance. Getting this
--     wrong leaks credits at the allowance↔pack boundary — the happy path looks
--     fine while it's broken.
--
-- Append-only. CREATE OR REPLACE only — no table/policy/grant broadening. The
-- legacy authenticated overloads keep their expand-stage grants (retired only in
-- the isolated contract template), so this migration reasserts grants ONLY for
-- the service seven-argument spend overload.
-- =========================================================================

DO $preflight$
BEGIN
  IF to_regclass('public.ai_credit_grants') IS NULL THEN
    RAISE EXCEPTION
      'ai-credit pack overflow blocked: missing public.ai_credit_grants (apply the grant-ledger migration first)';
  END IF;
  IF to_regprocedure('public.ai_credit_spend(uuid,text,text,uuid,text,text,jsonb)') IS NULL
     OR to_regprocedure('public.ai_credit_spend(text,uuid,text,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION
      'ai-credit pack overflow blocked: missing an ai_credit_spend overload to replace';
  END IF;
END;
$preflight$;

-- Allowance mirror of PLAN_CATALOG, now including Craft (300/month). Packs are
-- NOT represented here — a pack is a grant-ledger balance, never a plan cap — so
-- the SQL↔TS allowance parity test stays exact.
CREATE OR REPLACE FUNCTION public.ai_credit_allowance(p_plan_id text)
RETURNS TABLE(per_grow int, per_month int)
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    CASE p_plan_id
      WHEN 'free' THEN 3
      WHEN 'pro_monthly' THEN NULL
      WHEN 'pro_annual' THEN NULL
      WHEN 'craft_monthly' THEN NULL
      WHEN 'craft_annual' THEN NULL
      WHEN 'founder_lifetime' THEN NULL
      ELSE 0
    END::int AS per_grow,
    CASE p_plan_id
      WHEN 'free' THEN NULL
      WHEN 'pro_monthly' THEN 100
      WHEN 'pro_annual' THEN 100
      WHEN 'craft_monthly' THEN 300
      WHEN 'craft_annual' THEN 300
      WHEN 'founder_lifetime' THEN 100
      ELSE 0
    END::int AS per_month;
$$;

-- =========================================================================
-- Service-only overload (edge functions). Reproduces 20260720093000 with the
-- Craft resolver, the pack-excluding usage SUMs, and the monthly-first-then-pack
-- fund decision.
-- =========================================================================
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
    -- Pack-funded rows never count against a plan scope (they are drawn from the
    -- purchased grant balance, tracked separately below).
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

  -- Purchased credit packs are a per-user overflow ABOVE the monthly allowance
  -- (paid-only; the per-grow Free scope never dips into them). Balance is
  -- derived: unexpired granted credits minus already pack-funded consumption
  -- (refunds of pack-funded spends carry funded_by='pack' and restore it).
  IF v_scope = 'per_month' THEN
    SELECT COALESCE(SUM(credits), 0) INTO v_pack_granted
      FROM public.ai_credit_grants
     WHERE user_id = v_uid AND (expires_at IS NULL OR expires_at > now());
    -- No expiry filter here BY DESIGN: expiry is off (expires_at always NULL).
    -- If pack expiry is ever enabled, a spend against a now-expired grant would
    -- stay counted here while the grant drops out of v_pack_granted above,
    -- pushing pack_balance negative — filter both sides consistently then.
    SELECT COALESCE(SUM(weight), 0) INTO v_pack_used
      FROM public.ai_credit_spends
     WHERE user_id = v_uid AND (meta ->> 'funded_by') = 'pack';
    v_pack_balance := v_pack_granted - v_pack_used;
  END IF;

  -- Included monthly allowance first; packs only once it is exhausted.
  IF v_used + v_weight <= v_limit THEN
    v_funded_by := 'allowance';
  ELSIF v_scope = 'per_month' AND v_pack_balance >= v_weight THEN
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
       'funded_by', v_funded_by
     ))
  RETURNING id, created_at INTO v_new_id, v_new_created_at;

  -- Advance only the pool the spend actually drew from.
  IF v_funded_by = 'pack' THEN
    v_pack_balance := v_pack_balance - v_weight;
  ELSE
    v_used := v_used + v_weight;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'spent',
    'spend_id', v_new_id,
    'weight', v_weight,
    'plan_id', v_plan_id,
    'scope', v_scope,
    'scope_used', v_used,
    'scope_limit', v_limit,
    'remaining', GREATEST(v_limit - v_used, 0),
    'funded_by', v_funded_by,
    'pack_balance', GREATEST(v_pack_balance, 0),
    'period_key', v_period_key,
    'model_tier', p_model_tier,
    'feature', p_feature,
    'grow_id', p_grow_id,
    'spend_created_at', v_new_created_at,
    'spend_age_ms', 0
  );
END;
$function$;

-- =========================================================================
-- Legacy authenticated overload (expand-stage compatibility). Same Craft +
-- pack-overflow logic; keeps inline-result compatibility and its existing
-- grants (no REVOKE here — grants retire only in the contract template).
-- =========================================================================
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
  v_pack_granted int := 0;
  v_pack_used int := 0;
  v_pack_balance int := 0;
  v_funded_by text;
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

  IF v_scope = 'per_month' THEN
    SELECT COALESCE(SUM(credits), 0) INTO v_pack_granted
      FROM public.ai_credit_grants
     WHERE user_id = v_uid AND (expires_at IS NULL OR expires_at > now());
    -- No expiry filter here BY DESIGN: expiry is off (expires_at always NULL).
    -- If pack expiry is ever enabled, a spend against a now-expired grant would
    -- stay counted here while the grant drops out of v_pack_granted above,
    -- pushing pack_balance negative — filter both sides consistently then.
    SELECT COALESCE(SUM(weight), 0) INTO v_pack_used
      FROM public.ai_credit_spends
     WHERE user_id = v_uid AND (meta ->> 'funded_by') = 'pack';
    v_pack_balance := v_pack_granted - v_pack_used;
  END IF;

  IF v_used + v_weight <= v_limit THEN
    v_funded_by := 'allowance';
  ELSIF v_scope = 'per_month' AND v_pack_balance >= v_weight THEN
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

  INSERT INTO public.ai_credit_spends
    (user_id, grow_id, period_key, weight, model_tier, feature, status,
     idempotency_key, result, meta)
  VALUES
    (v_uid,
     p_grow_id,
     v_period_key, v_weight, p_model_tier, p_feature, 'spent',
     p_idempotency_key, p_result,
     jsonb_build_object('plan_id', v_plan_id, 'scope', v_scope, 'staff', v_is_staff,
       'funded_by', v_funded_by))
  RETURNING id INTO v_new_id;

  IF v_funded_by = 'pack' THEN
    v_pack_balance := v_pack_balance - v_weight;
  ELSE
    v_used := v_used + v_weight;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'spent',
    'spend_id', v_new_id,
    'weight', v_weight,
    'plan_id', v_plan_id,
    'scope', v_scope,
    'scope_used', v_used,
    'scope_limit', v_limit,
    'remaining', GREATEST(v_limit - v_used, 0),
    'funded_by', v_funded_by,
    'pack_balance', GREATEST(v_pack_balance, 0),
    'period_key', v_period_key,
    'model_tier', p_model_tier,
    'feature', p_feature
  );
END;
$function$;

-- =========================================================================
-- Refund overloads: propagate the original spend's funded_by onto the reversal
-- so a refunded pack-funded spend restores PACK balance (not the monthly
-- allowance), and a refunded allowance spend restores the allowance.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.ai_credit_refund(
  p_expected_user_id uuid,
  p_spend_id uuid,
  p_idempotency_key text,
  p_reason text DEFAULT 'upstream_failure'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := current_setting('role', true);
  v_uid uuid := p_expected_user_id;
  v_orig record;
  v_existing_by_key record;
  v_existing_refund uuid;
  v_new_id uuid;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'not_authorized');
  END IF;
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'user_id_required');
  END IF;
  IF p_spend_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'spend_id_required');
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 OR length(p_idempotency_key) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'invalid_idempotency_key');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_uid::text));

  SELECT id, status, refund_of INTO v_existing_by_key
    FROM public.ai_credit_spends
   WHERE user_id = v_uid AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing_by_key.status = 'refunded' AND v_existing_by_key.refund_of = p_spend_id THEN
      RETURN jsonb_build_object(
        'ok', true,
        'status', 'replayed',
        'refund_id', v_existing_by_key.id
      );
    END IF;
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'invalid',
      'reason', 'idempotency_key_conflict'
    );
  END IF;

  SELECT id, user_id, grow_id, period_key, weight, model_tier, feature, status, meta
    INTO v_orig
    FROM public.ai_credit_spends
   WHERE id = p_spend_id
   LIMIT 1;
  IF NOT FOUND OR v_orig.user_id <> v_uid OR v_orig.status <> 'spent' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'spend_not_refundable');
  END IF;

  SELECT id INTO v_existing_refund
    FROM public.ai_credit_spends
   WHERE refund_of = p_spend_id
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'status', 'replayed', 'refund_id', v_existing_refund);
  END IF;

  INSERT INTO public.ai_credit_spends
    (user_id, grow_id, period_key, weight, model_tier, feature, status,
     idempotency_key, refund_of, meta)
  VALUES
    (v_uid, v_orig.grow_id, v_orig.period_key, -v_orig.weight, v_orig.model_tier,
     v_orig.feature, 'refunded', p_idempotency_key, p_spend_id,
     jsonb_build_object('reason', p_reason, 'funded_by', v_orig.meta ->> 'funded_by'))
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'refunded',
    'refund_id', v_new_id,
    'spend_id', p_spend_id,
    'weight', -v_orig.weight
  );
END;
$function$;

-- Legacy authenticated refund (kept for expand-stage rollback). No REVOKE here
-- (grants retire only in the contract template); body updated to propagate
-- funded_by so it can never mis-restore a pack-funded spend either.
CREATE OR REPLACE FUNCTION public.ai_credit_refund(
  p_spend_id uuid,
  p_idempotency_key text,
  p_reason text DEFAULT 'upstream_failure'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_orig record;
  v_existing_refund uuid;
  v_new_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'not_authenticated');
  END IF;
  IF p_spend_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'spend_id_required');
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 OR length(p_idempotency_key) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'invalid_idempotency_key');
  END IF;

  SELECT id INTO v_new_id
    FROM public.ai_credit_spends
   WHERE user_id = v_uid AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'status', 'replayed', 'refund_id', v_new_id);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_uid::text));

  SELECT id, user_id, grow_id, period_key, weight, model_tier, feature, status, meta
    INTO v_orig
    FROM public.ai_credit_spends
   WHERE id = p_spend_id
   LIMIT 1;
  IF NOT FOUND OR v_orig.user_id <> v_uid OR v_orig.status <> 'spent' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'spend_not_refundable');
  END IF;

  SELECT id INTO v_existing_refund
    FROM public.ai_credit_spends
   WHERE refund_of = p_spend_id
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'status', 'replayed', 'refund_id', v_existing_refund);
  END IF;

  INSERT INTO public.ai_credit_spends
    (user_id, grow_id, period_key, weight, model_tier, feature, status,
     idempotency_key, refund_of, meta)
  VALUES
    (v_uid, v_orig.grow_id, v_orig.period_key, -v_orig.weight, v_orig.model_tier,
     v_orig.feature, 'refunded', p_idempotency_key, p_spend_id,
     jsonb_build_object('reason', p_reason, 'funded_by', v_orig.meta ->> 'funded_by'))
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('ok', true, 'status', 'refunded',
    'refund_id', v_new_id, 'spend_id', p_spend_id, 'weight', -v_orig.weight);
END;
$function$;

-- Reassert the service seven-argument overload as service-only (CREATE OR
-- REPLACE preserves grants, but pin the posture explicitly). The legacy
-- overloads keep their expand-stage grants — not touched here.
REVOKE ALL ON FUNCTION public.ai_credit_spend(uuid, text, text, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_credit_spend(uuid, text, text, uuid, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.ai_credit_spend(uuid, text, text, uuid, text, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ai_credit_spend(uuid, text, text, uuid, text, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.ai_credit_refund(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_credit_refund(uuid, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.ai_credit_refund(uuid, uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ai_credit_refund(uuid, uuid, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
