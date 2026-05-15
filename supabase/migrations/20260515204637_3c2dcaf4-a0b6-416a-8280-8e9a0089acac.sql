
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.award_nugs(TEXT, INT, JSONB, TEXT) SECURITY INVOKER;
