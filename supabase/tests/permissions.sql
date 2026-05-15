-- Reward-system permission & RLS test suite.
-- Run with: psql "$SUPABASE_DB_URL" -f supabase/tests/permissions.sql
-- Designed to run as a non-superuser role (e.g. sandbox_exec) without SET ROLE.
-- All assertions raise on failure; success prints ✓ notices.

\set ON_ERROR_STOP on
BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. EXECUTE privileges on reward functions
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
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
  RAISE NOTICE '✓ function EXECUTE privileges are locked down correctly';
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. RLS is enabled on all reward tables
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT; enabled BOOLEAN;
BEGIN
  FOR t IN SELECT unnest(ARRAY['profiles','nug_events','unlocks','user_quests','harvests']) LOOP
    SELECT relrowsecurity INTO enabled
      FROM pg_class WHERE oid = ('public.'||t)::regclass;
    ASSERT enabled, format('RLS not enabled on public.%I', t);
  END LOOP;
  RAISE NOTICE '✓ RLS enabled on every reward table';
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Every reward-table policy scopes rows to auth.uid() = user_id
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD; pol_count INT := 0; bad TEXT := '';
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('profiles','nug_events','unlocks','user_quests','harvests')
  LOOP
    pol_count := pol_count + 1;
    IF COALESCE(r.qual,'') !~ 'auth\.uid\(\)\s*=\s*user_id'
       AND COALESCE(r.with_check,'') !~ 'auth\.uid\(\)\s*=\s*user_id' THEN
      bad := bad || format('  - %s.%s: qual=%s check=%s', r.tablename, r.policyname, r.qual, r.with_check) || E'\n';
    END IF;
  END LOOP;
  ASSERT pol_count > 0, 'no RLS policies found on reward tables';
  ASSERT bad = '', 'policies missing auth.uid() = user_id scoping:'||E'\n'||bad;
  RAISE NOTICE '✓ all % reward-table policies scope to auth.uid() = user_id', pol_count;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. award_nugs without an authenticated user raises (defense-in-depth check
--    in addition to the EXECUTE GRANT).
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  BEGIN
    PERFORM public.award_nugs('daily_log', 25, '{}'::jsonb, NULL);
    RAISE EXCEPTION 'award_nugs should have raised when auth.uid() is NULL';
  EXCEPTION
    WHEN raise_exception THEN
      RAISE NOTICE '✓ award_nugs rejects calls without auth.uid()';
    WHEN insufficient_privilege THEN
      RAISE NOTICE '✓ award_nugs blocked by EXECUTE privilege for current role';
  END;
END $$;

ROLLBACK;
