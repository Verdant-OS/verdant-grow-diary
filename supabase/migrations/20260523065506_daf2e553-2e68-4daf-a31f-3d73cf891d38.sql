-- Encrypted bridge secret storage foundation.
-- Storage only; no decryption logic, no service_role, no Edge Function.

ALTER TABLE public.pi_ingest_bridge_credentials
  ADD COLUMN secret_ciphertext bytea NULL,
  ADD COLUMN secret_nonce bytea NULL,
  ADD COLUMN secret_key_version integer NULL,
  ADD COLUMN secret_status text NOT NULL DEFAULT 'pending_rotation';

ALTER TABLE public.pi_ingest_bridge_credentials
  ADD CONSTRAINT pi_ingest_bridge_credentials_secret_status_allowed
    CHECK (secret_status IN ('pending_rotation', 'active_encrypted', 'disabled'));

ALTER TABLE public.pi_ingest_bridge_credentials
  ADD CONSTRAINT pi_ingest_bridge_credentials_active_requires_encrypted
    CHECK (is_active = false OR secret_status = 'active_encrypted');

ALTER TABLE public.pi_ingest_bridge_credentials
  ADD CONSTRAINT pi_ingest_bridge_credentials_encrypted_requires_material
    CHECK (
      secret_status <> 'active_encrypted'
      OR (
        secret_ciphertext IS NOT NULL
        AND secret_nonce IS NOT NULL
        AND secret_key_version IS NOT NULL
      )
    );

ALTER TABLE public.pi_ingest_bridge_credentials
  ADD CONSTRAINT pi_ingest_bridge_credentials_key_version_positive
    CHECK (secret_key_version IS NULL OR secret_key_version > 0);

-- Remove base-table SELECT policy: encrypted columns must not be
-- selectable from the browser/client. RLS is row-level; client SELECT on
-- the base table would still expose sensitive columns.
DROP POLICY IF EXISTS "Users view own pi_ingest_bridge_credentials"
  ON public.pi_ingest_bridge_credentials;

-- Safe metadata-only view for client/UI usage. Definer-style: runs as
-- view owner, bypasses base-table RLS, but only exposes non-sensitive
-- columns and filters by auth.uid().
CREATE OR REPLACE VIEW public.pi_ingest_bridge_credentials_safe
WITH (security_invoker = false) AS
SELECT
  id,
  user_id,
  bridge_id,
  secret_hint,
  allowed_tent_ids,
  is_active,
  secret_status,
  created_at,
  updated_at,
  last_used_at
FROM public.pi_ingest_bridge_credentials
WHERE auth.uid() = user_id;

REVOKE ALL ON public.pi_ingest_bridge_credentials_safe FROM PUBLIC;
GRANT SELECT ON public.pi_ingest_bridge_credentials_safe TO authenticated;