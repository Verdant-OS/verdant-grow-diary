-- DRAFT / UNAPPLIED — audit lane only. Do not run via supabase--migration
-- until Verdant has reviewed and approved. Kept under
-- supabase/contract-migrations/ so it is NOT picked up by the auto-apply
-- migrations lane at supabase/migrations/.
--
-- Purpose: close the last drift left by the 2026-07-22 irrigation-evidence
-- trust-boundary sweep. Live audit of project ref knkwiiywfkbqznbxwqfh
-- (executed read-only) showed:
--
--   public.quicklog_save_manual(
--     text, uuid, text, numeric, text, numeric, numeric, numeric,
--     timestamptz, jsonb, text
--   )
--   proacl = {postgres=X/postgres,
--             anon=X/postgres,               -- ← DRIFT
--             authenticated=X/postgres,
--             service_role=X/postgres,
--             sandbox_exec=X/postgres}
--
-- The applied migration 20260709160000_quicklog_save_manual_idempotency.sql
-- runs `REVOKE ALL ... FROM PUBLIC` and `GRANT EXECUTE ... TO authenticated`,
-- but Supabase's default privileges for the `postgres` role auto-grant
-- EXECUTE on new public-schema functions to anon/authenticated/service_role,
-- so the anon grant persisted after the REVOKE-PUBLIC (it is an explicit
-- role grant, not a PUBLIC grant). The function is SECURITY DEFINER and
-- fails closed at `auth.uid() is null` with reason `not_authenticated`, so
-- this is a privilege-surface drift rather than an exploitable path — but
-- it still contradicts docs/quicklog-rpc-safety.md ("EXECUTE ... granted
-- only to authenticated") and the sibling quicklog_save_event ACL
-- ({postgres, authenticated, service_role, sandbox_exec}). This migration
-- brings the ACL back in line, additively, without touching the function
-- body, ownership, or SECURITY DEFINER posture.
--
-- Safety properties:
--   • Additive only: no DROP / CREATE / REPLACE of the function.
--   • Targets the exact live overload signature (11 args, ordered as above).
--   • Preserves authenticated + service_role EXECUTE.
--   • Includes postcondition assertions that fail the transaction if the
--     resulting ACL is not exactly {authenticated, service_role} for the
--     Supabase-managed roles.
--   • No other object is modified.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.quicklog_save_manual(
  text, uuid, text, numeric, text, numeric, numeric, numeric,
  timestamptz, jsonb, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.quicklog_save_manual(
  text, uuid, text, numeric, text, numeric, numeric, numeric,
  timestamptz, jsonb, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.quicklog_save_manual(
  text, uuid, text, numeric, text, numeric, numeric, numeric,
  timestamptz, jsonb, text
) TO service_role;

-- Postcondition assertions — cover every overload of quicklog_save_manual
-- (there is currently exactly one, but a stray overload must not silently
-- retain anon EXECUTE).
DO $$
DECLARE
  bad RECORD;
  overload_count INT;
BEGIN
  SELECT COUNT(*) INTO overload_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'quicklog_save_manual';

  IF overload_count = 0 THEN
    RAISE EXCEPTION 'quicklog_save_manual missing — refuse to leave a hole';
  END IF;

  FOR bad IN
    SELECT p.oid,
           has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_exec,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
           has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc_exec
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'quicklog_save_manual'
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
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
