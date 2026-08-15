-- Restrict the four SECURITY DEFINER pgmq email wrappers to service_role.
--
-- Background
-- ----------
-- public.enqueue_email / read_email_batch / delete_email / move_to_dlq are
-- PostgREST RPC wrappers around pgmq (created in 20260707153206_email_infra.sql).
-- They run as the owner, so EXECUTE is the authorization check. The email
-- worker (process-email-queue) is the only runtime caller: it builds a client
-- from SUPABASE_SERVICE_ROLE_KEY, sets verify_jwt, and additionally rejects
-- any JWT whose claims.role is not the service role. auth-email-hook and
-- send-transactional-email enqueue the same way. No database function in any
-- schema calls these wrappers, and supabase_auth_admin holds no EXECUTE —
-- the queue name auth_emails does not imply an Auth-hook dependency.
--
-- Why this file exists even though 20260707153206 already REVOKEd PUBLIC
-- and 20260804091142 already REVOKEd anon/authenticated:
-- a live Security Advisor sweep against sandbox bzatgtgjvuojpoxcknaa on
-- 2026-08-15 still showed Public Can Execute, and has_function_privilege()
-- confirmed anon EXECUTE. Publishing does not replay supabase/migrations/
-- (see docs/agents/CURRENT_STATE.md, 2026-08-15 drift note). This additive
-- file is the production apply vehicle.
--
-- This file also REVOKEs PUBLIC, not only the named roles. A REVOKE that
-- names only anon, authenticated reports success while PUBLIC's grant
-- remains (proacl entry `=X/postgres`) and both roles inherit EXECUTE
-- right back. That is the lesson recorded in the next migration
-- (20260815054605), which was applied as a no-op for that reason.
--
-- Rollback (email worker lock-out only — do not re-open the anon hole):
--   GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
--   (and the same GRANT for read_email_batch, delete_email, move_to_dlq)

BEGIN;

DO $$
DECLARE
  fn RECORD;
  found_names text[] := ARRAY[]::text[];
  required_names text[] := ARRAY[
    'enqueue_email',
    'read_email_batch',
    'delete_email',
    'move_to_dlq'
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
        'pgmq email wrapper % missing — refuse to leave a hole',
        missing;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  bad RECORD;
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
         'enqueue_email',
         'read_email_batch',
         'delete_email',
         'move_to_dlq'
       )
  LOOP
    IF bad.anon_exec THEN
      RAISE EXCEPTION '% oid=% still executable by anon', bad.proname, bad.oid;
    END IF;
    IF bad.auth_exec THEN
      RAISE EXCEPTION '% oid=% still executable by authenticated', bad.proname, bad.oid;
    END IF;
    IF NOT bad.svc_exec THEN
      RAISE EXCEPTION '% oid=% not executable by service_role — would break the email worker',
        bad.proname, bad.oid;
    END IF;
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
