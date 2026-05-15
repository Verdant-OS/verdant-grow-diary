REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recompute_level_after_harvest() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.max_level_for_user(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.max_level_for_user(uuid) TO authenticated;
-- handle_new_user and recompute_level_after_harvest are invoked by triggers
-- under the table owner; no role-level EXECUTE grant is needed.