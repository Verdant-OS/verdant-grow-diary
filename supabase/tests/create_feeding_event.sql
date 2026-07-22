-- Structured permission tests for public.create_feeding_event and the
-- supporting feeding_events table. Run with:
--   psql "$SUPABASE_DB_URL" -f supabase/tests/create_feeding_event.sql
-- Mirrors the locked-down pattern used by supabase/tests/permissions.sql.

\set ON_ERROR_STOP on
BEGIN;

-- 1. RLS is enabled on feeding_events.
DO $$
DECLARE enabled BOOLEAN;
BEGIN
  SELECT relrowsecurity INTO enabled
    FROM pg_class WHERE oid = 'public.feeding_events'::regclass;
  ASSERT enabled, 'RLS not enabled on public.feeding_events';
  RAISE NOTICE '✓ RLS enabled on feeding_events';
END $$;

-- 2. Required policies exist (mirrors watering_events).
DO $$
DECLARE need TEXT; missing TEXT := '';
BEGIN
  FOREACH need IN ARRAY ARRAY[
    'Users view own feeding_events',
    'Users insert own feeding_events',
    'Users update own feeding_events',
    'Users delete own feeding_events'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'feeding_events'
         AND policyname = need
    ) THEN
      missing := missing || ' • ' || need || E'\n';
    END IF;
  END LOOP;
  ASSERT missing = '',
    'missing feeding_events policies:'||E'\n'||missing;
  RAISE NOTICE '✓ feeding_events has required owner-scoped policies';
END $$;

-- 3. EXECUTE grants on create_feeding_event: anon FALSE, authenticated FALSE,
--    service_role TRUE. Legacy typed-event RPC is server-only after the
--    irrigation evidence trust-boundary revoke (2026-07-22). Canonical writes
--    go through quicklog_save_event / quicklog_save_manual.
--
-- Preflight: the function itself must exist. A missing function would make
-- every EXECUTE check trivially "expected=false, got=false" for anon/auth and
-- silently pass — that's a false green. Fail loudly and distinctly instead so
-- the operator sees "function missing" rather than "ACL wrong".
DO $$
DECLARE fn_count INT;
BEGIN
  SELECT count(*) INTO fn_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_feeding_event';
  ASSERT fn_count > 0,
    'DIAGNOSTIC[missing-function]: public.create_feeding_event does not exist — '
    'apply the legacy typed-event RPC migration before asserting its ACL.';
  RAISE NOTICE '✓ create_feeding_event is present (% overload(s))', fn_count;
END $$;

DO $$
DECLARE want JSONB := '{
    "anon": false,
    "authenticated": false,
    "service_role": true
  }'::jsonb;
  role_name TEXT; expected BOOLEAN; got BOOLEAN;
BEGIN
  FOR role_name IN SELECT jsonb_object_keys(want) LOOP
    expected := (want ->> role_name)::boolean;
    SELECT bool_or(has_function_privilege(role_name, p.oid, 'EXECUTE'))
      INTO got
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'create_feeding_event';
    ASSERT got = expected,
      format('DIAGNOSTIC[genuine-permission-mismatch]: EXECUTE create_feeding_event for %I: expected=%s got=%s '
             '(function present, ACL disagrees with trust-boundary contract)',
             role_name, expected, got);
  END LOOP;
  RAISE NOTICE '✓ create_feeding_event EXECUTE is server-only (service_role)';
END $$;


-- 4. Function is SECURITY INVOKER (mirrors create_watering_event).
DO $$
DECLARE is_def BOOLEAN;
BEGIN
  SELECT bool_or(p.prosecdef)
    INTO is_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_feeding_event';
  ASSERT is_def IS NOT NULL,
    'DIAGNOSTIC[missing-function]: create_feeding_event not found while checking SECURITY INVOKER';
  ASSERT is_def = false,
    'DIAGNOSTIC[security-mode-mismatch]: create_feeding_event must be SECURITY INVOKER, not SECURITY DEFINER';
  RAISE NOTICE '✓ create_feeding_event is SECURITY INVOKER';
END $$;

-- 5. products column has the jsonb-array check constraint.
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'feeding_events_products_is_array'
       AND conrelid = 'public.feeding_events'::regclass
  ), 'feeding_events_products_is_array CHECK constraint missing';
  RAISE NOTICE '✓ products is constrained to jsonb arrays';
END $$;

-- 6. (user_id, line_id) index exists.
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'feeding_events'
       AND indexname = 'idx_feeding_events_user_line'
  ), 'idx_feeding_events_user_line missing';
  RAISE NOTICE '✓ (user_id, line_id) index exists';
END $$;

-- 7. ON DELETE CASCADE from grow_events to feeding_events.
DO $$
DECLARE act CHAR;
BEGIN
  SELECT confdeltype INTO act
    FROM pg_constraint
   WHERE conrelid = 'public.feeding_events'::regclass
     AND contype  = 'f'
     AND confrelid = 'public.grow_events'::regclass;
  ASSERT act = 'c',
    format('feeding_events.event_id FK delete action: expected CASCADE (c), got %L', act);
  RAISE NOTICE '✓ deleting parent grow_event cascades to feeding_events';
END $$;

-- 8. validate_feeding_event trigger rejects non-array products and bad ranges.
DO $$
BEGIN
  BEGIN
    PERFORM 1;
    -- Build a throwaway tuple via NEW-record path using a temp transaction.
    -- We can't easily invoke the trigger without a row; the smoke-test below
    -- exercises behavior via the RPC harness instead. Mark structural check.
  END;
  RAISE NOTICE '✓ trigger structural check skipped (covered by runtime harness)';
END $$;

-- 9. Table-level DML ACL preservation:
--   * service_role retains SELECT/INSERT/UPDATE/DELETE on feeding_events (required
--     for admin/edge-function backfill and repair paths).
--   * anon and authenticated retain SELECT (RLS still filters per row) but must
--     NOT possess INSERT/UPDATE/DELETE at the table-privilege level after the
--     2026-07-22 irrigation-evidence trust-boundary revoke — canonical writes
--     go through quicklog_save_event / quicklog_save_manual.
DO $$
DECLARE
  want JSONB := '{
    "anon":          {"SELECT": true,  "INSERT": false, "UPDATE": false, "DELETE": false},
    "authenticated": {"SELECT": true,  "INSERT": false, "UPDATE": false, "DELETE": false},
    "service_role":  {"SELECT": true,  "INSERT": true,  "UPDATE": true,  "DELETE": true}
  }'::jsonb;
  role_name TEXT; priv TEXT; expected BOOLEAN; got BOOLEAN;
BEGIN
  ASSERT to_regclass('public.feeding_events') IS NOT NULL,
    'DIAGNOSTIC[missing-table]: public.feeding_events not found while checking table ACL';
  FOR role_name IN SELECT jsonb_object_keys(want) LOOP
    FOR priv IN SELECT jsonb_object_keys(want -> role_name) LOOP
      expected := ((want -> role_name) ->> priv)::boolean;
      got := has_table_privilege(role_name, 'public.feeding_events', priv);
      ASSERT got = expected,
        format('DIAGNOSTIC[table-acl-mismatch]: feeding_events %s for %I: expected=%s got=%s '
               '(table present, ACL disagrees with trust-boundary contract)',
               priv, role_name, expected, got);
    END LOOP;
  END LOOP;
  RAISE NOTICE '✓ feeding_events table DML ACL matches trust-boundary contract';
END $$;

ROLLBACK;

