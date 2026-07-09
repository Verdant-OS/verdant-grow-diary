-- quicklog_save_manual: add server-side idempotency (mirrors quicklog_save_event).
--
-- Root cause being fixed: the manual Quick Log save path did an unconditional
-- INSERT INTO grow_events with no quicklog_idempotency guard. When a
-- post-save companion write (photo/video diary row) failed, the sheet showed
-- an error and the grower's natural Retry re-entered the whole save —
-- duplicating the diary/log entry. The sibling quicklog_save_event has been
-- idempotent since 20260610234642; this brings the manual path to parity.
--
-- Rollout safety: p_idempotency_key is appended with DEFAULT NULL. A NULL key
-- preserves the legacy (non-idempotent) behavior so already-deployed client
-- bundles keep saving during rollout; the updated client always sends a key.
-- When a key is provided it must be 8..200 chars (same rule as
-- quicklog_save_event) and a repeat call returns the original grow_event_id
-- with reused=true instead of writing again.

BEGIN;

-- Drop old signature exactly (avoids a PGRST203-ambiguous overload pair).
DROP FUNCTION IF EXISTS public.quicklog_save_manual(
  text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb
);

CREATE FUNCTION public.quicklog_save_manual(
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
  p_idempotency_key text DEFAULT NULL::text
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
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  -- Idempotency guard (key optional for legacy-bundle rollout safety).
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

  IF p_target_type = 'plant' THEN
    SELECT p.tent_id, p.grow_id, p.id
      INTO v_tent_id, v_grow_id, v_plant_id
      FROM public.plants p
     WHERE p.id = p_target_id AND p.user_id = uid;
  ELSE
    SELECT t.id, t.grow_id
      INTO v_tent_id, v_grow_id
      FROM public.tents t
     WHERE t.id = p_target_id AND t.user_id = uid;
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

    IF p_details IS NOT NULL THEN
      v_safe_details := (
        p_details
          - 'user_id'
          - 'grow_id'
          - 'tent_id'
          - 'plant_id'
          - 'auth_uid'
          - 'auth.uid'
      );
      v_diary_note := COALESCE(NULLIF(p_note, ''), '(quick log)');
      INSERT INTO public.diary_entries
        (user_id, grow_id, tent_id, plant_id, note, details, entry_at)
      VALUES
        (uid, v_grow_id, v_tent_id, v_plant_id,
         v_diary_note, v_safe_details, v_occurred)
      RETURNING id INTO v_diary_id;
    END IF;

    -- Record idempotency atomically with the save so a retry of the same
    -- logical submission reuses this grow_event instead of writing again.
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

-- Grants: authenticated-only, mirroring the prior posture.
REVOKE ALL ON FUNCTION public.quicklog_save_manual(
  text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quicklog_save_manual(
  text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb, text
) TO authenticated;

COMMIT;

-- Refresh PostgREST schema cache so the new signature resolves cleanly.
NOTIFY pgrst, 'reload schema';
