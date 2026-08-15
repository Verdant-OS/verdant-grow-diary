-- Revoke PUBLIC EXECUTE on trigger-only SECURITY DEFINER functions and align
-- quicklog_save_manual overload grants with the already-hardened
-- quicklog_save_event sibling (20260703093500_harden_quicklog_save_event_grants).
--
-- Prior work (20260804091142, 20260804091217) revoked FROM anon/authenticated
-- and partially FROM PUBLIC on some trigger functions, but quicklog_save_manual
-- still inherited anon EXECUTE via PUBLIC on at least one overload — the same
-- class of bug 20260807150000 repaired dynamically. This migration closes the
-- remaining Security Advisor "Public Can Execute" entries with explicit PUBLIC
-- revokes and overload-aware repair for quicklog_save_manual.
--
-- Rollback (emergency only):
--   GRANT EXECUTE ON FUNCTION public.grant_staff_role_for_verified_email() TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.profiles_block_gamification_updates() TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.grant_staff_role_for_verified_allowlist() TO PUBLIC;
--   GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;  -- overly broad; prefer per-function

BEGIN;

-- Trigger-only: must never be callable via PostgREST RPC.
REVOKE EXECUTE ON FUNCTION public.grant_staff_role_for_verified_email() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_staff_role_for_verified_allowlist() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profiles_block_gamification_updates() FROM PUBLIC, anon, authenticated;

-- quicklog_save_manual: every overload — match quicklog_save_event posture.
DO $$
DECLARE
  fn RECORD;
  fixed_count INT := 0;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'quicklog_save_manual'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
    fixed_count := fixed_count + 1;
  END LOOP;

  IF fixed_count = 0 THEN
    RAISE EXCEPTION 'quicklog_save_manual missing entirely -- refuse to leave a hole';
  END IF;
END $$;

-- Postcondition: trigger functions must not be client-executable; quicklog_save_manual
-- must match quicklog_save_event (anon=false, authenticated=true, service_role=true).
DO $$
DECLARE
  bad RECORD;
BEGIN
  FOR bad IN
    SELECT p.proname,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
           has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_exec
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY(ARRAY[
         'grant_staff_role_for_verified_email',
         'grant_staff_role_for_verified_allowlist',
         'profiles_block_gamification_updates'
       ])
  LOOP
    IF bad.anon_exec OR bad.auth_exec OR bad.svc_exec THEN
      RAISE EXCEPTION '% must not be executable by anon/authenticated/service_role (trigger-only)', bad.proname;
    END IF;
  END LOOP;

  FOR bad IN
    SELECT p.oid,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
           has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_exec
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'quicklog_save_manual'
  LOOP
    IF bad.anon_exec THEN
      RAISE EXCEPTION 'quicklog_save_manual oid=% still executable by anon', bad.oid;
    END IF;
    IF NOT bad.auth_exec THEN
      RAISE EXCEPTION 'quicklog_save_manual oid=% not executable by authenticated', bad.oid;
    END IF;
    IF NOT bad.svc_exec THEN
      RAISE EXCEPTION 'quicklog_save_manual oid=% not executable by service_role', bad.oid;
    END IF;
  END LOOP;

  -- quicklog_save_event sibling should already match; assert rather than mutate.
  FOR bad IN
    SELECT p.oid,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
           has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_exec
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'quicklog_save_event'
  LOOP
    IF bad.anon_exec THEN
      RAISE EXCEPTION 'quicklog_save_event oid=% still executable by anon', bad.oid;
    END IF;
    IF NOT bad.auth_exec THEN
      RAISE EXCEPTION 'quicklog_save_event oid=% not executable by authenticated', bad.oid;
    END IF;
    IF NOT bad.svc_exec THEN
      RAISE EXCEPTION 'quicklog_save_event oid=% not executable by service_role', bad.oid;
    END IF;
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
