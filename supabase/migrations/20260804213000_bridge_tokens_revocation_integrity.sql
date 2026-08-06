-- Bridge token revocation integrity (bridge trust program, gap G1).
--
-- The founding guard (20260527011845) froze identity/secret columns
-- (user_id, tent_id, token_hash, token_prefix, expires_at, created_at) but
-- left revocation state and usage telemetry client-mutable: an owner
-- session — or any code running with the owner's session, e.g. XSS — could
-- UPDATE revoked_at back to NULL to re-activate a soft-revoked token, and
-- could rewrite last_used_at / first_used_at / ingest_count.
--
-- This migration extends the BEFORE UPDATE guard (additive replace of the
-- trigger function only; the trigger itself is unchanged):
--
--   * revoked_at becomes one-way for client roles: setting it from NULL is
--     allowed (that is the revoke path, which runs as `authenticated` via
--     the caller-JWT revoke-bridge-token function), but clearing it or
--     moving an existing revocation timestamp is rejected.
--   * last_used_at / first_used_at / ingest_count become server-maintained
--     for client roles. The legitimate writer, bump_bridge_token_usage
--     (SECURITY DEFINER, EXECUTE service_role-only), runs as the function
--     owner and is unaffected, as are direct service_role writes.
--   * name stays owner-mutable — renaming a bridge is a legitimate client
--     action.
--
-- Enforcement is scoped to current_user IN ('anon','authenticated') so
-- server/admin paths keep full control: an operator un-revoke, if ever
-- needed, remains a deliberate service-role action.

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

  IF current_user IN ('anon', 'authenticated') THEN
    IF OLD.revoked_at IS NOT NULL
       AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
      RAISE EXCEPTION 'bridge_token revocation is one-way';
    END IF;
    IF NEW.last_used_at IS DISTINCT FROM OLD.last_used_at
       OR NEW.first_used_at IS DISTINCT FROM OLD.first_used_at
       OR NEW.ingest_count IS DISTINCT FROM OLD.ingest_count THEN
      RAISE EXCEPTION 'bridge_token usage telemetry is server-maintained';
    END IF;
  END IF;

  RETURN NEW;
END $$;
