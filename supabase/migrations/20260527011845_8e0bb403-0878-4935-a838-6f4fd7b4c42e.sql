-- Bridge tokens: tent-scoped, expiring API tokens for headless bridges.
-- Plaintext is shown once at mint time and never stored. Only sha-256 hash and a
-- short non-secret prefix are persisted. Token verification lives in the edge
-- function (service role) so this table does not need SELECT-by-hash policies.

CREATE TABLE public.bridge_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  tent_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'bridge',
  token_prefix text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bridge_tokens_user_tent_idx
  ON public.bridge_tokens (user_id, tent_id);

GRANT SELECT, INSERT, UPDATE ON public.bridge_tokens TO authenticated;
GRANT ALL ON public.bridge_tokens TO service_role;

ALTER TABLE public.bridge_tokens ENABLE ROW LEVEL SECURITY;

-- Owners can list their tokens (metadata only; hash is opaque).
CREATE POLICY "Users view own bridge_tokens"
  ON public.bridge_tokens FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Owners can insert a token only for a tent they own.
CREATE POLICY "Users insert own bridge_tokens"
  ON public.bridge_tokens FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.tents t
      WHERE t.id = bridge_tokens.tent_id AND t.user_id = auth.uid()
    )
  );

-- Owners can update only their own rows (used for revoke). Defense-in-depth:
-- forbid changing user_id, tent_id, token_hash, token_prefix, or expires_at.
CREATE POLICY "Users update own bridge_tokens"
  ON public.bridge_tokens FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.bridge_tokens_guard_immutables()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.tent_id IS DISTINCT FROM OLD.tent_id
     OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
     OR NEW.token_prefix IS DISTINCT FROM OLD.token_prefix
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'immutable bridge_token columns cannot be changed';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER bridge_tokens_guard_immutables_t
  BEFORE UPDATE ON public.bridge_tokens
  FOR EACH ROW EXECUTE FUNCTION public.bridge_tokens_guard_immutables();

-- Expiry guard: must be between 1 hour and 365 days from creation.
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
  RETURN NEW;
END $$;

CREATE TRIGGER bridge_tokens_validate_insert_t
  BEFORE INSERT ON public.bridge_tokens
  FOR EACH ROW EXECUTE FUNCTION public.bridge_tokens_validate_insert();