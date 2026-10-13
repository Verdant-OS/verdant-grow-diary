-- Additive columns for manual sensor observations.
-- PLAN ONLY. Do not apply. Held for Matthew.
-- Approved by Matthew (Cheeko) 2026-10-09T19:42:00-05:00.
-- Does not replace validate_sensor_reading(). Does not change RLS.
-- Does not GRANT or REVOKE. CREATE OR REPLACE VIEW keeps existing privileges.
-- Notes are optional free text. CSV writers omit the column and store NULL.
-- unit_unconfirmed defaults to false. The app sets true only after the grower confirms.

ALTER TABLE public.sensor_readings
  ADD COLUMN notes text,
  ADD COLUMN unit_unconfirmed boolean NOT NULL DEFAULT false;

ALTER TABLE public.sensor_readings
  ADD CONSTRAINT sensor_readings_notes_shape_chk
  CHECK (
    notes IS NULL
    OR (
      char_length(notes) BETWEEN 1 AND 500
      AND notes = btrim(notes)
    )
  );

ALTER TABLE public.sensor_readings
  ADD CONSTRAINT sensor_readings_unit_unconfirmed_metric_chk
  CHECK (
    unit_unconfirmed = false
    OR metric IN ('temperature_c', 'soil_temp_c')
  );

COMMENT ON COLUMN public.sensor_readings.notes IS
  'Optional grower observation for a manual reading. NULL means absent. CSV inserts omit this column. Distinct from device_id manual:<label>. Not part of raw_payload.';

COMMENT ON COLUMN public.sensor_readings.unit_unconfirmed IS
  'Grower attestation that the stored numeric value may be in the wrong display unit. false is the default for every existing row and every insert that omits the column. true is allowed only on temperature_c and soil_temp_c. Does not change quality and does not reinterpret value.';

CREATE OR REPLACE VIEW public.sensor_readings_effective WITH (security_invoker = true) AS
SELECT r.id, r.user_id, r.tent_id, r.ts, r.captured_at, r.metric,
       CASE WHEN l.valid AND (c.id IS NULL OR c.legacy_evidence->r.id::text = l.evidence)
         THEN COALESCE(c.value, l.value) ELSE NULL::numeric END AS value, r.source, r.quality, r.created_at,
       r.device_id, r.raw_payload,
       c.changed_at AS corrected_at, c.id AS correction_operation_id,
       l.valid AND (c.id IS NULL OR c.legacy_evidence->r.id::text = l.evidence) AS correction_valid,
       l.evidence AS legacy_evidence,
       r.notes, r.unit_unconfirmed
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
