-- Additive, append-only correction operations. Original readings and the existing
-- five-column dedupe index remain unchanged. Every insert, including direct
-- authenticated table INSERT, passes the invoker trigger and existing reading RLS.
BEGIN;

CREATE TABLE public.manual_sensor_correction_operations (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  tent_id uuid NOT NULL REFERENCES public.tents(id) ON DELETE CASCADE,
  anchor_reading_id uuid NOT NULL REFERENCES public.sensor_readings(id) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL,
  changed_at timestamptz NOT NULL,
  revision bigserial NOT NULL UNIQUE,
  request jsonb NOT NULL,
  resolved_changes jsonb NOT NULL,
  legacy_evidence jsonb NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX manual_sensor_correction_observation_idx
  ON public.manual_sensor_correction_operations (user_id, tent_id, observed_at, revision DESC);
ALTER TABLE public.manual_sensor_correction_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY manual_sensor_correction_read_own
  ON public.manual_sensor_correction_operations FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.sensor_readings r
    WHERE r.id = anchor_reading_id AND r.user_id = (SELECT auth.uid())
  ));
CREATE POLICY manual_sensor_correction_insert_own
  ON public.manual_sensor_correction_operations FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.manual_sensor_correction_operations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.manual_sensor_correction_operations TO authenticated;
GRANT ALL ON public.manual_sensor_correction_operations TO service_role;
GRANT USAGE ON SEQUENCE public.manual_sensor_correction_operations_revision_seq TO authenticated, service_role;

-- Resolve only complete, linear legacy chains against caller-visible raw facts.
-- No edit timestamp is trusted to choose between conflicting branches.
CREATE FUNCTION public.resolve_legacy_manual_sensor_reading(p_id uuid)
RETURNS TABLE(root_id uuid, value numeric, valid boolean, evidence jsonb)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public AS $function$
DECLARE v_raw public.sensor_readings%ROWTYPE;
BEGIN
  SELECT r.* INTO v_raw FROM public.sensor_readings r WHERE r.id = p_id AND r.user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN QUERY SELECT p_id, NULL::numeric, false, '[]'::jsonb;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.manual_sensor_snapshot_edits e
    WHERE e.user_id = auth.uid() AND (e.original_reading_id = p_id OR e.replacement_reading_id = p_id)) THEN
    RETURN QUERY SELECT p_id, v_raw.value, true, '[]'::jsonb;
    RETURN;
  END IF;
  RETURN QUERY
  WITH RECURSIVE
  owned_links AS NOT MATERIALIZED (
    SELECT e.id, e.original_reading_id, e.replacement_reading_id, e.user_id, e.tent_id,
      e.source_before, e.source_after, e.old_values, e.new_values, e.changed_fields
    FROM public.manual_sensor_snapshot_edits e WHERE e.user_id = auth.uid()
  ),
  related(id) AS (
    SELECT p_id
    UNION
    SELECT CASE WHEN e.original_reading_id = x.id THEN e.replacement_reading_id ELSE e.original_reading_id END
    FROM related x JOIN owned_links e ON e.original_reading_id = x.id OR e.replacement_reading_id = x.id
    WHERE CASE WHEN e.original_reading_id = x.id THEN e.replacement_reading_id ELSE e.original_reading_id END IS NOT NULL
  ),
  readings AS (
    SELECT r.* FROM public.sensor_readings r JOIN related x ON r.id = x.id WHERE r.user_id = auth.uid()
  ),
  links AS (
    SELECT e.* FROM owned_links e WHERE e.original_reading_id IN (SELECT x.id FROM related x)
      OR e.replacement_reading_id IN (SELECT x.id FROM related x)
  ),
  roots AS (SELECT r.id FROM readings r WHERE NOT EXISTS (SELECT 1 FROM links e WHERE e.replacement_reading_id = r.id)),
  leaves AS (SELECT r.id, r.value FROM readings r WHERE NOT EXISTS (SELECT 1 FROM links e WHERE e.original_reading_id = r.id)),
  checked AS (
    SELECT (SELECT count(*) FROM related) = (SELECT count(*) FROM readings)
      AND (SELECT count(*) FROM related) <= 4096
      AND (SELECT count(*) FROM links) = (SELECT count(*) - 1 FROM related)
      AND (SELECT count(*) FROM roots) = 1 AND (SELECT count(*) FROM leaves) = 1
      AND NOT EXISTS (SELECT 1 FROM links GROUP BY original_reading_id HAVING count(*) > 1)
      AND NOT EXISTS (SELECT 1 FROM links GROUP BY replacement_reading_id HAVING count(*) > 1)
      AND NOT EXISTS (
        SELECT 1 FROM links e
        LEFT JOIN readings a ON a.id = e.original_reading_id
        LEFT JOIN readings b ON b.id = e.replacement_reading_id
        WHERE a.id IS NULL OR b.id IS NULL OR e.tent_id IS DISTINCT FROM a.tent_id
          OR b.tent_id IS DISTINCT FROM a.tent_id OR b.metric IS DISTINCT FROM a.metric
          OR a.source IS DISTINCT FROM 'manual' OR b.source IS DISTINCT FROM 'manual'
          OR e.source_before IS DISTINCT FROM 'manual' OR e.source_after IS DISTINCT FROM 'manual'
          OR e.changed_fields IS DISTINCT FROM ARRAY[a.metric]
          OR e.old_values IS DISTINCT FROM jsonb_build_object(a.metric, a.value)
          OR e.new_values IS DISTINCT FROM jsonb_build_object(a.metric, b.value)
      ) AS ok
  )
  SELECT CASE WHEN c.ok THEN (SELECT r.id FROM roots r) ELSE p_id END,
    CASE WHEN c.ok THEN (SELECT l.value FROM leaves l) ELSE NULL::numeric END, c.ok,
    COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM links e), '[]'::jsonb)
  FROM checked c;
END;
$function$;
REVOKE ALL ON FUNCTION public.resolve_legacy_manual_sensor_reading(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_legacy_manual_sensor_reading(uuid) TO authenticated, service_role;

-- RLS runs as the calling user. Verified replacements collapse to their root;
-- original ID, source, provenance, observation time, quality and creation time
-- remain the root's raw facts. Invalid or subsequently changed lineage yields a
-- NULL value with correction_valid=false; consumers must report unavailable.
CREATE VIEW public.sensor_readings_effective WITH (security_invoker = true) AS
SELECT r.id, r.user_id, r.tent_id, r.ts, r.captured_at, r.metric,
       CASE WHEN l.valid AND (c.id IS NULL OR c.legacy_evidence->r.id::text = l.evidence)
         THEN COALESCE(c.value, l.value) ELSE NULL::numeric END AS value, r.source, r.quality, r.created_at,
       r.device_id, r.raw_payload,
       c.changed_at AS corrected_at, c.id AS correction_operation_id,
       l.valid AND (c.id IS NULL OR c.legacy_evidence->r.id::text = l.evidence) AS correction_valid,
       l.evidence AS legacy_evidence
FROM public.sensor_readings r
CROSS JOIN LATERAL public.resolve_legacy_manual_sensor_reading(r.id) l
LEFT JOIN LATERAL (
  SELECT (v.change->>'value')::numeric AS value, o.changed_at, o.id, o.legacy_evidence
  FROM public.manual_sensor_correction_operations o
  CROSS JOIN LATERAL jsonb_array_elements(o.resolved_changes) AS v(change)
  WHERE o.user_id = r.user_id AND o.tent_id = r.tent_id
    AND o.observed_at = COALESCE(r.captured_at, r.ts)
    AND (v.change->>'readingId')::uuid = r.id
    AND r.source = 'manual'
  ORDER BY o.revision DESC LIMIT 1
) c ON true
WHERE NOT l.valid OR l.root_id = r.id;
REVOKE ALL ON public.sensor_readings_effective FROM PUBLIC, anon;
GRANT SELECT ON public.sensor_readings_effective TO authenticated, service_role;

CREATE FUNCTION public.validate_manual_sensor_correction_operation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_original jsonb;
  v_change jsonb;
  v_row record;
  v_id uuid;
  v_metric text;
  v_value numeric;
  v_expected numeric;
  v_seen_metrics text[] := '{}';
  v_seen_ids uuid[] := '{}';
  v_changed_metrics text[] := '{}';
  v_allowed text[] := ARRAY['temperature_c','humidity_pct','vpd_kpa','co2_ppm','soil_moisture_pct','ppfd'];
  v_resolved jsonb := '[]'::jsonb;
  v_added boolean;
BEGIN
  NEW.legacy_evidence := '{}'::jsonb;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'correction_owner_unavailable' USING ERRCODE = '42501'; END IF;
  -- Fresh post-lock reads are essential. Snapshot isolation could retain an older
  -- correction despite waiting for the previous writer. PostgREST's normal
  -- read-committed lane is supported; other isolation levels fail closed.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'correction_requires_read_committed' USING ERRCODE = '25001';
  END IF;
  IF jsonb_typeof(NEW.request) IS DISTINCT FROM 'object'
     OR NEW.request->'version' IS DISTINCT FROM '1'::jsonb
     OR NEW.request->>'source' IS DISTINCT FROM 'manual'
     OR jsonb_typeof(NEW.request->'originals') IS DISTINCT FROM 'array'
     OR jsonb_typeof(NEW.request->'changes') IS DISTINCT FROM 'array'
     OR (SELECT count(*) FROM jsonb_object_keys(NEW.request)) <> 7 THEN
    RAISE EXCEPTION 'invalid_correction_request' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(NEW.request->'originals') NOT BETWEEN 1 AND 6
     OR jsonb_array_length(NEW.request->'changes') NOT BETWEEN 1 AND 6
     OR COALESCE(NEW.request->>'observedAt', '') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' THEN
    RAISE EXCEPTION 'invalid_correction_request' USING ERRCODE = '22023';
  END IF;
  NEW.user_id := v_uid;
  NEW.id := (NEW.request->>'operationId')::uuid;
  NEW.tent_id := (NEW.request->>'tentId')::uuid;
  NEW.observed_at := (NEW.request->>'observedAt')::timestamptz;
  IF NEW.id IS NULL OR NEW.tent_id IS NULL THEN
    RAISE EXCEPTION 'invalid_correction_identity' USING ERRCODE = '22023';
  END IF;
  -- Same lock order for direct INSERT and RPC. Operation lock protects replay;
  -- observation lock prevents two separately named intents overwriting each other.
  PERFORM pg_advisory_xact_lock(hashtextextended('manual-correction-operation:' || v_uid || ':' || NEW.id, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('manual-correction-observation:' || v_uid || ':' ||
    NEW.tent_id || ':' || extract(epoch FROM NEW.observed_at)::text, 0));
  IF NOT EXISTS (SELECT 1 FROM public.tents WHERE id = NEW.tent_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'correction_tent_unavailable' USING ERRCODE = '42501';
  END IF;

  FOR v_original IN SELECT value FROM jsonb_array_elements(NEW.request->'originals') LOOP
    v_metric := v_original->>'metric';
    v_id := (v_original->>'readingId')::uuid;
    IF v_id IS NULL OR v_metric IS NULL OR NOT (v_metric = ANY(v_allowed))
       OR v_id = ANY(v_seen_ids) OR v_metric = ANY(v_seen_metrics)
       OR jsonb_typeof(v_original->'value') IS DISTINCT FROM 'number'
       OR (SELECT count(*) FROM jsonb_object_keys(v_original)) <> 3 THEN
      RAISE EXCEPTION 'invalid_correction_originals' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_row FROM public.sensor_readings_effective
      WHERE id = v_id AND user_id = v_uid AND tent_id = NEW.tent_id
        AND source = 'manual' AND metric = v_metric
        AND COALESCE(captured_at, ts) = NEW.observed_at;
    IF NOT FOUND OR v_row.correction_valid IS DISTINCT FROM true OR v_row.value IS NULL THEN
      RAISE EXCEPTION 'correction_original_unavailable' USING ERRCODE = '42501';
    END IF;
    IF abs(v_row.value - (v_original->>'value')::numeric) >= 0.000000001 THEN
      RAISE EXCEPTION 'correction_original_conflict' USING ERRCODE = '40001';
    END IF;
    v_seen_ids := array_append(v_seen_ids, v_id);
    NEW.legacy_evidence := NEW.legacy_evidence || jsonb_build_object(v_id::text, v_row.legacy_evidence);
    v_seen_metrics := array_append(v_seen_metrics, v_metric);
  END LOOP;
  NEW.anchor_reading_id := v_seen_ids[1];

  FOR v_change IN SELECT value FROM jsonb_array_elements(NEW.request->'changes') LOOP
    v_metric := v_change->>'metric';
    IF v_metric IS NULL OR NOT (v_metric = ANY(v_allowed)) OR v_metric = ANY(v_changed_metrics)
       OR jsonb_typeof(v_change->'value') IS DISTINCT FROM 'number'
       OR (SELECT count(*) FROM jsonb_object_keys(v_change)) <> 4 THEN
      RAISE EXCEPTION 'invalid_correction_value' USING ERRCODE = '22023';
    END IF;
    v_value := (v_change->>'value')::numeric;
    IF (v_metric = 'temperature_c' AND v_value NOT BETWEEN -10 AND 50)
       OR (v_metric IN ('humidity_pct','soil_moisture_pct') AND v_value NOT BETWEEN 0 AND 100)
       OR (v_metric = 'vpd_kpa' AND v_value NOT BETWEEN 0.2 AND 2.5)
       OR (v_metric = 'co2_ppm' AND v_value < 0)
       OR (v_metric = 'ppfd' AND v_value NOT BETWEEN 0 AND 2500) THEN
      RAISE EXCEPTION 'invalid_correction_value' USING ERRCODE = '22023';
    END IF;
    v_added := v_change->'originalReadingId' = 'null'::jsonb;
    IF v_added THEN
      IF v_change->'expectedValue' IS DISTINCT FROM 'null'::jsonb
         OR v_metric = ANY(v_seen_metrics)
         OR EXISTS (SELECT 1 FROM public.sensor_readings
           WHERE user_id = v_uid AND tent_id = NEW.tent_id AND source = 'manual'
             AND metric = v_metric AND COALESCE(captured_at, ts) = NEW.observed_at) THEN
        RAISE EXCEPTION 'correction_original_conflict' USING ERRCODE = '40001';
      END IF;
      v_expected := NULL;
      INSERT INTO public.sensor_readings (user_id, tent_id, metric, value, source, quality,
        captured_at, ts, raw_payload)
      VALUES (v_uid, NEW.tent_id, v_metric, v_value, 'manual', 'ok', NEW.observed_at, NEW.observed_at,
        '{"manual_provenance":{"source":"manual","source_identity":"manual_entry","transport":"manual","confidence":null}}'::jsonb)
      RETURNING id INTO v_id;
      NEW.legacy_evidence := NEW.legacy_evidence || jsonb_build_object(v_id::text, '[]'::jsonb);
    ELSE
      v_id := (v_change->>'originalReadingId')::uuid;
      IF v_id IS NULL OR jsonb_typeof(v_change->'expectedValue') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'invalid_correction_originals' USING ERRCODE = '22023';
      END IF;
      v_expected := (v_change->>'expectedValue')::numeric;
      IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.request->'originals') a
        WHERE (a->>'readingId')::uuid = v_id AND a->>'metric' = v_metric
          AND abs((a->>'value')::numeric - v_expected) < 0.000000001)
        OR abs(v_value - v_expected) < 0.000000001 THEN
        RAISE EXCEPTION 'correction_original_conflict' USING ERRCODE = '40001';
      END IF;
    END IF;
    v_changed_metrics := array_append(v_changed_metrics, v_metric);
    v_resolved := v_resolved || jsonb_build_array(jsonb_build_object(
      'metric', v_metric, 'readingId', v_id, 'previousValue', v_expected, 'value', v_value, 'added', v_added));
  END LOOP;
  -- Assign ordering after acquiring the observation lock, never at transaction start.
  NEW.revision := nextval('public.manual_sensor_correction_operations_revision_seq'::regclass);
  NEW.changed_at := clock_timestamp();
  NEW.resolved_changes := v_resolved;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.validate_manual_sensor_correction_operation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER manual_sensor_correction_validate
  BEFORE INSERT ON public.manual_sensor_correction_operations
  FOR EACH ROW EXECUTE FUNCTION public.validate_manual_sensor_correction_operation();

CREATE FUNCTION public.save_manual_sensor_correction(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid := (p_request->>'operationId')::uuid;
  v_row public.manual_sensor_correction_operations%ROWTYPE;
  v_reused boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'correction_owner_unavailable' USING ERRCODE = '42501'; END IF;
  IF v_id IS NULL THEN RAISE EXCEPTION 'invalid_correction_identity' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('manual-correction-operation:' || v_uid || ':' || v_id, 0));
  SELECT * INTO v_row FROM public.manual_sensor_correction_operations WHERE user_id = v_uid AND id = v_id;
  IF FOUND THEN
    IF v_row.request IS DISTINCT FROM p_request THEN
      RAISE EXCEPTION 'operation_payload_mismatch' USING ERRCODE = '22023';
    END IF;
    v_reused := true;
  ELSE
    INSERT INTO public.manual_sensor_correction_operations (request)
      VALUES (p_request) RETURNING * INTO v_row;
  END IF;
  RETURN jsonb_build_object(
    'operationId', v_row.id, 'observedAt', v_row.request->>'observedAt',
    'changedAt', v_row.changed_at, 'revision', v_row.revision,
    'changes', v_row.resolved_changes, 'reused', v_reused, 'request', v_row.request);
END;
$function$;
REVOKE ALL ON FUNCTION public.save_manual_sensor_correction(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_manual_sensor_correction(jsonb) TO authenticated;

COMMENT ON TABLE public.manual_sensor_correction_operations IS
  'Validated append-only correction intent and receipt. Original observations remain unchanged; observation time never becomes edit time.';
COMMENT ON VIEW public.sensor_readings_effective IS
  'Caller-RLS-preserving effective values for validated corrections. Raw history and raw write-recovery reads remain separate.';

-- One statement snapshot for the entire caller-visible correction graph. A
-- bounded raw window alone cannot prove that a recent row is not a replacement.
-- UNION (not UNION ALL) terminates cycles; the consumer rejects ambiguous graphs.
CREATE FUNCTION public.read_manual_sensor_correction_evidence(p_reading_ids uuid[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public AS $function$
  WITH RECURSIVE
  input AS (
    SELECT DISTINCT unnest(p_reading_ids) AS id
    WHERE auth.uid() IS NOT NULL AND cardinality(p_reading_ids) BETWEEN 0 AND 2000
  ),
  owned_links AS (
    SELECT original_reading_id, replacement_reading_id, user_id, tent_id,
      source_before, source_after, old_values, new_values, changed_fields
    FROM public.manual_sensor_snapshot_edits WHERE user_id = auth.uid()
  ),
  related(id) AS (
    SELECT id FROM input
    UNION
    SELECT CASE WHEN e.original_reading_id = r.id THEN e.replacement_reading_id
                ELSE e.original_reading_id END
    FROM related r JOIN owned_links e
      ON e.original_reading_id = r.id OR e.replacement_reading_id = r.id
    WHERE CASE WHEN e.original_reading_id = r.id THEN e.replacement_reading_id
               ELSE e.original_reading_id END IS NOT NULL
  ),
  readings AS (
    SELECT r.* FROM public.sensor_readings r JOIN related x ON x.id = r.id
    WHERE r.user_id = auth.uid()
  ),
  links AS (
    SELECT e.* FROM owned_links e
    WHERE e.original_reading_id IN (SELECT id FROM related)
       OR e.replacement_reading_id IN (SELECT id FROM related)
  ),
  valid AS (
    SELECT auth.uid() IS NOT NULL
      AND COALESCE(cardinality(p_reading_ids) BETWEEN 0 AND 2000, false)
      AND NOT EXISTS (SELECT 1 FROM input WHERE id IS NULL)
      AND (SELECT count(*) FROM related) <= 4096
      AND (SELECT count(*) FROM links) <= 4096
      AND NOT EXISTS (SELECT 1 FROM related x WHERE NOT EXISTS
        (SELECT 1 FROM readings r WHERE r.id = x.id)) AS complete
  )
  SELECT jsonb_build_object(
    'complete', complete,
    'readings', CASE WHEN complete THEN
      COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM readings r), '[]'::jsonb)
      ELSE '[]'::jsonb END,
    'links', CASE WHEN complete THEN
      COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.original_reading_id, e.replacement_reading_id) FROM links e), '[]'::jsonb)
      ELSE '[]'::jsonb END,
    'effective', CASE WHEN complete THEN
      COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)
        FROM public.sensor_readings_effective r JOIN related x ON x.id = r.id
        WHERE r.user_id = auth.uid()), '[]'::jsonb)
      ELSE '[]'::jsonb END
  ) FROM valid;
$function$;
REVOKE ALL ON FUNCTION public.read_manual_sensor_correction_evidence(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.read_manual_sensor_correction_evidence(uuid[]) TO authenticated;
COMMIT;
