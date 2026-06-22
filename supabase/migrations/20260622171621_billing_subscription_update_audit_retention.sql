-- L2-H4E-5 retention slice.
-- Service-role-only purge for sanitized subscription updater audit rows.
-- Touches ONLY public.billing_subscription_update_audit. No billing_subscriptions,
-- paddle_events, paddle_event_processing, billing_customer_links, or grow-room
-- tables are read or written here.
--
-- Scheduling: this repo does not currently use pg_cron / scheduled DB jobs.
-- Run monthly via service-role scheduled maintenance (operator runbook),
-- e.g.  SELECT public.purge_billing_subscription_update_audit(365);

CREATE OR REPLACE FUNCTION public.purge_billing_subscription_update_audit(
  p_retention_days integer DEFAULT 365
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_clamped integer;
  v_deleted bigint := 0;
BEGIN
  -- Clamp retention window: minimum 90 days (preserve at least one quarter of
  -- updater outcomes for incident review), maximum 2555 days (~7 years).
  v_clamped := LEAST(GREATEST(COALESCE(p_retention_days, 365), 90), 2555);

  DELETE FROM public.billing_subscription_update_audit
   WHERE created_at < (now() - make_interval(days => v_clamped));
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Sanitized return: counts only. Never returns deleted rows, processing_id,
  -- user_id, provider IDs, payloads, or reason details.
  RETURN jsonb_build_object(
    'ok', true,
    'retention_days', v_clamped,
    'deleted_count', v_deleted
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.purge_billing_subscription_update_audit(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_billing_subscription_update_audit(integer) FROM anon;
REVOKE ALL ON FUNCTION public.purge_billing_subscription_update_audit(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purge_billing_subscription_update_audit(integer) TO service_role;

COMMENT ON FUNCTION public.purge_billing_subscription_update_audit(integer) IS
  'L2-H4E-5 retention purge. Service-role only. Run monthly via service-role scheduled maintenance. Deletes only from public.billing_subscription_update_audit. Returns sanitized {ok, retention_days, deleted_count}.';