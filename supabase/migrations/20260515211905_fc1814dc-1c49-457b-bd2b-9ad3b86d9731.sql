REVOKE EXECUTE ON FUNCTION public.award_nugs(text, integer, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_nugs(text, integer, jsonb, text) TO authenticated;