-- L2-H4E-5: Subscription updater audit trail (sandbox-only, server-only).
-- Adds a sanitized audit table for results of public.apply_paddle_subscription_update,
-- a service-role-only wrapper RPC that runs the updater and records a sanitized
-- audit row, and an operator-only read RPC that exposes sanitized rows.
--
-- Safety scope:
--   - No live mode, no Founder allocation, no checkout-success grant.
--   - No raw provider IDs / no payload / no price IDs stored.
--   - No grow/plant/tent/sensor/alert/action/AI/device-control writes.
--   - Service-role-only direct table access; anon/authenticated have none.

CREATE TABLE IF NOT EXISTS public.billing_subscription_update_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processing_id uuid NULL REFERENCES public.paddle_event_processing(id) ON DELETE SET NULL,
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  result_status text NOT NULL,
  result_reason text NULL,
  candidate_plan_id text NULL,
  candidate_status text NULL,
  subscription_status text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_subscription_update_audit_result_status_chk
    CHECK (result_status IN ('created','updated','noop','blocked','failed','skipped')),
  CONSTRAINT billing_subscription_update_audit_candidate_plan_id_chk
    CHECK (candidate_plan_id IS NULL OR candidate_plan_id IN ('free','pro_monthly','pro_annual','founder_lifetime')),
  CONSTRAINT billing_subscription_update_audit_candidate_status_chk
    CHECK (candidate_status IS NULL OR candidate_status IN ('active','past_due','canceled','paused','expired')),
  CONSTRAINT billing_subscription_update_audit_subscription_status_chk
    CHECK (subscription_status IS NULL OR subscription_status IN ('active','past_due','canceled','paused','expired'))
);

CREATE INDEX IF NOT EXISTS billing_subscription_update_audit_created_at_idx
  ON public.billing_subscription_update_audit (created_at DESC);

REVOKE ALL ON public.billing_subscription_update_audit FROM PUBLIC;
REVOKE ALL ON public.billing_subscription_update_audit FROM anon;
REVOKE ALL ON public.billing_subscription_update_audit FROM authenticated;
GRANT ALL ON public.billing_subscription_update_audit TO service_role;

ALTER TABLE public.billing_subscription_update_audit ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated; RLS fails closed. service_role bypasses RLS.

CREATE OR REPLACE FUNCTION public.apply_paddle_subscription_update_with_audit(
  p_processing_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  v_result jsonb;
  v_status text;
  v_audit_status text;
BEGIN
  IF p_processing_id IS NULL THEN
    v_result := jsonb_build_object(
      'ok', false,
      'status', 'skipped',
      'reason', 'processing_id_missing',
      'processing_id', NULL,
      'user_id', NULL,
      'plan_id', NULL,
      'subscription_status', NULL
    );
    INSERT INTO public.billing_subscription_update_audit
      (processing_id, user_id, result_status, result_reason,
       candidate_plan_id, candidate_status, subscription_status)
    VALUES (NULL, NULL, 'skipped', 'processing_id_missing', NULL, NULL, NULL);
    RETURN v_result;
  END IF;

  v_result := public.apply_paddle_subscription_update(p_processing_id);

  v_status := COALESCE(v_result ->> 'status', 'failed');
  v_audit_status := CASE
    WHEN v_status IN ('created','updated','noop','blocked','failed','skipped') THEN v_status
    ELSE 'failed'
  END;

  INSERT INTO public.billing_subscription_update_audit
    (processing_id, user_id, result_status, result_reason,
     candidate_plan_id, candidate_status, subscription_status)
  VALUES (
    NULLIF(v_result ->> 'processing_id', '')::uuid,
    NULLIF(v_result ->> 'user_id', '')::uuid,
    v_audit_status,
    NULLIF(v_result ->> 'reason', ''),
    NULLIF(v_result ->> 'plan_id', ''),
    NULLIF(v_result ->> 'subscription_status', ''),
    NULLIF(v_result ->> 'subscription_status', '')
  );

  RETURN v_result;
END;
$func$;

REVOKE ALL ON FUNCTION public.apply_paddle_subscription_update_with_audit(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_paddle_subscription_update_with_audit(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.apply_paddle_subscription_update_with_audit(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_paddle_subscription_update_with_audit(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.billing_subscription_update_operator_audit(
  p_limit integer DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_counts jsonb;
  v_latest jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF NOT public.has_role(auth.uid(), 'operator'::public.app_role) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'operator_required');
  END IF;

  SELECT jsonb_build_object(
    'created', COUNT(*) FILTER (WHERE result_status = 'created'),
    'updated', COUNT(*) FILTER (WHERE result_status = 'updated'),
    'noop', COUNT(*) FILTER (WHERE result_status = 'noop'),
    'blocked', COUNT(*) FILTER (WHERE result_status = 'blocked'),
    'failed', COUNT(*) FILTER (WHERE result_status = 'failed'),
    'skipped', COUNT(*) FILTER (WHERE result_status = 'skipped'),
    'total', COUNT(*)
  )
  INTO v_counts
  FROM public.billing_subscription_update_audit;

  SELECT COALESCE(jsonb_agg(row_json ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_latest
  FROM (
    SELECT
      created_at,
      jsonb_build_object(
        'created_at', created_at,
        'result_status', result_status,
        'result_reason', result_reason,
        'candidate_plan_id', candidate_plan_id,
        'candidate_status', candidate_status,
        'subscription_status', subscription_status
      ) AS row_json
    FROM public.billing_subscription_update_audit
    ORDER BY created_at DESC
    LIMIT v_limit
  ) safe_rows;

  RETURN jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'limit', v_limit,
    'counts', v_counts,
    'latest', v_latest
  );
END;
$func$;

REVOKE ALL ON FUNCTION public.billing_subscription_update_operator_audit(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_subscription_update_operator_audit(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.billing_subscription_update_operator_audit(integer) TO authenticated;
