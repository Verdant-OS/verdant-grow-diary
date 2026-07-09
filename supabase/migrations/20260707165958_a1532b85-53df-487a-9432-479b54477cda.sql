-- 1) TABLE
CREATE TABLE public.pheno_stress_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hunt_id uuid NOT NULL REFERENCES public.pheno_hunts(id) ON DELETE CASCADE,
  plant_id uuid NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  stress_factor text NOT NULL,
  status text NOT NULL,
  start_date date NOT NULL,
  end_date date NULL,
  intensity text NOT NULL,
  plant_response text NULL,
  recovery_notes text NULL,
  yield_impact_notes text NULL,
  disease_pest_notes text NULL,
  recommendation text NOT NULL,
  linked_diary_entry_id uuid NULL REFERENCES public.diary_entries(id) ON DELETE SET NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pheno_stress_observations_status_chk
    CHECK (status IN ('planned', 'observed')),
  CONSTRAINT pheno_stress_observations_intensity_chk
    CHECK (intensity IN ('low', 'moderate', 'high')),
  CONSTRAINT pheno_stress_observations_recommendation_chk
    CHECK (recommendation IN ('keep', 'watch', 'reject')),
  CONSTRAINT pheno_stress_observations_dates_chk
    CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT pheno_stress_observations_observed_chk
    CHECK (
      status = 'planned'
      OR (
        status = 'observed'
        AND end_date IS NOT NULL
        AND plant_response IS NOT NULL
        AND length(btrim(plant_response)) > 0
      )
    )
);

CREATE INDEX pheno_stress_observations_user_idx
  ON public.pheno_stress_observations (user_id);
CREATE INDEX pheno_stress_observations_hunt_idx
  ON public.pheno_stress_observations (hunt_id);
CREATE INDEX pheno_stress_observations_plant_idx
  ON public.pheno_stress_observations (plant_id);

-- 2) GRANTS (no anon — every policy scopes to auth.uid())
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pheno_stress_observations TO authenticated;
GRANT ALL ON public.pheno_stress_observations TO service_role;

-- 3) RLS
ALTER TABLE public.pheno_stress_observations ENABLE ROW LEVEL SECURITY;

-- 4) POLICIES (mirror pheno_smoke_tests owner-scoped pattern)
CREATE POLICY pheno_stress_observations_select_own
  ON public.pheno_stress_observations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY pheno_stress_observations_insert_own
  ON public.pheno_stress_observations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pheno_hunts h
      WHERE h.id = pheno_stress_observations.hunt_id
        AND h.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.plants p
      WHERE p.id = pheno_stress_observations.plant_id
        AND p.user_id = auth.uid()
        AND p.pheno_hunt_id = pheno_stress_observations.hunt_id
    )
    AND (
      linked_diary_entry_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.diary_entries d
        WHERE d.id = pheno_stress_observations.linked_diary_entry_id
          AND d.user_id = auth.uid()
      )
    )
  );

CREATE POLICY pheno_stress_observations_update_own
  ON public.pheno_stress_observations
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pheno_hunts h
      WHERE h.id = pheno_stress_observations.hunt_id
        AND h.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.plants p
      WHERE p.id = pheno_stress_observations.plant_id
        AND p.user_id = auth.uid()
        AND p.pheno_hunt_id = pheno_stress_observations.hunt_id
    )
    AND (
      linked_diary_entry_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.diary_entries d
        WHERE d.id = pheno_stress_observations.linked_diary_entry_id
          AND d.user_id = auth.uid()
      )
    )
  );

CREATE POLICY pheno_stress_observations_delete_own
  ON public.pheno_stress_observations
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 5) updated_at trigger (reuses shared helper if present, else create-safe)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER pheno_stress_observations_set_updated_at
  BEFORE UPDATE ON public.pheno_stress_observations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();