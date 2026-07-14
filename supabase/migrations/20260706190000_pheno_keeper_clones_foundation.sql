-- Pheno Keeper Clones foundation (clone lineage graph).
--
-- A validated keeper is preserved as living clones. This table is a
-- self-referential clone graph anchored on a pheno_keepers row: each node is a
-- clone/accession with an optional parent clone (null = cut directly off the
-- mother) and an optional link to a tracked plants row. Data-only: recording a
-- clone starts no grow and drives no device.
--
-- Privacy: RLS keeps every row private to its owning grower on read AND write.
-- Ownership is via the referenced KEEPER (not a hunt candidate). No anon grant.

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

CREATE POLICY "pheno_keeper_clones_select_own"
  ON public.pheno_keeper_clones FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Insert: caller owns the row AND the keeper; if a parent clone is set it must
-- be the caller's and belong to the SAME keeper; if a clone plant is set it
-- must be the caller's.
CREATE POLICY "pheno_keeper_clones_insert_own"
  ON public.pheno_keeper_clones FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pheno_keepers k
      WHERE k.id = keeper_id AND k.user_id = auth.uid()
    )
    AND (
      parent_clone_id IS NULL OR EXISTS (
        SELECT 1 FROM public.pheno_keeper_clones c
        WHERE c.id = parent_clone_id AND c.user_id = auth.uid() AND c.keeper_id = keeper_id
      )
    )
    AND (
      clone_plant_id IS NULL OR EXISTS (
        SELECT 1 FROM public.plants p WHERE p.id = clone_plant_id AND p.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "pheno_keeper_clones_update_own"
  ON public.pheno_keeper_clones FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pheno_keepers k
      WHERE k.id = keeper_id AND k.user_id = auth.uid()
    )
    AND (
      parent_clone_id IS NULL OR EXISTS (
        SELECT 1 FROM public.pheno_keeper_clones c
        WHERE c.id = parent_clone_id AND c.user_id = auth.uid() AND c.keeper_id = keeper_id
      )
    )
    AND (
      clone_plant_id IS NULL OR EXISTS (
        SELECT 1 FROM public.plants p WHERE p.id = clone_plant_id AND p.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "pheno_keeper_clones_delete_own"
  ON public.pheno_keeper_clones FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX pheno_keeper_clones_user_id_idx ON public.pheno_keeper_clones (user_id);
CREATE INDEX pheno_keeper_clones_keeper_id_idx ON public.pheno_keeper_clones (keeper_id);
CREATE INDEX pheno_keeper_clones_parent_idx ON public.pheno_keeper_clones (parent_clone_id);
CREATE INDEX pheno_keeper_clones_plant_idx ON public.pheno_keeper_clones (clone_plant_id);

CREATE TRIGGER pheno_keeper_clones_set_updated_at
  BEFORE UPDATE ON public.pheno_keeper_clones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
