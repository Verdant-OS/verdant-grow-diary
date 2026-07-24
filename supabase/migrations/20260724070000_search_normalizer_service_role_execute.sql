-- Preserve server-side writes through expression indexes that call the
-- canonical search normalizer. Revoking PUBLIC execute also removed the
-- privilege inherited by service_role, so generated/admin writes failed.

BEGIN;

GRANT EXECUTE
ON FUNCTION public.verdant_normalize_search_text(text)
TO service_role;

DO $verify$
BEGIN
  IF NOT has_function_privilege(
    'service_role',
    'public.verdant_normalize_search_text(text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION
      'search normalizer ACL invariant failed: service_role requires EXECUTE';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.verdant_normalize_search_text(text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION
      'search normalizer ACL invariant failed: anon must not have EXECUTE';
  END IF;
END
$verify$;

COMMIT;
