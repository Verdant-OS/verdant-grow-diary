-- Storage foundation for future pi-ingest bridge credential resolution.
-- No Edge Function, no elevated-key access, no plaintext secret storage.

CREATE TABLE public.pi_ingest_bridge_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  bridge_id text NOT NULL,
  secret_hash text NOT NULL,
  secret_hint text NULL,
  allowed_tent_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NULL,

  CONSTRAINT pi_ingest_bridge_credentials_bridge_id_nonempty
    CHECK (bridge_id <> ''),
  CONSTRAINT pi_ingest_bridge_credentials_secret_hash_nonempty
    CHECK (secret_hash <> ''),
  CONSTRAINT pi_ingest_bridge_credentials_active_requires_tents
    CHECK (
      is_active = false
      OR COALESCE(array_length(allowed_tent_ids, 1), 0) >= 1
    ),
  CONSTRAINT pi_ingest_bridge_credentials_user_bridge_unique
    UNIQUE (user_id, bridge_id)
);

CREATE INDEX pi_ingest_bridge_credentials_user_bridge_idx
  ON public.pi_ingest_bridge_credentials (user_id, bridge_id);

CREATE INDEX pi_ingest_bridge_credentials_user_active_idx
  ON public.pi_ingest_bridge_credentials (user_id, is_active);

-- Reuse the shared updated_at trigger helper already defined in this project.
CREATE TRIGGER pi_ingest_bridge_credentials_set_updated_at
  BEFORE UPDATE ON public.pi_ingest_bridge_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pi_ingest_bridge_credentials ENABLE ROW LEVEL SECURITY;

-- Owner-scoped SELECT.
CREATE POLICY "Users view own pi_ingest_bridge_credentials"
  ON public.pi_ingest_bridge_credentials
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Owner-scoped INSERT.
CREATE POLICY "Users insert own pi_ingest_bridge_credentials"
  ON public.pi_ingest_bridge_credentials
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Owner-scoped UPDATE (for is_active, allowed_tent_ids, last_used_at).
CREATE POLICY "Users update own pi_ingest_bridge_credentials"
  ON public.pi_ingest_bridge_credentials
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Intentionally NO delete policy and NO elevated-key grant.