-- QuickLog manual save: always mirror to diary_entries
--
-- Bug: public.quicklog_save_manual only wrote the diary_entries mirror when
-- p_details was non-null. Plain notes / plain waterings (the common path) wrote
-- ONLY grow_events. But the plant-scoped read surfaces — PlantQuickStatusStrip
-- and the Recent Activity panel (src/hooks/usePlantRecentActivity.ts) — read
-- diary_entries. So a grower who logged a simple note saw the success toast and
-- the grow Timeline update, but the plant's own page still said "No updates
-- yet". grow_events is NOT a superset of diary_entries (tent moves, photos,
-- action follow-ups, and the legacy PlantQuickLog surface all write only
-- diary_entries), so the fix is to keep diary_entries the complete activity
-- log rather than repoint every reader.
--
-- Change (single behavioral edit; everything else is byte-identical to the
-- 20260611 definition):
--   * The diary_entries INSERT now runs unconditionally, so EVERY successful
--     save (note or water, with or without details/sensors) leaves a diary row.
--   * The mirror's details jsonb is tagged with grow_event_id = the spine
--     grow_events id. src/lib/timelineMergeRules.ts (mergeTimelineSources)
--     logically dedups a diary row against its grow_events twin via
--     details.grow_event_id, so the merged Grow Timeline still shows each save
--     ONCE. This also closes a latent double-show for today's detailed entries,
--     whose mirror rows previously carried no grow_event_id.
--
-- Signature is unchanged, so CREATE OR REPLACE is safe. The auth-rebind key
-- stripping (user_id/grow_id/tent_id/plant_id/auth_uid/auth.uid) is preserved
-- exactly. Verify with scripts/run-quicklog-save-manual-rls-harness.ts.

BEGIN;

CREATE OR REPLACE FUNCTION public.quicklog_save_manual(
  p_target_type text,
  p_target_id uuid,
  p_action text,
  p_volume_ml numeric DEFAULT NULL::numeric,
  p_note text DEFAULT NULL::text,
  p_temperature_c numeric DEFAULT NULL::numeric,
  p_humidity_pct numeric DEFAULT NULL::numeric,
  p_vpd_kpa numeric DEFAULT NULL::numeric,
  p_occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_details jsonb DEFAULT NULL::jsonb
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
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
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

  INSERT INTO public.quicklog_audit_events (user_id, status)
    VALUES (uid, 'save_started');

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

    -- Always mirror to diary_entries. Strip auth-rebind keys from any
    -- caller-supplied details (unchanged), then tag the mirror with
    -- grow_event_id so mergeTimelineSources dedups it against the spine
    -- grow_events row on the merged Grow Timeline.
    v_safe_details := COALESCE(
      (
        p_details
          - 'user_id'
          - 'grow_id'
          - 'tent_id'
          - 'plant_id'
          - 'auth_uid'
          - 'auth.uid'
      ),
      '{}'::jsonb
    ) || jsonb_build_object('grow_event_id', v_parent_event);
    v_diary_note := COALESCE(NULLIF(p_note, ''), '(quick log)');
    INSERT INTO public.diary_entries
      (user_id, grow_id, tent_id, plant_id, note, details, entry_at)
    VALUES
      (uid, v_grow_id, v_tent_id, v_plant_id,
       v_diary_note, v_safe_details, v_occurred)
    RETURNING id INTO v_diary_id;
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
    'diary_entry_id', v_diary_id
  );
END;
$function$;

-- Re-assert the minimal execute surface (CREATE OR REPLACE preserves grants,
-- but re-issuing keeps the security contract explicit and pinned).
REVOKE ALL ON FUNCTION public.quicklog_save_manual(
  text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quicklog_save_manual(
  text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb
) TO authenticated;

COMMIT;

-- Refresh PostgREST schema cache so the updated function resolves cleanly.
NOTIFY pgrst, 'reload schema';
