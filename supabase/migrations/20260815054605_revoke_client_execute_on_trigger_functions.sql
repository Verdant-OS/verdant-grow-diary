-- NO-OP against a default ACL. Kept as recorded history, not a working fix.
--
-- Intent (2026-08-15 sandbox apply against bzatgtgjvuojpoxcknaa):
-- revoke client EXECUTE on the two trigger-only SECURITY DEFINER functions
--   public.grant_staff_role_for_verified_email()
--   public.profiles_block_gamification_updates()
--
-- What actually happened:
-- REVOKE EXECUTE … FROM anon, authenticated reported {"success": true}.
-- has_function_privilege('anon', oid, 'EXECUTE') remained true.
-- Both functions carried the default ACL (proacl NULL, or the PUBLIC
-- entry `=X/postgres`). anon and authenticated inherit EXECUTE through
-- PUBLIC. Revoking the named roles does not remove that inheritance.
--
-- Do not "fix" this file. It is already published to the sandbox migration
-- ledger under this version. The working PUBLIC revoke is the next file,
-- 20260815054645_revoke_public_and_anon_execute_on_definer_functions.sql.
-- Editing a recorded no-op to make it succeed would hide the lesson that
-- the apply-time success response is not evidence the grant is gone.
--
-- No postcondition DO block on purpose: an assertion of the intended end
-- state would RAISE EXCEPTION here and roll back a file whose job is to
-- remain the unsuccessful named-role revoke.
--
-- Rollback: none required. This file does not change effective privileges
-- when PUBLIC still holds EXECUTE.

REVOKE EXECUTE ON FUNCTION public.grant_staff_role_for_verified_email()
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.profiles_block_gamification_updates()
  FROM anon, authenticated;
