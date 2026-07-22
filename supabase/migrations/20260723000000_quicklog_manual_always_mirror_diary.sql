-- quicklog_save_manual: always mirror manual saves to diary_entries.
--
-- Closes the last gap in the Quick Log → plant-page read path. The plant-scoped
-- surfaces (PlantQuickStatusStrip + Recent Activity via usePlantRecentActivity)
-- read diary_entries, but the mirror was still conditional:
--   20260611...: mirrored only when p_details was non-null.
--   20260722100000 / 20260722165149: widened to (p_details OR v_stage) — so a
--   detail-less note for a plant whose stage never resolves (unknown-stage
--   plant AND unknown-stage grow → v_stage NULL) STILL skipped the mirror and
--   the plant page said "No updates yet" after a successful save.
-- This migration makes the diary companion row unconditional: every successful
-- save leaves a mirror.
--
-- It also RESTORES the linked_grow_event_id tag on the mirror's details. The
-- 20260611 definition carried it; the two 20260722 stage migrations dropped it,
-- so mirrors written since then cannot be logically deduped against their
-- grow_events twin by mergeTimelineSources (pickLogicalGrowEventLink reads
-- linked_grow_event_id / grow_event_id) and double-show on the merged
-- timeline. Tagging fixes new rows; rows written in the untagged window keep
-- the pre-existing duplication (bounded, display-only).
--
-- Everything else is byte-identical to 20260722165149: same 12-arg signature,
-- same validation/rejection order, same optional idempotency, same auth-rebind
-- key stripping, same grants. Follows the lineage convention of dropping the
-- exact immediately-prior signature before re-creating (here the signature is
-- unchanged, so the drop names the same 12-arg form — no overload pair can
-- ever exist).

BEGIN;

DROP FUNCTION IF EXISTS public.quicklog_save_manual(
  text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb, text, text
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

REVOKE ALL ON FUNCTION public.quicklog_save_manual(
  text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quicklog_save_manual(
  text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb, text, text
) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
