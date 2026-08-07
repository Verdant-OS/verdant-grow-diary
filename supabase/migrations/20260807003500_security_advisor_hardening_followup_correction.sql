-- Correction to 20260805090000_security_advisor_hardening_followup.sql.
--
-- That migration is already published (append-only history -- it cannot be
-- edited here) but it never actually landed anywhere it has been applied:
-- its postcondition DO block created a throwaway function
-- (public.__default_privilege_selftest_fn) and table
-- (public.__default_privilege_selftest_tbl) to prove the migration's
-- `ALTER DEFAULT PRIVILEGES` change worked end-to-end, then asserted the
-- throwaway function was not anon-executable. That assertion FAILED
-- (confirmed reproducibly against a fresh local Supabase stack,
-- 2026-08-06: `ERROR: default-privilege change did not take: a freshly
-- created function is anon-executable`), root cause unconfirmed. Because
-- that DO block ran inside the same BEGIN/COMMIT transaction as every
-- other statement in the file, the RAISE EXCEPTION rolled back the ENTIRE
-- migration -- not just the self-test. So on any target where this
-- migration is applied, none of its real fixes take effect either: the
-- `lovable_paddle_events` / `lead_events` grant hardening never applies,
-- `ALTER DEFAULT PRIVILEGES` never changes, and -- most importantly --
-- `anon` keeps EXECUTE on `quicklog_save_manual`, which is the exact live
-- production Security Advisor finding this whole effort exists to close.
--
-- This migration re-does everything 20260805090000 intended, minus the
-- broken self-test, as a fresh additive file per this repo's append-only
-- migration history rule (see .github/workflows/published-migration-
-- integrity.yml). Every statement below is independently idempotent, so
-- this is safe to apply whether or not 20260805090000 ever partially
-- succeeded anywhere (it shouldn't have been able to, given the rollback,
-- but there is no direct prod access from this environment to confirm
-- either way).

BEGIN;

-- 1. lovable_paddle_events: match paddle_events / ai_credit_grants posture.
REVOKE ALL ON TABLE public.lovable_paddle_events FROM PUBLIC, anon, authenticated;

-- 2. lead_events: narrow to exactly what RLS already permits.
REVOKE ALL ON TABLE public.lead_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.lead_events TO authenticated;

-- 3. Forward hardening (best-effort -- see 20260805090000's header for the
-- full account of why this is "best-effort" and not a proven root-cause
-- fix): stop future functions from being born with PUBLIC/anon EXECUTE.
-- Scoped to FUNCTIONS only, not TABLES -- prod is grandfathered so
-- anon/authenticated get DML on new tables automatically, and Lovable
-- ships new tables continuously without knowing about ACL defaults;
-- silently making every future table client-invisible by default is a
-- workflow change nobody has signed off on (founder decision, 2026-08-06).
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon;

-- 4. quicklog_save_manual: the one finding independently reconfirmed live
-- against production on 2026-08-05 (anon still had EXECUTE). Revokes from
-- PUBLIC as well as anon -- a REVOKE naming only anon leaves PUBLIC's
-- grant in effect and anon inherits EXECUTE right back through it -- and
-- explicitly re-affirms authenticated/service_role so this statement is
-- self-contained regardless of what already landed.
-- Applied to EVERY overload, discovered dynamically, not just the 12-arg
-- signature. A static single-signature REVOKE paired with the loop below
-- (which asserts across all overloads) would turn a stray overload into a
-- RAISE EXCEPTION -- rolling back this entire transaction and recreating
-- the exact failure mode of 20260805090000 that this file exists to undo.
-- Fix the grant rather than fail on it.
DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'quicklog_save_manual'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
  END LOOP;
END $$;

-- Postcondition assertions -- checks on EXISTING objects only (no
-- throwaway object creation this time). Modeled on the reviewed
-- audit-lane contract at
-- supabase/contract-migrations/quicklog_save_manual_revoke_anon_execute.sql:
-- fail the whole transaction (RAISE EXCEPTION, not a NOTICE) rather than
-- silently leaving a gap, and verify with has_function_privilege /
-- has_table_privilege so PUBLIC-inherited grants are correctly accounted
-- for.
DO $$
DECLARE
  bad RECORD;
  overload_count INT;
BEGIN
  -- 4a. quicklog_save_manual: every overload, not just the 12-arg one in
  -- question -- a stray overload must not silently retain anon EXECUTE.
  SELECT COUNT(*) INTO overload_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'quicklog_save_manual';

  IF overload_count = 0 THEN
    RAISE EXCEPTION 'quicklog_save_manual missing -- refuse to leave a hole';
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

  -- 4b. lovable_paddle_events / lead_events: effective anon/authenticated
  -- table privileges.
  IF has_table_privilege('anon', 'public.lovable_paddle_events', 'SELECT')
     OR has_table_privilege('anon', 'public.lovable_paddle_events', 'INSERT')
     OR has_table_privilege('anon', 'public.lovable_paddle_events', 'UPDATE')
     OR has_table_privilege('anon', 'public.lovable_paddle_events', 'DELETE') THEN
    RAISE EXCEPTION 'lovable_paddle_events still has an anon table privilege';
  END IF;
  IF has_table_privilege('authenticated', 'public.lovable_paddle_events', 'SELECT')
     OR has_table_privilege('authenticated', 'public.lovable_paddle_events', 'INSERT')
     OR has_table_privilege('authenticated', 'public.lovable_paddle_events', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.lovable_paddle_events', 'DELETE') THEN
    RAISE EXCEPTION 'lovable_paddle_events still has an authenticated table privilege';
  END IF;

  IF has_table_privilege('anon', 'public.lead_events', 'SELECT')
     OR has_table_privilege('anon', 'public.lead_events', 'INSERT')
     OR has_table_privilege('anon', 'public.lead_events', 'UPDATE')
     OR has_table_privilege('anon', 'public.lead_events', 'DELETE') THEN
    RAISE EXCEPTION 'lead_events still has an anon table privilege';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.lead_events', 'SELECT') THEN
    RAISE EXCEPTION 'lead_events lost the authenticated SELECT this migration is supposed to preserve';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.lead_events', 'INSERT') THEN
    RAISE EXCEPTION 'lead_events lost the authenticated INSERT this migration is supposed to preserve';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
