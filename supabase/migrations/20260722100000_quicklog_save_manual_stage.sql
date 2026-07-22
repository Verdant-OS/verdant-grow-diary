-- quicklog_save_manual: persist the Quick Log stage tag (app-audit fix #2).
--
-- Root cause being fixed: the stage resolved in the Quick Log dialog
-- (resolveQuickLogStageDefault) was dropped before persistence — the RPC had
-- no stage parameter, so the stage-progression widget honestly reported
-- "0 stage-tagged logs" no matter how many entries existed.
--
-- Behavior:
--  - New optional p_stage (DEFAULT NULL): soft-validated against the
--    canonical Quick Log stage vocabulary; anything else becomes NULL.
--    A bad stage NEVER blocks a save.
--  - A non-null stage now also earns the diary_entries companion row (the
--    same gate that p_details already had) — otherwise a bare stage-tagged
--    note would still vanish into the grow_events spine, which carries no
--    stage column. diary_entries.stage has existed since 20260515173341.
--  - Rollout safety mirrors 20260709160000: the old signature is dropped
--    exactly (no ambiguous overload pair) and every prior parameter keeps
--    its default, so already-deployed bundles that omit p_stage keep saving.

BEGIN;

DROP FUNCTION IF EXISTS public.quicklog_save_manual(
  text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb, text
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

  -- Stage tag: soft-validated against the canonical Quick Log vocabulary
  -- (src/lib/grow.ts STAGES). Unknown/blank values become NULL — a bad
  -- stage never blocks a save and is never coerced to a different stage.
  IF p_stage IN ('seedling','veg','flower','flush','harvest','drying') THEN
    v_stage := p_stage;
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

    -- Companion diary row: structured details OR a stage tag earn one (the
    -- grow_events spine has no stage column, so a stage-only save would
    -- otherwise lose its tag).
    IF p_details IS NOT NULL OR v_stage IS NOT NULL THEN
      v_safe_details := (
        COALESCE(p_details, '{}'::jsonb)
          - 'user_id'
          - 'grow_id'
          - 'tent_id'
          - 'plant_id'
          - 'auth_uid'
          - 'auth.uid'
      );
      v_diary_note := COALESCE(NULLIF(p_note, ''), '(quick log)');
      INSERT INTO public.diary_entries
        (user_id, grow_id, tent_id, plant_id, note, details, entry_at, stage)
      VALUES
        (uid, v_grow_id, v_tent_id, v_plant_id,
         v_diary_note, v_safe_details, v_occurred, v_stage)
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
  text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quicklog_save_manual(
  text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb, text, text
) TO authenticated;

COMMIT;

-- Refresh PostgREST schema cache so the new signature resolves cleanly.
NOTIFY pgrst, 'reload schema';
