-- Pheno Smoke Tests foundation (the deciding gate).
--
-- The cured smoke test (flavor, effect, smoothness, potency feel, verdict) is
-- THE deciding round for a keeper — it can override great structure, bag
-- appeal, and even COA numbers. This stores one grower-entered post-cure result
-- per candidate. HONEST: potency_impression is a SUBJECTIVE 1-5 feel, not a lab
-- number; absent fields render as "not recorded", never fabricated.
--
-- Privacy: RLS keeps every row private to its owning grower on read AND write.
-- No anon grant. Descriptive only — nothing here ranks or picks.

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
  CONSTRAINT pheno_smoke_tests_flavor_is_array
    CHECK (jsonb_typeof(flavor_descriptors) = 'array'),
  CONSTRAINT pheno_smoke_tests_effect_is_array
    CHECK (jsonb_typeof(effect_descriptors) = 'array'),
  CONSTRAINT pheno_smoke_tests_smoothness_range
    CHECK (smoothness IS NULL OR (smoothness BETWEEN 1 AND 5)),
  CONSTRAINT pheno_smoke_tests_potency_range
    CHECK (potency_impression IS NULL OR (potency_impression BETWEEN 1 AND 5)),
  UNIQUE (hunt_id, plant_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pheno_smoke_tests TO authenticated;
GRANT ALL ON public.pheno_smoke_tests TO service_role;

ALTER TABLE public.pheno_smoke_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pheno_smoke_tests_select_own"
  ON public.pheno_smoke_tests FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "pheno_smoke_tests_insert_own"
  ON public.pheno_smoke_tests FOR INSERT TO authenticated
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

CREATE POLICY "pheno_smoke_tests_update_own"
  ON public.pheno_smoke_tests FOR UPDATE TO authenticated
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

CREATE POLICY "pheno_smoke_tests_delete_own"
  ON public.pheno_smoke_tests FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX pheno_smoke_tests_user_id_idx ON public.pheno_smoke_tests (user_id);
CREATE INDEX pheno_smoke_tests_hunt_id_idx ON public.pheno_smoke_tests (hunt_id);
CREATE INDEX pheno_smoke_tests_plant_id_idx ON public.pheno_smoke_tests (plant_id);

CREATE TRIGGER pheno_smoke_tests_set_updated_at
  BEFORE UPDATE ON public.pheno_smoke_tests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
