CREATE OR REPLACE FUNCTION public.billing_entitlement_resolution_operator_audit(
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit  int;
  v_counts jsonb;
  v_rows   jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;
  IF NOT public.has_role(auth.uid(), 'operator'::public.app_role) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'operator_required');
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);

  WITH resolved AS (
    SELECT
      bs.plan_id,
      bs.status                  AS subscription_status,
      bs.cancel_at_period_end,
      bs.current_period_end,
      bs.updated_at,
      CASE
        WHEN bs.plan_id NOT IN ('free','pro_monthly','pro_annual','founder_lifetime') THEN 'unknown'
        WHEN bs.status  NOT IN ('active','past_due','canceled','paused','expired')    THEN 'unknown'
        WHEN bs.status = 'active'
             AND (bs.current_period_end IS NULL OR bs.current_period_end > now())     THEN 'active'
        WHEN bs.status = 'active' AND bs.current_period_end <= now()                  THEN 'expired_fallback'
        WHEN bs.status IN ('expired','canceled')                                      THEN 'expired_fallback'
        WHEN bs.status IN ('past_due','paused')                                       THEN 'blocked'
        ELSE 'free_fallback'
      END AS effective_entitlement_state,
      CASE
        WHEN bs.plan_id NOT IN ('free','pro_monthly','pro_annual','founder_lifetime') THEN 'unknown_plan_id'
        WHEN bs.status  NOT IN ('active','past_due','canceled','paused','expired')    THEN 'unknown_status'
        WHEN bs.status = 'active'
             AND (bs.current_period_end IS NULL OR bs.current_period_end > now())     THEN NULL
        WHEN bs.status = 'active' AND bs.current_period_end <= now()                  THEN 'period_elapsed'
        WHEN bs.status = 'expired'                                                    THEN 'expired'
        WHEN bs.status = 'canceled'                                                   THEN 'canceled'
        WHEN bs.status = 'past_due'                                                   THEN 'past_due'
        WHEN bs.status = 'paused'                                                     THEN 'paused'
        ELSE NULL
      END AS fallback_reason
    FROM public.billing_subscriptions bs
  )
  SELECT jsonb_build_object(
    'total',            count(*),
    'active',           count(*) FILTER (WHERE effective_entitlement_state = 'active'),
    'free_fallback',    count(*) FILTER (WHERE effective_entitlement_state = 'free_fallback'),
    'expired_fallback', count(*) FILTER (WHERE effective_entitlement_state = 'expired_fallback'),
    'blocked',          count(*) FILTER (WHERE effective_entitlement_state = 'blocked'),
    'unknown',          count(*) FILTER (WHERE effective_entitlement_state = 'unknown')
  )
  INTO v_counts
  FROM resolved;

  SELECT COALESCE(jsonb_agg(sub.row), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'plan_id',                    plan_id,
      'subscription_status',        subscription_status,
      'effective_entitlement_state', effective_entitlement_state,
      'fallback_reason',            fallback_reason,
      'cancel_at_period_end',       cancel_at_period_end,
      'current_period_end_present', current_period_end IS NOT NULL,
      'updated_at',                 to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    ) AS row
    FROM resolved
    ORDER BY updated_at DESC NULLS LAST
    LIMIT v_limit
  ) sub;

  RETURN jsonb_build_object(
    'ok',           true,
    'generated_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'limit',        v_limit,
    'counts',       COALESCE(v_counts, jsonb_build_object(
      'total', 0, 'active', 0, 'free_fallback', 0,
      'expired_fallback', 0, 'blocked', 0, 'unknown', 0
    )),
    'latest',       v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.billing_entitlement_resolution_operator_audit(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_entitlement_resolution_operator_audit(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.billing_entitlement_resolution_operator_audit(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_entitlement_resolution_operator_audit(integer) TO service_role;

COMMENT ON FUNCTION public.billing_entitlement_resolution_operator_audit(integer) IS
  'Operator-only sanitized diagnostic. Returns counts and latest entitlement resolution rows from billing_subscriptions. Never returns provider IDs, payloads, user IDs, emails, or internal event/processing IDs.';
