-- Irrigation evidence trust boundary — additive REVOKE.
-- Preserves: authenticated SELECT on all three event tables (readers rely on it);
--            service_role privileges (server writers);
--            EXECUTE on quicklog_save_event / quicklog_save_manual (canonical writers).
-- Removes:   INSERT/UPDATE/DELETE on the three event tables from anon, authenticated, PUBLIC;
--            EXECUTE on every overload of create_watering_event and create_feeding_event
--              from anon, authenticated, PUBLIC.

-- Fresh Supabase local stacks use hardened default table privileges, while the
-- hosted project still has the legacy table-access baseline. Explicitly pin the
-- privileges this migration promises to preserve so clean replay does not rely
-- on seed.sql running after all migrations.
GRANT SELECT ON public.grow_events, public.watering_events, public.feeding_events
  TO authenticated;
GRANT ALL ON public.grow_events, public.watering_events, public.feeding_events
  TO service_role;

REVOKE INSERT, UPDATE, DELETE ON public.grow_events     FROM anon, authenticated, PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.watering_events FROM anon, authenticated, PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.feeding_events  FROM anon, authenticated, PUBLIC;

-- Revoke EXECUTE from every overload of the two legacy typed-event RPCs.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('create_watering_event', 'create_feeding_event')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated, PUBLIC', r.sig);
  END LOOP;
END $$;

-- Post-condition guard: fail the migration if any write privilege remains on
-- the event tables for anon/authenticated, or if either legacy RPC is still
-- callable by anon/authenticated. service_role must remain able to write and
-- call, and authenticated must retain SELECT on all three event tables.
DO $$
DECLARE
  bad_priv text;
  bad_rpc  text;
BEGIN
  SELECT string_agg(format('%s/%s/%s', grantee, table_name, privilege_type), ', ')
    INTO bad_priv
    FROM information_schema.table_privileges
   WHERE table_schema = 'public'
     AND table_name IN ('grow_events','watering_events','feeding_events')
     AND grantee IN ('anon','authenticated','PUBLIC')
     AND privilege_type IN ('INSERT','UPDATE','DELETE');
  IF bad_priv IS NOT NULL THEN
    RAISE EXCEPTION 'irrigation revoke incomplete — remaining write grants: %', bad_priv;
  END IF;

  SELECT string_agg(p.oid::regprocedure::text || '/' || role_name, ', ')
    INTO bad_rpc
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN unnest(ARRAY['anon','authenticated']) AS role_name
   WHERE n.nspname = 'public'
     AND p.proname IN ('create_watering_event','create_feeding_event')
     AND has_function_privilege(role_name, p.oid, 'EXECUTE');
  IF bad_rpc IS NOT NULL THEN
    RAISE EXCEPTION 'legacy typed-event RPC still executable — %', bad_rpc;
  END IF;

  IF NOT has_table_privilege('authenticated','public.grow_events','SELECT')
     OR NOT has_table_privilege('authenticated','public.watering_events','SELECT')
     OR NOT has_table_privilege('authenticated','public.feeding_events','SELECT') THEN
    RAISE EXCEPTION 'authenticated SELECT was unintentionally revoked';
  END IF;

  IF NOT has_table_privilege('service_role','public.grow_events','INSERT')
     OR NOT has_table_privilege('service_role','public.watering_events','INSERT')
     OR NOT has_table_privilege('service_role','public.feeding_events','INSERT') THEN
    RAISE EXCEPTION 'service_role writes were unintentionally revoked';
  END IF;
END $$;
