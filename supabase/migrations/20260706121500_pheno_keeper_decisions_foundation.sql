-- Pheno Keeper Decisions foundation.
--
-- A grower's recorded keeper decision for a hunt candidate (a plants row tagged
-- with pheno_hunt_id): keep / cull / hold / undecided. This is a NOTE TO SELF —
-- recording a decision never keeps, culls, or acts on a plant. Any follow-up a
-- decision implies is approval-required and handled by the Action Queue, not by
-- this table.
--
-- Privacy: RLS keeps every row private to its owning grower (auth.uid() =
-- user_id) on read AND write. No anon grant.
--
-- NOTE: delivered as a file for review + per-PR Supabase preview validation.
-- Intentionally NOT applied to the live project by this change.

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
  CONSTRAINT pheno_keeper_decisions_decision_check
    CHECK (decision IN ('keep', 'cull', 'hold', 'undecided')),
  UNIQUE (hunt_id, plant_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pheno_keeper_decisions TO authenticated;
GRANT ALL ON public.pheno_keeper_decisions TO service_role;

ALTER TABLE public.pheno_keeper_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pheno_keeper_decisions_select_own"
  ON public.pheno_keeper_decisions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Insert: the row owner is the caller, and both the hunt and the plant belong
-- to the caller and are consistent (the plant is a candidate of that hunt).
CREATE POLICY "pheno_keeper_decisions_insert_own"
  ON public.pheno_keeper_decisions FOR INSERT TO authenticated
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

CREATE POLICY "pheno_keeper_decisions_update_own"
  ON public.pheno_keeper_decisions FOR UPDATE TO authenticated
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

CREATE POLICY "pheno_keeper_decisions_delete_own"
  ON public.pheno_keeper_decisions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX pheno_keeper_decisions_user_id_idx ON public.pheno_keeper_decisions (user_id);
CREATE INDEX pheno_keeper_decisions_hunt_id_idx ON public.pheno_keeper_decisions (hunt_id);
CREATE INDEX pheno_keeper_decisions_plant_id_idx ON public.pheno_keeper_decisions (plant_id);

CREATE TRIGGER pheno_keeper_decisions_set_updated_at
  BEFORE UPDATE ON public.pheno_keeper_decisions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
