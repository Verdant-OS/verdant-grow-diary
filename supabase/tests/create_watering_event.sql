-- Structured permission tests for public.create_watering_event and the
-- supporting watering_events table. Sibling to create_feeding_event.sql.
-- Run with:
--   psql "$SUPABASE_DB_URL" -f supabase/tests/create_watering_event.sql
--
-- After the 2026-07-22 irrigation-evidence trust-boundary revoke, this RPC
-- is server-only. Runtime execution requires auth.uid() (SECURITY INVOKER),
-- so we verify ACL POSSESSION here rather than execution — a service_role
-- call cannot supply user identity.

\set ON_ERROR_STOP on
BEGIN;

-- 1. RLS enabled on watering_events.
DO $$
DECLARE enabled BOOLEAN;
BEGIN
  SELECT relrowsecurity INTO enabled
    FROM pg_class WHERE oid = 'public.watering_events'::regclass;
  ASSERT enabled, 'RLS not enabled on public.watering_events';
  RAISE NOTICE '✓ RLS enabled on watering_events';
END $$;

-- 2. Required owner-scoped policies exist.
DO $$
DECLARE need TEXT; missing TEXT := '';
BEGIN
  FOREACH need IN ARRAY ARRAY[
    'Users view own watering_events',
    'Users insert own watering_events',
    'Users update own watering_events',
    'Users delete own watering_events'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'watering_events'
         AND policyname = need
    ) THEN
      missing := missing || ' • ' || need || E'\n';
    END IF;
  END LOOP;
  ASSERT missing = '',
    'missing watering_events policies:'||E'\n'||missing;
  RAISE NOTICE '✓ watering_events has required owner-scoped policies';
END $$;

-- 3. EXECUTE grants on create_watering_event: anon FALSE, authenticated FALSE,
--    service_role TRUE. Legacy typed-event RPC is server-only after the
--    2026-07-22 revoke. Canonical writes go through quicklog_save_event.
--
-- Preflight: the function itself must exist. A missing function would make
-- every EXECUTE check trivially "expected=false, got=false" for anon/auth and
-- silently pass — that's a false green. Fail loudly and distinctly instead.
DO $$
DECLARE fn_count INT;
BEGIN
  SELECT count(*) INTO fn_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_watering_event';
  ASSERT fn_count > 0,
    'DIAGNOSTIC[missing-function]: public.create_watering_event does not exist — '
    'apply the legacy typed-event RPC migration before asserting its ACL.';
  RAISE NOTICE '✓ create_watering_event is present (% overload(s))', fn_count;
END $$;

DO $$
DECLARE want JSONB := '{
    "anon": false,
    "authenticated": false,
    "service_role": true
  }'::jsonb;
  role_name TEXT; expected BOOLEAN;
  overload_count BIGINT; granted_count BIGINT;
BEGIN
  FOR role_name IN SELECT jsonb_object_keys(want) LOOP
    expected := (want ->> role_name)::boolean;
    SELECT count(*),
           count(*) FILTER (
             WHERE has_function_privilege(role_name, p.oid, 'EXECUTE')
           )
      INTO overload_count, granted_count
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'create_watering_event';
    ASSERT overload_count > 0,
      'DIAGNOSTIC[missing-function]: create_watering_event missing while checking EXECUTE overload matrix';
    ASSERT (
      expected AND granted_count = overload_count
    ) OR (
      NOT expected AND granted_count = 0
    ), format(
      'DIAGNOSTIC[genuine-permission-mismatch]: EXECUTE create_watering_event for %I: expected all=%s, granted=%s/%s '
      '(function present, ACL disagrees with trust-boundary contract)',
      role_name, expected, granted_count, overload_count
    );
  END LOOP;
  RAISE NOTICE '✓ every create_watering_event overload is server-only (service_role)';
END $$;

-- 4. Function is SECURITY INVOKER (never SECURITY DEFINER).
DO $$
DECLARE is_def BOOLEAN;
BEGIN
  SELECT bool_or(p.prosecdef)
    INTO is_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_watering_event';
  ASSERT is_def IS NOT NULL,
    'DIAGNOSTIC[missing-function]: create_watering_event not found while checking SECURITY INVOKER';
  ASSERT is_def = false,
    'DIAGNOSTIC[security-mode-mismatch]: create_watering_event must be SECURITY INVOKER, not SECURITY DEFINER';
  RAISE NOTICE '✓ create_watering_event is SECURITY INVOKER';
END $$;

-- 5. Table-level DML ACL preservation:
--   * service_role retains SELECT/INSERT/UPDATE/DELETE on watering_events.
--   * anon and authenticated retain SELECT (RLS still filters per row) but must
--     NOT possess INSERT/UPDATE/DELETE at the table-privilege level after the
--     2026-07-22 irrigation-evidence trust-boundary revoke.
DO $$
DECLARE
  want JSONB := '{
    "anon":          {"SELECT": true,  "INSERT": false, "UPDATE": false, "DELETE": false},
    "authenticated": {"SELECT": true,  "INSERT": false, "UPDATE": false, "DELETE": false},
    "service_role":  {"SELECT": true,  "INSERT": true,  "UPDATE": true,  "DELETE": true}
  }'::jsonb;
  role_name TEXT; priv TEXT; expected BOOLEAN; got BOOLEAN;
BEGIN
  ASSERT to_regclass('public.watering_events') IS NOT NULL,
    'DIAGNOSTIC[missing-table]: public.watering_events not found while checking table ACL';
  FOR role_name IN SELECT jsonb_object_keys(want) LOOP
    FOR priv IN SELECT jsonb_object_keys(want -> role_name) LOOP
      expected := ((want -> role_name) ->> priv)::boolean;
      got := has_table_privilege(role_name, 'public.watering_events', priv);
      ASSERT got = expected,
        format('DIAGNOSTIC[table-acl-mismatch]: watering_events %s for %I: expected=%s got=%s '
               '(table present, ACL disagrees with trust-boundary contract)',
               priv, role_name, expected, got);
    END LOOP;
  END LOOP;
  RAISE NOTICE '✓ watering_events table DML ACL matches trust-boundary contract';
END $$;

-- 6. Parent grow_events table DML ACL: same contract (canonical RPC only for
--    authenticated writes; service_role retains admin/backfill DML).
DO $$
DECLARE
  want JSONB := '{
    "anon":          {"SELECT": true,  "INSERT": false, "UPDATE": false, "DELETE": false},
    "authenticated": {"SELECT": true,  "INSERT": false, "UPDATE": false, "DELETE": false},
    "service_role":  {"SELECT": true,  "INSERT": true,  "UPDATE": true,  "DELETE": true}
  }'::jsonb;
  role_name TEXT; priv TEXT; expected BOOLEAN; got BOOLEAN;
BEGIN
  ASSERT to_regclass('public.grow_events') IS NOT NULL,
    'DIAGNOSTIC[missing-table]: public.grow_events not found while checking table ACL';
  FOR role_name IN SELECT jsonb_object_keys(want) LOOP
    FOR priv IN SELECT jsonb_object_keys(want -> role_name) LOOP
      expected := ((want -> role_name) ->> priv)::boolean;
      got := has_table_privilege(role_name, 'public.grow_events', priv);
      ASSERT got = expected,
        format('DIAGNOSTIC[table-acl-mismatch]: grow_events %s for %I: expected=%s got=%s '
               '(table present, ACL disagrees with trust-boundary contract)',
               priv, role_name, expected, got);
    END LOOP;
  END LOOP;
  RAISE NOTICE '✓ grow_events table DML ACL matches trust-boundary contract';
END $$;

ROLLBACK;
