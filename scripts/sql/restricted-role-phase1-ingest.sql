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

DO $phase1$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'verdant_ingest_writer') THEN
    CREATE ROLE verdant_ingest_writer;
  END IF;
END
$phase1$;

-- Attributes asserted explicitly so a pre-existing role cannot carry anything
-- stronger. NOINHERIT matters: the role must not passively acquire privileges
-- through membership. Every dangerous attribute is negated here and P10 in the
-- harness re-asserts it from pg_roles rather than trusting this text.
ALTER ROLE verdant_ingest_writer
  NOLOGIN
  NOINHERIT
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOBYPASSRLS;

-- USAGE on the schema only. This does NOT grant access to any object in it.
GRANT USAGE ON SCHEMA public TO verdant_ingest_writer;

-- Exactly one function, guarded on its existence so a schema drift cannot
-- abort the fixture. bump_bridge_token_usage(uuid, integer) is ingest-domain,
-- SECURITY DEFINER, has a single overload, and writes only bridge_tokens.
DO $grant_fn$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'bump_bridge_token_usage'
       AND pg_get_function_identity_arguments(p.oid) = 'uuid, integer'
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.bump_bridge_token_usage(uuid, integer) TO verdant_ingest_writer';
  END IF;
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
