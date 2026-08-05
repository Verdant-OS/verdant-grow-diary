-- Bridge token insert integrity (bridge trust program, Phase B review
-- correction; companion to 20260804213000_bridge_tokens_revocation_integrity).
--
-- The UPDATE guard alone is not enough: the owner-scoped client INSERT
-- policy still lets a fresh bridge_tokens row arrive with arbitrary
-- ingest_count / first_used_at / last_used_at — or pre-revoked, which
-- combined with one-way revocation would create frozen misleading state.
-- Extend the INSERT validator so client-role rows always start clean.
--
-- Server paths are unaffected (enforcement scoped to
-- current_user IN ('anon','authenticated')); mint's normal insert carries
-- none of these fields and passes unchanged. Additive CREATE OR REPLACE in
-- a new migration — the previously merged migrations are never edited.

CREATE OR REPLACE FUNCTION public.bridge_tokens_validate_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.expires_at IS NULL
     OR NEW.expires_at <= now() + interval '1 hour'
     OR NEW.expires_at >  now() + interval '365 days' THEN
    RAISE EXCEPTION 'expires_at must be between 1 hour and 365 days from now';
  END IF;
  IF NEW.token_prefix IS NULL OR length(NEW.token_prefix) < 6 THEN
    RAISE EXCEPTION 'token_prefix is required';
  END IF;
  IF NEW.token_hash IS NULL OR length(NEW.token_hash) < 32 THEN
    RAISE EXCEPTION 'token_hash is required';
  END IF;

  IF current_user IN ('anon', 'authenticated') THEN
    IF COALESCE(NEW.ingest_count, 0) <> 0
       OR NEW.first_used_at IS NOT NULL
       OR NEW.last_used_at IS NOT NULL THEN
      RAISE EXCEPTION 'bridge_token usage telemetry is server-maintained';
    END IF;
    IF NEW.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'bridge_token rows must be created unrevoked';
    END IF;
  END IF;

  RETURN NEW;
END $$;
