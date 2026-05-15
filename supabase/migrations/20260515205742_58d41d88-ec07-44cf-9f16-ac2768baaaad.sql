
REVOKE EXECUTE ON FUNCTION public.max_level_for_user(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_level_after_harvest() FROM PUBLIC, anon, authenticated;
