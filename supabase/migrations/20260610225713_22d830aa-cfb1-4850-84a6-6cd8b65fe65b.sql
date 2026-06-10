CREATE OR REPLACE FUNCTION public.get_latest_tent_sensor_snapshot(_tent_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH latest AS (
    SELECT metric, value, captured_at, source
    FROM sensor_readings
    WHERE tent_id = _tent_id
      AND captured_at > now() - interval '4 hours'
    ORDER BY captured_at DESC
  )
  SELECT jsonb_build_object(
    'captured_at', (SELECT max(captured_at) FROM latest),
    'source',      (SELECT source FROM latest LIMIT 1),
    'temperature', (SELECT value FROM latest WHERE metric = 'temperature_c' LIMIT 1),
    'humidity',    (SELECT value FROM latest WHERE metric = 'humidity_pct'    LIMIT 1),
    'vpd',         (SELECT value FROM latest WHERE metric = 'vpd_kpa'         LIMIT 1),
    'soil_temp',   (SELECT value FROM latest WHERE metric = 'soil_temp'      LIMIT 1),
    'soil_ec',     (SELECT value FROM latest WHERE metric = 'ec'             LIMIT 1),
    'ppfd',        (SELECT value FROM latest WHERE metric = 'ppfd'           LIMIT 1)
  );
$$;

COMMENT ON FUNCTION public.get_latest_tent_sensor_snapshot(uuid) IS 
  'Returns a normalized JSONB snapshot of the most recent sensor readings for a tent (last 4 hours). Deterministic and reusable by Quick Log and AI Doctor.';

GRANT EXECUTE ON FUNCTION public.get_latest_tent_sensor_snapshot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_latest_tent_sensor_snapshot(uuid) TO service_role;