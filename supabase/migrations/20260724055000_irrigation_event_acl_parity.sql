-- Additive parity repair for the immutable 20260722062644 irrigation revoke.
-- Existing environments never replay an applied migration, so required reader
-- and server privileges must be asserted in a new version.

GRANT SELECT ON TABLE
  public.grow_events,
  public.watering_events,
  public.feeding_events
TO authenticated;

GRANT ALL ON TABLE
  public.grow_events,
  public.watering_events,
  public.feeding_events
TO service_role;

DO $grant_legacy_server_execute$
DECLARE
  v_signature regprocedure;
BEGIN
  FOR v_signature IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('create_watering_event', 'create_feeding_event')
  LOOP
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO service_role',
      v_signature
    );
  END LOOP;
END
$grant_legacy_server_execute$;

DO $verify_acl_parity$
DECLARE
  v_table text;
  v_signature regprocedure;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'grow_events',
    'watering_events',
    'feeding_events'
  ] LOOP
    IF NOT has_table_privilege(
      'authenticated',
      format('public.%I', v_table),
      'SELECT'
    ) THEN
      RAISE EXCEPTION 'irrigation ACL parity failed: authenticated SELECT missing';
    END IF;

    IF has_table_privilege('authenticated', format('public.%I', v_table), 'INSERT')
       OR has_table_privilege('authenticated', format('public.%I', v_table), 'UPDATE')
       OR has_table_privilege('authenticated', format('public.%I', v_table), 'DELETE') THEN
      RAISE EXCEPTION 'irrigation ACL parity failed: authenticated write remains';
    END IF;

    IF NOT has_table_privilege('service_role', format('public.%I', v_table), 'SELECT')
       OR NOT has_table_privilege('service_role', format('public.%I', v_table), 'INSERT')
       OR NOT has_table_privilege('service_role', format('public.%I', v_table), 'UPDATE')
       OR NOT has_table_privilege('service_role', format('public.%I', v_table), 'DELETE') THEN
      RAISE EXCEPTION 'irrigation ACL parity failed: service role table access missing';
    END IF;
  END LOOP;

  FOR v_signature IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('create_watering_event', 'create_feeding_event')
  LOOP
    IF has_function_privilege('anon', v_signature, 'EXECUTE')
       OR has_function_privilege('authenticated', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'irrigation ACL parity failed: legacy client execute remains';
    END IF;
    IF NOT has_function_privilege('service_role', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'irrigation ACL parity failed: legacy server execute missing';
    END IF;
  END LOOP;
END
$verify_acl_parity$;
