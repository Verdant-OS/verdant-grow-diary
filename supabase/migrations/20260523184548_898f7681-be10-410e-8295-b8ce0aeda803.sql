-- Atomic pi-ingest commit RPC.
-- Inserts sensor_readings and matching pi_ingest_idempotency_keys in a single
-- transaction. Skips rows whose (user_id, idempotency_key) already exists.
-- Service-role only. Never writes alerts or action_queue.

CREATE OR REPLACE FUNCTION public.pi_ingest_commit_batch(
  p_user_id uuid,
  p_bridge_id text,
  p_tent_id uuid,
  p_rows jsonb
)
RETURNS TABLE(inserted int, rejected int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_inserted int := 0;
  v_rejected int := 0;
  v_row jsonb;
  v_key text;
  v_device_id text;
  v_metric text;
  v_captured_at timestamptz;
  v_sensor_id uuid;
  v_tent_owner uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required' USING ERRCODE = '22023';
  END IF;
  IF p_bridge_id IS NULL OR p_bridge_id = '' THEN
    RAISE EXCEPTION 'p_bridge_id is required' USING ERRCODE = '22023';
  END IF;
  IF p_tent_id IS NULL THEN
    RAISE EXCEPTION 'p_tent_id is required' USING ERRCODE = '22023';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a jsonb array' USING ERRCODE = '22023';
  END IF;

  -- Defense in depth: tent ownership must match the server-resolved user.
  SELECT t.user_id INTO v_tent_owner
    FROM public.tents t
   WHERE t.id = p_tent_id;
  IF v_tent_owner IS NULL OR v_tent_owner <> p_user_id THEN
    RAISE EXCEPTION 'tent does not belong to user' USING ERRCODE = '42501';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_key := v_row->>'idempotency_key';
    v_device_id := v_row->>'device_id';
    v_metric := v_row->>'metric';
    v_captured_at := (v_row->>'captured_at')::timestamptz;

    IF v_key IS NULL OR v_key = '' THEN
      RAISE EXCEPTION 'row missing idempotency_key' USING ERRCODE = '22023';
    END IF;
    IF v_device_id IS NULL OR v_device_id = '' THEN
      RAISE EXCEPTION 'row missing device_id' USING ERRCODE = '22023';
    END IF;
    IF v_metric IS NULL OR v_metric = '' THEN
      RAISE EXCEPTION 'row missing metric' USING ERRCODE = '22023';
    END IF;
    IF v_captured_at IS NULL THEN
      RAISE EXCEPTION 'row missing captured_at' USING ERRCODE = '22023';
    END IF;

    -- Skip if (user_id, idempotency_key) already recorded.
    IF EXISTS (
      SELECT 1 FROM public.pi_ingest_idempotency_keys k
       WHERE k.user_id = p_user_id AND k.idempotency_key = v_key
    ) THEN
      v_rejected := v_rejected + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.sensor_readings (
      user_id, tent_id, device_id, metric, value, captured_at,
      source, quality, raw_payload
    ) VALUES (
      p_user_id,
      p_tent_id,
      v_device_id,
      v_metric,
      (v_row->>'value')::numeric,
      v_captured_at,
      COALESCE(v_row->>'source', 'pi_bridge'),
      COALESCE(v_row->>'quality', 'ok'),
      v_row->'raw_payload'
    )
    RETURNING id INTO v_sensor_id;

    INSERT INTO public.pi_ingest_idempotency_keys (
      user_id, tent_id, bridge_id, device_id, metric, captured_at,
      idempotency_key, sensor_reading_id
    ) VALUES (
      p_user_id,
      p_tent_id,
      p_bridge_id,
      v_device_id,
      v_metric,
      v_captured_at,
      v_key,
      v_sensor_id
    );

    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN QUERY SELECT v_inserted, v_rejected;
END;
$function$;

REVOKE ALL ON FUNCTION public.pi_ingest_commit_batch(uuid, text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pi_ingest_commit_batch(uuid, text, uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.pi_ingest_commit_batch(uuid, text, uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pi_ingest_commit_batch(uuid, text, uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.pi_ingest_commit_batch(uuid, text, uuid, jsonb) IS
  'Atomic pi-ingest commit. Inserts sensor_readings + matching pi_ingest_idempotency_keys in one transaction. Service-role only. Skips rows whose (user_id, idempotency_key) already exists. Never writes alerts or action_queue.';