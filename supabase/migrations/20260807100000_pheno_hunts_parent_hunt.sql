-- Pheno hunt generation lineage: which earlier hunt this hunt continues from.
--
-- A breeder running a line asks "is my F2 landing closer to the bar than my F1
-- did?". Answering that needs a STRUCTURAL link between hunts — the existing
-- `generation` and `lineage` columns are free text a person reads, not
-- something the app can walk.
--
-- Additive and nullable: every existing hunt keeps parent_hunt_id NULL and
-- behaves exactly as before. No policy, grant, or trigger change — the column
-- inherits pheno_hunts' own owner-scoped RLS, and the self-reference FK means
-- a parent the caller cannot see is still constrained by that table's policies.
--
-- CYCLE SAFETY: the CHECK below only rejects the one-hop case (a hunt as its
-- own parent). A longer ring (A→B→A) is not expressible as a row constraint,
-- so the chain walker in the app bounds its depth AND carries a visited set —
-- see phenoObjectiveGenerationRules.buildGenerationChain.

ALTER TABLE public.pheno_hunts
  ADD COLUMN IF NOT EXISTS parent_hunt_id uuid REFERENCES public.pheno_hunts(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pheno_hunts_parent_hunt_not_self'
  ) THEN
    ALTER TABLE public.pheno_hunts
      ADD CONSTRAINT pheno_hunts_parent_hunt_not_self
      CHECK (parent_hunt_id IS NULL OR parent_hunt_id <> id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS pheno_hunts_parent_hunt_id_idx
  ON public.pheno_hunts (parent_hunt_id)
  WHERE parent_hunt_id IS NOT NULL;

COMMENT ON COLUMN public.pheno_hunts.parent_hunt_id IS
  'The earlier hunt this hunt continues from, when the grower says so. Used to show how each generation landed against the objective the grower set. Descriptive lineage only: it never implies one generation is better than another, and it never changes what any candidate scored.';
