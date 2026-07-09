-- Pheno Sex Observations foundation (append-only, grower-recorded).
--
-- Zero-tolerance herm discipline is core to protecting a run: a single nanner
-- can seed the tent. This table is an APPEND-ONLY log of the grower's own sex
-- observations (female / male / hermaphrodite / unknown) — a plant read female
-- at week 4 can herm at week 7, so the timeline is first-class and immutable.
--
-- NEVER inferred: sex is only what the grower recorded (phenoSexObservationModel
-- normalizes it). The "herm observed -> consider removing" prompt is
-- SUGGEST-ONLY and is NEVER auto-inserted server-side; the client reads the
-- latest row and, on the grower's confirmation, inserts a pending_approval
-- Action Queue row. Nothing here removes, keeps, or acts on a plant.
--
-- Append-only enforcement: authenticated granted SELECT + INSERT only (no
-- UPDATE/DELETE), and no UPDATE/DELETE policy exists.

CREATE TABLE public.pheno_sex_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hunt_id uuid NOT NULL REFERENCES public.pheno_hunts(id) ON DELETE CASCADE,
  plant_id uuid NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  sex text NOT NULL DEFAULT 'unknown',
  herm_observed boolean NOT NULL DEFAULT false,
  note text,
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pheno_sex_observations_sex_check
    CHECK (sex IN ('female', 'male', 'hermaphrodite', 'unknown'))
);

-- APPEND-ONLY: authenticated may read and insert, never update or delete.
GRANT SELECT, INSERT ON public.pheno_sex_observations TO authenticated;
GRANT ALL ON public.pheno_sex_observations TO service_role;

ALTER TABLE public.pheno_sex_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pheno_sex_observations_select_own"
  ON public.pheno_sex_observations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "pheno_sex_observations_insert_own"
  ON public.pheno_sex_observations FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pheno_hunts h
      WHERE h.id = hunt_id AND h.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.plants p
      WHERE p.id = plant_id
        AND p.user_id = auth.uid()
        AND p.pheno_hunt_id = hunt_id
    )
  );

-- Intentionally NO UPDATE and NO DELETE policy: immutable observation log.

CREATE INDEX pheno_sex_observations_user_id_idx
  ON public.pheno_sex_observations (user_id);
CREATE INDEX pheno_sex_observations_hunt_id_idx
  ON public.pheno_sex_observations (hunt_id);
CREATE INDEX pheno_sex_observations_candidate_time_idx
  ON public.pheno_sex_observations (hunt_id, plant_id, observed_at DESC);
