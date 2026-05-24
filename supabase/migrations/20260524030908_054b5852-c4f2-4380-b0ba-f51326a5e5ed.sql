-- Drop the SECURITY DEFINER metadata view to resolve Supabase lint 0010.
-- A SECURITY INVOKER replacement is not viable yet because the base
-- table public.pi_ingest_bridge_credentials intentionally has no
-- owner-scoped SELECT policy (it stores encrypted bridge secrets and
-- must not be readable by signed-in clients). Re-introducing a SELECT
-- policy on the base table — even column-scoped — would weaken
-- credential secrecy. Bridge credential metadata access is deferred
-- until a safe server-only pattern (Edge Function) is implemented.

REVOKE ALL ON public.pi_ingest_bridge_credentials_safe FROM PUBLIC;
REVOKE ALL ON public.pi_ingest_bridge_credentials_safe FROM authenticated;
DROP VIEW IF EXISTS public.pi_ingest_bridge_credentials_safe;