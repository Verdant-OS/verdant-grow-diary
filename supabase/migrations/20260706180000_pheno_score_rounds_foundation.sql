-- Pheno Score Rounds foundation (staged / per-round scoring).
--
-- Keeper selection is a staged cull-down: the SAME candidate plant is scored
-- at veg, early flower, mid flower, late flower, and post-cure as SEPARATE,
-- comparable, timestamped rounds. This table stores one grower-entered score
-- card per (hunt, plant, round). The existing flat pheno_candidate_scores card
-- is left untouched (it serves as the "overall" card); nothing is migrated or
-- dropped.
--
-- traits       — subjective 1-5 quality scores keyed by trait (jsonb object).
-- loud_traits  — loud/exotic axes incl. nose_loudness 0-10 (jsonb object);
--                value ranges validated in the app (phenoExpressionRules).
-- aroma_descriptors — grower-tagged nose descriptors (jsonb array of strings).
--
-- Descriptive only: nothing here ranks candidates or picks a phenotype.
-- Privacy: RLS keeps every row private to its owning grower on read AND write.
-- No anon grant.

CREATE TABLE public.pheno_score_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hunt_id uuid NOT NULL REFERENCES public.pheno_hunts(id) ON DELETE CASCADE,
  plant_id uuid NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  round text NOT NULL,
  traits jsonb NOT NULL DEFAULT '{}'::jsonb,
  loud_traits jsonb NOT NULL DEFAULT '{}'::jsonb,
  aroma_descriptors jsonb NOT NULL DEFAULT '[]'::jsonb,
  nose_note text,
  note text,
  observed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pheno_score_rounds_round_check
    CHECK (round IN ('veg', 'early_flower', 'mid_flower', 'late_flower', 'post_cure')),
  CONSTRAINT pheno_score_rounds_traits_is_object
    CHECK (jsonb_typeof(traits) = 'object'),
  CONSTRAINT pheno_score_rounds_loud_traits_is_object
    CHECK (jsonb_typeof(loud_traits) = 'object'),
  CONSTRAINT pheno_score_rounds_aroma_is_array
    CHECK (jsonb_typeof(aroma_descriptors) = 'array'),
  UNIQUE (hunt_id, plant_id, round)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pheno_score_rounds TO authenticated;
GRANT ALL ON public.pheno_score_rounds TO service_role;

ALTER TABLE public.pheno_score_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pheno_score_rounds_select_own"
  ON public.pheno_score_rounds FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Insert: the row owner is the caller, and both the hunt and the plant belong
-- to the caller and are consistent (the plant is a candidate of that hunt).
CREATE POLICY "pheno_score_rounds_insert_own"
  ON public.pheno_score_rounds FOR INSERT TO authenticated
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

CREATE POLICY "pheno_score_rounds_update_own"
  ON public.pheno_score_rounds FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
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

CREATE POLICY "pheno_score_rounds_delete_own"
  ON public.pheno_score_rounds FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX pheno_score_rounds_user_id_idx ON public.pheno_score_rounds (user_id);
CREATE INDEX pheno_score_rounds_hunt_id_idx ON public.pheno_score_rounds (hunt_id);
CREATE INDEX pheno_score_rounds_plant_id_idx ON public.pheno_score_rounds (plant_id);

CREATE TRIGGER pheno_score_rounds_set_updated_at
  BEFORE UPDATE ON public.pheno_score_rounds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
