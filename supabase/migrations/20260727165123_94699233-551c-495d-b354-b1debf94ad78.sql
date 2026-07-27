
-- Retention-oriented indexes
CREATE INDEX IF NOT EXISTS edge_function_metric_events_event_type_created_at_idx
  ON public.edge_function_metric_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS edge_function_metric_events_supabase_env_created_at_idx
  ON public.edge_function_metric_events (supabase_env, created_at DESC);

-- Purge function: tiered retention by event type
CREATE OR REPLACE FUNCTION public.purge_edge_function_metric_events(
  request_metric_days integer DEFAULT 14,
  snapshot_days integer DEFAULT 90,
  other_days integer DEFAULT 30
)
RETURNS TABLE(event_type text, deleted_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF request_metric_days < 1 OR snapshot_days < 1 OR other_days < 1 THEN
    RAISE EXCEPTION 'retention windows must be >= 1 day';
  END IF;

  RETURN QUERY
  WITH deleted AS (
    DELETE FROM public.edge_function_metric_events e
    WHERE
      (e.event_type = 'request_metric'  AND e.created_at < now() - make_interval(days => request_metric_days))
      OR (e.event_type = 'metric_snapshot' AND e.created_at < now() - make_interval(days => snapshot_days))
      OR (e.event_type NOT IN ('request_metric','metric_snapshot')
          AND e.created_at < now() - make_interval(days => other_days))
    RETURNING e.event_type
  )
  SELECT d.event_type, count(*)::bigint
  FROM deleted d
  GROUP BY d.event_type;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_edge_function_metric_events(integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_edge_function_metric_events(integer, integer, integer) TO service_role;

-- Daily schedule (unschedule prior copies of the same job name if present)
DO $$
DECLARE
  job_id bigint;
BEGIN
  FOR job_id IN
    SELECT jobid FROM cron.job WHERE jobname = 'purge_edge_function_metric_events_daily'
  LOOP
    PERFORM cron.unschedule(job_id);
  END LOOP;

  PERFORM cron.schedule(
    'purge_edge_function_metric_events_daily',
    '17 3 * * *',
    $cron$ SELECT public.purge_edge_function_metric_events(); $cron$
  );
END;
$$;
