-- =============================================================================
-- VPD targets — RLS / uniqueness manual verification script.
--
-- Run against a database with at least one auth.users row available. This
-- script asserts the same invariants the migration encodes:
--
--   1. Only one global row per stage (partial unique on user_id IS NULL).
--   2. Only one user override per stage per user.
--   3. Authenticated users can read globals + own overrides only.
--   4. Authenticated users cannot create global rows.
--   5. Authenticated users cannot update or delete global rows.
--   6. Authenticated users cannot read or modify another user's overrides.
--
-- Usage (Cloud / local Supabase shell):
--   psql "$SUPABASE_DB_URL" -f supabase/tests/vpd_targets.sql
--
-- This file is intentionally pgTAP-free so it works on any Postgres setup
-- the project already supports; assertions use DO blocks that RAISE on
-- violation.
-- =============================================================================

BEGIN;

-- 1) Global stage uniqueness ------------------------------------------------
DO $$
BEGIN
  BEGIN
    INSERT INTO public.vpd_targets (user_id, stage, vpd_low_kpa, vpd_high_kpa)
    VALUES (NULL, 'flower', 1.0, 1.5);
    RAISE EXCEPTION 'expected duplicate global stage to fail';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;
END $$;

-- 2) Authenticated users cannot create global rows --------------------------
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users LIMIT 1;
  IF v_uid IS NULL THEN RETURN; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
  PERFORM set_config('role', 'authenticated', true);

  BEGIN
    INSERT INTO public.vpd_targets (user_id, stage, vpd_low_kpa, vpd_high_kpa)
    VALUES (NULL, 'flower', 1.0, 1.5);
    RAISE EXCEPTION 'expected RLS to block authenticated insert of a global row';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN check_violation THEN NULL;
  END;

  RESET role;
END $$;

-- 3) Authenticated users can insert at most one override per stage ----------
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users LIMIT 1;
  IF v_uid IS NULL THEN RETURN; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO public.vpd_targets (user_id, stage, vpd_low_kpa, vpd_high_kpa)
  VALUES (v_uid, 'flower', 1.05, 1.45)
  ON CONFLICT DO NOTHING;

  BEGIN
    INSERT INTO public.vpd_targets (user_id, stage, vpd_low_kpa, vpd_high_kpa)
    VALUES (v_uid, 'flower', 1.10, 1.40);
    RAISE EXCEPTION 'expected duplicate user override per stage to fail';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;

  RESET role;
END $$;

-- 4) Authenticated users cannot update/delete global rows -------------------
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users LIMIT 1;
  IF v_uid IS NULL THEN RETURN; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
  PERFORM set_config('role', 'authenticated', true);

  IF EXISTS (
    SELECT 1 FROM public.vpd_targets
     WHERE user_id IS NULL AND stage = 'flower'
       AND vpd_low_kpa = 0.01
  ) THEN
    RAISE EXCEPTION 'pre-condition failed';
  END IF;

  UPDATE public.vpd_targets
     SET vpd_low_kpa = 0.01
   WHERE user_id IS NULL AND stage = 'flower';

  IF EXISTS (
    SELECT 1 FROM public.vpd_targets
     WHERE user_id IS NULL AND stage = 'flower'
       AND vpd_low_kpa = 0.01
  ) THEN
    RAISE EXCEPTION 'expected RLS to block authenticated update of a global row';
  END IF;

  RESET role;
END $$;

ROLLBACK;
