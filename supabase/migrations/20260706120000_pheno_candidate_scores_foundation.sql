-- Pheno Candidate Trait Scores foundation.
--
-- Grower-entered SUBJECTIVE 1-5 trait ratings for a hunt candidate (a plants
-- row tagged with pheno_hunt_id). These are the grower's own opinions, not lab
-- measurements — Verdant stores what the grower recorded and never ranks
-- candidates or picks a phenotype.
--
-- Privacy: RLS keeps every row private to its owning grower (auth.uid() =
-- user_id) on read AND write. No anon grant. No cross-owner visibility.
--
-- NOTE: this migration is delivered as a file for review + per-PR Supabase
-- preview validation. It is intentionally NOT applied to the live project by
-- this change.

CREATE TABLE public.pheno_candidate_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hunt_id uuid NOT NULL REFERENCES public.pheno_hunts(id) ON DELETE CASCADE,
  plant_id uuid NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  -- Subjective 1-5 trait ratings keyed by trait, e.g. {"vigor": 4, "aroma": 5}.
  -- Object shape enforced below; individual value ranges validated in the app.
  traits jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pheno_candidate_scores_traits_is_object
    CHECK (jsonb_typeof(traits) = 'object'),
  UNIQUE (hunt_id, plant_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pheno_candidate_scores TO authenticated;
GRANT ALL ON public.pheno_candidate_scores TO service_role;

ALTER TABLE public.pheno_candidate_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pheno_candidate_scores_select_own"
  ON public.pheno_candidate_scores FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Insert: the row owner is the caller, and both the hunt and the plant belong
-- to the caller and are consistent (the plant is a candidate of that hunt).
CREATE POLICY "pheno_candidate_scores_insert_own"
  ON public.pheno_candidate_scores FOR INSERT TO authenticated
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

CREATE POLICY "pheno_candidate_scores_update_own"
  ON public.pheno_candidate_scores FOR UPDATE TO authenticated
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

CREATE POLICY "pheno_candidate_scores_delete_own"
  ON public.pheno_candidate_scores FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX pheno_candidate_scores_user_id_idx ON public.pheno_candidate_scores (user_id);
CREATE INDEX pheno_candidate_scores_hunt_id_idx ON public.pheno_candidate_scores (hunt_id);
CREATE INDEX pheno_candidate_scores_plant_id_idx ON public.pheno_candidate_scores (plant_id);

CREATE TRIGGER pheno_candidate_scores_set_updated_at
  BEFORE UPDATE ON public.pheno_candidate_scores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
