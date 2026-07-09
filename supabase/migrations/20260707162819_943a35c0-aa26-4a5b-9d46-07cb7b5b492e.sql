-- Fix pheno_keeper_clones lineage integrity.
-- Old WITH CHECK compared c.id = c.parent_clone_id AND c.keeper_id = c.keeper_id
-- against the aliased same-table row, which is trivially true / tautological.
-- Replace with a predicate that actually verifies the incoming parent_clone_id
-- row exists, is owned by the caller, and belongs to the SAME keeper.

DROP POLICY IF EXISTS pheno_keeper_clones_insert_own ON public.pheno_keeper_clones;
DROP POLICY IF EXISTS pheno_keeper_clones_update_own ON public.pheno_keeper_clones;

CREATE POLICY pheno_keeper_clones_insert_own
  ON public.pheno_keeper_clones
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pheno_keepers k
      WHERE k.id = pheno_keeper_clones.keeper_id
        AND k.user_id = auth.uid()
    )
    AND (
      parent_clone_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.pheno_keeper_clones c
        WHERE c.id = pheno_keeper_clones.parent_clone_id
          AND c.user_id = auth.uid()
          AND c.keeper_id = pheno_keeper_clones.keeper_id
      )
    )
    AND (
      clone_plant_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.plants p
        WHERE p.id = pheno_keeper_clones.clone_plant_id
          AND p.user_id = auth.uid()
      )
    )
  );

CREATE POLICY pheno_keeper_clones_update_own
  ON public.pheno_keeper_clones
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pheno_keepers k
      WHERE k.id = pheno_keeper_clones.keeper_id
        AND k.user_id = auth.uid()
    )
    AND (
      parent_clone_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.pheno_keeper_clones c
        WHERE c.id = pheno_keeper_clones.parent_clone_id
          AND c.user_id = auth.uid()
          AND c.keeper_id = pheno_keeper_clones.keeper_id
      )
    )
    AND (
      clone_plant_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.plants p
        WHERE p.id = pheno_keeper_clones.clone_plant_id
          AND p.user_id = auth.uid()
      )
    )
  );