-- Pheno hunt generation lineage: which earlier hunt this hunt continues from.
--
-- A breeder running a line asks "is my F2 landing closer to the bar than my F1
-- did?". Answering that needs a STRUCTURAL link between hunts — the existing
-- `generation` and `lineage` columns are free text a person reads, not
-- something the app can walk.
--
-- Additive and nullable: every existing hunt keeps parent_hunt_id NULL and
-- behaves exactly as before. No policy or grant change.
--
-- OWNERSHIP: a foreign key proves the parent EXISTS, never that the caller owns
-- it. `pheno_hunts` grants UPDATE to `authenticated` under an owner-scoped
-- policy that constrains only the row being written, so without the trigger
-- below a client holding another grower's hunt UUID could store it as
-- parent_hunt_id. RLS would still hide that hunt's contents on read, but the
-- cross-tenant reference must not be storable at all. The trigger compares
-- user_id explicitly rather than relying on the parent being invisible under
-- RLS, so it holds for service_role and owner contexts too.
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

-- Same-owner enforcement. Raises rather than silently nulling, so a
-- cross-tenant attempt is a hard failure the caller sees, never a quiet
-- downgrade that looks like it worked.
CREATE OR REPLACE FUNCTION public.pheno_hunts_assert_parent_same_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.parent_hunt_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.pheno_hunts AS parent
       WHERE parent.id = NEW.parent_hunt_id
         AND parent.user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION
        'pheno_hunts.parent_hunt_id must reference a hunt owned by the same user'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS pheno_hunts_parent_hunt_same_owner ON public.pheno_hunts;
CREATE TRIGGER pheno_hunts_parent_hunt_same_owner
  BEFORE INSERT OR UPDATE OF parent_hunt_id, user_id ON public.pheno_hunts
  FOR EACH ROW
  EXECUTE FUNCTION public.pheno_hunts_assert_parent_same_owner();

REVOKE EXECUTE ON FUNCTION public.pheno_hunts_assert_parent_same_owner() FROM PUBLIC, anon;

CREATE INDEX IF NOT EXISTS pheno_hunts_parent_hunt_id_idx
  ON public.pheno_hunts (parent_hunt_id)
  WHERE parent_hunt_id IS NOT NULL;

COMMENT ON COLUMN public.pheno_hunts.parent_hunt_id IS
  'The earlier hunt this hunt continues from, when the grower says so. Used to show how each generation landed against the objective the grower set. Descriptive lineage only: it never implies one generation is better than another, and it never changes what any candidate scored.';
