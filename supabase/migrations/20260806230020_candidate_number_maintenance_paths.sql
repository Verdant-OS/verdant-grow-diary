-- =============================================================================
-- Candidate number — maintenance paths + declarative membership
--
-- Forward fix for three defects confirmed empirically against the shipped
-- 20260712010343 guard (throwaway Postgres, migration applied verbatim over
-- prod-faithful tables and Supabase's real auth.uid()):
--
--  1. Deleting a pheno hunt OR a grow FAILED with 42501 ("only the owning grower
--     may set or clear the pheno candidate number") whenever an affected plant
--     carried a candidate_number, unless the caller was service_role or the
--     owner's JWT. Cause: step 1 clears the number when the hunt changes, which
--     made v_num_changed true, so step 4's authorization check fired even though
--     the WRITER never touched the number. Every no-JWT maintenance context hit
--     this: the Supabase SQL editor, psql, migrations, and pg_cron — as did the
--     FK ON DELETE SET NULL from deleting a hunt and the detach performed by
--     trg_grows_detach_pheno_plants when deleting a grow.
--
--  2. "A candidate number requires a hunt" was enforced only by the trigger, so
--     any window with the trigger disabled (pg_restore --disable-triggers, bulk
--     loads, ALTER TABLE ... DISABLE TRIGGER) could leave orphan numbers that
--     nothing later rejected. Proven: with the guard disabled, inserting
--     candidate_number=42 with pheno_hunt_id=NULL succeeded.
--
--  3. The 20260712010343 header said service_role "bypasses these write guards",
--     but the bypass covers ONLY step 4. service_role is still blocked from
--     moving a tagged plant's grow (23514) and still has numbers silently
--     cleared on any hunt change. Documented here rather than widened.
--
-- Deliberately NOT changed: operators still cannot set, change, or clear a
-- number (including by untagging); owners still need Pro to SET one; clearing
-- stays allowed for a lapsed owner; numbers stay immutable within a hunt and
-- reusable across hunts.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Fix 1 — distinguish an implicit guard clear from a caller-initiated write.
--
-- Only the step 4 condition changes; every other rule is byte-identical to
-- 20260712010343. The number as SUPPLIED BY THE WRITER is captured before step 1
-- can overwrite it, so "did the caller touch the number?" is answerable.
-- -----------------------------------------------------------------------------
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
  -- The number exactly as the writer supplied it, captured BEFORE step 1 may
  -- clear it. This is what separates "the caller wrote a number" from "this
  -- guard cleared one because the hunt went away".
  v_incoming_num integer := NEW.candidate_number;
  v_caller_set_num boolean;
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

  -- Did the WRITER change the number, as opposed to step 1 clearing it? Measured
  -- against the supplied value, so an FK ON DELETE SET NULL or a detach UPDATE
  -- that leaves candidate_number alone reads as false.
  v_caller_set_num := (TG_OP = 'INSERT' AND v_incoming_num IS NOT NULL)
                   OR (TG_OP = 'UPDATE' AND v_incoming_num IS DISTINCT FROM OLD.candidate_number);

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
  --    DELETION is handled up front by trg_grows_detach_pheno_plants, which
  --    untags affected plants before the ON DELETE SET NULL runs, so a legitimate
  --    grow delete never trips this.)
  IF TG_OP = 'UPDATE'
     AND NEW.grow_id IS DISTINCT FROM OLD.grow_id
     AND NEW.pheno_hunt_id IS NOT NULL THEN
    RAISE EXCEPTION 'cannot change the grow of a hunt-tagged plant; untag it first'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 3. A candidate number requires the plant to be tagged to a pheno hunt.
  --    (Also enforced declaratively by plants_candidate_number_requires_hunt_chk.)
  IF NEW.candidate_number IS NOT NULL AND NEW.pheno_hunt_id IS NULL THEN
    RAISE EXCEPTION 'a candidate number requires the plant to be tagged to a pheno hunt'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 4. Authorization + immutability for CALLER-INITIATED number changes
  --    (non-service). Runs BEFORE the RLS-dependent lineage lookup, and is checked
  --    against the CURRENT owner, so an operator always receives the explicit
  --    insufficient_privilege — even when trying to clear a number by detaching
  --    and reassigning user_id in one statement. service_role bypasses.
  --
  --    Maintenance exemption (fix 1): skip these checks when the number is being
  --    cleared solely because THIS GUARD reacted to a hunt change, the writer
  --    never touched the number, and there is no authenticated caller at all.
  --    That is exactly the FK ON DELETE SET NULL / grow-detach / migration /
  --    pg_cron / SQL-editor path. An authenticated non-owner (operator) still
  --    falls through to the checks and is still refused, and a no-JWT caller that
  --    explicitly writes a number is still refused.
  IF NOT v_is_service
     AND v_num_changed
     AND NOT (v_hunt_changed AND NOT v_caller_set_num AND auth.uid() IS NULL) THEN
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

-- -----------------------------------------------------------------------------
-- Fix 3 — record the ACTUAL scope of the service_role bypass on the object
-- itself, so the next reader does not have to re-derive it from the body.
-- -----------------------------------------------------------------------------
COMMENT ON FUNCTION public.plants_candidate_number_guard() IS
  'Enforcement-only guard for plants.candidate_number (never allocates). '
  'service_role bypasses ONLY the step 4 authorization / Pro-entitlement / '
  'immutability checks. It is STILL subject to: auto-clear of the number on any '
  'hunt change, the block on changing a tagged plant''s grow, the '
  'number-requires-a-hunt rule, and the hunt/grow/owner lineage check. A no-JWT '
  'maintenance caller (FK ON DELETE SET NULL, grow detach, migration, pg_cron, '
  'SQL editor) may have a number implicitly cleared by a hunt change, but may '
  'not set or explicitly change one.';

-- -----------------------------------------------------------------------------
-- Fix 2 — make "a number requires a hunt" declarative, so it survives any window
-- where the trigger is disabled. One-way only: a tagged plant may still have a
-- NULL number, which is the whole point of manual assignment.
--
-- Fail loudly and actionably if legacy orphans already exist rather than letting
-- the constraint emit a bare error. The whole migration is one transaction, so a
-- failure here leaves nothing behind.
--
-- The constraint is added NOT VALID here and VALIDATEd in the NEXT migration, on
-- purpose: locks are held until the transaction commits, so validating in this
-- same file would run the full scan while ADD CONSTRAINT's ACCESS EXCLUSIVE lock
-- is still held and block all access to plants. Splitting lets this lock be
-- released at commit, after which VALIDATE takes only SHARE UPDATE EXCLUSIVE and
-- allows concurrent reads and writes. A NOT VALID CHECK is already enforced for
-- every new INSERT/UPDATE, so the intermediate state is safe.
-- -----------------------------------------------------------------------------
DO $$
DECLARE v_orphans bigint;
BEGIN
  SELECT count(*) INTO v_orphans
    FROM public.plants
   WHERE candidate_number IS NOT NULL
     AND pheno_hunt_id IS NULL;

  IF v_orphans > 0 THEN
    RAISE EXCEPTION
      'cannot add plants_candidate_number_requires_hunt_chk: % plant row(s) carry a candidate_number with no pheno_hunt_id. An explicit clear is caller-initiated, so the guard requires service_role — run: BEGIN; SET LOCAL role = ''service_role''; UPDATE public.plants SET candidate_number = NULL WHERE candidate_number IS NOT NULL AND pheno_hunt_id IS NULL; COMMIT;',
      v_orphans;
  END IF;
END $$;

ALTER TABLE public.plants
  DROP CONSTRAINT IF EXISTS plants_candidate_number_requires_hunt_chk;

-- Enforced for all new writes immediately; validated against existing rows by
-- 20260806230021 so this transaction's ACCESS EXCLUSIVE lock is released first.
ALTER TABLE public.plants
  ADD CONSTRAINT plants_candidate_number_requires_hunt_chk
  CHECK (candidate_number IS NULL OR pheno_hunt_id IS NOT NULL) NOT VALID;

NOTIFY pgrst, 'reload schema';
