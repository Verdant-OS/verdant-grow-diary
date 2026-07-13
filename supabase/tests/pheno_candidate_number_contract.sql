-- =============================================================================
-- Pheno candidate number — direct-column contract (public.plants.candidate_number)
--
-- Proves the 20260712010343_pheno_candidate_number_foundation migration:
--   structural: candidate_number is a nullable integer on plants; NO separate
--     pheno_candidate_numbers table and NO allocate_pheno_candidate_number();
--   behavioral: NULL accepted; zero/negative rejected; owner initial assignment;
--     operator/stranger cannot mutate; operator can read; service_role repair;
--     immutability within a hunt; duplicate-per-hunt rejected; same number in a
--     different hunt allowed; mismatched hunt/grow lineage rejected; detach and
--     hunt-change clear the number; tagged plant cannot cross grows; untag-then-
--     move succeeds; retag requires a fresh manual assignment.
--
-- Run (Cloud / local Supabase shell):
--   psql "$SUPABASE_DB_URL" -f supabase/tests/pheno_candidate_number_contract.sql
--
-- pgTAP-free. Requires at least one auth.users row (fails loudly otherwise, never
-- silently skips). Operators/strangers are simulated via user_roles + a JWT sub,
-- so no second real auth user is needed. Runs in a transaction that is rolled
-- back; ON_ERROR_STOP makes any hard failure a non-zero psql exit. Reports exact
-- pass/fail counts and RAISEs if any check fails.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ---- Structural -----------------------------------------------------------
DO $$
DECLARE v_type text; v_nullable text;
BEGIN
  SELECT data_type, is_nullable INTO v_type, v_nullable
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'plants' AND column_name = 'candidate_number';
  IF v_type IS NULL THEN RAISE EXCEPTION 'plants.candidate_number is missing'; END IF;
  IF v_type <> 'integer' THEN RAISE EXCEPTION 'plants.candidate_number must be integer, got %', v_type; END IF;
  IF v_nullable <> 'YES' THEN RAISE EXCEPTION 'plants.candidate_number must be nullable'; END IF;

  IF to_regclass('public.pheno_candidate_numbers') IS NOT NULL THEN
    RAISE EXCEPTION 'pheno_candidate_numbers table must NOT exist (direct-column contract)';
  END IF;
  IF to_regprocedure('public.allocate_pheno_candidate_number(uuid,uuid,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'allocate_pheno_candidate_number() must NOT exist (allocation is prohibited)';
  END IF;
  IF to_regclass('public.plants_hunt_candidate_number_uidx') IS NULL THEN
    RAISE EXCEPTION 'missing UNIQUE(pheno_hunt_id, candidate_number) index';
  END IF;
  RAISE NOTICE 'structural checks passed';
END $$;

-- ---- Behavioral -----------------------------------------------------------
DO $$
DECLARE
  pass int := 0;
  fail int := 0;
  v_owner    uuid;
  v_op       uuid := gen_random_uuid();
  v_stranger uuid := gen_random_uuid();
  gA uuid; gB uuid; hA uuid; hA2 uuid; hB uuid;
  p1 uuid; p2 uuid; p3 uuid; pUn uuid;
  v_num integer;
BEGIN
  SELECT id INTO v_owner FROM auth.users LIMIT 1;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'contract prerequisite: at least one auth.users row is required';
  END IF;

  -- operator role for the simulated operator subject
  INSERT INTO public.user_roles (user_id, role) VALUES (v_op, 'operator')
    ON CONFLICT DO NOTHING;

  -- seed grows / hunts / plants as service_role (bypasses guards + RLS)
  PERFORM set_config('role', 'service_role', true);
  INSERT INTO public.grows (user_id, name) VALUES (v_owner, 'PCN gA') RETURNING id INTO gA;
  INSERT INTO public.grows (user_id, name) VALUES (v_owner, 'PCN gB') RETURNING id INTO gB;
  INSERT INTO public.pheno_hunts (user_id, grow_id, name) VALUES (v_owner, gA, 'hunt A')  RETURNING id INTO hA;
  INSERT INTO public.pheno_hunts (user_id, grow_id, name) VALUES (v_owner, gA, 'hunt A2') RETURNING id INTO hA2;
  INSERT INTO public.pheno_hunts (user_id, grow_id, name) VALUES (v_owner, gB, 'hunt B')  RETURNING id INTO hB;
  INSERT INTO public.plants (user_id, grow_id, pheno_hunt_id, name) VALUES (v_owner, gA, hA, 'p1') RETURNING id INTO p1;
  INSERT INTO public.plants (user_id, grow_id, pheno_hunt_id, name) VALUES (v_owner, gA, hA, 'p2') RETURNING id INTO p2;
  INSERT INTO public.plants (user_id, grow_id, pheno_hunt_id, name) VALUES (v_owner, gA, hA, 'p3') RETURNING id INTO p3;
  INSERT INTO public.plants (user_id, grow_id, name)                 VALUES (v_owner, gA, 'pUntagged') RETURNING id INTO pUn;
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);

  -- 1) NULL accepted (p1 currently NULL)
  BEGIN
    IF (SELECT candidate_number FROM public.plants WHERE id = p1) IS NOT NULL THEN
      RAISE EXCEPTION 'PCN_SENTINEL seed number not null'; END IF;
    pass := pass + 1;
  EXCEPTION WHEN OTHERS THEN fail := fail + 1; RAISE NOTICE 'FAIL null-accepted: %', SQLERRM; END;

  -- 2) zero rejected
  BEGIN
    UPDATE public.plants SET candidate_number = 0 WHERE id = p1;
    RAISE EXCEPTION 'PCN_SENTINEL zero accepted';
  EXCEPTION WHEN check_violation THEN pass := pass + 1;
           WHEN OTHERS THEN fail := fail + 1; RAISE NOTICE 'FAIL zero-rejected: %', SQLERRM; END;

  -- 3) negative rejected
  BEGIN
    UPDATE public.plants SET candidate_number = -1 WHERE id = p1;
    RAISE EXCEPTION 'PCN_SENTINEL negative accepted';
  EXCEPTION WHEN check_violation THEN pass := pass + 1;
           WHEN OTHERS THEN fail := fail + 1; RAISE NOTICE 'FAIL negative-rejected: %', SQLERRM; END;

  -- 4) owner initial assignment NULL -> positive
  BEGIN
    UPDATE public.plants SET candidate_number = 1 WHERE id = p1;
    pass := pass + 1;
  EXCEPTION WHEN OTHERS THEN fail := fail + 1; RAISE NOTICE 'FAIL owner-assign: %', SQLERRM; END;

  -- 5) immutable within the same hunt (change)
  BEGIN
    UPDATE public.plants SET candidate_number = 2 WHERE id = p1;
    RAISE EXCEPTION 'PCN_SENTINEL mutable';
  EXCEPTION WHEN check_violation THEN pass := pass + 1;
           WHEN OTHERS THEN fail := fail + 1; RAISE NOTICE 'FAIL immutable-change: %', SQLERRM; END;

  -- 6) cannot clear in place within the same hunt
  BEGIN
    UPDATE public.plants SET candidate_number = NULL WHERE id = p1;
    RAISE EXCEPTION 'PCN_SENTINEL clearable';
  EXCEPTION WHEN check_violation THEN pass := pass + 1;
           WHEN OTHERS THEN fail := fail + 1; RAISE NOTICE 'FAIL immutable-clear: %', SQLERRM; END;

  -- 7) duplicate number within the same hunt rejected (p2 = 1, same hunt hA)
  BEGIN
    UPDATE public.plants SET candidate_number = 1 WHERE id = p2;
    RAISE EXCEPTION 'PCN_SENTINEL dup';
  EXCEPTION WHEN unique_violation THEN pass := pass + 1;
           WHEN OTHERS THEN fail := fail + 1; RAISE NOTICE 'FAIL dup-per-hunt: %', SQLERRM; END;

  -- 8) operator cannot mutate the number (operator has UPDATE on plants)
  PERFORM set_config('request.jwt.claim.sub', v_op::text, true);
  BEGIN
    UPDATE public.plants SET candidate_number = 9 WHERE id = p2;
    RAISE EXCEPTION 'PCN_SENTINEL operator-mutated';
  EXCEPTION WHEN insufficient_privilege THEN pass := pass + 1;
           WHEN OTHERS THEN fail := fail + 1; RAISE NOTICE 'FAIL operator-cannot-mutate: %', SQLERRM; END;

  -- 9) operator CAN read the number
  BEGIN
    SELECT candidate_number INTO v_num FROM public.plants WHERE id = p1;
    IF v_num = 1 THEN pass := pass + 1;
    ELSE fail := fail + 1; RAISE NOTICE 'FAIL operator-read: got %', v_num; END IF;
  EXCEPTION WHEN OTHERS THEN fail := fail + 1; RAISE NOTICE 'FAIL operator-read: %', SQLERRM; END;

  -- 10) stranger cannot mutate (no RLS update access -> zero rows, number unchanged)
  PERFORM set_config('request.jwt.claim.sub', v_stranger::text, true);
  BEGIN
    UPDATE public.plants SET candidate_number = 7 WHERE id = p1;
    IF (SELECT candidate_number FROM public.plants WHERE id = p1) = 1 THEN pass := pass + 1;
    ELSE fail := fail + 1; RAISE NOTICE 'FAIL stranger-mutated the number'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN pass := pass + 1;  -- also acceptable
           WHEN OTHERS THEN fail := fail + 1; RAISE NOTICE 'FAIL stranger-cannot-mutate: %', SQLERRM; END;

  -- 11) service_role repair may change an immutable number
  PERFORM set_config('role', 'service_role', true);
  BEGIN
    UPDATE public.plants SET candidate_number = 3 WHERE id = p1;
    pass := pass + 1;
  EXCEPTION WHEN OTHERS THEN fail := fail + 1; RAISE NOTICE 'FAIL service-repair: %', SQLERRM; END;
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);

  -- 12) same number allowed in a DIFFERENT hunt (assign 3 to a plant in hunt hB)
  BEGIN
    -- move pUn into gB/hB legitimately first (untagged plant, no number)
    PERFORM set_config('role', 'service_role', true);
    UPDATE public.plants SET grow_id = gB, pheno_hunt_id = hB WHERE id = pUn;
    PERFORM set_config('role', 'authenticated', true);
    UPDATE public.plants SET candidate_number = 3 WHERE id = pUn;  -- 3 also used in hA -> ok, different hunt
    pass := pass + 1;
  EXCEPTION WHEN OTHERS THEN fail := fail + 1; RAISE NOTICE 'FAIL same-number-different-hunt: %', SQLERRM; END;

  -- 13) mismatched hunt/grow lineage rejected (tag a gA plant to hB in gB)
  BEGIN
    UPDATE public.plants SET pheno_hunt_id = hB WHERE id = p3;  -- p3 is in gA, hB is in gB
    RAISE EXCEPTION 'PCN_SENTINEL lineage';
  EXCEPTION WHEN check_violation THEN pass := pass + 1;
           WHEN OTHERS THEN fail := fail + 1; RAISE NOTICE 'FAIL lineage-mismatch: %', SQLERRM; END;

  -- 14) detaching a hunt clears the number (p1 has 3, hunt hA -> NULL)
  BEGIN
    UPDATE public.plants SET pheno_hunt_id = NULL WHERE id = p1;
    IF (SELECT candidate_number FROM public.plants WHERE id = p1) IS NULL THEN pass := pass + 1;
    ELSE fail := fail + 1; RAISE NOTICE 'FAIL detach-clears'; END IF;
  EXCEPTION WHEN OTHERS THEN fail := fail + 1; RAISE NOTICE 'FAIL detach-clears: %', SQLERRM; END;

  -- 15) changing hunt clears the number; retag requires fresh assignment
  BEGIN
    UPDATE public.plants SET candidate_number = 5 WHERE id = p3;      -- assign in hA
    UPDATE public.plants SET pheno_hunt_id = hA2 WHERE id = p3;       -- move to hA2 (same grow)
    IF (SELECT candidate_number FROM public.plants WHERE id = p3) IS NOT NULL THEN
      RAISE EXCEPTION 'PCN_SENTINEL hunt-change did not clear'; END IF;
    -- retag/new hunt has no auto-restored number; a fresh manual assignment works
    UPDATE public.plants SET candidate_number = 5 WHERE id = p3;      -- manual reassign in hA2
    pass := pass + 1;
  EXCEPTION WHEN OTHERS THEN fail := fail + 1; RAISE NOTICE 'FAIL hunt-change-clears-and-retag: %', SQLERRM; END;

  -- 16) tagged plant cannot move across grows
  BEGIN
    UPDATE public.plants SET grow_id = gB WHERE id = p2;  -- p2 tagged hA (gA)
    RAISE EXCEPTION 'PCN_SENTINEL cross-grow';
  EXCEPTION WHEN check_violation THEN pass := pass + 1;
           WHEN OTHERS THEN fail := fail + 1; RAISE NOTICE 'FAIL cross-grow-blocked: %', SQLERRM; END;

  -- 17) untag before moving succeeds
  BEGIN
    UPDATE public.plants SET pheno_hunt_id = NULL WHERE id = p2;  -- untag (clears number)
    UPDATE public.plants SET grow_id = gB WHERE id = p2;          -- now move allowed
    pass := pass + 1;
  EXCEPTION WHEN OTHERS THEN fail := fail + 1; RAISE NOTICE 'FAIL untag-then-move: %', SQLERRM; END;

  PERFORM set_config('role', 'authenticated', false);
  RAISE NOTICE 'pheno_candidate_number contract: % passed, % failed', pass, fail;
  IF fail > 0 THEN
    RAISE EXCEPTION 'pheno_candidate_number contract failed: % of % checks failed', fail, pass + fail;
  END IF;
END $$;

ROLLBACK;
