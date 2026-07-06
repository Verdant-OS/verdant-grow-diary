-- Pheno Lab Results foundation (COA numbers, source-tagged).
--
-- Objective lab data confirms and defends subjective calls and arrives AFTER
-- cure. This stores grower-entered / attached COA numbers (cannabinoids +
-- dominant terpenes). HONEST: source is NOT NULL and never defaulted to 'coa'
-- (default 'unspecified'); "lab verified" is derived only when source = 'coa';
-- absent numbers render as "not recorded", NEVER fabricated. UNIQUE(hunt, plant,
-- source) lets a grower estimate and a real lab COA coexist for one candidate.
--
-- Privacy: RLS keeps every row private to its owning grower on read AND write.
-- No anon grant. Data-only — nothing here ranks or picks.

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
  CONSTRAINT pheno_lab_results_terpenes_is_array
    CHECK (jsonb_typeof(dominant_terpenes) = 'array'),
  CONSTRAINT pheno_lab_results_source_check
    CHECK (source IN ('coa', 'estimate', 'unspecified')),
  UNIQUE (hunt_id, plant_id, source)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pheno_lab_results TO authenticated;
GRANT ALL ON public.pheno_lab_results TO service_role;

ALTER TABLE public.pheno_lab_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pheno_lab_results_select_own"
  ON public.pheno_lab_results FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "pheno_lab_results_insert_own"
  ON public.pheno_lab_results FOR INSERT TO authenticated
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

CREATE POLICY "pheno_lab_results_update_own"
  ON public.pheno_lab_results FOR UPDATE TO authenticated
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

CREATE POLICY "pheno_lab_results_delete_own"
  ON public.pheno_lab_results FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX pheno_lab_results_user_id_idx ON public.pheno_lab_results (user_id);
CREATE INDEX pheno_lab_results_hunt_id_idx ON public.pheno_lab_results (hunt_id);
CREATE INDEX pheno_lab_results_plant_id_idx ON public.pheno_lab_results (plant_id);

CREATE TRIGGER pheno_lab_results_set_updated_at
  BEFORE UPDATE ON public.pheno_lab_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
