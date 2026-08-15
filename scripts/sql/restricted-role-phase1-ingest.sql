-- Phase 1 fixture for POSTGRES_RESTRICTED_ROLE_SPIKE (GAP-PGROLE-001).
-- Contract: docs/specs/postgres-restricted-role-alternative.md §5.2, §7, §8.
--
-- THIS IS DELIBERATELY NOT A MIGRATION.
--
-- Anything under supabase/migrations/ eventually reaches production on a
-- Lovable apply. The spec's §8 fence says the spike must never create a role in
-- production or the sandbox project — local replay only — and §9 marks
-- production role adoption REJECT. A migration would violate both by design, so
-- the role is created here and applied only by
-- scripts/run-restricted-role-harness.ts against a loopback database, and
-- dropped again in teardown.
--
-- The role is the shape §5.2 argues for: EXECUTE on exactly one existing
-- SECURITY DEFINER function, and NO table grants at all. Partitioning by
-- function grant rather than table grant is what survives the 2026-08-06
-- founder decision recorded in migration 20260807003500 — Lovable ships tables
-- without ACL awareness, so any table-grant partition drifts open.
--
-- Idempotent: safe to apply twice. Contains no raising self-test, per the R1
-- rule in §3.5 — 20260805090000 rolled back its own real fixes because a
-- failing assertion shared their transaction. Verification lives in the
-- harness, not in here.

BEGIN;

-- Only NOLOGIN and NOINHERIT are set explicitly, and only at CREATE time.
--
-- MEASURED 2026-08-14: an ALTER ROLE naming NOSUPERUSER / NOREPLICATION /
-- NOBYPASSRLS fails on the Supabase local stack with
--   ERROR: permission denied to alter role
-- because PostgreSQL requires **superuser** to change those three attributes --
-- even to turn them OFF -- and Supabase's `postgres` role is not a true
-- superuser. This is a real constraint on any Verdant role design, not a
-- fixture bug, and it is recorded in the spec's §5.2.1.
--
-- It is also harmless, because CREATE ROLE already defaults every one of them
-- to off. NOINHERIT is the one default that does NOT go the safe way (roles
-- INHERIT by default), so it is named explicitly here.
--
-- The safety property is therefore VERIFIED rather than COMMANDED: harness P1
-- reads rolsuper / rolbypassrls / rolcreatedb / rolcreaterole / rolcanlogin /
-- rolinherit straight out of pg_roles and fails if any of them is true. That is
-- the stronger check anyway — it would catch a changed server default, which an
-- ALTER asserting the value it already has never would.
DO $phase1$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'verdant_ingest_writer') THEN
    CREATE ROLE verdant_ingest_writer NOLOGIN NOINHERIT;
  END IF;
END
$phase1$;

-- Re-assert only the two attributes a non-superuser role holder may change, and
-- never let it abort the fixture: a pre-existing role owned by someone else is
-- a P1 failure to report, not a crash to hide behind.
DO $reassert$
BEGIN
  EXECUTE 'ALTER ROLE verdant_ingest_writer NOLOGIN NOINHERIT';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'could not re-assert NOLOGIN NOINHERIT; P1 will verify from pg_roles';
END
$reassert$;

-- USAGE on the schema only. This does NOT grant access to any object in it.
GRANT USAGE ON SCHEMA public TO verdant_ingest_writer;

-- Exactly one function, guarded on its existence so a schema drift cannot
-- abort the fixture. bump_bridge_token_usage(uuid, integer) is ingest-domain,
-- SECURITY DEFINER, has a single overload, and writes only bridge_tokens.
-- MEASURED 2026-08-14: the first run that reached this point left the role
-- WITHOUT execute permission ("permission denied for function
-- bump_bridge_token_usage" at P5). The previous version pre-checked
-- pg_get_function_identity_arguments(p.oid) = 'uuid, integer' and silently
-- skipped the GRANT when that string did not match exactly -- a guard that
-- fails CLOSED and silently, which is the worst combination.
--
-- Attempt the GRANT directly instead and let Postgres arbitrate the signature.
-- If the function is genuinely absent, that is a P5 failure the harness reports
-- with a diagnostic, not a silent no-op here.
DO $grant_fn$
BEGIN
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.bump_bridge_token_usage(uuid, integer) TO verdant_ingest_writer';
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE 'allowlisted function absent; harness P5 will fail and report the diagnostic';
END
$grant_fn$;

-- Reachability through PostgREST role switching (§5.3). PostgREST issues
-- SET LOCAL ROLE from the JWT `role` claim, which requires `authenticator` to
-- be a member of the target role. Guarded because `authenticator` is a Supabase
-- provisioning artifact and may be absent on a bare Postgres.
DO $grant_authenticator$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    EXECUTE 'GRANT verdant_ingest_writer TO authenticator';
  END IF;
END
$grant_authenticator$;

COMMIT;
