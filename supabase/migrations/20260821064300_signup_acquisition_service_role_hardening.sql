-- Revoke service_role's legacy default access on the signup-acquisition
-- objects that 20260813030000_signup_acquisition_forward_repair.sql installs.
--
-- WHY THIS EXISTS. That migration revokes PUBLIC/anon/authenticated on the
-- table and all four functions, but never revokes FROM service_role -- zero
-- occurrences of the string anywhere in the file. On this hosted project's
-- legacy default privileges (the same posture supabase/seed.sql's header
-- documents for tables), a freshly created table or function grants
-- service_role SELECT/INSERT/EXECUTE automatically with no explicit grant.
-- Confirmed live 2026-08-21 with a rolled-back probe: a throwaway table and
-- function on this exact project both defaulted to anon/authenticated/
-- service_role holding full access.
--
-- 20260813030000 was applied to production on 2026-08-21 together with an
-- ad-hoc supplemental REVOKE for service_role on all five objects, run
-- through the same Lovable SQL channel used for that apply. That supplement
-- was never captured in a migration file, so a fresh local replay, CI reset,
-- or disaster-recovery restore would rebuild the table and functions but
-- silently leave service_role holding unintended access -- reopening
-- exactly the gap the production apply closed. This migration captures that
-- supplement in version control so every environment reaches the same
-- hardened end state, not just the one hand-patched database.
--
-- Per Migration Immutability Rules, 20260813030000 itself is not touched;
-- this is a new additive migration.
--
-- Scope: REVOKE only. No table, column, policy, or new capability is added.
-- service_role never had an intended reason to reach these objects --
-- neither the migration's own design (it documents the table and every
-- function as authenticated-or-nobody) nor any edge function in this repo
-- references them (verified: zero matches in supabase/functions/).
--
-- Safe to run whether 20260813030000 already applied service_role-hardened
-- (as production now is) or unhardened (a plain replay of that file alone) --
-- the preflight accepts either grantee shape and the postflight always
-- leaves service_role with nothing. If the underlying objects are absent
-- entirely, this migration fails closed rather than silently no-op'ing.
--
-- Rollback (emergency only, not expected to ever be needed):
--   GRANT ALL ON TABLE public.signup_acquisition_attributions TO service_role;
--   GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
--   GRANT EXECUTE ON FUNCTION public.record_signup_acquisition_first_touch(text) TO service_role;
--   GRANT EXECUTE ON FUNCTION public.signup_acquisition_operator_snapshot() TO service_role;
--   GRANT EXECUTE ON FUNCTION public.signup_to_paid_operator_snapshot() TO service_role;

BEGIN;

DO $signup_service_role_hardening_preflight$
BEGIN
  IF to_regclass('public.signup_acquisition_attributions') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'signup_service_role_hardening_prerequisite_missing_table';
  END IF;

  IF (
    SELECT count(*) FROM pg_proc WHERE proname IN (
      'handle_new_user',
      'record_signup_acquisition_first_touch',
      'signup_acquisition_operator_snapshot',
      'signup_to_paid_operator_snapshot'
    )
  ) <> 4 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'signup_service_role_hardening_prerequisite_missing_functions';
  END IF;
END
$signup_service_role_hardening_preflight$;

REVOKE ALL ON TABLE public.signup_acquisition_attributions FROM service_role;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM service_role;
REVOKE ALL ON FUNCTION public.record_signup_acquisition_first_touch(text) FROM service_role;
REVOKE ALL ON FUNCTION public.signup_acquisition_operator_snapshot() FROM service_role;
REVOKE ALL ON FUNCTION public.signup_to_paid_operator_snapshot() FROM service_role;

DO $signup_service_role_hardening_postflight$
BEGIN
  IF has_table_privilege('service_role', 'public.signup_acquisition_attributions', 'SELECT')
     OR has_table_privilege('service_role', 'public.signup_acquisition_attributions', 'INSERT')
     OR has_table_privilege('service_role', 'public.signup_acquisition_attributions', 'UPDATE')
     OR has_table_privilege('service_role', 'public.signup_acquisition_attributions', 'DELETE') THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'signup_service_role_hardening_table_postcondition_failed';
  END IF;

  IF has_function_privilege('service_role', 'public.handle_new_user()', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.record_signup_acquisition_first_touch(text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.signup_acquisition_operator_snapshot()', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.signup_to_paid_operator_snapshot()', 'EXECUTE') THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'signup_service_role_hardening_function_postcondition_failed';
  END IF;

  -- The intended authenticated grants from 20260813030000 must survive
  -- unchanged -- this migration must narrow service_role only, never touch
  -- the caller-facing surface.
  IF NOT has_function_privilege('authenticated', 'public.record_signup_acquisition_first_touch(text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.signup_acquisition_operator_snapshot()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.signup_to_paid_operator_snapshot()', 'EXECUTE') THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'signup_service_role_hardening_authenticated_grant_lost';
  END IF;
END
$signup_service_role_hardening_postflight$;

COMMIT;

NOTIFY pgrst, 'reload schema';
