-- =============================================================================
-- Pheno candidate numbering — foundation (direct column on public.plants)
--
-- Per the confirmed P.2 contract: candidate numbers live DIRECTLY on plants as a
-- nullable integer. There is no separate table, no RPC, no allocator, no
-- automatic assignment, and no backfill. The grower assigns a number manually,
-- once, through the existing plants write path; guards only enforce positivity,
-- uniqueness, authorization, immutability, clearing, and lineage — they never
-- choose or allocate a number.
--
-- Rules enforced here:
--   * Column: plants.candidate_number integer NULL. NULL = legacy / unassigned.
--   * A non-null number is a positive integer (CHECK).
--   * Unique per HUNT (not per grow): UNIQUE(pheno_hunt_id, candidate_number)
--     for rows where both are non-null. Gaps allowed; the same number may recur
--     in different hunts.
--   * A number requires the plant to be tagged to a pheno hunt.
--   * When tagged, the hunt must share the plant's grow and owner (lineage).
--   * A tagged plant cannot be moved to a different grow (untag first).
--   * Changing or detaching the hunt clears the number (never carries across
--     hunts; retagging requires a fresh manual assignment).
--   * Authorization: only the owning grower (auth.uid() = plants.user_id) may set
--     or clear the number. Operators — who can otherwise UPDATE plants — may read
--     it but may not assign, change, or clear it. service_role bypasses these
--     write guards for exceptional repair / migrations / test setup only.
--   * Immutability: within the same hunt, a non-null number cannot be changed or
--     cleared (the grower must untag to clear).
-- =============================================================================

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS candidate_number integer;

COMMENT ON COLUMN public.plants.candidate_number IS
  'Pheno-hunt candidate number, unique per pheno_hunt_id. NULL = legacy/unassigned. '
  'Owner-assigned once (NULL->positive) via the plants write path; immutable within a '
  'hunt; cleared automatically on detach or hunt change. Operators read-only; '
  'service_role may repair.';

-- Positivity (allows NULL).
ALTER TABLE public.plants
  DROP CONSTRAINT IF EXISTS plants_candidate_number_positive_chk;
ALTER TABLE public.plants
  ADD CONSTRAINT plants_candidate_number_positive_chk
  CHECK (candidate_number IS NULL OR candidate_number > 0);

-- Uniqueness per hunt (partial: only when both columns are non-null).
CREATE UNIQUE INDEX IF NOT EXISTS plants_hunt_candidate_number_uidx
  ON public.plants (pheno_hunt_id, candidate_number)
  WHERE pheno_hunt_id IS NOT NULL AND candidate_number IS NOT NULL;

-- =============================================================================
-- plants_candidate_number_guard
--
-- Enforcement only (never allocates). Fires BEFORE INSERT/UPDATE on plants.
-- Mirrors the repo's column-immutability trigger pattern
-- (current_setting('role') = 'service_role' bypass).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.plants_candidate_number_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_service   boolean := current_setting('role', true) = 'service_role';
  v_hunt_changed boolean := (TG_OP = 'UPDATE' AND NEW.pheno_hunt_id IS DISTINCT FROM OLD.pheno_hunt_id);
  -- The plant's CURRENT owner (OLD on UPDATE, NEW on INSERT). Number authorization
  -- is checked against this, so an operator cannot bypass it by reassigning user_id
  -- to themselves in the same statement.
  v_current_owner uuid := (CASE WHEN TG_OP = 'UPDATE' THEN OLD.user_id ELSE NEW.user_id END);
  v_num_changed  boolean;
  v_lineage_relevant boolean;
BEGIN
  -- 1. A hunt change (including detach to NULL) never carries a number across
  --    hunts: clear it. Clearing is an allowed guard action.
  IF v_hunt_changed THEN
    NEW.candidate_number := NULL;
  END IF;

  v_num_changed := (TG_OP = 'INSERT' AND NEW.candidate_number IS NOT NULL)
                OR (TG_OP = 'UPDATE' AND NEW.candidate_number IS DISTINCT FROM OLD.candidate_number);

  -- Lineage is (re)validated when the tag, grow, or owner changes, on INSERT, and
  -- when the number is (re)assigned — the last so a pre-existing inconsistent tag
  -- cannot be given a number. An unrelated edit to an already-consistent tagged
  -- plant skips the SECURITY INVOKER pheno_hunts lookup entirely, so enforcement
  -- never depends on the writer's RLS visibility of pheno_hunts.
  v_lineage_relevant := (TG_OP = 'INSERT') OR (
    TG_OP = 'UPDATE' AND (
      NEW.pheno_hunt_id IS DISTINCT FROM OLD.pheno_hunt_id
      OR NEW.grow_id IS DISTINCT FROM OLD.grow_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR v_num_changed
    )
  );

  -- 2. A tagged plant cannot move to a different grow; untag first.
  IF TG_OP = 'UPDATE'
     AND NEW.grow_id IS DISTINCT FROM OLD.grow_id
     AND NEW.pheno_hunt_id IS NOT NULL THEN
    RAISE EXCEPTION 'cannot move a hunt-tagged plant to a different grow; untag it first'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 3. A candidate number requires the plant to be tagged to a pheno hunt.
  IF NEW.candidate_number IS NOT NULL AND NEW.pheno_hunt_id IS NULL THEN
    RAISE EXCEPTION 'a candidate number requires the plant to be tagged to a pheno hunt'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 4. Authorization + immutability for number changes (non-service). Runs BEFORE
  --    the RLS-dependent lineage lookup, and is checked against the CURRENT owner,
  --    so an operator always receives the explicit insufficient_privilege — even
  --    when trying to clear a number by detaching and reassigning user_id in one
  --    statement. service_role bypasses.
  IF NOT v_is_service AND v_num_changed THEN
    IF auth.uid() IS NULL OR auth.uid() <> v_current_owner THEN
      RAISE EXCEPTION 'only the owning grower may set or clear the pheno candidate number'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Immutability within the same hunt: a set number cannot be changed or cleared
    -- in place (untag to clear). Initial NULL->positive is allowed.
    IF TG_OP = 'UPDATE' AND NOT v_hunt_changed AND OLD.candidate_number IS NOT NULL THEN
      RAISE EXCEPTION 'the pheno candidate number is immutable within a hunt; untag to clear it'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- 5. Lineage: when tagged, the hunt must share the plant's grow and owner.
  IF v_lineage_relevant AND NEW.pheno_hunt_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.pheno_hunts h
       WHERE h.id = NEW.pheno_hunt_id
         AND h.grow_id = NEW.grow_id
         AND h.user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'pheno hunt % must belong to the same grow and owner as the plant', NEW.pheno_hunt_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_plants_candidate_number_guard ON public.plants;
CREATE TRIGGER trg_plants_candidate_number_guard
  BEFORE INSERT OR UPDATE ON public.plants
  FOR EACH ROW EXECUTE FUNCTION public.plants_candidate_number_guard();
