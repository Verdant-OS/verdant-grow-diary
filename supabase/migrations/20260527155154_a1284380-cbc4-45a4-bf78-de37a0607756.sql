
ALTER TABLE public.bridge_tokens
  ADD COLUMN IF NOT EXISTS ingest_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_used_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.bump_bridge_token_usage(p_id UUID, p_inserted INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_id IS NULL OR p_inserted IS NULL OR p_inserted <= 0 THEN
    RETURN;
  END IF;
  UPDATE public.bridge_tokens
     SET last_used_at  = now(),
         first_used_at = COALESCE(first_used_at, now()),
         ingest_count  = ingest_count + p_inserted
   WHERE id = p_id
     AND revoked_at IS NULL
     AND expires_at > now();
END;
$$;

REVOKE ALL ON FUNCTION public.bump_bridge_token_usage(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_bridge_token_usage(UUID, INTEGER) TO service_role;
