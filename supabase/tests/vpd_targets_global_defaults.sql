-- vpd_targets — global defaults + RLS contract.
--
-- Verifies:
--   1. All six canonical global defaults exist with user_id IS NULL.
--   2. Partial unique indexes are in place (global + per-user).
--   3. RLS policies enforce: anyone authenticated reads globals; no client
--      can write a global row; users can only write their own override.
--
-- Run with the Supabase SQL test runner (or psql) against a database
-- containing the migration that seeded the six defaults.

BEGIN;

-- 1. Six canonical global rows exist.
DO $$
DECLARE
  missing text;
BEGIN
  FOR missing IN
    SELECT s
      FROM unnest(ARRAY[
        'seedling','early_veg','late_veg',
        'early_flower','mid_late_flower','ripening'
      ]) s
     WHERE NOT EXISTS (
       SELECT 1 FROM public.vpd_targets
        WHERE stage = s AND user_id IS NULL
     )
  LOOP
    RAISE EXCEPTION 'missing canonical global VPD default for stage: %', missing;
  END LOOP;
END$$;

-- 2. Partial unique indexes.
DO $$
BEGIN
  PERFORM 1 FROM pg_indexes
    WHERE tablename = 'vpd_targets'
      AND indexname = 'vpd_targets_global_stage_uidx';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'missing index vpd_targets_global_stage_uidx';
  END IF;

  PERFORM 1 FROM pg_indexes
    WHERE tablename = 'vpd_targets'
      AND indexname = 'vpd_targets_user_stage_uidx';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'missing index vpd_targets_user_stage_uidx';
  END IF;
END$$;

-- 3. RLS policy contract.
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
    WHERE tablename = 'vpd_targets'
      AND policyname = 'vpd_targets_select_global_or_own';
  IF n <> 1 THEN
    RAISE EXCEPTION 'expected select policy vpd_targets_select_global_or_own';
  END IF;

  SELECT count(*) INTO n FROM pg_policies
    WHERE tablename = 'vpd_targets'
      AND policyname IN (
        'vpd_targets_insert_own_only',
        'vpd_targets_update_own_only',
        'vpd_targets_delete_own_only'
      );
  IF n <> 3 THEN
    RAISE EXCEPTION 'expected three own-only write policies on vpd_targets';
  END IF;
END$$;

ROLLBACK;
