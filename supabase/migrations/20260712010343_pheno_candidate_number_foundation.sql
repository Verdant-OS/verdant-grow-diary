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
--   * A tagged plant cannot be moved to a different grow (untag first), and,
--     symmetrically, a hunt with numbered candidate plants cannot change its
--     grow/owner (a separate pheno_hunts guard; clear those numbers first).
--   * Changing or detaching the hunt clears the number (never carries across
--     hunts; retagging requires a fresh manual assignment).
--   * Authorization: only the owning grower (auth.uid() = plants.user_id) may set
--     or clear the number. Operators — who can otherwise UPDATE plants — may read
--     it but may not assign, change, or clear it. service_role bypasses these
--     write guards for exceptional repair / migrations / test setup only.
--   * Pro gate: SETTING a candidate number additionally requires the owner to hold
--     an active Pheno Tracker entitlement (public.has_pheno_tracker_entitlement),
--     matching the restrictive pheno_* write policies. Clearing/detach stays
--     allowed even if the plan lapsed.
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

  -- 2. A hunt-tagged plant cannot have its grow changed AT ALL while tagged —
  --    neither moved to another grow nor cleared to NULL; untag it first. (Grow
  --    DELETION is handled up front by trg_grows_detach_pheno_plants below, which
  --    untags affected plants before the ON DELETE SET NULL runs, so a legitimate
  --    grow delete never trips this.)
  IF TG_OP = 'UPDATE'
     AND NEW.grow_id IS DISTINCT FROM OLD.grow_id
     AND NEW.pheno_hunt_id IS NOT NULL THEN
    RAISE EXCEPTION 'cannot change the grow of a hunt-tagged plant; untag it first'
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

    -- Pheno candidate numbering is a Pro feature: SETTING a number additionally
    -- requires the owner to hold an active entitlement, matching the restrictive
    -- has_pheno_tracker_entitlement policies on the pheno_* tables (candidate_number
    -- lives on plants, which those policies don't cover). Clearing a number
    -- (untag / detach) stays allowed for a lapsed owner winding down.
    IF NEW.candidate_number IS NOT NULL
       AND NOT public.has_pheno_tracker_entitlement(v_current_owner) THEN
      RAISE EXCEPTION 'assigning a pheno candidate number requires an active Pro (Pheno Tracker) subscription'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Immutability within the same hunt: a set number cannot be changed or cleared
    -- in place (untag to clear). Initial NULL->positive is allowed.
    IF TG_OP = 'UPDATE' AND NOT v_hunt_changed AND OLD.candidate_number IS NOT NULL THEN
      RAISE EXCEPTION 'the pheno candidate number is immutable within a hunt; untag to clear it'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- 5. Lineage: when tagged, the hunt must share the plant's grow AND owner. Grow
  --    changes on tagged plants are already rejected in step 2, and grow deletion
  --    detaches plants first (trg_grows_detach_pheno_plants), so NEW.grow_id here
  --    is always the plant's real grow — a strict equality is correct and also
  --    keeps a plant from ever referencing another owner's hunt.
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

-- =============================================================================
-- pheno_hunts_numbered_move_guard
--
-- The plants trigger only fires on plant writes, so moving a hunt to a different
-- grow/owner via a pheno_hunts UPDATE would strand candidate_number on plants
-- whose hunt no longer shares their grow/owner. Mirror the plant-side cross-grow
-- rule from the hunt side: a hunt that already has numbered candidate plants
-- cannot change grow or owner — the grower must clear those numbers (untag the
-- plants) first. Enforcement only; never allocates or clears a number itself.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.pheno_hunts_numbered_move_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (NEW.grow_id IS DISTINCT FROM OLD.grow_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id)
     AND EXISTS (
       SELECT 1 FROM public.plants p
        WHERE p.pheno_hunt_id = OLD.id
          AND p.candidate_number IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'cannot change the grow or owner of a pheno hunt with numbered candidate plants; clear their candidate numbers first'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pheno_hunts_numbered_move_guard ON public.pheno_hunts;
CREATE TRIGGER trg_pheno_hunts_numbered_move_guard
  BEFORE UPDATE ON public.pheno_hunts
  FOR EACH ROW EXECUTE FUNCTION public.pheno_hunts_numbered_move_guard();

-- =============================================================================
-- grows_detach_pheno_plants
--
-- Grow deletion nulls plants.grow_id via ON DELETE SET NULL, which would trip the
-- (strict) cross-grow guard on any still-tagged plant. Detach those plants up
-- front so the plant guard clears their candidate_number (hunt change), and the
-- later SET NULL then runs cleanly. This keeps the grow-change guard strict for
-- direct writes while letting ordinary grow deletion succeed and retain plants.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.grows_detach_pheno_plants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.plants
     SET pheno_hunt_id = NULL
   WHERE grow_id = OLD.id
     AND pheno_hunt_id IS NOT NULL;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_grows_detach_pheno_plants ON public.grows;
CREATE TRIGGER trg_grows_detach_pheno_plants
  BEFORE DELETE ON public.grows
  FOR EACH ROW EXECUTE FUNCTION public.grows_detach_pheno_plants();
