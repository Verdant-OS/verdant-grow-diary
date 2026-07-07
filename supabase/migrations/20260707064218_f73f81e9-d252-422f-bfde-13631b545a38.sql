-- Pheno Candidate Trait Scores foundation.
CREATE TABLE public.pheno_candidate_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hunt_id uuid NOT NULL REFERENCES public.pheno_hunts(id) ON DELETE CASCADE,
  plant_id uuid NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  traits jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pheno_candidate_scores_traits_is_object CHECK (jsonb_typeof(traits) = 'object'),
  UNIQUE (hunt_id, plant_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pheno_candidate_scores TO authenticated;
GRANT ALL ON public.pheno_candidate_scores TO service_role;
ALTER TABLE public.pheno_candidate_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pheno_candidate_scores_select_own" ON public.pheno_candidate_scores FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "pheno_candidate_scores_insert_own" ON public.pheno_candidate_scores FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.pheno_hunts h WHERE h.id = hunt_id AND h.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.plants p WHERE p.id = plant_id AND p.user_id = auth.uid() AND p.pheno_hunt_id = hunt_id));
CREATE POLICY "pheno_candidate_scores_update_own" ON public.pheno_candidate_scores FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.pheno_hunts h WHERE h.id = hunt_id AND h.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.plants p WHERE p.id = plant_id AND p.user_id = auth.uid() AND p.pheno_hunt_id = hunt_id));
CREATE POLICY "pheno_candidate_scores_delete_own" ON public.pheno_candidate_scores FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX pheno_candidate_scores_user_id_idx ON public.pheno_candidate_scores (user_id);
CREATE INDEX pheno_candidate_scores_hunt_id_idx ON public.pheno_candidate_scores (hunt_id);
CREATE INDEX pheno_candidate_scores_plant_id_idx ON public.pheno_candidate_scores (plant_id);
CREATE TRIGGER pheno_candidate_scores_set_updated_at BEFORE UPDATE ON public.pheno_candidate_scores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Pheno Keeper Decisions foundation.
CREATE TABLE public.pheno_keeper_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hunt_id uuid NOT NULL REFERENCES public.pheno_hunts(id) ON DELETE CASCADE,
  plant_id uuid NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  decision text NOT NULL DEFAULT 'undecided',
  note text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pheno_keeper_decisions_decision_check CHECK (decision IN ('keep','cull','hold','undecided')),
  UNIQUE (hunt_id, plant_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pheno_keeper_decisions TO authenticated;
GRANT ALL ON public.pheno_keeper_decisions TO service_role;
ALTER TABLE public.pheno_keeper_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pheno_keeper_decisions_select_own" ON public.pheno_keeper_decisions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "pheno_keeper_decisions_insert_own" ON public.pheno_keeper_decisions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.pheno_hunts h WHERE h.id = hunt_id AND h.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.plants p WHERE p.id = plant_id AND p.user_id = auth.uid() AND p.pheno_hunt_id = hunt_id));
CREATE POLICY "pheno_keeper_decisions_update_own" ON public.pheno_keeper_decisions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.pheno_hunts h WHERE h.id = hunt_id AND h.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.plants p WHERE p.id = plant_id AND p.user_id = auth.uid() AND p.pheno_hunt_id = hunt_id));
CREATE POLICY "pheno_keeper_decisions_delete_own" ON public.pheno_keeper_decisions FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX pheno_keeper_decisions_user_id_idx ON public.pheno_keeper_decisions (user_id);
CREATE INDEX pheno_keeper_decisions_hunt_id_idx ON public.pheno_keeper_decisions (hunt_id);
CREATE INDEX pheno_keeper_decisions_plant_id_idx ON public.pheno_keeper_decisions (plant_id);
CREATE TRIGGER pheno_keeper_decisions_set_updated_at BEFORE UPDATE ON public.pheno_keeper_decisions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Pheno Keepers foundation.
CREATE TABLE public.pheno_keepers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hunt_id uuid NOT NULL REFERENCES public.pheno_hunts(id) ON DELETE CASCADE,
  source_plant_id uuid NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  keeper_name text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hunt_id, source_plant_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pheno_keepers TO authenticated;
GRANT ALL ON public.pheno_keepers TO service_role;
ALTER TABLE public.pheno_keepers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pheno_keepers_select_own" ON public.pheno_keepers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "pheno_keepers_insert_own" ON public.pheno_keepers FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.pheno_hunts h WHERE h.id = hunt_id AND h.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.plants p WHERE p.id = source_plant_id AND p.user_id = auth.uid() AND p.pheno_hunt_id = hunt_id));
CREATE POLICY "pheno_keepers_update_own" ON public.pheno_keepers FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.pheno_hunts h WHERE h.id = hunt_id AND h.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.plants p WHERE p.id = source_plant_id AND p.user_id = auth.uid() AND p.pheno_hunt_id = hunt_id));
CREATE POLICY "pheno_keepers_delete_own" ON public.pheno_keepers FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX pheno_keepers_user_id_idx ON public.pheno_keepers (user_id);
CREATE INDEX pheno_keepers_hunt_id_idx ON public.pheno_keepers (hunt_id);
CREATE INDEX pheno_keepers_source_plant_id_idx ON public.pheno_keepers (source_plant_id);
CREATE TRIGGER pheno_keepers_set_updated_at BEFORE UPDATE ON public.pheno_keepers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Pheno Score Rounds foundation.
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
  CONSTRAINT pheno_score_rounds_round_check CHECK (round IN ('veg','early_flower','mid_flower','late_flower','post_cure')),
  CONSTRAINT pheno_score_rounds_traits_is_object CHECK (jsonb_typeof(traits) = 'object'),
  CONSTRAINT pheno_score_rounds_loud_traits_is_object CHECK (jsonb_typeof(loud_traits) = 'object'),
  CONSTRAINT pheno_score_rounds_aroma_is_array CHECK (jsonb_typeof(aroma_descriptors) = 'array'),
  UNIQUE (hunt_id, plant_id, round)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pheno_score_rounds TO authenticated;
GRANT ALL ON public.pheno_score_rounds TO service_role;
ALTER TABLE public.pheno_score_rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pheno_score_rounds_select_own" ON public.pheno_score_rounds FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "pheno_score_rounds_insert_own" ON public.pheno_score_rounds FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.pheno_hunts h WHERE h.id = hunt_id AND h.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.plants p WHERE p.id = plant_id AND p.user_id = auth.uid() AND p.pheno_hunt_id = hunt_id));
CREATE POLICY "pheno_score_rounds_update_own" ON public.pheno_score_rounds FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.pheno_hunts h WHERE h.id = hunt_id AND h.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.plants p WHERE p.id = plant_id AND p.user_id = auth.uid() AND p.pheno_hunt_id = hunt_id));
CREATE POLICY "pheno_score_rounds_delete_own" ON public.pheno_score_rounds FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX pheno_score_rounds_user_id_idx ON public.pheno_score_rounds (user_id);
CREATE INDEX pheno_score_rounds_hunt_id_idx ON public.pheno_score_rounds (hunt_id);
CREATE INDEX pheno_score_rounds_plant_id_idx ON public.pheno_score_rounds (plant_id);
CREATE TRIGGER pheno_score_rounds_set_updated_at BEFORE UPDATE ON public.pheno_score_rounds FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Pheno Keeper Decisions LOG (append-only).
CREATE TABLE public.pheno_keeper_decisions_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hunt_id uuid NOT NULL REFERENCES public.pheno_hunts(id) ON DELETE CASCADE,
  plant_id uuid NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  decision text NOT NULL,
  reason text NOT NULL,
  note text,
  decided_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pheno_keeper_decisions_log_decision_check CHECK (decision IN ('keep','cull','hold','undecided')),
  CONSTRAINT pheno_keeper_decisions_log_reason_present CHECK (length(btrim(reason)) > 0)
);
GRANT SELECT, INSERT ON public.pheno_keeper_decisions_log TO authenticated;
GRANT ALL ON public.pheno_keeper_decisions_log TO service_role;
ALTER TABLE public.pheno_keeper_decisions_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pheno_keeper_decisions_log_select_own" ON public.pheno_keeper_decisions_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "pheno_keeper_decisions_log_insert_own" ON public.pheno_keeper_decisions_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.pheno_hunts h WHERE h.id = hunt_id AND h.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.plants p WHERE p.id = plant_id AND p.user_id = auth.uid() AND p.pheno_hunt_id = hunt_id));
CREATE INDEX pheno_keeper_decisions_log_user_id_idx ON public.pheno_keeper_decisions_log (user_id);
CREATE INDEX pheno_keeper_decisions_log_hunt_id_idx ON public.pheno_keeper_decisions_log (hunt_id);
CREATE INDEX pheno_keeper_decisions_log_candidate_time_idx ON public.pheno_keeper_decisions_log (hunt_id, plant_id, decided_at DESC);

-- Pheno Sex Observations (append-only).
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
  CONSTRAINT pheno_sex_observations_sex_check CHECK (sex IN ('female','male','hermaphrodite','unknown'))
);
GRANT SELECT, INSERT ON public.pheno_sex_observations TO authenticated;
GRANT ALL ON public.pheno_sex_observations TO service_role;
ALTER TABLE public.pheno_sex_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pheno_sex_observations_select_own" ON public.pheno_sex_observations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "pheno_sex_observations_insert_own" ON public.pheno_sex_observations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.pheno_hunts h WHERE h.id = hunt_id AND h.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.plants p WHERE p.id = plant_id AND p.user_id = auth.uid() AND p.pheno_hunt_id = hunt_id));
CREATE INDEX pheno_sex_observations_user_id_idx ON public.pheno_sex_observations (user_id);
CREATE INDEX pheno_sex_observations_hunt_id_idx ON public.pheno_sex_observations (hunt_id);
CREATE INDEX pheno_sex_observations_candidate_time_idx ON public.pheno_sex_observations (hunt_id, plant_id, observed_at DESC);

-- Pheno Smoke Tests.
CREATE TABLE public.pheno_smoke_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hunt_id uuid NOT NULL REFERENCES public.pheno_hunts(id) ON DELETE CASCADE,
  plant_id uuid NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  flavor_descriptors jsonb NOT NULL DEFAULT '[]'::jsonb,
  effect_descriptors jsonb NOT NULL DEFAULT '[]'::jsonb,
  smoothness smallint,
  potency_impression smallint,
  verdict text,
  note text,
  tested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pheno_smoke_tests_flavor_is_array CHECK (jsonb_typeof(flavor_descriptors) = 'array'),
  CONSTRAINT pheno_smoke_tests_effect_is_array CHECK (jsonb_typeof(effect_descriptors) = 'array'),
  CONSTRAINT pheno_smoke_tests_smoothness_range CHECK (smoothness IS NULL OR (smoothness BETWEEN 1 AND 5)),
  CONSTRAINT pheno_smoke_tests_potency_range CHECK (potency_impression IS NULL OR (potency_impression BETWEEN 1 AND 5)),
  UNIQUE (hunt_id, plant_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pheno_smoke_tests TO authenticated;
GRANT ALL ON public.pheno_smoke_tests TO service_role;
ALTER TABLE public.pheno_smoke_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pheno_smoke_tests_select_own" ON public.pheno_smoke_tests FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "pheno_smoke_tests_insert_own" ON public.pheno_smoke_tests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.pheno_hunts h WHERE h.id = hunt_id AND h.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.plants p WHERE p.id = plant_id AND p.user_id = auth.uid() AND p.pheno_hunt_id = hunt_id));
CREATE POLICY "pheno_smoke_tests_update_own" ON public.pheno_smoke_tests FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.pheno_hunts h WHERE h.id = hunt_id AND h.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.plants p WHERE p.id = plant_id AND p.user_id = auth.uid() AND p.pheno_hunt_id = hunt_id));
CREATE POLICY "pheno_smoke_tests_delete_own" ON public.pheno_smoke_tests FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX pheno_smoke_tests_user_id_idx ON public.pheno_smoke_tests (user_id);
CREATE INDEX pheno_smoke_tests_hunt_id_idx ON public.pheno_smoke_tests (hunt_id);
CREATE INDEX pheno_smoke_tests_plant_id_idx ON public.pheno_smoke_tests (plant_id);
CREATE TRIGGER pheno_smoke_tests_set_updated_at BEFORE UPDATE ON public.pheno_smoke_tests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Pheno Lab Results.
CREATE TABLE public.pheno_lab_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hunt_id uuid NOT NULL REFERENCES public.pheno_hunts(id) ON DELETE CASCADE,
  plant_id uuid NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  thc_pct numeric,
  cbd_pct numeric,
  total_cannabinoids_pct numeric,
  dominant_terpenes jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'unspecified',
  note text,
  tested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pheno_lab_results_terpenes_is_array CHECK (jsonb_typeof(dominant_terpenes) = 'array'),
  CONSTRAINT pheno_lab_results_source_check CHECK (source IN ('coa','estimate','unspecified')),
  UNIQUE (hunt_id, plant_id, source)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pheno_lab_results TO authenticated;
GRANT ALL ON public.pheno_lab_results TO service_role;
ALTER TABLE public.pheno_lab_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pheno_lab_results_select_own" ON public.pheno_lab_results FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "pheno_lab_results_insert_own" ON public.pheno_lab_results FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.pheno_hunts h WHERE h.id = hunt_id AND h.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.plants p WHERE p.id = plant_id AND p.user_id = auth.uid() AND p.pheno_hunt_id = hunt_id));
CREATE POLICY "pheno_lab_results_update_own" ON public.pheno_lab_results FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.pheno_hunts h WHERE h.id = hunt_id AND h.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.plants p WHERE p.id = plant_id AND p.user_id = auth.uid() AND p.pheno_hunt_id = hunt_id));
CREATE POLICY "pheno_lab_results_delete_own" ON public.pheno_lab_results FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX pheno_lab_results_user_id_idx ON public.pheno_lab_results (user_id);
CREATE INDEX pheno_lab_results_hunt_id_idx ON public.pheno_lab_results (hunt_id);
CREATE INDEX pheno_lab_results_plant_id_idx ON public.pheno_lab_results (plant_id);
CREATE TRIGGER pheno_lab_results_set_updated_at BEFORE UPDATE ON public.pheno_lab_results FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Pheno Keeper Clones.
CREATE TABLE public.pheno_keeper_clones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  keeper_id uuid NOT NULL REFERENCES public.pheno_keepers(id) ON DELETE CASCADE,
  parent_clone_id uuid REFERENCES public.pheno_keeper_clones(id) ON DELETE SET NULL,
  clone_plant_id uuid REFERENCES public.plants(id) ON DELETE SET NULL,
  clone_label text NOT NULL,
  note text,
  taken_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (keeper_id, clone_label)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pheno_keeper_clones TO authenticated;
GRANT ALL ON public.pheno_keeper_clones TO service_role;
ALTER TABLE public.pheno_keeper_clones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pheno_keeper_clones_select_own" ON public.pheno_keeper_clones FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "pheno_keeper_clones_insert_own" ON public.pheno_keeper_clones FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.pheno_keepers k WHERE k.id = keeper_id AND k.user_id = auth.uid())
    AND (parent_clone_id IS NULL OR EXISTS (SELECT 1 FROM public.pheno_keeper_clones c WHERE c.id = parent_clone_id AND c.user_id = auth.uid() AND c.keeper_id = keeper_id))
    AND (clone_plant_id IS NULL OR EXISTS (SELECT 1 FROM public.plants p WHERE p.id = clone_plant_id AND p.user_id = auth.uid())));
CREATE POLICY "pheno_keeper_clones_update_own" ON public.pheno_keeper_clones FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.pheno_keepers k WHERE k.id = keeper_id AND k.user_id = auth.uid())
    AND (parent_clone_id IS NULL OR EXISTS (SELECT 1 FROM public.pheno_keeper_clones c WHERE c.id = parent_clone_id AND c.user_id = auth.uid() AND c.keeper_id = keeper_id))
    AND (clone_plant_id IS NULL OR EXISTS (SELECT 1 FROM public.plants p WHERE p.id = clone_plant_id AND p.user_id = auth.uid())));
CREATE POLICY "pheno_keeper_clones_delete_own" ON public.pheno_keeper_clones FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX pheno_keeper_clones_user_id_idx ON public.pheno_keeper_clones (user_id);
CREATE INDEX pheno_keeper_clones_keeper_id_idx ON public.pheno_keeper_clones (keeper_id);
CREATE INDEX pheno_keeper_clones_parent_idx ON public.pheno_keeper_clones (parent_clone_id);
CREATE INDEX pheno_keeper_clones_plant_idx ON public.pheno_keeper_clones (clone_plant_id);
CREATE TRIGGER pheno_keeper_clones_set_updated_at BEFORE UPDATE ON public.pheno_keeper_clones FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Pheno Crosses.
CREATE TABLE public.pheno_crosses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hunt_id uuid REFERENCES public.pheno_hunts(id) ON DELETE SET NULL,
  female_keeper_id uuid NOT NULL REFERENCES public.pheno_keepers(id) ON DELETE CASCADE,
  male_keeper_id uuid NOT NULL REFERENCES public.pheno_keepers(id) ON DELETE CASCADE,
  cross_name text,
  note text,
  crossed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pheno_crosses_distinct_parents CHECK (female_keeper_id <> male_keeper_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pheno_crosses TO authenticated;
GRANT ALL ON public.pheno_crosses TO service_role;
ALTER TABLE public.pheno_crosses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pheno_crosses_select_own" ON public.pheno_crosses FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "pheno_crosses_delete_own" ON public.pheno_crosses FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX pheno_crosses_user_id_idx ON public.pheno_crosses (user_id);
CREATE INDEX pheno_crosses_hunt_id_idx ON public.pheno_crosses (hunt_id);
CREATE INDEX pheno_crosses_female_idx ON public.pheno_crosses (female_keeper_id);
CREATE INDEX pheno_crosses_male_idx ON public.pheno_crosses (male_keeper_id);
CREATE TRIGGER pheno_crosses_set_updated_at BEFORE UPDATE ON public.pheno_crosses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Part B (B2): pheno_reversals + pheno_crosses cross_type/selfing support.
CREATE TABLE public.pheno_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  keeper_id uuid NOT NULL REFERENCES public.pheno_keepers(id) ON DELETE CASCADE,
  method text NOT NULL DEFAULT 'sts',
  note text,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pheno_reversals_method_check CHECK (method IN ('sts','colloidal_silver','ga3','other'))
);
GRANT SELECT, INSERT ON public.pheno_reversals TO authenticated;
GRANT ALL ON public.pheno_reversals TO service_role;
ALTER TABLE public.pheno_reversals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pheno_reversals_select_own" ON public.pheno_reversals FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "pheno_reversals_insert_own" ON public.pheno_reversals FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.pheno_keepers k WHERE k.id = keeper_id AND k.user_id = auth.uid()));
CREATE INDEX pheno_reversals_user_id_idx ON public.pheno_reversals (user_id);
CREATE INDEX pheno_reversals_keeper_idx ON public.pheno_reversals (keeper_id);

ALTER TABLE public.pheno_crosses ADD COLUMN cross_type text NOT NULL DEFAULT 'standard_f1';
ALTER TABLE public.pheno_crosses ADD CONSTRAINT pheno_crosses_cross_type_check CHECK (cross_type IN ('standard_f1','feminized_cross','selfing_s1'));
ALTER TABLE public.pheno_crosses ALTER COLUMN male_keeper_id DROP NOT NULL;
ALTER TABLE public.pheno_crosses DROP CONSTRAINT pheno_crosses_distinct_parents;
ALTER TABLE public.pheno_crosses ADD CONSTRAINT pheno_crosses_parents_by_type CHECK (
  (cross_type = 'selfing_s1' AND male_keeper_id IS NULL)
  OR (cross_type IN ('standard_f1','feminized_cross') AND male_keeper_id IS NOT NULL AND male_keeper_id <> female_keeper_id)
);

CREATE POLICY "pheno_crosses_insert_own" ON public.pheno_crosses FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.pheno_keepers f WHERE f.id = female_keeper_id AND f.user_id = auth.uid())
    AND (male_keeper_id IS NULL OR EXISTS (SELECT 1 FROM public.pheno_keepers m WHERE m.id = male_keeper_id AND m.user_id = auth.uid()))
    AND (hunt_id IS NULL OR EXISTS (SELECT 1 FROM public.pheno_hunts h WHERE h.id = hunt_id AND h.user_id = auth.uid()))
    AND (
      (cross_type = 'standard_f1' AND NOT EXISTS (SELECT 1 FROM public.pheno_reversals r WHERE r.keeper_id = male_keeper_id AND r.user_id = auth.uid()))
      OR (cross_type = 'selfing_s1' AND EXISTS (SELECT 1 FROM public.pheno_reversals r WHERE r.keeper_id = female_keeper_id AND r.user_id = auth.uid()))
      OR (cross_type = 'feminized_cross' AND EXISTS (SELECT 1 FROM public.pheno_reversals r WHERE r.keeper_id = male_keeper_id AND r.user_id = auth.uid()))
    )
  );

CREATE POLICY "pheno_crosses_update_own" ON public.pheno_crosses FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.pheno_keepers f WHERE f.id = female_keeper_id AND f.user_id = auth.uid())
    AND (male_keeper_id IS NULL OR EXISTS (SELECT 1 FROM public.pheno_keepers m WHERE m.id = male_keeper_id AND m.user_id = auth.uid()))
    AND (hunt_id IS NULL OR EXISTS (SELECT 1 FROM public.pheno_hunts h WHERE h.id = hunt_id AND h.user_id = auth.uid()))
    AND (
      (cross_type = 'standard_f1' AND NOT EXISTS (SELECT 1 FROM public.pheno_reversals r WHERE r.keeper_id = male_keeper_id AND r.user_id = auth.uid()))
      OR (cross_type = 'selfing_s1' AND EXISTS (SELECT 1 FROM public.pheno_reversals r WHERE r.keeper_id = female_keeper_id AND r.user_id = auth.uid()))
      OR (cross_type = 'feminized_cross' AND EXISTS (SELECT 1 FROM public.pheno_reversals r WHERE r.keeper_id = male_keeper_id AND r.user_id = auth.uid()))
    )
  );

CREATE INDEX pheno_crosses_cross_type_idx ON public.pheno_crosses (cross_type);