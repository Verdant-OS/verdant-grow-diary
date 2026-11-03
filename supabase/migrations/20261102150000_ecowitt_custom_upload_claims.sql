-- EcoWitt customized-upload claim links for one tent.
-- This file is not applied here. Authenticated owners may read non-secret
-- columns and call the owner RPCs. token_sha256 and passkey_sha256 stay off
-- that grant. Gateway ingest writes with the service role.
-- No anon grants. The raw claim token and the gateway secret are not columns.

CREATE TABLE public.ecowitt_custom_upload_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tent_id uuid NOT NULL REFERENCES public.tents (id) ON DELETE CASCADE,
  token_sha256 text NOT NULL,
  passkey_sha256 text,
  stationtype text,
  bound_at timestamptz,
  interval_seconds integer NOT NULL DEFAULT 16,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_received_at timestamptz,
  last_captured_at timestamptz,
  CONSTRAINT ecowitt_custom_upload_claims_token_sha256_hex
    CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ecowitt_custom_upload_claims_passkey_sha256_hex
    CHECK (passkey_sha256 IS NULL OR passkey_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ecowitt_custom_upload_claims_stationtype_len
    CHECK (stationtype IS NULL OR char_length(stationtype) <= 64),
  CONSTRAINT ecowitt_custom_upload_claims_interval
    CHECK (interval_seconds BETWEEN 16 AND 600),
  CONSTRAINT ecowitt_custom_upload_claims_bind_pair
    CHECK (
      (passkey_sha256 IS NULL AND bound_at IS NULL)
      OR (passkey_sha256 IS NOT NULL AND bound_at IS NOT NULL)
    ),
  CONSTRAINT ecowitt_custom_upload_claims_token_sha256_key UNIQUE (token_sha256)
);

CREATE UNIQUE INDEX ecowitt_custom_upload_claims_one_open_tent
  ON public.ecowitt_custom_upload_claims (tent_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.ecowitt_custom_upload_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY ecowitt_custom_upload_claims_owner_select
  ON public.ecowitt_custom_upload_claims
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

CREATE POLICY ecowitt_custom_upload_claims_service_write
  ON public.ecowitt_custom_upload_claims
  FOR ALL
  TO service_role
  USING (user_id IS NOT NULL)
  WITH CHECK (user_id IS NOT NULL);

REVOKE ALL ON TABLE public.ecowitt_custom_upload_claims FROM PUBLIC, anon, authenticated, service_role;
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
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ecowitt_custom_upload_claims TO service_role;

CREATE OR REPLACE FUNCTION public.create_ecowitt_custom_upload_claim(p_tent_id uuid)
RETURNS TABLE (claim_id uuid, upload_token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  raw_token text;
  token_hash text;
  new_id uuid;
BEGIN
  IF uid IS NULL OR COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.tents
    WHERE tents.id = p_tent_id
      AND tents.user_id = uid
  ) THEN
    RAISE EXCEPTION 'tent not found';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.ecowitt_custom_upload_claims
    WHERE tent_id = p_tent_id
      AND revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'active claim exists';
  END IF;

  raw_token := encode(extensions.gen_random_bytes(24), 'hex');
  token_hash := encode(extensions.digest(convert_to(raw_token, 'utf8'), 'sha256'), 'hex');
  INSERT INTO public.ecowitt_custom_upload_claims (user_id, tent_id, token_sha256)
  VALUES (uid, p_tent_id, token_hash)
  RETURNING id INTO new_id;
  RETURN QUERY SELECT new_id, raw_token;
END;
$function$;

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
  SET revoked_at = clock_timestamp()
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
  raw_token := encode(extensions.gen_random_bytes(24), 'hex');
  token_hash := encode(extensions.digest(convert_to(raw_token, 'utf8'), 'sha256'), 'hex');
  UPDATE public.ecowitt_custom_upload_claims
  SET token_sha256 = token_hash,
      passkey_sha256 = NULL,
      stationtype = NULL,
      bound_at = NULL
  WHERE id = p_claim_id
    AND user_id = uid
    AND revoked_at IS NULL;
  -- A concurrent revoke or second rotate can make this match nothing.
  -- Returning raw_token then would show a path the database never stored.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'claim not found';
  END IF;
  RETURN raw_token;
END;
$function$;

-- Serializes receipt updates for one claim. Bind must not write these columns.
CREATE OR REPLACE FUNCTION public.reserve_ecowitt_custom_upload_receipt(
  p_claim_id uuid,
  p_received_at timestamptz,
  p_captured_at timestamptz
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_interval integer;
  v_last_received timestamptz;
  v_last_captured timestamptz;
  v_revoked timestamptz;
  v_gap_ms integer;
BEGIN
  IF p_claim_id IS NULL OR p_received_at IS NULL OR p_captured_at IS NULL THEN
    RETURN 'claim_not_found';
  END IF;

  SELECT interval_seconds, last_received_at, last_captured_at, revoked_at
  INTO v_interval, v_last_received, v_last_captured, v_revoked
  FROM public.ecowitt_custom_upload_claims
  WHERE id = p_claim_id
  FOR UPDATE;

  IF NOT FOUND OR v_revoked IS NOT NULL THEN
    RETURN 'claim_not_found';
  END IF;

  v_gap_ms := GREATEST(8000, v_interval * 500);
  IF v_last_received IS NOT NULL
     AND p_received_at < v_last_received + (v_gap_ms * INTERVAL '1 millisecond') THEN
    RETURN 'rate_limited';
  END IF;

  -- `=` missed an older dateutc. A captured time at or before the last one is a replay.
  IF v_last_captured IS NOT NULL AND p_captured_at <= v_last_captured THEN
    RETURN 'duplicate_captured_at';
  END IF;

  UPDATE public.ecowitt_custom_upload_claims
  SET last_received_at = p_received_at,
      last_captured_at = p_captured_at
  WHERE id = p_claim_id
    AND revoked_at IS NULL;
  RETURN 'ok';
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_ecowitt_custom_upload_receipt(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;

-- First unbound packet wins. A second passkey does not replace it.
CREATE OR REPLACE FUNCTION public.bind_ecowitt_custom_upload_claim(
  p_claim_id uuid,
  p_passkey_sha256 text,
  p_stationtype text,
  p_bound_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_claim_id IS NULL OR p_bound_at IS NULL THEN
    RETURN false;
  END IF;
  IF p_passkey_sha256 IS NULL OR p_passkey_sha256 !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;
  IF p_stationtype IS NULL OR char_length(p_stationtype) < 1 OR char_length(p_stationtype) > 64 THEN
    RETURN false;
  END IF;

  UPDATE public.ecowitt_custom_upload_claims
  SET passkey_sha256 = p_passkey_sha256,
      stationtype = p_stationtype,
      bound_at = p_bound_at
  WHERE id = p_claim_id
    AND revoked_at IS NULL
    AND passkey_sha256 IS NULL;

  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.bind_ecowitt_custom_upload_claim(uuid, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;

-- Recheck, reserve, first-sender bind, and reading insert commit together.
-- A rejection returns before any write. An insert error other than a unique
-- clash raises, so the receipt and bind roll back with it. One metric that
-- already exists is skipped. If every metric clashes, the function raises
-- 23505 and the receipt rolls back. A mix returns partial:<stored>.
CREATE OR REPLACE FUNCTION public.commit_ecowitt_custom_upload_ingest(
  p_claim_id uuid,
  p_received_at timestamptz,
  p_captured_at timestamptz,
  p_passkey_sha256 text,
  p_stationtype text,
  p_readings jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid;
  v_tent uuid;
  v_interval integer;
  v_last_received timestamptz;
  v_last_captured timestamptz;
  v_revoked timestamptz;
  v_passkey text;
  v_gap_ms integer;
  v_elem jsonb;
  v_stored integer := 0;
  v_submitted integer;
BEGIN
  IF p_claim_id IS NULL OR p_received_at IS NULL OR p_captured_at IS NULL THEN
    RETURN 'claim_not_found';
  END IF;
  IF p_passkey_sha256 IS NULL OR p_passkey_sha256 !~ '^[0-9a-f]{64}$' THEN
    RETURN 'passkey_mismatch';
  END IF;
  IF p_stationtype IS NULL OR char_length(p_stationtype) < 1 OR char_length(p_stationtype) > 64 THEN
    RETURN 'passkey_mismatch';
  END IF;
  IF p_readings IS NULL OR jsonb_typeof(p_readings) <> 'array' OR jsonb_array_length(p_readings) < 1 THEN
    RETURN 'claim_not_found';
  END IF;

  SELECT user_id, tent_id, interval_seconds, last_received_at, last_captured_at, revoked_at, passkey_sha256
  INTO v_user, v_tent, v_interval, v_last_received, v_last_captured, v_revoked, v_passkey
  FROM public.ecowitt_custom_upload_claims
  WHERE id = p_claim_id
  FOR UPDATE;

  IF NOT FOUND OR v_revoked IS NOT NULL THEN
    RETURN 'claim_not_found';
  END IF;

  v_gap_ms := GREATEST(8000, v_interval * 500);
  IF v_last_received IS NOT NULL
     AND p_received_at < v_last_received + (v_gap_ms * INTERVAL '1 millisecond') THEN
    RETURN 'rate_limited';
  END IF;

  IF v_last_captured IS NOT NULL AND p_captured_at <= v_last_captured THEN
    RETURN 'duplicate_captured_at';
  END IF;

  IF v_passkey IS NULL THEN
    UPDATE public.ecowitt_custom_upload_claims
    SET passkey_sha256 = p_passkey_sha256,
        stationtype = p_stationtype,
        bound_at = p_received_at
    WHERE id = p_claim_id
      AND revoked_at IS NULL
      AND passkey_sha256 IS NULL;
    IF NOT FOUND THEN
      RETURN 'passkey_mismatch';
    END IF;
  ELSIF v_passkey IS DISTINCT FROM p_passkey_sha256 THEN
    RETURN 'passkey_mismatch';
  END IF;

  UPDATE public.ecowitt_custom_upload_claims
  SET last_received_at = p_received_at,
      last_captured_at = p_captured_at
  WHERE id = p_claim_id
    AND revoked_at IS NULL;

  v_submitted := jsonb_array_length(p_readings);
  FOR v_elem IN SELECT value FROM jsonb_array_elements(p_readings)
  LOOP
    IF v_elem->>'metric' NOT IN (
      'temperature_c', 'humidity_pct', 'vpd_kpa', 'co2_ppm', 'soil_moisture_pct',
      'soil_temp_c', 'ph', 'ec', 'ppfd'
    ) THEN
      RAISE EXCEPTION 'invalid sensor metric';
    END IF;
    IF v_elem->>'quality' NOT IN ('ok', 'degraded', 'stale', 'invalid') THEN
      RAISE EXCEPTION 'invalid sensor quality';
    END IF;
    BEGIN
      INSERT INTO public.sensor_readings (
        user_id, tent_id, source, metric, value, quality, captured_at, ts, raw_payload
      ) VALUES (
        v_user,
        v_tent,
        'live',
        v_elem->>'metric',
        (v_elem->>'value')::numeric,
        v_elem->>'quality',
        p_captured_at,
        p_captured_at,
        COALESCE(v_elem->'raw_payload', '{}'::jsonb)
      );
      v_stored := v_stored + 1;
    EXCEPTION
      WHEN unique_violation THEN
        NULL;
    END;
  END LOOP;

  IF v_stored = 0 THEN
    RAISE EXCEPTION 'sensor reading already stored'
      USING ERRCODE = '23505';
  END IF;
  IF v_stored < v_submitted THEN
    RETURN 'partial:' || v_stored::text;
  END IF;
  RETURN 'ok';
END;
$function$;

REVOKE ALL ON FUNCTION public.commit_ecowitt_custom_upload_ingest(uuid, timestamptz, timestamptz, text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commit_ecowitt_custom_upload_ingest(uuid, timestamptz, timestamptz, text, text, jsonb)
  TO service_role;

REVOKE ALL ON FUNCTION public.create_ecowitt_custom_upload_claim(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.revoke_ecowitt_custom_upload_claim(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rotate_ecowitt_custom_upload_claim(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_ecowitt_custom_upload_claim(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_ecowitt_custom_upload_claim(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_ecowitt_custom_upload_claim(uuid) TO authenticated;
