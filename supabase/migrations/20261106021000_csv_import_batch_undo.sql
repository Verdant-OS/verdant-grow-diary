-- Additive migration: tent-owner rollback for a single CSV import batch.
-- Keeps sensor_readings RLS as SELECT/INSERT-only for direct clients.
-- Undo is available only through this guarded SECURITY DEFINER RPC.

CREATE OR REPLACE FUNCTION public.undo_csv_sensor_import_batch(
  p_tent_id uuid,
  p_import_batch_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_batch_id text := nullif(btrim(COALESCE(p_import_batch_id, '')), '');
  v_deleted_count bigint := 0;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF p_tent_id IS NULL OR v_batch_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tents t
    WHERE t.id = p_tent_id
      AND t.user_id = uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'tent_not_owned');
  END IF;

  DELETE FROM public.sensor_readings r
  WHERE r.user_id = uid
    AND r.tent_id = p_tent_id
    AND r.source = 'csv'
    AND COALESCE(r.raw_payload ->> 'csv_import', '') = 'true'
    AND r.raw_payload ->> 'import_batch_id' = v_batch_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok',
    true,
    'deleted_count',
    v_deleted_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.undo_csv_sensor_import_batch(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_csv_sensor_import_batch(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_csv_sensor_import_batch(uuid, text) TO service_role;

COMMENT ON FUNCTION public.undo_csv_sensor_import_batch(uuid, text) IS
  'Deletes one owned CSV import batch (raw_payload.csv_import=true and matching import_batch_id) for the selected tent. No direct DELETE policy is granted on sensor_readings.';
