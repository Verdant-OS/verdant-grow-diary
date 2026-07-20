-- Persist validated AI responses outside the append-only financial ledger so
-- an ambiguous/lost HTTP response can be replayed without another provider
-- call or another credit spend. The original ai_credit_spends row remains
-- immutable; this sidecar is insert-once and keyed by that spend.

CREATE TABLE public.ai_credit_spend_results (
  spend_id uuid PRIMARY KEY
    REFERENCES public.ai_credit_spends(id) ON DELETE CASCADE,
  feature text NOT NULL
    CHECK (feature IN ('ai_doctor_review', 'ai_coach')),
  result jsonb NOT NULL
    CHECK (jsonb_typeof(result) = 'object')
    CHECK (result <> '{}'::jsonb)
    CHECK (octet_length(result::text) <= 131072),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_credit_spend_results IS
  'Insert-once validated AI result cache. Financial ai_credit_spends rows remain append-only.';
COMMENT ON COLUMN public.ai_credit_spend_results.result IS
  'Validated provider result used only for idempotent replay; maximum 128 KiB as canonical JSON text.';

-- Historical rows may contain the legacy inline cache. Keep those readable,
-- but reject every new/updated ledger row that attempts to populate it. NOT
-- VALID deliberately avoids rewriting or rejecting historical rows.
ALTER TABLE public.ai_credit_spends
  ADD CONSTRAINT ai_credit_spends_new_result_must_be_null
  CHECK (result IS NULL) NOT VALID;

ALTER TABLE public.ai_credit_spend_results ENABLE ROW LEVEL SECURITY;

-- No browser policy exists. Only the SECURITY DEFINER recorder writes the
-- sidecar. The service role can read it for server-side replay, but has no
-- direct INSERT/UPDATE/DELETE privilege. Parent-row/account deletion still
-- removes the sidecar through the declared parent-row cascade.
REVOKE ALL ON TABLE public.ai_credit_spend_results FROM PUBLIC;
REVOKE ALL ON TABLE public.ai_credit_spend_results FROM anon;
REVOKE ALL ON TABLE public.ai_credit_spend_results FROM authenticated;
REVOKE ALL ON TABLE public.ai_credit_spend_results FROM service_role;
GRANT SELECT ON TABLE public.ai_credit_spend_results TO service_role;

CREATE OR REPLACE FUNCTION public.ai_credit_attach_result(
  p_expected_user_id uuid,
  p_spend_id uuid,
  p_expected_feature text,
  p_result jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := current_setting('role', true);
  v_spend record;
  v_sidecar_feature text;
  v_sidecar_result jsonb;
  v_sidecar_found boolean := false;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'not_authorized');
  END IF;
  IF p_expected_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'user_id_required');
  END IF;
  IF p_spend_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'spend_id_required');
  END IF;
  IF p_expected_feature IS NULL
     OR p_expected_feature NOT IN ('ai_doctor_review', 'ai_coach') THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'invalid_feature');
  END IF;
  IF p_result IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'result_required');
  END IF;
  IF jsonb_typeof(p_result) IS DISTINCT FROM 'object' OR p_result = '{}'::jsonb THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'invalid_result_shape');
  END IF;
  IF octet_length(p_result::text) > 131072 THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'result_too_large');
  END IF;

  -- Share the per-user serialization boundary with spend/refund so a result
  -- cannot be attached while a reversal for the same user is racing it.
  PERFORM pg_advisory_xact_lock(hashtext(p_expected_user_id::text));

  SELECT id, user_id, feature, status, refund_of, result
    INTO v_spend
    FROM public.ai_credit_spends
   WHERE id = p_spend_id
   LIMIT 1;

  IF NOT FOUND
     OR v_spend.user_id <> p_expected_user_id
     OR v_spend.status <> 'spent'
     OR v_spend.refund_of IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'spend_not_recordable');
  END IF;
  IF v_spend.feature <> p_expected_feature THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'feature_mismatch');
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.ai_credit_spends reversal
     WHERE reversal.refund_of = p_spend_id
       AND reversal.status = 'refunded'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'spend_refunded');
  END IF;

  SELECT feature, result
    INTO v_sidecar_feature, v_sidecar_result
    FROM public.ai_credit_spend_results
   WHERE spend_id = p_spend_id;
  v_sidecar_found := FOUND;

  -- Older callers could put a result directly on the spend. Treat that value
  -- as immutable cache history too, and never paper over a mismatch.
  IF (v_sidecar_found AND v_sidecar_feature <> p_expected_feature)
     OR (v_spend.result IS NOT NULL AND v_spend.result <> p_result)
     OR (v_sidecar_found AND v_sidecar_result <> p_result) THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'result_conflict');
  END IF;
  IF v_spend.result IS NOT NULL OR v_sidecar_found THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'replayed',
      'spend_id', p_spend_id,
      'feature', p_expected_feature
    );
  END IF;

  INSERT INTO public.ai_credit_spend_results (spend_id, feature, result)
  VALUES (p_spend_id, p_expected_feature, p_result);

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'recorded',
    'spend_id', p_spend_id,
    'feature', p_expected_feature
  );
END;
$function$;

-- Keep the existing service-only spend signature and allowance behavior. Only
-- replay resolution changes: prefer the immutable sidecar, suppress any cache
-- after a refund, and return the server timestamp used by the edge to classify
-- a very recent resultless replay.
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

  PERFORM pg_advisory_xact_lock(hashtext(v_uid::text));

  SELECT
      spend.id,
      spend.status,
      spend.weight,
      spend.model_tier,
      spend.feature,
      spend.grow_id,
      spend.period_key,
      spend.created_at,
      -- Legacy credited rows predate the explicit environment field and were
      -- produced only by the live billing path. Keep those rows replayable in
      -- live while still rejecting a same-key sandbox request.
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
   WHERE user_id = v_uid AND idempotency_key = p_idempotency_key
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

REVOKE ALL ON FUNCTION public.ai_credit_attach_result(uuid, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_credit_attach_result(uuid, uuid, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.ai_credit_attach_result(uuid, uuid, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ai_credit_attach_result(uuid, uuid, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.ai_credit_spend(uuid, text, text, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_credit_spend(uuid, text, text, uuid, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.ai_credit_spend(uuid, text, text, uuid, text, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ai_credit_spend(uuid, text, text, uuid, text, text, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
