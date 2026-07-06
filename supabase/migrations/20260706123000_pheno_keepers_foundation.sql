-- Pheno Keepers foundation (data-only lineage anchor).
--
-- Records that a hunt candidate (a plants row) became a KEEPER — a preserved
-- phenotype the grower wants to carry forward. This is a data pointer only:
-- naming a keeper does nothing automatically, starts no grow, and drives no
-- device. Downstream lineage (which grows descend from a keeper) is presented
-- by a pure view-model from associations the grower records elsewhere.
--
-- Privacy: RLS keeps every row private to its owning grower (auth.uid() =
-- user_id) on read AND write. No anon grant.
--
-- NOTE: delivered as a file for review + per-PR Supabase preview validation.
-- Intentionally NOT applied to the live project by this change.

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

CREATE POLICY "pheno_keepers_select_own"
  ON public.pheno_keepers FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Insert: the row owner is the caller, and both the hunt and the source plant
-- belong to the caller and are consistent (the plant is a candidate of that hunt).
CREATE POLICY "pheno_keepers_insert_own"
  ON public.pheno_keepers FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pheno_hunts h
      WHERE h.id = hunt_id AND h.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.plants p
      WHERE p.id = source_plant_id
        AND p.user_id = auth.uid()
        AND p.pheno_hunt_id = hunt_id
    )
  );

CREATE POLICY "pheno_keepers_update_own"
  ON public.pheno_keepers FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pheno_hunts h
      WHERE h.id = hunt_id AND h.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.plants p
      WHERE p.id = source_plant_id
        AND p.user_id = auth.uid()
        AND p.pheno_hunt_id = hunt_id
    )
  );

CREATE POLICY "pheno_keepers_delete_own"
  ON public.pheno_keepers FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX pheno_keepers_user_id_idx ON public.pheno_keepers (user_id);
CREATE INDEX pheno_keepers_hunt_id_idx ON public.pheno_keepers (hunt_id);
CREATE INDEX pheno_keepers_source_plant_id_idx ON public.pheno_keepers (source_plant_id);

CREATE TRIGGER pheno_keepers_set_updated_at
  BEFORE UPDATE ON public.pheno_keepers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
