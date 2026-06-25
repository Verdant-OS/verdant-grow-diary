
-- Pheno Hunt Persistence v1: create pheno_hunts + pheno_hunt_candidates.

CREATE TABLE public.pheno_hunts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grow_id uuid NOT NULL REFERENCES public.grows(id) ON DELETE CASCADE,
  tent_id uuid REFERENCES public.tents(id) ON DELETE SET NULL,
  hunt_name text NOT NULL,
  cultivar text NOT NULL,
  project_goal text NOT NULL,
  start_date date NOT NULL,
  generation text,
  lineage text,
  breeder_seed_source text,
  propagation_type text,
  germination_method text,
  medium text,
  grow_style text,
  candidate_count int NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pheno_hunts TO authenticated;
GRANT ALL ON public.pheno_hunts TO service_role;

ALTER TABLE public.pheno_hunts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pheno_hunts_select_own"
  ON public.pheno_hunts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "pheno_hunts_insert_own"
  ON public.pheno_hunts FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.grows g WHERE g.id = grow_id AND g.user_id = auth.uid())
    AND (tent_id IS NULL OR EXISTS (
      SELECT 1 FROM public.tents t WHERE t.id = tent_id AND t.user_id = auth.uid()
    ))
  );
CREATE POLICY "pheno_hunts_update_own"
  ON public.pheno_hunts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pheno_hunts_delete_own"
  ON public.pheno_hunts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX pheno_hunts_user_id_idx ON public.pheno_hunts (user_id);
CREATE INDEX pheno_hunts_grow_id_idx ON public.pheno_hunts (grow_id);
CREATE INDEX pheno_hunts_tent_id_idx ON public.pheno_hunts (tent_id);

CREATE TRIGGER pheno_hunts_set_updated_at
  BEFORE UPDATE ON public.pheno_hunts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.pheno_hunt_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hunt_id uuid NOT NULL REFERENCES public.pheno_hunts(id) ON DELETE CASCADE,
  plant_id uuid NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hunt_id, plant_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pheno_hunt_candidates TO authenticated;
GRANT ALL ON public.pheno_hunt_candidates TO service_role;

ALTER TABLE public.pheno_hunt_candidates ENABLE ROW LEVEL SECURITY;

-- Hunt owner can read.
CREATE POLICY "pheno_hunt_candidates_select_via_hunt"
  ON public.pheno_hunt_candidates FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pheno_hunts h
    WHERE h.id = hunt_id AND h.user_id = auth.uid()
  ));

-- Insert: hunt must belong to caller, plant must belong to caller,
-- plant.grow_id must match hunt.grow_id, and if hunt.tent_id is set,
-- plant.tent_id must match.
CREATE POLICY "pheno_hunt_candidates_insert_via_hunt"
  ON public.pheno_hunt_candidates FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.pheno_hunts h
    JOIN public.plants p ON p.id = plant_id
    WHERE h.id = hunt_id
      AND h.user_id = auth.uid()
      AND p.user_id = auth.uid()
      AND p.grow_id = h.grow_id
      AND (h.tent_id IS NULL OR p.tent_id = h.tent_id)
  ));

CREATE POLICY "pheno_hunt_candidates_update_via_hunt"
  ON public.pheno_hunt_candidates FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pheno_hunts h
    WHERE h.id = hunt_id AND h.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.pheno_hunts h
    WHERE h.id = hunt_id AND h.user_id = auth.uid()
  ));

CREATE POLICY "pheno_hunt_candidates_delete_via_hunt"
  ON public.pheno_hunt_candidates FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pheno_hunts h
    WHERE h.id = hunt_id AND h.user_id = auth.uid()
  ));

CREATE INDEX pheno_hunt_candidates_hunt_id_idx ON public.pheno_hunt_candidates (hunt_id);
CREATE INDEX pheno_hunt_candidates_plant_id_idx ON public.pheno_hunt_candidates (plant_id);
