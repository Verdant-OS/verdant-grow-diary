-- Restrict pgmq email queue RPC wrappers to service_role only.
--
-- Context: public.enqueue_email / read_email_batch / delete_email / move_to_dlq
-- are SECURITY DEFINER wrappers around pgmq. PostgREST exposes any function in
-- public with EXECUTE to the caller's role. Prior hardening
-- (20260804091142_da8cef1f) revoked FROM anon, authenticated but left
-- Postgres's default PUBLIC grant (=X/postgres) in proacl, so anon still
-- inherited EXECUTE via PUBLIC.
--
-- Caller audit (2026-08-15): no function in any schema calls these wrappers;
-- the sole runtime caller is the process-email-queue edge function, which uses
-- SUPABASE_SERVICE_ROLE_KEY and rejects non-service_role JWTs. The auth_emails
-- queue name does not imply a supabase_auth_admin dependency — that role holds
-- no EXECUTE on these functions.
--
-- Rollback (emergency only — re-exposes queue manipulation to anon):
--   GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO PUBLIC, anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO PUBLIC, anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO PUBLIC, anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO PUBLIC, anon, authenticated;

BEGIN;

REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;

REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;

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
         'enqueue_email', 'read_email_batch', 'delete_email', 'move_to_dlq'
       ])
  LOOP
    IF bad.anon_exec OR bad.auth_exec THEN
      RAISE EXCEPTION '% still executable by anon/authenticated after revoke', bad.proname;
    END IF;
    IF NOT bad.svc_exec THEN
      RAISE EXCEPTION '% not executable by service_role after grant', bad.proname;
    END IF;
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
