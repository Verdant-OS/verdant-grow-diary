-- Pheno Male Evaluations foundation.
--
-- Males are half the genetics of every cross, but the pheno-hunt surface only
-- scores the female lifecycle so far. This adds the schema for the v1.1
-- workbook "Male_Evaluation_Tracker": a grower-owned evaluation card per male
-- plant, plus an APPEND-ONLY log of pollen viability tests.
--
-- Two coordinated tables mirror the reviewed pheno envelope:
--
--   1. pheno_male_evaluations — an UPDATABLE card of the grower's own 1-10
--      operator rubric ratings for one male (keyed by axis in a jsonb object,
--      shape validated here, value ranges validated in the app by
--      phenoMaleEvaluationRules). One card per (hunt, male). Full CRUD grant +
--      RLS, cloned from pheno_candidate_scores.
--
--   2. pheno_pollen_viability_tests — an APPEND-ONLY log of independent pollen
--      viability tests for an evaluation. A male with nonviable pollen cannot
--      breed regardless of vigor, so viability is tracked separately from the
--      taste rubric and each test is immutable (SELECT + INSERT grant only, no
--      UPDATE/DELETE grant and no UPDATE/DELETE policy).
--
-- Record-only, privacy-first: RLS keeps every row private to its owner
-- (auth.uid() = user_id) on read AND write. No anon grant, no cross-owner
-- visibility. Verdant never ranks males, never picks or promotes one, and
-- nothing here starts a grow, collects pollen, or touches a plant.
--
-- hunt_id is NULLABLE: a male can be evaluated for a breeding program that
-- spans hunts (mirroring pheno_crosses). When a hunt is named, the male plant
-- must be a candidate of that hunt (plants.pheno_hunt_id = hunt_id), matching
-- the pheno_candidate_scores consistency check.
--
-- NOTE: this migration is delivered as a file for review + per-PR Supabase
-- preview validation. It is intentionally NOT applied to the live project by
-- this change.

-- ---------------------------------------------------------------------------
-- 1. pheno_male_evaluations (updatable card)
-- ---------------------------------------------------------------------------

CREATE TABLE public.pheno_male_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hunt_id uuid REFERENCES public.pheno_hunts(id) ON DELETE CASCADE,
  plant_id uuid NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  strain_lineage text,
  -- Operator 1-10 rubric ratings keyed by axis, e.g.
  -- {"vegetative_vigor_structure": 8, "environmental_robustness": 6}.
  -- Object shape enforced below; individual value ranges validated in the app.
  ratings jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pheno_male_evaluations_ratings_is_object
    CHECK (jsonb_typeof(ratings) = 'object'),
  UNIQUE (hunt_id, plant_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pheno_male_evaluations TO authenticated;
GRANT ALL ON public.pheno_male_evaluations TO service_role;

ALTER TABLE public.pheno_male_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pheno_male_evaluations_select_own"
  ON public.pheno_male_evaluations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Insert: the row owner is the caller, the male plant belongs to the caller,
-- and when a hunt is named it belongs to the caller and the plant is a
-- candidate of it. A NULL hunt_id is allowed (standalone male evaluation).
CREATE POLICY "pheno_male_evaluations_insert_own"
  ON public.pheno_male_evaluations FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.plants p
      WHERE p.id = plant_id AND p.user_id = auth.uid()
    )
    AND (
      hunt_id IS NULL OR (
        EXISTS (
          SELECT 1 FROM public.pheno_hunts h
          WHERE h.id = hunt_id AND h.user_id = auth.uid()
        )
        AND EXISTS (
          SELECT 1 FROM public.plants p
          WHERE p.id = plant_id
            AND p.user_id = auth.uid()
            AND p.pheno_hunt_id = hunt_id
        )
      )
    )
  );

CREATE POLICY "pheno_male_evaluations_update_own"
  ON public.pheno_male_evaluations FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.plants p
      WHERE p.id = plant_id AND p.user_id = auth.uid()
    )
    AND (
      hunt_id IS NULL OR (
        EXISTS (
          SELECT 1 FROM public.pheno_hunts h
          WHERE h.id = hunt_id AND h.user_id = auth.uid()
        )
        AND EXISTS (
          SELECT 1 FROM public.plants p
          WHERE p.id = plant_id
            AND p.user_id = auth.uid()
            AND p.pheno_hunt_id = hunt_id
        )
      )
    )
  );

CREATE POLICY "pheno_male_evaluations_delete_own"
  ON public.pheno_male_evaluations FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX pheno_male_evaluations_user_id_idx
  ON public.pheno_male_evaluations (user_id);
CREATE INDEX pheno_male_evaluations_hunt_id_idx
  ON public.pheno_male_evaluations (hunt_id);
CREATE INDEX pheno_male_evaluations_plant_id_idx
  ON public.pheno_male_evaluations (plant_id);

CREATE TRIGGER pheno_male_evaluations_set_updated_at
  BEFORE UPDATE ON public.pheno_male_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. pheno_pollen_viability_tests (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE public.pheno_pollen_viability_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  evaluation_id uuid NOT NULL
    REFERENCES public.pheno_male_evaluations(id) ON DELETE CASCADE,
  result text NOT NULL DEFAULT 'untested',
  -- Optional germination-percentage evidence, 0..100. Surfaced, never scored.
  germination_pct numeric,
  note text,
  tested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pheno_pollen_viability_tests_result_check
    CHECK (result IN ('viable', 'nonviable', 'inconclusive', 'untested')),
  CONSTRAINT pheno_pollen_viability_tests_germination_pct_range
    CHECK (germination_pct IS NULL OR (germination_pct >= 0 AND germination_pct <= 100))
);

-- APPEND-ONLY: authenticated may read and insert, never update or delete.
GRANT SELECT, INSERT ON public.pheno_pollen_viability_tests TO authenticated;
GRANT ALL ON public.pheno_pollen_viability_tests TO service_role;

ALTER TABLE public.pheno_pollen_viability_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pheno_pollen_viability_tests_select_own"
  ON public.pheno_pollen_viability_tests FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Insert: the row owner is the caller and the parent evaluation belongs to the
-- caller (ownership derived through the evaluation, matching pheno_reversals).
CREATE POLICY "pheno_pollen_viability_tests_insert_own"
  ON public.pheno_pollen_viability_tests FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pheno_male_evaluations e
      WHERE e.id = evaluation_id AND e.user_id = auth.uid()
    )
  );

-- Intentionally NO UPDATE and NO DELETE policy: immutable viability-test log.

CREATE INDEX pheno_pollen_viability_tests_user_id_idx
  ON public.pheno_pollen_viability_tests (user_id);
CREATE INDEX pheno_pollen_viability_tests_evaluation_idx
  ON public.pheno_pollen_viability_tests (evaluation_id, created_at DESC);
