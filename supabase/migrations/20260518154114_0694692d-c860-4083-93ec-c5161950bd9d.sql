-- Security hardening: tighten search_path and EXECUTE privileges on existing
-- SECURITY DEFINER / helper functions. No function bodies, ownership, RLS,
-- triggers, or tables are modified.

-- 1. Pin search_path to public, pg_temp for all four functions
ALTER FUNCTION public.has_role(uuid, public.app_role)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.award_nugs(text, integer, jsonb, text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.max_level_for_user(uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.recompute_level_after_harvest()
  SET search_path = public, pg_temp;

-- 2. Lock down has_role EXECUTE to authenticated + service_role only
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

-- 3. Defensive REVOKE FROM PUBLIC on the other three (idempotent)
REVOKE EXECUTE ON FUNCTION public.max_level_for_user(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recompute_level_after_harvest() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.award_nugs(text, integer, jsonb, text) FROM PUBLIC;