-- The normalized-search expression indexes on grows, tents, and plants call
-- this helper during every INSERT/UPDATE. The original migration granted it
-- only to authenticated, which unintentionally blocks trusted service-role
-- ingestion, imports, and disposable security fixtures before RLS is reached.
--
-- Keep the helper private from anon/PUBLIC. It is immutable, accepts one text
-- value, and returns only its normalized form; granting service_role restores
-- the intended server-write path without widening any row or table policy.

REVOKE ALL ON FUNCTION public.verdant_normalize_search_text(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verdant_normalize_search_text(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.verdant_normalize_search_text(text)
  TO authenticated, service_role;
