-- Manual Sensor Snapshot edit history (append-only correction linkage).
-- Safety: append-only (SELECT+INSERT only), owner-scoped RLS, source pinned
-- to 'manual' on both sides by CHECK, no anon/PUBLIC grants, FK guards
-- prevent cross-user references. Original sensor_readings row is NEVER
-- mutated (sensor_readings RLS already forbids UPDATE/DELETE).

CREATE TABLE public.manual_sensor_snapshot_edits (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL DEFAULT auth.uid(),
  original_reading_id      uuid NOT NULL REFERENCES public.sensor_readings(id) ON DELETE CASCADE,
  replacement_reading_id   uuid NULL     REFERENCES public.sensor_readings(id) ON DELETE SET NULL,
  tent_id                  uuid NOT NULL REFERENCES public.tents(id) ON DELETE CASCADE,
  plant_id                 uuid NULL     REFERENCES public.plants(id) ON DELETE SET NULL,
  changed_at               timestamptz NOT NULL DEFAULT now(),
  change_reason            text NULL,
  old_values               jsonb NOT NULL,
  new_values               jsonb NOT NULL,
  changed_fields           text[] NOT NULL,
  source_before            text NOT NULL CHECK (source_before = 'manual'),
  source_after             text NOT NULL CHECK (source_after  = 'manual'),
  CONSTRAINT manual_sensor_snapshot_edits_changed_fields_nonempty
    CHECK (array_length(changed_fields, 1) >= 1),
  CONSTRAINT manual_sensor_snapshot_edits_reason_length
    CHECK (change_reason IS NULL OR length(change_reason) <= 500)
);

GRANT SELECT, INSERT ON public.manual_sensor_snapshot_edits TO authenticated;
GRANT ALL             ON public.manual_sensor_snapshot_edits TO service_role;
-- No anon grant. No PUBLIC grant.

ALTER TABLE public.manual_sensor_snapshot_edits ENABLE ROW LEVEL SECURITY;

CREATE INDEX manual_sensor_snapshot_edits_user_changed_at_idx
  ON public.manual_sensor_snapshot_edits (user_id, changed_at DESC);
CREATE INDEX manual_sensor_snapshot_edits_original_idx
  ON public.manual_sensor_snapshot_edits (original_reading_id);
CREATE INDEX manual_sensor_snapshot_edits_replacement_idx
  ON public.manual_sensor_snapshot_edits (replacement_reading_id);

CREATE POLICY "select_own_manual_sensor_snapshot_edits"
  ON public.manual_sensor_snapshot_edits
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "insert_own_manual_sensor_snapshot_edits"
  ON public.manual_sensor_snapshot_edits
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
        FROM public.sensor_readings r
       WHERE r.id      = original_reading_id
         AND r.user_id = auth.uid()
         AND r.source  = 'manual'
    )
    AND (
      replacement_reading_id IS NULL
      OR EXISTS (
        SELECT 1
          FROM public.sensor_readings r2
         WHERE r2.id      = replacement_reading_id
           AND r2.user_id = auth.uid()
           AND r2.source  = 'manual'
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.tents t
       WHERE t.id = tent_id AND t.user_id = auth.uid()
    )
    AND (
      plant_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.plants p
         WHERE p.id = plant_id AND p.user_id = auth.uid()
      )
    )
  );

-- Deliberately no UPDATE and no DELETE policies for authenticated:
-- append-only history. service_role retains implicit admin ability.

COMMENT ON TABLE public.manual_sensor_snapshot_edits IS
  'Append-only history linking a corrected manual sensor snapshot to its replacement. Original sensor_readings row is never mutated. source_before/source_after pinned to ''manual''.';