-- =========================================================================
-- L2-H4C-2: Read-only operator visibility for Paddle processing outcomes.
--
-- Adds a sanitized SECURITY DEFINER RPC that lets authenticated operators view
-- aggregate processing counts and latest safe processing rows.
--
-- Scope guard:
-- - No direct client grants on public.paddle_event_processing.
-- - No sensitive event body fields in the response.
-- - No external provider identifiers in the response.
-- - No public.billing_subscriptions reads or writes.
-- - No checkout/live-mode changes.
-- - No grow/plant/tent/sensor/alert/action/AI writes.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.paddle_event_processing_operator_audit(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_counts jsonb;
  v_latest jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'not_authenticated'
    );
  END IF;

  IF NOT public.has_role(auth.uid(), 'operator'::public.app_role) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'operator_required'
    );
  END IF;

  SELECT jsonb_build_object(
    'processed', COUNT(*) FILTER (WHERE status = 'processed'),
    'ignored', COUNT(*) FILTER (WHERE status = 'ignored'),
    'blocked', COUNT(*) FILTER (WHERE status = 'blocked'),
    'failed', COUNT(*) FILTER (WHERE status = 'failed'),
    'total', COUNT(*)
  )
  INTO v_counts
  FROM public.paddle_event_processing;

  SELECT COALESCE(jsonb_agg(row_json ORDER BY processed_at DESC), '[]'::jsonb)
  INTO v_latest
  FROM (
    SELECT
      processed_at,
      jsonb_build_object(
        'processed_at', processed_at,
        'event_type', event_type,
        'environment', environment,
        'status', status,
        'reason', reason,
        'candidate_plan_id', candidate_plan_id,
        'candidate_status', candidate_status,
        'current_period_end', current_period_end,
        'cancel_at_period_end', cancel_at_period_end,
        'is_founder_candidate', is_founder_candidate
      ) AS row_json
    FROM public.paddle_event_processing
    ORDER BY processed_at DESC
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
$$;

REVOKE ALL ON FUNCTION public.paddle_event_processing_operator_audit(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.paddle_event_processing_operator_audit(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.paddle_event_processing_operator_audit(integer) TO authenticated;
