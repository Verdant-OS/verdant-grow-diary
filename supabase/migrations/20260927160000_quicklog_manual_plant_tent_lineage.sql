-- A plant Quick Log must never save with a tent belonging to another grow.
-- This replaces only the private manual-save delegate after #1735; the public
-- wrapper, table policies, existing rows, and grants remain unchanged.
BEGIN;

DO $preflight$
DECLARE
  v_wrapper oid := pg_catalog.to_regprocedure('public.quicklog_save_manual(text, uuid, text, numeric, text, numeric, numeric, numeric, timestamp with time zone, jsonb, text, text)');
  v_delegate oid := pg_catalog.to_regprocedure('public.quicklog_save_manual_pre_logged_at(text, uuid, text, numeric, text, numeric, numeric, numeric, timestamp with time zone, jsonb, text, text)');
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(20260927, 1600);
  -- The replay fence parent must be present before replacing its delegate.
  IF v_wrapper IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid = v_wrapper
      AND p.prosecdef
      AND pg_catalog.md5(pg_catalog.replace(p.prosrc, E'\r', '')) = '85e40fcd47d1e38dca8f057fee2d905a'
  ) OR v_delegate IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
    WHERE p.oid = v_delegate
      AND r.rolname = 'postgres'
      AND p.prosecdef
      AND p.prorettype = 'jsonb'::pg_catalog.regtype
      AND p.proconfig = ARRAY['search_path=public, pg_temp']::text[]
      AND pg_catalog.md5(pg_catalog.replace(p.prosrc, E'\r', '')) = '7ec296e422f7f47c8b2793b051840798'
  ) OR pg_catalog.has_function_privilege('anon', v_delegate, 'EXECUTE')
    OR pg_catalog.has_function_privilege('authenticated', v_delegate, 'EXECUTE') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'quicklog_manual_lineage_preflight_unrecognized';
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public."quicklog_save_manual_pre_logged_at"(
  p_target_type text,
  p_target_id uuid,
  p_action text,
  p_volume_ml numeric DEFAULT NULL::numeric,
  p_note text DEFAULT NULL::text,
  p_temperature_c numeric DEFAULT NULL::numeric,
  p_humidity_pct numeric DEFAULT NULL::numeric,
  p_vpd_kpa numeric DEFAULT NULL::numeric,
  p_occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_details jsonb DEFAULT NULL::jsonb,
  p_idempotency_key text DEFAULT NULL::text,
  p_stage text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid             uuid := auth.uid();
  v_grow_id       uuid;
  v_tent_id       uuid;
  v_tent_grow_id  uuid;
  v_plant_id      uuid;
  v_occurred      timestamptz := COALESCE(p_occurred_at, now());
  v_parent_event  uuid;
  v_env_parent    uuid;
  v_env_child     uuid;
  v_has_sensors   boolean;
  v_parent_type   text;
  v_diary_id      uuid := NULL;
  v_safe_details  jsonb;
  v_diary_note    text;
  v_existing      uuid;
  v_stage         text := NULL;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    IF length(p_idempotency_key) < 8 OR length(p_idempotency_key) > 200 THEN
      INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
        VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_idempotency_key');
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_idempotency_key');
    END IF;

    SELECT grow_event_id INTO v_existing
      FROM public.quicklog_idempotency
     WHERE user_id = uid AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, grow_event_id, status)
        VALUES (uid, p_idempotency_key, v_existing, 'duplicate_reused');
      RETURN jsonb_build_object('ok', true, 'grow_event_id', v_existing, 'reused', true);
    END IF;
  END IF;

  IF p_target_type NOT IN ('tent','plant') THEN
    INSERT INTO public.quicklog_audit_events (user_id, status, reason)
      VALUES (uid, 'validation_failed', 'invalid_target_type');
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_target_type');
  END IF;

  IF p_target_id IS NULL THEN
    INSERT INTO public.quicklog_audit_events (user_id, status, reason)
      VALUES (uid, 'validation_failed', 'missing_target_id');
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_target_id');
  END IF;

  IF p_action NOT IN ('water','note') THEN
    INSERT INTO public.quicklog_audit_events (user_id, status, reason)
      VALUES (uid, 'validation_failed', 'unsupported_action');
    RETURN jsonb_build_object('ok', false, 'reason', 'unsupported_action');
  END IF;

  IF p_action = 'water'
     AND (p_volume_ml IS NULL OR p_volume_ml <= 0) THEN
    INSERT INTO public.quicklog_audit_events (user_id, status, reason)
      VALUES (uid, 'validation_failed', 'invalid_volume');
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_volume');
  END IF;

  IF p_details IS NOT NULL AND jsonb_typeof(p_details) <> 'object' THEN
    INSERT INTO public.quicklog_audit_events (user_id, status, reason)
      VALUES (uid, 'validation_failed', 'invalid_details');
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_details');
  END IF;

  IF p_stage IN ('seedling','veg','flower','flush','harvest','drying') THEN
    v_stage := p_stage;
  END IF;

  IF p_target_type = 'plant' THEN
    SELECT p.tent_id, p.grow_id, p.id
      INTO v_tent_id, v_grow_id, v_plant_id
      FROM public.plants p
     WHERE p.id = p_target_id AND p.user_id = uid
      FOR SHARE;
  ELSE
    SELECT t.id, t.grow_id
      INTO v_tent_id, v_grow_id
      FROM public.tents t
     WHERE t.id = p_target_id AND t.user_id = uid
      FOR SHARE;
    v_plant_id := NULL;
  END IF;

  IF v_grow_id IS NULL THEN
    INSERT INTO public.quicklog_audit_events (user_id, status, reason)
      VALUES (uid, 'validation_failed', 'target_not_owned');
    RETURN jsonb_build_object('ok', false, 'reason', 'target_not_owned');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.grows g
     WHERE g.id = v_grow_id AND g.user_id = uid
  ) THEN
    INSERT INTO public.quicklog_audit_events (user_id, status, reason)
      VALUES (uid, 'validation_failed', 'grow_not_owned');
    RETURN jsonb_build_object('ok', false, 'reason', 'grow_not_owned');
  END IF;

  -- A plant can reference two owned rows from different grows under the
  -- historical client RLS policy. Never persist that mixed lineage.
  IF v_plant_id IS NOT NULL AND v_tent_id IS NOT NULL THEN
    SELECT t.grow_id INTO v_tent_grow_id
      FROM public.tents t
     WHERE t.id = v_tent_id AND t.user_id = uid
     FOR SHARE;
    IF NOT FOUND OR v_tent_grow_id IS DISTINCT FROM v_grow_id THEN
      INSERT INTO public.quicklog_audit_events (user_id, status, reason)
        VALUES (uid, 'validation_failed', 'plant_tent_grow_mismatch');
      RETURN jsonb_build_object('ok', false, 'reason', 'plant_tent_grow_mismatch');
    END IF;
  END IF;

  v_has_sensors := (p_temperature_c IS NOT NULL
                    OR p_humidity_pct IS NOT NULL
                    OR p_vpd_kpa IS NOT NULL);

  v_parent_type := CASE
    WHEN p_action = 'water' THEN 'watering'
    ELSE 'observation'
  END;

  INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status)
    VALUES (uid, p_idempotency_key, 'save_started');

  BEGIN
    INSERT INTO public.grow_events
      (user_id, grow_id, tent_id, plant_id, event_type, source, occurred_at, note)
    VALUES
      (uid, v_grow_id, v_tent_id, v_plant_id,
       v_parent_type, 'manual', v_occurred, NULLIF(p_note, ''))
    RETURNING id INTO v_parent_event;

    IF p_action = 'water' THEN
      INSERT INTO public.watering_events (event_id, user_id, volume_ml)
      VALUES (v_parent_event, uid, p_volume_ml);
    END IF;

    IF v_has_sensors THEN
      INSERT INTO public.grow_events
        (user_id, grow_id, tent_id, plant_id, event_type, source, occurred_at, note)
      VALUES
        (uid, v_grow_id, v_tent_id, v_plant_id,
         'environment', 'manual', v_occurred, NULL)
      RETURNING id INTO v_env_parent;

      INSERT INTO public.environment_events
        (event_id, user_id, temperature_c, humidity_pct, vpd_kpa)
      VALUES
        (v_env_parent, uid, p_temperature_c, p_humidity_pct, p_vpd_kpa)
      RETURNING event_id INTO v_env_child;
    END IF;

    -- Always mirror to diary_entries: strip auth-rebind keys from any
    -- caller-supplied details, then tag the mirror with linked_grow_event_id
    -- so mergeTimelineSources dedups it against the grow_events spine row.
    v_safe_details := (
      COALESCE(p_details, '{}'::jsonb)
        - 'user_id'
        - 'grow_id'
        - 'tent_id'
        - 'plant_id'
        - 'auth_uid'
        - 'auth.uid'
    ) || jsonb_build_object('linked_grow_event_id', v_parent_event);
    v_diary_note := COALESCE(NULLIF(p_note, ''), '(quick log)');
    INSERT INTO public.diary_entries
      (user_id, grow_id, tent_id, plant_id, note, details, entry_at, stage)
    VALUES
      (uid, v_grow_id, v_tent_id, v_plant_id,
       v_diary_note, v_safe_details, v_occurred, v_stage)
    RETURNING id INTO v_diary_id;

    IF p_idempotency_key IS NOT NULL THEN
      INSERT INTO public.quicklog_idempotency (user_id, idempotency_key, grow_event_id)
        VALUES (uid, p_idempotency_key, v_parent_event);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.quicklog_audit_events (user_id, status, reason)
      VALUES (uid, 'save_failed', SQLSTATE);
    RETURN jsonb_build_object('ok', false, 'reason', 'save_failed');
  END;

  INSERT INTO public.quicklog_audit_events (user_id, grow_event_id, status)
    VALUES (uid, v_parent_event, 'save_succeeded');

  RETURN jsonb_build_object(
    'ok', true,
    'grow_event_id', v_parent_event,
    'environment_event_id', v_env_child,
    'diary_entry_id', v_diary_id,
    'reused', false
  );
END;
$function$;

DO $postflight$
DECLARE
  v_delegate oid := pg_catalog.to_regprocedure('public.quicklog_save_manual_pre_logged_at(text, uuid, text, numeric, text, numeric, numeric, numeric, timestamp with time zone, jsonb, text, text)');
BEGIN
  IF v_delegate IS NULL OR pg_catalog.has_function_privilege('anon', v_delegate, 'EXECUTE')
    OR pg_catalog.has_function_privilege('authenticated', v_delegate, 'EXECUTE')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid = v_delegate
      AND p.prosecdef AND p.prosrc LIKE '%plant_tent_grow_mismatch%') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'quicklog_manual_lineage_postflight_failed';
  END IF;
END;
$postflight$;

COMMIT;
NOTIFY pgrst, 'reload schema';
