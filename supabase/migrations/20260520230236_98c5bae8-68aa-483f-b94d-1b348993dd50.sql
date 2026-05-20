-- Document why public.has_role must remain SECURITY DEFINER.
--
-- Rationale: has_role is referenced from Row Level Security policies on
-- public.user_roles and on operator-only admin paths. RLS on user_roles
-- prevents the calling role from selecting other users' role rows, which
-- would otherwise make a plain SECURITY INVOKER lookup return NULL and
-- silently fail policy checks. SECURITY DEFINER lets the function read
-- user_roles using the function owner so policies can evaluate role
-- membership without triggering recursive RLS on user_roles itself.
--
-- Safety properties preserved:
--   * search_path is pinned to public, pg_temp (no schema hijacking).
--   * STABLE + read-only SELECT (no writes, cannot mutate state).
--   * Returns only a boolean; never returns row contents.
--   * Callers in policies always pass auth.uid(), so the function cannot
--     be used to escalate the caller's own privileges.
--   * No service_role usage.
COMMENT ON FUNCTION public.has_role(uuid, public.app_role) IS
  'SECURITY DEFINER required: used by RLS policies on user_roles to avoid '
  'recursive RLS. search_path pinned, STABLE, read-only, returns boolean. '
  'See migration documenting linter 0029 acceptance.';