# pi-ingest Bridge Secret — Encryption Key Management Contract (DOCS ONLY)

**Status:** Contract + static guardrail tests only. **No runtime
encryption or decryption code exists yet.** No Edge Function and no
resolver exist yet. This document governs how encrypted pi-ingest
bridge secrets may be decrypted, where keys may be read, how versions
are named, and how rotation is performed.

This is a **docs/static-tests only** scope. No runtime crypto, no Edge
Function, no resolver, no `service_role`, no schema changes, no UI
changes, no sensor insert behavior changes, no automation, no device
control, no alert persistence changes, no Action Queue changes, and no
AI Doctor changes are introduced here.

---

## 1. Purpose

This contract defines **server-only key management rules** for the
encrypted bridge secrets stored in `public.pi_ingest_bridge_credentials`
(columns `secret_ciphertext`, `secret_nonce`, `secret_key_version`,
`secret_status`).

These rules are **required before any future resolver or Edge Function
can verify HMAC requests** from external bridges. Until this contract is
satisfied by real server-side code, the future `pi-ingest-readings`
Edge Function remains blocked (see
[`docs/pi-ingest-readings-contract.md`](./pi-ingest-readings-contract.md)
§12).

---

## 2. Key naming

Encryption keys are held only as environment variables in the future
Supabase Edge Function runtime. Required naming convention:

- `PI_INGEST_SECRET_KEY_V1`
- `PI_INGEST_SECRET_KEY_V2`
- Future versions follow the same pattern: `PI_INGEST_SECRET_KEY_V{N}`.

Key material is **never** committed to the repository, never present in
the client bundle, and never present in pure modules under `src/lib`.

---

## 3. Key version mapping

The integer column `secret_key_version` on each credential row maps
directly to an env var:

- `secret_key_version = 1` → `PI_INGEST_SECRET_KEY_V1`
- `secret_key_version = 2` → `PI_INGEST_SECRET_KEY_V2`
- `secret_key_version = N` → `PI_INGEST_SECRET_KEY_V{N}`

Failure rules:

- **Unknown key versions must fail closed.** If the stored
  `secret_key_version` does not have a corresponding env var loaded
  into the runtime, verification MUST reject the request (HTTP 401,
  zero inserts) without falling back to any other key.
- **Missing env key must fail closed.** If `PI_INGEST_SECRET_KEY_V{N}`
  is not set in the Edge Function environment at request time,
  verification MUST reject the request (HTTP 401, zero inserts).
- No silent downgrade. No "best available key" selection. No
  in-memory cache lookup that bypasses the version mapping.

---

## 4. Allowed decryption surface

Decryption of `secret_ciphertext` may run **only** inside the future
Supabase Edge Function code path responsible for HMAC verification on
`pi-ingest-readings`.

Decryption MUST NOT run in:

- React components.
- Any browser/client bundle code.
- Shared pure modules under `src/lib/`.
- Any hook under `src/hooks/`.
- Any test fixture or seed script that ships with the client.

Pure modules under `src/lib/` may define **types and contracts only**
(for example, a `BridgeCredential` shape). They must not decrypt
secrets, must not read env keys, and must not import server-only
crypto APIs.

---

## 5. Prohibited surfaces

The following are explicitly forbidden anywhere outside the future
Edge Function path:

- `process.env.PI_INGEST_SECRET_KEY*` references in `src/`.
- `Deno.env.get("PI_INGEST_SECRET_KEY...")` outside future Edge
  Function paths under `supabase/functions/pi-ingest-readings/`.
- `crypto.subtle.decrypt` outside future Edge Function paths.
- `createDecipheriv` outside future Edge Function paths.
- Plaintext bridge secret storage in any database column, log line,
  test fixture, or snapshot.
- Returning decrypted secret material to the client.
- Logging decrypted secrets.
- Logging ciphertext, nonce, or key material.
- Mapping `secret_hash` to `BridgeCredential.secret` (audit finding;
  see `docs/pi-ingest-readings-contract.md` §12).
- Mapping `secret_ciphertext` directly to `BridgeCredential.secret`
  (ciphertext is not usable HMAC key material — decrypted plaintext
  must be produced in-memory inside the Edge Function only).

---

## 6. Rotation procedure

Future rotation steps:

1. Add a new env var to the Edge Function runtime, e.g.
   `PI_INGEST_SECRET_KEY_V2`.
2. Mark old credentials as `pending_rotation` (via `secret_status`)
   or re-encrypt them server-side under the new key version.
3. Newly issued credentials use the latest active key version
   (highest `V{N}`) and store the matching `secret_key_version`.
4. Existing credentials continue verifying against their stored
   `secret_key_version` until they are re-encrypted or rotated.
5. Once all active credentials are migrated to the new key version,
   retire the old key by removing the old env var from the runtime.
6. Unknown or missing key versions fail closed (per §3).

No client-side step exists in this procedure. Rotation is entirely a
server-side operation.

---

## 7. Safe credential lifecycle

- A bridge secret may be generated server-side later (e.g. by an
  authenticated owner action that runs inside an Edge Function).
- The plaintext secret may be **shown once at creation** if a future UI
  is built. After creation it is unrecoverable from the server.
- The plaintext secret is **never stored** in the database. Only
  `secret_ciphertext` + `secret_nonce` + `secret_key_version` are
  stored.
- The browser/client **never receives** ciphertext, nonce, key
  version, or `secret_hash`. These columns are excluded from the
  metadata-only safe view `pi_ingest_bridge_credentials_safe`.
- The metadata view may show only non-sensitive metadata such as
  `bridge_id`, `is_active`, `allowed_tent_ids`, `last_used_at`,
  `created_at`, and `updated_at`.

---

## 8. Stop-ship conditions

Any of the following blocks shipping the future resolver or Edge
Function:

- Decryption code appears outside the future Edge Function path.
- A `PI_INGEST_SECRET_KEY*` env key read appears anywhere in `src/`.
- A plaintext bridge secret column exists in the database.
- The client can `SELECT` `secret_ciphertext`, `secret_nonce`,
  `secret_key_version`, or `secret_hash` from
  `pi_ingest_bridge_credentials`.
- A resolver maps encrypted columns directly to a usable HMAC secret
  field on `BridgeCredential`.
- Secret material (plaintext, ciphertext, nonce, key) appears in
  logs, tests, or snapshots.
- The Edge Function verifies HMAC without server-side decrypted
  secret material (e.g., it tries to use `secret_hash` as the key).
- Missing or unknown key versions do not fail closed.
