# Bridge credential metadata access — deferred

**Status:** Deferred (no client/UI read path).

## Context

`public.pi_ingest_bridge_credentials` stores encrypted bridge secrets
(`secret_ciphertext`, `secret_nonce`, `secret_key_version`, `secret_hash`)
plus non-sensitive metadata (`bridge_id`, `secret_hint`,
`allowed_tent_ids`, `is_active`, `secret_status`, timestamps).

Signed-in clients are intentionally blocked from reading this base
table — there is **no owner-scoped SELECT RLS policy** on it, so the
encrypted secret material cannot leak through the Supabase REST API
even if column-level grants were misconfigured.

## Why the safe view was removed

An earlier migration created `public.pi_ingest_bridge_credentials_safe`
as a `SECURITY DEFINER` view (`security_invoker = false`) so it could
return owner-scoped metadata without re-introducing a base-table SELECT
policy. Supabase lint **0010 (Security Definer View)** flagged this
pattern because such views bypass caller RLS.

A `SECURITY INVOKER` rewrite is **not viable today**: under invoker
semantics the base table's RLS applies, and adding any base-table
SELECT policy — even with column-level grants — would weaken the
"clients cannot read credential rows" invariant guarded by
`src/test/piIngestBridgeCredentialEncryptedStorage.test.ts`.

The view has therefore been dropped. There is no client-readable
bridge credential metadata surface right now, and no UI depends on
one.

## Safe path forward

When a bridge management UI is built, expose metadata via an Edge
Function that:

- authenticates the caller (verify JWT),
- reads metadata columns only with a scoped server-side query,
- never returns ciphertext / nonce / key version / hash,
- filters by the authenticated `user_id`,
- does **not** use `service_role` beyond what the existing pi-ingest
  patterns already justify, and
- ships with the same static guardrails as the other pi-ingest
  modules (no automation, no device control, no sensor inserts).

Until then, do not re-create the safe view.
