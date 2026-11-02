-- Forward hardening for EcoWitt custom-upload claims.
-- Does not edit 20261102150000. Not applied here.
-- Authenticated owners can read non-hash columns. The service role binds.

ALTER TABLE public.ecowitt_custom_upload_claims
  DROP CONSTRAINT ecowitt_custom_upload_claims_token_sha256_hex;

ALTER TABLE public.ecowitt_custom_upload_claims
  ALTER COLUMN token_sha256 DROP NOT NULL;

ALTER TABLE public.ecowitt_custom_upload_claims
  ADD CONSTRAINT ecowitt_custom_upload_claims_token_sha256_hex
  CHECK (token_sha256 IS NULL OR token_sha256 ~ '^[0-9a-f]{64}$');

REVOKE SELECT ON TABLE public.ecowitt_custom_upload_claims FROM authenticated;

GRANT SELECT (
  id,
  user_id,
  tent_id,
  stationtype,
  bound_at,
  interval_seconds,
  revoked_at,
  created_at,
  last_received_at,
  last_captured_at
) ON TABLE public.ecowitt_custom_upload_claims TO authenticated;

COMMENT ON POLICY ecowitt_custom_upload_claims_owner_select
  ON public.ecowitt_custom_upload_claims IS
  'Row filter for the owner. token_sha256 and passkey_sha256 are not granted.';

CREATE VIEW public.ecowitt_custom_upload_claims_owner
WITH (security_invoker = true) AS
SELECT
  id,
  user_id,
  tent_id,
  stationtype,
  bound_at,
  interval_seconds,
  revoked_at,
  created_at,
  last_received_at,
  last_captured_at
FROM public.ecowitt_custom_upload_claims;

COMMENT ON VIEW public.ecowitt_custom_upload_claims_owner IS
  'Owner read surface. token_sha256 and passkey_sha256 are not columns.';

REVOKE ALL ON TABLE public.ecowitt_custom_upload_claims_owner
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.ecowitt_custom_upload_claims_owner
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revoke_ecowitt_custom_upload_claim(p_claim_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  UPDATE public.ecowitt_custom_upload_claims
  SET revoked_at = clock_timestamp(),
      token_sha256 = NULL,
      passkey_sha256 = NULL,
      bound_at = NULL
  WHERE id = p_claim_id
    AND user_id = uid
    AND revoked_at IS NULL;
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rotate_ecowitt_custom_upload_claim(p_claim_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  raw_token text;
  token_hash text;
BEGIN
  IF uid IS NULL OR COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.ecowitt_custom_upload_claims
    WHERE id = p_claim_id
      AND user_id = uid
      AND revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'claim not found';
  END IF;

  raw_token := encode(extensions.gen_random_bytes(24), 'hex');
  token_hash := encode(extensions.digest(convert_to(raw_token, 'utf8'), 'sha256'), 'hex');
  UPDATE public.ecowitt_custom_upload_claims
  SET token_sha256 = token_hash,
      passkey_sha256 = NULL,
      bound_at = NULL,
      stationtype = NULL
  WHERE id = p_claim_id
    AND user_id = uid
    AND revoked_at IS NULL;
  RETURN raw_token;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bind_ecowitt_custom_upload_claim(
  p_claim_id uuid,
  p_passkey_sha256 text,
  p_stationtype text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_claim_id IS NULL
     OR p_passkey_sha256 IS NULL
     OR p_passkey_sha256 !~ '^[0-9a-f]{64}$'
     OR p_stationtype IS NULL
     OR char_length(p_stationtype) < 1
     OR char_length(p_stationtype) > 64 THEN
    RETURN false;
  END IF;

  UPDATE public.ecowitt_custom_upload_claims
  SET passkey_sha256 = p_passkey_sha256,
      stationtype = p_stationtype,
      bound_at = clock_timestamp()
  WHERE id = p_claim_id
    AND revoked_at IS NULL
    AND passkey_sha256 IS NULL;

  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.bind_ecowitt_custom_upload_claim(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bind_ecowitt_custom_upload_claim(uuid, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.revoke_ecowitt_custom_upload_claim(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rotate_ecowitt_custom_upload_claim(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_ecowitt_custom_upload_claim(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_ecowitt_custom_upload_claim(uuid) TO authenticated;
