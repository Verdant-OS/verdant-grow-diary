-- Follow-up to 20260807003500_security_advisor_hardening_followup_correction.sql
-- (itself a correction to 20260805090000). Both are published and
-- append-only, so this lands the fix as a fresh additive file per
-- .github/workflows/published-migration-integrity.yml.
--
-- The problem this fixes (Copilot review on PR #808):
--
-- 20260807003500 REVOKEs/GRANTs only the ONE 12-argument
-- quicklog_save_manual signature, but its postcondition DO block asserts
-- across EVERY overload found in pg_proc. Those two halves disagree. If a
-- stray overload exists that still carries anon EXECUTE -- exactly what
-- this project keeps hitting, because each added parameter creates a new
-- signature that re-acquires the schema default ACL -- the loop raises:
--
--     RAISE EXCEPTION 'quicklog_save_manual oid=% still executable by anon'
--
-- That EXCEPTION rolls back the whole transaction, so none of
-- 20260807003500's real fixes apply either. It is the same
-- assert-and-die-instead-of-repair shape that made 20260805090000 a
-- complete no-op and required 20260807003500 in the first place.
--
-- This file repairs rather than asserts: it enumerates every
-- quicklog_save_manual overload and applies the intended grants to each,
-- so a stray overload is corrected instead of being fatal. Idempotent and
-- safe to re-run, and safe whether or not either predecessor ever
-- successfully applied.

BEGIN;

-- Enumerate every overload and fix each one. Dynamic SQL is required
-- because the signature list is not knowable at authoring time -- that
-- unknowability is the root of the recurring regression.
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
    -- PUBLIC as well as anon: a REVOKE naming only anon leaves PUBLIC's
    -- grant in effect and anon inherits EXECUTE straight back through it.
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
    fixed_count := fixed_count + 1;
  END LOOP;

  IF fixed_count = 0 THEN
    RAISE EXCEPTION 'quicklog_save_manual missing entirely -- refuse to leave a hole';
  END IF;
END $$;

-- Postcondition: verify the repair actually took, on existing objects
-- only. No throwaway object creation -- that disposable self-test is what
-- broke 20260805090000. Hard-fails rather than warning, so a silent gap
-- cannot ship.
DO $$
DECLARE
  bad RECORD;
BEGIN
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
      RAISE EXCEPTION 'quicklog_save_manual oid=% still executable by anon after repair', bad.oid;
    END IF;
    IF NOT bad.auth_exec THEN
      RAISE EXCEPTION 'quicklog_save_manual oid=% not executable by authenticated', bad.oid;
    END IF;
    IF NOT bad.svc_exec THEN
      RAISE EXCEPTION 'quicklog_save_manual oid=% not executable by service_role', bad.oid;
    END IF;
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
