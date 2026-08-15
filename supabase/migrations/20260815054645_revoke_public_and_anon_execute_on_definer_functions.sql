-- Working follow-up to 20260815054605 (the recorded no-op).
--
-- 1. Trigger-only SECURITY DEFINER functions: REVOKE EXECUTE FROM PUBLIC
--    (the ACL entry the previous file missed), then GRANT service_role so
--    a PUBLIC revoke cannot lock out operator paths. Trigger firing on
--    PG11+ does not require the inserting role to hold EXECUTE; stripping
--    client EXECUTE is defense in depth against PostgREST RPC exposure.
--
-- 2. quicklog_save_manual: revoke anon (and PUBLIC) on every overload, and
--    re-grant authenticated + service_role. Sibling quicklog_save_event was
--    already hardened to that posture by 20260703093500_harden_quicklog_save_event_grants;
--    matching the _manual variant restores this repo's own convention rather
--    than inventing one. 20260807150000 already attempted the all-overloads
--    repair — this re-asserts it for hosts that have not applied that file.
--
-- Verify with has_function_privilege so PUBLIC-inherited grants are visible.
-- Do not create throwaway objects inside this transaction (see
-- 20260805090000 — a failed self-test rolled back the real fixes).
--
-- Rollback (restore the previous hole — only if this apply must be undone):
--   GRANT EXECUTE ON FUNCTION public.grant_staff_role_for_verified_email() TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.profiles_block_gamification_updates() TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.quicklog_save_manual(...) TO anon;
-- Prefer not to. The intended posture is the postcondition below.

BEGIN;

DO $$
DECLARE
  fn RECORD;
  found_names text[] := ARRAY[]::text[];
  required_names text[] := ARRAY[
    'grant_staff_role_for_verified_email',
    'profiles_block_gamification_updates'
  ];
  missing text;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig, p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY (required_names)
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      fn.sig
    );
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
    found_names := array_append(found_names, fn.proname);
  END LOOP;

  FOREACH missing IN ARRAY required_names LOOP
    IF NOT (missing = ANY (found_names)) THEN
      RAISE EXCEPTION
        'trigger definer function % missing — refuse to leave a hole',
        missing;
    END IF;
  END LOOP;
END $$;

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
    RAISE EXCEPTION 'quicklog_save_manual missing entirely — refuse to leave a hole';
  END IF;
END $$;

DO $$
DECLARE
  bad RECORD;
  manual_anon boolean;
  manual_auth boolean;
  manual_svc boolean;
  event_anon boolean;
  event_auth boolean;
  event_svc boolean;
BEGIN
  FOR bad IN
    SELECT p.proname,
           p.oid,
           has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_exec,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
           has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc_exec
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'grant_staff_role_for_verified_email',
         'profiles_block_gamification_updates'
       )
  LOOP
    IF bad.anon_exec THEN
      RAISE EXCEPTION '% oid=% still executable by anon after PUBLIC revoke',
        bad.proname, bad.oid;
    END IF;
    IF bad.auth_exec THEN
      RAISE EXCEPTION '% oid=% still executable by authenticated after PUBLIC revoke',
        bad.proname, bad.oid;
    END IF;
    IF NOT bad.svc_exec THEN
      RAISE EXCEPTION '% oid=% not executable by service_role', bad.proname, bad.oid;
    END IF;
  END LOOP;

  FOR bad IN
    SELECT p.oid,
           has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_exec,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
           has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc_exec
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'quicklog_save_manual'
  LOOP
    IF bad.anon_exec THEN
      RAISE EXCEPTION 'quicklog_save_manual oid=% still executable by anon after repair',
        bad.oid;
    END IF;
    IF NOT bad.auth_exec THEN
      RAISE EXCEPTION 'quicklog_save_manual oid=% not executable by authenticated',
        bad.oid;
    END IF;
    IF NOT bad.svc_exec THEN
      RAISE EXCEPTION 'quicklog_save_manual oid=% not executable by service_role',
        bad.oid;
    END IF;
  END LOOP;

  -- Effective three-role ACL must match the already-hardened sibling.
  -- Compare via has_function_privilege (OR across overloads), not proacl
  -- byte identity — GRANT order and owner entries can differ while the
  -- client-visible posture is the same.
  SELECT bool_or(has_function_privilege('anon', p.oid, 'EXECUTE')),
         bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE')),
         bool_or(has_function_privilege('service_role', p.oid, 'EXECUTE'))
    INTO manual_anon, manual_auth, manual_svc
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'quicklog_save_manual';

  SELECT bool_or(has_function_privilege('anon', p.oid, 'EXECUTE')),
         bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE')),
         bool_or(has_function_privilege('service_role', p.oid, 'EXECUTE'))
    INTO event_anon, event_auth, event_svc
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'quicklog_save_event';

  IF event_anon IS NULL THEN
    RAISE EXCEPTION 'quicklog_save_event missing — cannot align sibling ACL';
  END IF;

  IF manual_anon IS DISTINCT FROM event_anon
     OR manual_auth IS DISTINCT FROM event_auth
     OR manual_svc IS DISTINCT FROM event_svc THEN
    RAISE EXCEPTION
      'quicklog_save_manual ACL (anon=%, auth=%, svc=%) does not match quicklog_save_event (anon=%, auth=%, svc=%)',
      manual_anon, manual_auth, manual_svc, event_anon, event_auth, event_svc;
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
