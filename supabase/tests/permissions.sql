-- Reward-system permission & RLS test suite.
-- Run with: psql "$SUPABASE_DB_URL" -f supabase/tests/permissions.sql
-- Each block uses SAVEPOINTs so role switches & expected failures don't poison the session.
-- All assertions use plain SQL; failures raise via ASSERT.

\set ON_ERROR_STOP on
BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. EXECUTE privileges on reward functions
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
  expected JSONB := '{
    "award_nugs":                     {"anon": false, "authenticated": true},
    "max_level_for_user":             {"anon": false, "authenticated": false},
    "handle_new_user":                {"anon": false, "authenticated": false},
    "recompute_level_after_harvest":  {"anon": false, "authenticated": false}
  }'::jsonb;
  fn TEXT; role_name TEXT; want BOOLEAN; got BOOLEAN;
BEGIN
  FOR fn IN SELECT jsonb_object_keys(expected) LOOP
    FOR role_name IN SELECT jsonb_object_keys(expected -> fn) LOOP
      want := (expected -> fn ->> role_name)::boolean;
      SELECT bool_or(has_function_privilege(role_name, p.oid, 'EXECUTE'))
        INTO got
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = fn;
      ASSERT got = want,
        format('EXECUTE on %I for %I: expected %s, got %s', fn, role_name, want, got);
    END LOOP;
  END LOOP;
  RAISE NOTICE '✓ function EXECUTE privileges correct';
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. anon cannot call award_nugs (permission denied at GRANT layer)
-- ────────────────────────────────────────────────────────────────────────────
SAVEPOINT anon_award;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.award_nugs('daily_log', 25, '{}'::jsonb, NULL);
    RAISE EXCEPTION 'expected permission denied for anon, but call succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '✓ anon blocked from award_nugs';
  END;
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT anon_award;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. authenticated without auth.uid() cannot earn (function raises)
-- ────────────────────────────────────────────────────────────────────────────
SAVEPOINT auth_no_uid;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.award_nugs('daily_log', 25, '{}'::jsonb, NULL);
    RAISE EXCEPTION 'expected award_nugs to raise without auth.uid(), but it succeeded';
  EXCEPTION WHEN raise_exception OR others THEN
    RAISE NOTICE '✓ authenticated without uid is rejected by award_nugs';
  END;
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT auth_no_uid;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. RLS still blocks cross-user reads on reward tables
--    Simulate two users by setting request.jwt.claims and switching to authenticated.
-- ────────────────────────────────────────────────────────────────────────────
SAVEPOINT cross_user;

-- seed two synthetic profiles & events (bypasses RLS — we're still superuser here)
WITH ids AS (
  SELECT '11111111-1111-1111-1111-111111111111'::uuid AS u1,
         '22222222-2222-2222-2222-222222222222'::uuid AS u2
)
INSERT INTO public.profiles (user_id, display_name, nugs_total, level, tier)
SELECT u1, 'tester1', 100, 1, 'seedling' FROM ids
UNION ALL
SELECT u2, 'tester2', 200, 2, 'seedling' FROM ids
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.nug_events (user_id, kind, amount, meta)
VALUES ('11111111-1111-1111-1111-111111111111', 'daily_log', 25, '{}'::jsonb),
       ('22222222-2222-2222-2222-222222222222', 'daily_log', 25, '{}'::jsonb);

INSERT INTO public.unlocks (user_id, key)
VALUES ('11111111-1111-1111-1111-111111111111', 'grow_badge'),
       ('22222222-2222-2222-2222-222222222222', 'grow_badge')
ON CONFLICT DO NOTHING;

-- Act as user 1 — should see only their row across each reward table
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE c INT;
BEGIN
  SELECT count(*) INTO c FROM public.profiles;
  ASSERT c = 1, format('profiles: user1 should see 1 row, saw %s', c);

  SELECT count(*) INTO c FROM public.nug_events;
  ASSERT c = 1, format('nug_events: user1 should see 1 row, saw %s', c);

  SELECT count(*) INTO c FROM public.unlocks;
  ASSERT c = 1, format('unlocks: user1 should see 1 row, saw %s', c);

  SELECT count(*) INTO c FROM public.profiles
   WHERE user_id = '22222222-2222-2222-2222-222222222222';
  ASSERT c = 0, 'user1 must not see user2 profile';

  RAISE NOTICE '✓ RLS isolates reward tables per-user';
END $$;

RESET ROLE;
ROLLBACK TO SAVEPOINT cross_user;

ROLLBACK; -- nothing in this suite should persist
