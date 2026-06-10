
-- Quick Log idempotency map (per-user, per-key → grow_event)
CREATE TABLE IF NOT EXISTS public.quicklog_idempotency (
  user_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  grow_event_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idempotency_key)
);
GRANT SELECT ON public.quicklog_idempotency TO authenticated;
GRANT ALL ON public.quicklog_idempotency TO service_role;
ALTER TABLE public.quicklog_idempotency ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quicklog_idempotency_owner_read"
  ON public.quicklog_idempotency FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Internal Quick Log audit log
CREATE TABLE IF NOT EXISTS public.quicklog_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  idempotency_key text,
  grow_event_id uuid,
  status text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quicklog_audit_events_user_created_idx
  ON public.quicklog_audit_events (user_id, created_at DESC);
GRANT SELECT ON public.quicklog_audit_events TO authenticated;
GRANT ALL ON public.quicklog_audit_events TO service_role;
ALTER TABLE public.quicklog_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quicklog_audit_events_owner_read"
  ON public.quicklog_audit_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Atomic Quick Log save RPC
CREATE OR REPLACE FUNCTION public.quicklog_save_event(
  p_idempotency_key text,
  p_grow_id uuid,
  p_event_type text,
  p_tent_id uuid DEFAULT NULL,
  p_plant_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_photo_url text DEFAULT NULL,
  p_sensor_snapshot jsonb DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_existing uuid;
  v_event_id uuid;
  v_plant_grow uuid;
  v_plant_tent uuid;
  v_tent_grow uuid;
  v_occurred timestamptz := COALESCE(p_occurred_at, now());
  v_metrics jsonb;
  v_src text;
  v_cap text;
  v_has_snapshot boolean := false;
  v_needs_diary boolean := false;
  v_details jsonb;
  k text;
  v_val jsonb;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 OR length(p_idempotency_key) > 200 THEN
    INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
      VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_idempotency_key');
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_idempotency_key');
  END IF;

  IF p_event_type NOT IN ('observation','watering','feeding','photo','note','environment','training') THEN
    INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
      VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_event_type');
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_event_type');
  END IF;

  INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status)
    VALUES (uid, p_idempotency_key, 'save_started');

  -- Idempotency replay
  SELECT grow_event_id INTO v_existing
    FROM public.quicklog_idempotency
   WHERE user_id = uid AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, grow_event_id, status)
      VALUES (uid, p_idempotency_key, v_existing, 'duplicate_reused');
    RETURN jsonb_build_object('ok', true, 'grow_event_id', v_existing, 'reused', true);
  END IF;

  -- Grow ownership
  IF NOT EXISTS (SELECT 1 FROM public.grows WHERE id = p_grow_id AND user_id = uid) THEN
    INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
      VALUES (uid, p_idempotency_key, 'validation_failed', 'grow_not_owned');
    RETURN jsonb_build_object('ok', false, 'reason', 'grow_not_owned');
  END IF;

  -- Tent ownership + scope
  IF p_tent_id IS NOT NULL THEN
    SELECT grow_id INTO v_tent_grow FROM public.tents
      WHERE id = p_tent_id AND user_id = uid;
    IF NOT FOUND OR v_tent_grow IS DISTINCT FROM p_grow_id THEN
      INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
        VALUES (uid, p_idempotency_key, 'validation_failed', 'tent_not_in_grow');
      RETURN jsonb_build_object('ok', false, 'reason', 'tent_not_in_grow');
    END IF;
  END IF;

  -- Plant ownership + scope
  IF p_plant_id IS NOT NULL THEN
    SELECT grow_id, tent_id INTO v_plant_grow, v_plant_tent
      FROM public.plants WHERE id = p_plant_id AND user_id = uid;
    IF NOT FOUND OR v_plant_grow IS DISTINCT FROM p_grow_id THEN
      INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
        VALUES (uid, p_idempotency_key, 'validation_failed', 'plant_not_in_grow');
      RETURN jsonb_build_object('ok', false, 'reason', 'plant_not_in_grow');
    END IF;
    IF p_tent_id IS NOT NULL AND v_plant_tent IS NOT NULL AND v_plant_tent <> p_tent_id THEN
      INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
        VALUES (uid, p_idempotency_key, 'validation_failed', 'plant_not_in_tent');
      RETURN jsonb_build_object('ok', false, 'reason', 'plant_not_in_tent');
    END IF;
  END IF;

  -- Sensor snapshot validation (optional)
  IF p_sensor_snapshot IS NOT NULL AND jsonb_typeof(p_sensor_snapshot) = 'object' THEN
    v_metrics := p_sensor_snapshot->'metrics';
    IF v_metrics IS NOT NULL AND jsonb_typeof(v_metrics) = 'object'
       AND (SELECT count(*) FROM jsonb_object_keys(v_metrics)) > 0 THEN
      FOR k, v_val IN SELECT * FROM jsonb_each(v_metrics) LOOP
        IF jsonb_typeof(v_val) <> 'number' THEN
          INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
            VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_sensor_metric');
          RETURN jsonb_build_object('ok', false, 'reason', 'invalid_sensor_metric');
        END IF;
      END LOOP;
      v_src := p_sensor_snapshot->>'source';
      v_cap := p_sensor_snapshot->>'captured_at';
      IF v_src IS NULL OR length(btrim(v_src)) = 0 THEN
        INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
          VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_sensor_source');
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid_sensor_source');
      END IF;
      BEGIN
        PERFORM v_cap::timestamptz;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
          VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_sensor_captured_at');
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid_sensor_captured_at');
      END;
      v_has_snapshot := true;
    END IF;
  END IF;

  v_needs_diary := v_has_snapshot OR (p_photo_url IS NOT NULL AND length(p_photo_url) > 0);

  -- Atomic writes
  BEGIN
    INSERT INTO public.grow_events
      (user_id, grow_id, tent_id, plant_id, event_type, source, occurred_at, note)
    VALUES
      (uid, p_grow_id, p_tent_id, p_plant_id, p_event_type, 'manual', v_occurred, NULLIF(p_note, ''))
    RETURNING id INTO v_event_id;

    IF v_needs_diary THEN
      v_details := jsonb_build_object(
        'sensor_snapshot', CASE WHEN v_has_snapshot THEN jsonb_build_object(
            'source', v_src,
            'captured_at', v_cap,
            'metrics', v_metrics
          ) ELSE NULL END,
        'photo_url', p_photo_url,
        'quick_log_version', 1,
        'linked_grow_event_id', v_event_id
      );
      INSERT INTO public.diary_entries
        (user_id, grow_id, tent_id, plant_id, note, entry_at, details)
      VALUES
        (uid, p_grow_id, p_tent_id, p_plant_id,
         COALESCE(NULLIF(btrim(p_note), ''), '(quick log)'),
         v_occurred, v_details);
    END IF;

    INSERT INTO public.quicklog_idempotency (user_id, idempotency_key, grow_event_id)
      VALUES (uid, p_idempotency_key, v_event_id);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
      VALUES (uid, p_idempotency_key, 'save_failed', SQLSTATE);
    RAISE;
  END;

  INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, grow_event_id, status)
    VALUES (uid, p_idempotency_key, v_event_id, 'save_succeeded');

  RETURN jsonb_build_object('ok', true, 'grow_event_id', v_event_id, 'reused', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.quicklog_save_event(text, uuid, text, uuid, uuid, text, text, jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quicklog_save_event(text, uuid, text, uuid, uuid, text, text, jsonb, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.quicklog_save_event(text, uuid, text, uuid, uuid, text, text, jsonb, timestamptz) IS
  'Atomic Quick Log writer: validates ownership of grow/tent/plant, dedupes by (auth.uid, idempotency_key), writes grow_events + companion diary_entries in a single transaction, and emits internal audit rows.';
