-- Correct the global default-privilege layer for future public-schema objects.
--
-- PostgreSQL combines global default privileges with per-schema additions.
-- A schema-scoped REVOKE therefore cannot remove the built-in global PUBLIC
-- EXECUTE privilege for newly created functions. The previously published
-- 20260805090000 migration is immutable; this additive migration applies the
-- missing global revokes and repeats the schema-specific revokes defensively.

BEGIN;

ALTER DEFAULT PRIVILEGES
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

ALTER DEFAULT PRIVILEGES
  REVOKE ALL ON TABLES FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE ALL ON TABLES FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon;

DO $postcondition$
DECLARE
  test_fn_oid oid;
BEGIN
  EXECUTE 'CREATE FUNCTION public.__global_default_privilege_selftest_fn() RETURNS void
             LANGUAGE sql AS $selftest$ SELECT 1 $selftest$';

  SELECT oid
    INTO test_fn_oid
    FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname = '__global_default_privilege_selftest_fn';

  IF has_function_privilege('anon', test_fn_oid, 'EXECUTE') THEN
    RAISE EXCEPTION
      'global default-privilege hardening failed: a new function is anon-executable';
  END IF;

  EXECUTE 'DROP FUNCTION public.__global_default_privilege_selftest_fn()';
END
$postcondition$;

COMMIT;

NOTIFY pgrst, 'reload schema';
