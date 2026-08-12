-- Lab Tests foundation (measured COA results per plant).
--
-- Grower-entered MEASURED lab results (cannabinoid percentages and terpene
-- percentages) transcribed from a Certificate of Analysis for one plant.
-- Verdant stores what the grower transcribed and never verifies, ranks, or
-- compares results across plants — this is the plant's own evidence record.
--
-- Privacy: RLS keeps every row private to its owning grower (auth.uid() =
-- user_id) on read AND write, and inserts/updates additionally require the
-- referenced plant to belong to the caller. No anon grant. No cross-owner
-- visibility. (The abandoned breeder-mode draft of this table granted
-- authenticated-wide SELECT — that leak is deliberately not reproduced.)

-- Terpene payload validator, enforced at the database boundary: authenticated
-- clients have direct INSERT/UPDATE, so app-side draft validation alone cannot
-- stop a tampered client from persisting malformed evidence. Every entry must
-- be a named (1-64 char) key with a numeric 0-100 value. IMMUTABLE + plain SQL
-- (no I/O, no definer rights) so it is legal in a CHECK constraint.
CREATE FUNCTION public.lab_tests_terpenes_valid(t jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_typeof(t) = 'object'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_each(t) AS e(key, value)
      -- Keys must equal their trimmed form: a whitespace-only key ("   ") is
      -- as nameless as an empty one, and a padded variant (" myrcene ") would
      -- collapse into a duplicate of "myrcene" at display time.
      WHERE char_length(btrim(e.key)) = 0
         OR e.key <> btrim(e.key)
         OR char_length(e.key) > 64
         OR jsonb_typeof(e.value) <> 'number'
         -- CASE guards the numeric cast: it must only run for real numbers.
         OR CASE
              WHEN jsonb_typeof(e.value) = 'number'
                THEN (e.value)::text::numeric < 0 OR (e.value)::text::numeric > 100
              ELSE false
            END
    );
$$;

CREATE TABLE public.lab_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plant_id uuid NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  tested_at timestamptz NOT NULL DEFAULT now(),
  -- Cannabinoid percentages as printed on the COA. Nullable: labs report
  -- different subsets. Bounds are sanity rails; exact values are the lab's.
  thca_percent numeric CHECK (thca_percent >= 0 AND thca_percent <= 100),
  thc_percent numeric CHECK (thc_percent >= 0 AND thc_percent <= 100),
  cbda_percent numeric CHECK (cbda_percent >= 0 AND cbda_percent <= 100),
  cbd_percent numeric CHECK (cbd_percent >= 0 AND cbd_percent <= 100),
  -- Terpene percentages keyed by terpene name, e.g. {"myrcene": 0.8}.
  -- Shape AND entry validity enforced by the CHECK below.
  terpenes jsonb NOT NULL DEFAULT '{}'::jsonb,
  lab_name text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lab_tests_terpenes_valid
    CHECK (public.lab_tests_terpenes_valid(terpenes)),
  -- A row with no measurement at all is not evidence; mirror the app-side
  -- "enter at least one measurement" rule at the boundary.
  CONSTRAINT lab_tests_has_measurement
    CHECK (
      thca_percent IS NOT NULL
      OR thc_percent IS NOT NULL
      OR cbda_percent IS NOT NULL
      OR cbd_percent IS NOT NULL
      OR terpenes <> '{}'::jsonb
    )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_tests TO authenticated;
GRANT ALL ON public.lab_tests TO service_role;

ALTER TABLE public.lab_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lab_tests_select_own"
  ON public.lab_tests FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Insert: the row owner is the caller and the referenced plant is theirs.
CREATE POLICY "lab_tests_insert_own"
  ON public.lab_tests FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.plants p
      WHERE p.id = plant_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "lab_tests_update_own"
  ON public.lab_tests FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.plants p
      WHERE p.id = plant_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "lab_tests_delete_own"
  ON public.lab_tests FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX lab_tests_user_id_idx ON public.lab_tests (user_id);
CREATE INDEX lab_tests_plant_id_idx ON public.lab_tests (plant_id);

CREATE TRIGGER lab_tests_set_updated_at
  BEFORE UPDATE ON public.lab_tests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
