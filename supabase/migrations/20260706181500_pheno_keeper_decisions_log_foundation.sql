-- Pheno Keeper Decisions LOG foundation (append-only audit trail).
--
-- A serious breeder narrows hundreds of candidates to one or two and needs a
-- defensible, reviewable record of WHY each was kept or cut. This table is an
-- APPEND-ONLY history: every keep / cull / hold / undecided the grower records
-- is an immutable row with a REQUIRED reason. The current decision is the
-- latest row per candidate (resolved in the app); nothing is overwritten.
--
-- The live pheno_keeper_decisions table (one current row per candidate) is
-- LEFT INTACT — this is a NEW table, not an in-place ALTER, so there is zero
-- risk to existing readers/writers.
--
-- Append-only is enforced two ways: (1) the authenticated grant is SELECT +
-- INSERT only (no UPDATE/DELETE), and (2) no UPDATE or DELETE policy exists, so
-- RLS default-denies those commands. service_role keeps ALL for admin
-- correction. Suggest-only: recording a decision acts on nothing.

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
  CONSTRAINT pheno_keeper_decisions_log_decision_check
    CHECK (decision IN ('keep', 'cull', 'hold', 'undecided')),
  CONSTRAINT pheno_keeper_decisions_log_reason_present
    CHECK (length(btrim(reason)) > 0)
);

-- APPEND-ONLY: authenticated may read and insert, never update or delete.
GRANT SELECT, INSERT ON public.pheno_keeper_decisions_log TO authenticated;
GRANT ALL ON public.pheno_keeper_decisions_log TO service_role;

ALTER TABLE public.pheno_keeper_decisions_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pheno_keeper_decisions_log_select_own"
  ON public.pheno_keeper_decisions_log FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "pheno_keeper_decisions_log_insert_own"
  ON public.pheno_keeper_decisions_log FOR INSERT TO authenticated
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

-- Intentionally NO UPDATE and NO DELETE policy: rows are immutable (append-only
-- audit trail). RLS default-denies any command without a matching policy.

CREATE INDEX pheno_keeper_decisions_log_user_id_idx
  ON public.pheno_keeper_decisions_log (user_id);
CREATE INDEX pheno_keeper_decisions_log_hunt_id_idx
  ON public.pheno_keeper_decisions_log (hunt_id);
CREATE INDEX pheno_keeper_decisions_log_candidate_time_idx
  ON public.pheno_keeper_decisions_log (hunt_id, plant_id, decided_at DESC);
