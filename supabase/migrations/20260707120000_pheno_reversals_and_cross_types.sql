-- Part B (B2): reversals + cross types — the reversing & selfing foundation.
--
-- Two coordinated changes make reversing and selfing first-class:
--
--   1. pheno_reversals — an APPEND-ONLY log of chemical reversals a grower
--      applies to a keeper (STS / colloidal silver / GA3). A keeper is
--      "reversed" iff a row exists for it (derived state, exactly like herm is
--      derived from sex observations). Grants SELECT + INSERT only; no
--      UPDATE/DELETE grant and no UPDATE/DELETE policy → immutable log.
--
--   2. pheno_crosses gains a cross_type and a NULLABLE male parent so a SELF
--      (S1) cross — where the reversed mother pollinates itself — can be
--      recorded. The old unconditional distinct-parents CHECK is replaced by a
--      type-conditional one. Existing rows default to 'standard_f1'.
--
-- Record-only, privacy-first: RLS keeps every row private to its owner on read
-- AND write; nothing here starts a grow, collects pollen, or touches a plant.

-- ---------------------------------------------------------------------------
-- 1. pheno_reversals (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE public.pheno_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  keeper_id uuid NOT NULL REFERENCES public.pheno_keepers(id) ON DELETE CASCADE,
  method text NOT NULL DEFAULT 'sts',
  note text,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pheno_reversals_method_check
    CHECK (method IN ('sts', 'colloidal_silver', 'ga3', 'other'))
);

-- APPEND-ONLY: authenticated may read and insert, never update or delete.
GRANT SELECT, INSERT ON public.pheno_reversals TO authenticated;
GRANT ALL ON public.pheno_reversals TO service_role;

ALTER TABLE public.pheno_reversals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pheno_reversals_select_own"
  ON public.pheno_reversals FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "pheno_reversals_insert_own"
  ON public.pheno_reversals FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pheno_keepers k
      WHERE k.id = keeper_id AND k.user_id = auth.uid()
    )
  );

-- Intentionally NO UPDATE and NO DELETE policy: immutable reversal log.

CREATE INDEX pheno_reversals_user_id_idx ON public.pheno_reversals (user_id);
CREATE INDEX pheno_reversals_keeper_idx ON public.pheno_reversals (keeper_id);

-- ---------------------------------------------------------------------------
-- 2. pheno_crosses: cross_type + nullable male parent + conditional parents
-- ---------------------------------------------------------------------------

ALTER TABLE public.pheno_crosses
  ADD COLUMN cross_type text NOT NULL DEFAULT 'standard_f1';

ALTER TABLE public.pheno_crosses
  ADD CONSTRAINT pheno_crosses_cross_type_check
  CHECK (cross_type IN ('standard_f1', 'feminized_cross', 'selfing_s1'));

-- Selfing (S1) has a single parent: the reversed mother pollinates itself, so
-- male_keeper_id is NULL for a self-cross.
ALTER TABLE public.pheno_crosses
  ALTER COLUMN male_keeper_id DROP NOT NULL;

-- Replace the unconditional distinct-parents check with a type-conditional one:
--   - selfing_s1: exactly one parent (male_keeper_id IS NULL),
--   - standard_f1 / feminized_cross: two DISTINCT non-null parents.
ALTER TABLE public.pheno_crosses
  DROP CONSTRAINT pheno_crosses_distinct_parents;

ALTER TABLE public.pheno_crosses
  ADD CONSTRAINT pheno_crosses_parents_by_type CHECK (
    (cross_type = 'selfing_s1' AND male_keeper_id IS NULL)
    OR (
      cross_type IN ('standard_f1', 'feminized_cross')
      AND male_keeper_id IS NOT NULL
      AND male_keeper_id <> female_keeper_id
    )
  );

-- RLS null-male guard: the male-ownership EXISTS check must apply ONLY when a
-- male parent is present. A NULL male would otherwise let the subquery pass
-- trivially, so recreate both write policies with the guarded check.
DROP POLICY "pheno_crosses_insert_own" ON public.pheno_crosses;
CREATE POLICY "pheno_crosses_insert_own"
  ON public.pheno_crosses FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pheno_keepers f
      WHERE f.id = female_keeper_id AND f.user_id = auth.uid()
    )
    AND (
      male_keeper_id IS NULL OR EXISTS (
        SELECT 1 FROM public.pheno_keepers m
        WHERE m.id = male_keeper_id AND m.user_id = auth.uid()
      )
    )
    AND (
      hunt_id IS NULL OR EXISTS (
        SELECT 1 FROM public.pheno_hunts h WHERE h.id = hunt_id AND h.user_id = auth.uid()
      )
    )
  );

DROP POLICY "pheno_crosses_update_own" ON public.pheno_crosses;
CREATE POLICY "pheno_crosses_update_own"
  ON public.pheno_crosses FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pheno_keepers f
      WHERE f.id = female_keeper_id AND f.user_id = auth.uid()
    )
    AND (
      male_keeper_id IS NULL OR EXISTS (
        SELECT 1 FROM public.pheno_keepers m
        WHERE m.id = male_keeper_id AND m.user_id = auth.uid()
      )
    )
    AND (
      hunt_id IS NULL OR EXISTS (
        SELECT 1 FROM public.pheno_hunts h WHERE h.id = hunt_id AND h.user_id = auth.uid()
      )
    )
  );

CREATE INDEX pheno_crosses_cross_type_idx ON public.pheno_crosses (cross_type);
