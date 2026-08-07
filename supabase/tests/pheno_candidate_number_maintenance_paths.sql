-- =============================================================================
-- Pheno candidate number — maintenance paths + declarative membership
--
-- Covers 20260806230020_candidate_number_maintenance_paths, which fixed three
-- defects in the 20260712010343 guard:
--   1. deleting a pheno hunt OR a grow raised 42501 when an affected plant
--      carried a candidate_number, for every caller without a JWT (SQL editor,
--      psql, migrations, pg_cron) — the guard's own auto-clear was mistaken for
--      a caller-initiated number write;
--   2. "a number requires a hunt" was trigger-only, so any trigger-disabled
--      window (pg_restore --disable-triggers, bulk load) could leave strays;
--   3. the service_role bypass was documented more broadly than it behaves.
--
-- Also re-asserts what the fix deliberately PRESERVED: a non-owner still cannot
-- clear a number by untagging, and a caller without a JWT still cannot set one.
--
-- Run (local Supabase shell). owner_id must be an existing auth.users id that
-- holds an active Pheno Tracker entitlement (assignment is Pro-gated):
--   psql "$DB_URL" -v owner_id=<uuid> \
--     -f supabase/tests/pheno_candidate_number_maintenance_paths.sql
--
-- pgTAP-free. Runs in a transaction that is rolled back; ON_ERROR_STOP makes any
-- hard failure a non-zero psql exit. Reports exact pass/fail counts and RAISEs if
-- any check fails.
-- =============================================================================
\set ON_ERROR_STOP on

\if :{?owner_id}
\else
  \echo '*** owner_id not set - pass: psql -v owner_id=<uuid> ***'
  DO $$ BEGIN RAISE EXCEPTION 'owner_id psql variable not provided'; END $$;
\endif

BEGIN;

-- psql cannot interpolate into a dollar-quoted block; hand the value over a GUC.
SELECT set_config('pcnmp.owner_id', :'owner_id', true);

DO $suite$
DECLARE
  v_owner  uuid := nullif(current_setting('pcnmp.owner_id', true), '')::uuid;
  v_other  uuid := gen_random_uuid();   -- JWT sub only; never an FK
  v_pass   int  := 0;
  v_fail   int  := 0;
  v_grow   uuid;
  v_hunt   uuid;
  v_plant  uuid;
  v_plant2 uuid;
  v_state  text;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'contract prerequisite: owner_id must be provided as an auth.users id';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_owner) THEN
    RAISE EXCEPTION 'owner_id % is not an existing auth.users id', v_owner;
  END IF;

  -- ---- structural: declarative membership constraint exists and is valid ----
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'plants_candidate_number_requires_hunt_chk'
       AND conrelid = 'public.plants'::regclass
       AND convalidated
  ) THEN
    v_pass := v_pass + 1;
    RAISE NOTICE 'PASS  membership CHECK present and validated';
  ELSE
    v_fail := v_fail + 1;
    RAISE WARNING 'FAIL  membership CHECK missing or not validated';
  END IF;

  -- ---- fixture: owner-owned grow + hunt + numbered plant --------------------
  INSERT INTO public.grows(user_id, name) VALUES (v_owner, 'mp-test grow') RETURNING id INTO v_grow;
  INSERT INTO public.pheno_hunts(user_id, grow_id, name) VALUES (v_owner, v_grow, 'mp-test hunt') RETURNING id INTO v_hunt;
  INSERT INTO public.plants(user_id, grow_id, pheno_hunt_id, name)
    VALUES (v_owner, v_grow, v_hunt, 'mp-test plant') RETURNING id INTO v_plant;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  UPDATE public.plants SET candidate_number = 7 WHERE id = v_plant;
  IF (SELECT candidate_number FROM public.plants WHERE id = v_plant) IS DISTINCT FROM 7 THEN
    RAISE EXCEPTION 'fixture: owner could not assign candidate_number (Pro entitlement active for %?)', v_owner;
  END IF;

  -- ---- FIX 1a: hunt DELETE with no JWT succeeds and clears the number -------
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    DELETE FROM public.pheno_hunts WHERE id = v_hunt;
    IF (SELECT candidate_number FROM public.plants WHERE id = v_plant) IS NULL THEN
      v_pass := v_pass + 1;
      RAISE NOTICE 'PASS  hunt DELETE without a JWT succeeds and clears the number';
    ELSE
      v_fail := v_fail + 1;
      RAISE WARNING 'FAIL  hunt DELETE left a stale candidate_number';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail + 1;
    RAISE WARNING 'FAIL  hunt DELETE without a JWT was blocked [%]', SQLSTATE;
  END;

  -- ---- FIX 1d: grow DELETE with no JWT succeeds; plant retained -------------
  INSERT INTO public.pheno_hunts(user_id, grow_id, name) VALUES (v_owner, v_grow, 'mp-test hunt 2') RETURNING id INTO v_hunt;
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  UPDATE public.plants SET pheno_hunt_id = v_hunt WHERE id = v_plant;
  UPDATE public.plants SET candidate_number = 3 WHERE id = v_plant;

  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    DELETE FROM public.grows WHERE id = v_grow;
    SELECT CASE WHEN candidate_number IS NULL AND pheno_hunt_id IS NULL THEN 'clean' ELSE 'stale' END
      INTO v_state FROM public.plants WHERE id = v_plant;
    IF v_state = 'clean' THEN
      v_pass := v_pass + 1;
      RAISE NOTICE 'PASS  grow DELETE without a JWT succeeds; plant retained, number cleared';
    ELSE
      v_fail := v_fail + 1;
      RAISE WARNING 'FAIL  grow DELETE left the plant %', v_state;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail + 1;
    RAISE WARNING 'FAIL  grow DELETE without a JWT was blocked [%]', SQLSTATE;
  END;

  -- ---- rebuild fixture for the remaining cases -----------------------------
  INSERT INTO public.grows(user_id, name) VALUES (v_owner, 'mp-test grow b') RETURNING id INTO v_grow;
  INSERT INTO public.pheno_hunts(user_id, grow_id, name) VALUES (v_owner, v_grow, 'mp-test hunt b') RETURNING id INTO v_hunt;
  INSERT INTO public.plants(user_id, grow_id, pheno_hunt_id, name)
    VALUES (v_owner, v_grow, v_hunt, 'mp-test plant b') RETURNING id INTO v_plant;
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  UPDATE public.plants SET candidate_number = 5 WHERE id = v_plant;

  -- ---- FIX 2: stray rejected declaratively, trigger disabled --------------
  -- Back to the session user: ALTER TABLE requires table ownership, which the
  -- 'authenticated' role does not have.
  PERFORM set_config('role', 'none', true);
  ALTER TABLE public.plants DISABLE TRIGGER trg_plants_candidate_number_guard;
  BEGIN
    INSERT INTO public.plants(user_id, grow_id, pheno_hunt_id, candidate_number, name)
      VALUES (v_owner, NULL, NULL, 42, 'mp-stray');
    v_fail := v_fail + 1;
    RAISE WARNING 'FAIL  stray number accepted while the trigger was disabled';
  EXCEPTION WHEN check_violation THEN
    v_pass := v_pass + 1;
    RAISE NOTICE 'PASS  stray number rejected declaratively with the trigger disabled';
  END;
  ALTER TABLE public.plants ENABLE TRIGGER trg_plants_candidate_number_guard;

  -- ---- PRESERVED: the GUARD refuses a non-owner clearing by untagging ------
  -- Deliberately left under the session role rather than 'authenticated'. As
  -- 'authenticated' with a foreign sub, RLS ("Users update own plants" /
  -- "Operators update all plants") would filter this UPDATE to zero rows, the
  -- trigger would never fire, and a no-op would be misread as a guard failure.
  -- RLS is a separate, already-covered layer; what must be asserted here is that
  -- a caller who DOES reach the row (e.g. an operator via the operator policy)
  -- is still refused by the guard itself.
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
  BEGIN
    UPDATE public.plants SET pheno_hunt_id = NULL WHERE id = v_plant;
    IF NOT FOUND THEN
      v_fail := v_fail + 1;
      RAISE WARNING 'FAIL  non-owner untag matched zero rows - the guard was never exercised';
    ELSE
      v_fail := v_fail + 1;
      RAISE WARNING 'FAIL  a non-owner cleared a candidate number by untagging';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    v_pass := v_pass + 1;
    RAISE NOTICE 'PASS  the guard refuses a non-owner clearing a number by untagging';
  END;

  -- ---- PRESERVED: a caller without a JWT cannot explicitly set a number ----
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  INSERT INTO public.plants(user_id, grow_id, pheno_hunt_id, name)
    VALUES (v_owner, v_grow, v_hunt, 'mp-test plant c') RETURNING id INTO v_plant2;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    UPDATE public.plants SET candidate_number = 9 WHERE id = v_plant2;
    v_fail := v_fail + 1;
    RAISE WARNING 'FAIL  a caller without a JWT explicitly set a candidate number';
  EXCEPTION WHEN insufficient_privilege THEN
    v_pass := v_pass + 1;
    RAISE NOTICE 'PASS  a caller without a JWT still cannot set a number';
  END;

  RAISE NOTICE '-----------------------------------------------';
  RAISE NOTICE 'maintenance-paths contract: % passed, % failed', v_pass, v_fail;
  IF v_fail > 0 THEN
    RAISE EXCEPTION 'pheno candidate-number maintenance-paths contract FAILED (% failures)', v_fail;
  END IF;
END
$suite$;

ROLLBACK;
