# pi-ingest Server-Only Bridge Secret Resolver — Contract (DOCS ONLY)

**Status:** Contract + static guardrail tests only. **No resolver
implementation, no runtime decryption, no Edge Function** may appear
in this task.

This document defines the future server-only bridge secret resolver
that will eventually run inside the `pi-ingest-readings` Edge Function
and convert encrypted bridge secret storage into usable HMAC secret
material for `verifyBridgeRequest`.

This is a **docs/static-tests only** scope. No resolver implementation,
no runtime encryption, no runtime decryption, no Edge Function, no
`service_role` usage, no schema changes, no UI, no sensor inserts, no
alert persistence changes, no Action Queue changes, no automation, no
device control, and no AI Doctor changes are introduced here.

---

## 1. Purpose

The future server-only resolver:

- Resolves encrypted bridge HMAC secrets into usable secret material
  **inside the Edge Function only**.
- Is **required before** `pi-ingest-readings` can verify bridge HMAC
  signatures via
  [`verifyBridgeRequest`](../src/lib/piIngestAuthRules.ts).
- Converts encrypted credential storage (`secret_ciphertext`,
  `secret_nonce`, `secret_key_version`) into temporary in-memory HMAC
  secret material that lives only for the duration of one request.
- Does **not** expose secret material to browser/client code, logs,
  responses, or any other surface.

---

## 2. Allowed runtime surface

The resolver may run **only** inside the future Supabase Edge Function
code path for `pi-ingest-readings`.

The resolver MUST NOT run:

- In React components.
- In browser/client bundles.
- In shared `src/lib` pure modules.

Shared `src/lib` modules may define **contracts/types only** for
input/output shapes. They must not import the Supabase client, must
not import any decryption API, and must not read encryption keys.

---

## 3. Inputs

The future resolver may accept (from a server-side query):

- bridge credential row
- `secret_ciphertext`
- `secret_nonce`
- `secret_key_version`
- `bridge_id`
- `secret_status`

Inputs must originate from a server-side SELECT on
`pi_ingest_bridge_credentials` performed inside the Edge Function
after bridge authentication context is established. Inputs must
**never** come from the request body or the bridge caller.

---

## 4. Outputs

On success the resolver returns **internally only**:

```ts
{
  ok: true;
  bridgeId: string;
  secret: string; // raw HMAC key material, in-memory only
}
```

On failure the resolver returns:

```ts
{
  ok: false;
  reason:
    | "missing_credential"
    | "inactive_credential"
    | "missing_ciphertext"
    | "missing_nonce"
    | "missing_key_version"
    | "unknown_key_version"
    | "missing_env_key"
    | "decrypt_failed"
    | "invalid_secret_status";
}
```

The successful `secret` value:

- Is held only in-memory for the duration of one HMAC verification.
- Is **never** returned to the bridge caller.
- Is **never** logged.
- Is **never** persisted.
- Is **never** stored in any cache that outlives the request.
- Is **never** assigned to `BridgeCredentialMetadata` or any other
  type that may be passed to client code.

---

## 5. Failure-closed behavior

The resolver MUST fail closed:

- Missing credential row → reject (HTTP 401, zero inserts).
- Inactive credential (`is_active = false` or
  `secret_status !== "active_encrypted"`) → reject.
- Missing `secret_ciphertext`, `secret_nonce`, or
  `secret_key_version` → reject.
- Unknown key version (no matching `PI_INGEST_SECRET_KEY_V{N}` env
  var) → reject.
- Missing env key for the stored key version → reject.
- Decryption error → reject without leaking error details to the
  caller.
- Invalid `secret_status` → reject.

A failed resolution:

- Inserts **zero** `sensor_readings` rows.
- Records **zero** `pi_ingest_idempotency_keys` rows.
- Triggers **zero** alerts, Action Queue items, or device control.
- Returns a generic auth failure response — never reveals which
  reason caused the failure to the bridge caller.

---

## 6. Key version mapping

Key version mapping follows the
[secret key management contract](./pi-ingest-secret-key-management.md):

- `secret_key_version = 1` → `PI_INGEST_SECRET_KEY_V1`
- `secret_key_version = 2` → `PI_INGEST_SECRET_KEY_V2`
- `secret_key_version = N` → `PI_INGEST_SECRET_KEY_V{N}`

Unknown or missing key versions fail closed (per §5).

---

## 7. Prohibited behavior

Explicitly forbidden:

- Returning the decrypted `secret` to the bridge caller.
- Logging the decrypted `secret`.
- Logging `secret_ciphertext`, `secret_nonce`, or
  `secret_key_version`.
- Storing the decrypted `secret` in the database.
- Caching the decrypted `secret` across requests.
- Mapping `secret_hash` to `BridgeCredential.secret`.
- Mapping `secret_ciphertext` directly to `BridgeCredential.secret`
  without decryption.
- Reading `PI_INGEST_SECRET_KEY_V*` env vars from anywhere in `src/`.
- Calling `crypto.subtle.decrypt` or `createDecipheriv` outside the
  future Edge Function path.
- Resolving secret material in React components, hooks, pages, or
  pure shared `src/lib` modules.
- Trusting request-body fields for credential lookup.

---

## 8. Stop-ship conditions

Any of the following blocks shipping the future resolver:

- Resolver runs in browser/client bundle.
- Resolver runs in a React component, hook, or page.
- Resolver runs in a pure `src/lib` module.
- Resolver returns decrypted secret material to the bridge caller.
- Resolver logs decrypted secret, ciphertext, nonce, or key material.
- Resolver caches decrypted secret across requests.
- Resolver does not fail closed on unknown key version.
- Resolver does not fail closed on missing env key.
- Resolver maps `secret_hash` or `secret_ciphertext` directly to
  `BridgeCredential.secret`.
- Resolver runs **before** bridge authentication context is
  established.
- Resolver uses request-body fields as credential lookup keys.
