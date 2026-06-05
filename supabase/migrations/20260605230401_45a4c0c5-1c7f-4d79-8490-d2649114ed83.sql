-- =========================================================================
-- S2: AI credit ledger + atomic spend/refund.
-- Append-only. No mutable counters. Locking via pg_advisory_xact_lock.
-- =========================================================================

CREATE TABLE public.ai_credit_spends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grow_id uuid NULL REFERENCES public.grows(id) ON DELETE CASCADE,
  period_key text NOT NULL,
  weight int NOT NULL CHECK (weight IN (1, 5, -1, -5)),
  model_tier text NOT NULL CHECK (model_tier IN ('standard','escalated')),
  feature text NOT NULL CHECK (feature IN ('ai_doctor_review','ai_coach')),
  status text NOT NULL CHECK (status IN ('spent','refunded')),
  idempotency_key text NOT NULL,
  refund_of uuid NULL REFERENCES public.ai_credit_spends(id),
  result jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ai_credit_spends_refunded_has_parent
    CHECK ((status = 'refunded' AND refund_of IS NOT NULL)
        OR (status = 'spent'    AND refund_of IS NULL)),
  CONSTRAINT ai_credit_spends_weight_sign
    CHECK ((status = 'spent'    AND weight > 0)
        OR (status = 'refunded' AND weight < 0))
);

CREATE UNIQUE INDEX ai_credit_spends_user_idem_uq
  ON public.ai_credit_spends(user_id, idempotency_key);

CREATE INDEX ai_credit_spends_user_period_idx
  ON public.ai_credit_spends(user_id, period_key);

CREATE INDEX ai_credit_spends_user_grow_idx
  ON public.ai_credit_spends(user_id, grow_id)
  WHERE grow_id IS NOT NULL;

-- Grants. No anon. No client write policy.
GRANT SELECT ON public.ai_credit_spends TO authenticated;
GRANT ALL    ON public.ai_credit_spends TO service_role;

ALTER TABLE public.ai_credit_spends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_credit_spends_select_own"
  ON public.ai_credit_spends
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- =========================================================================
-- Allowance helper. SQL mirror of PLAN_CATALOG. Parity is enforced by tests.
-- Fail-closed for unknown plan_id: (0, 0).
-- =========================================================================
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
      WHEN 'founder_lifetime' THEN NULL
      ELSE 0
    END::int AS per_grow,
    CASE p_plan_id
      WHEN 'free' THEN NULL
      WHEN 'pro_monthly' THEN 100
      WHEN 'pro_annual' THEN 100
      WHEN 'founder_lifetime' THEN 100
      ELSE 0
    END::int AS per_month;
$$;

-- =========================================================================
-- ai_credit_spend: atomic check-and-spend with idempotent replay.
-- Returns jsonb:
--   { ok: true,  status: 'spent'|'replayed', spend_id, weight, scope,
--     scope_used, scope_limit, remaining, period_key, plan_id, model_tier,
--     result?: jsonb }
--   { ok: false, status: 'denied'|'invalid', reason, scope?, scope_used?,
--     scope_limit?, remaining?, plan_id? }
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
  v_plan_id text;
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

  -- Resolve plan from billing_subscriptions (source of truth). Default 'free'.
  SELECT plan_id INTO v_plan_id
    FROM public.billing_subscriptions
   WHERE user_id = v_uid
   LIMIT 1;
  v_plan_id := COALESCE(v_plan_id, 'free');

  SELECT per_grow, per_month INTO v_per_grow, v_per_month
    FROM public.ai_credit_allowance(v_plan_id);

  -- Determine scope: per-grow if per_grow defined, else per-month.
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
    -- Fail-closed unknown plan.
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
     CASE WHEN v_scope = 'per_grow' THEN p_grow_id ELSE p_grow_id END,
     v_period_key, v_weight, p_model_tier, p_feature, 'spent',
     p_idempotency_key, p_result,
     jsonb_build_object('plan_id', v_plan_id, 'scope', v_scope))
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
$$;

REVOKE ALL ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb) TO authenticated, service_role;

-- =========================================================================
-- ai_credit_refund: append-only negative-weight reversal.
-- Only refunds the caller's own prior 'spent' row, and only once.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.ai_credit_refund(
  p_spend_id uuid,
  p_idempotency_key text,
  p_reason text DEFAULT 'upstream_failure'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

  -- Idempotent: replaying the refund key returns the existing refund row.
  SELECT id INTO v_new_id
    FROM public.ai_credit_spends
   WHERE user_id = v_uid AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'status', 'replayed', 'refund_id', v_new_id);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_uid::text));

  SELECT id, user_id, grow_id, period_key, weight, model_tier, feature, status
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
     jsonb_build_object('reason', p_reason))
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('ok', true, 'status', 'refunded',
    'refund_id', v_new_id, 'spend_id', p_spend_id, 'weight', -v_orig.weight);
END;
$$;

REVOKE ALL ON FUNCTION public.ai_credit_refund(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_credit_refund(uuid, text, text) TO authenticated, service_role;