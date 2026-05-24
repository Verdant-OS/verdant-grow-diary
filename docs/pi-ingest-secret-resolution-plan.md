# pi-ingest Secret Resolution Plan (DOCS + STATIC TESTS ONLY)

**Status:** Plan + static guardrails only. No Edge Function
implementation, no encryption, no decryption, no `service_role` use,
no schema changes, no UI, no sensor inserts, no alert persistence
changes, no Action Queue changes, no automation, and no device
control may appear in this task.

This document defines exactly how the future `pi-ingest-readings`
Edge Function will resolve usable HMAC secret material from the
encrypted `pi_ingest_bridge_credentials` storage **without exposing
secrets or ciphertext to browser clients**.

It complements (does not replace):

- `docs/pi-ingest-readings-contract.md`
- `docs/pi-ingest-server-secret-resolver-contract.md`
- `docs/pi-ingest-server-secret-resolver-implementation-plan.md`
- `docs/pi-ingest-secret-key-management.md`
- `docs/pi-ingest-bridge-credential-metadata-deferred.md`

---

## 1. Trust boundary

The **Edge Function is the only place** allowed to resolve usable
bridge secret material. Specifically:

- Only `supabase/functions/pi-ingest-readings/` may convert encrypted
  credential columns into a usable HMAC secret.
- No file under `src/` may resolve, decrypt, or otherwise materialize
  the plaintext bridge secret.
- No browser/client bundle may import resolver code from the Edge
  Function directory.
- No other Edge Function may resolve `pi-ingest` bridge secrets.

## 2. Browser/client read prohibitions

The browser/client must **never** read any of the following fields,
in any shape (direct SELECT, RPC, view, or projection):

- `secret_hash`
- `secret_ciphertext`
- `secret_nonce`
- `secret_key_version`
- the plaintext bridge secret (in any form)

These fields must not appear in any client-visible payload, log,
response body, telemetry, error message, or UI surface.

## 3. Base table access

The base credential table `public.pi_ingest_bridge_credentials` must
**not have client SELECT access**:

- No SELECT policy granting `authenticated` or `anon` read access.
- No exposed view, RPC, or function that returns secret-bearing
  columns to clients.
- The `pi_ingest_bridge_credentials_safe` SECURITY DEFINER view has
  already been dropped (see
  `docs/pi-ingest-bridge-credential-metadata-deferred.md`).

## 4. Server-side access path

The future Edge Function **may use `service_role`** to read the
bridge credential row, but **only** after:

- The request has passed shape validation
  (`piIngestRequestRules` / typed payload checks).
- Per-request safety (rate-limit, bridge id present, tent id present)
  has been evaluated.
- The read is scoped to the single credential row for the supplied
  `bridge_id`.

`service_role` usage is confined to server-only code under
`supabase/functions/pi-ingest-readings/`. It must not appear in any
file under `src/`.

## 5. Decryption key source

The decryption key material must come **only** from server-only
sources:

- `Deno.env.get(...)` inside the Edge Function, or
- a server-side secret store / Vault.

The decryption key must **never** be:

- shipped in client config, `.env` files consumed by Vite, or any
  bundled JS,
- written to a database row,
- logged,
- returned in any HTTP response,
- exposed to AI Doctor, Action Queue, alerts, or device-control code.

The mapping from `secret_key_version` to env var name is documented
in `docs/pi-ingest-secret-key-management.md`.

## 6. Decrypted secret lifetime

The decrypted bridge secret is **memory-only**:

- It lives only for the duration of a single request.
- It is consumed exactly once by `verifyBridgeRequest`
  (`src/lib/piIngestAuthRules.ts`).
- No caching. No memoization. No reuse across requests.
- No write to any database row, log, response body, or storage
  bucket.
- The reference is dropped immediately after HMAC verification.

## 7. Logging prohibitions

The decrypted secret must **never be logged**. Likewise, the
following must never appear in logs:

- raw request body
- HMAC signature
- ciphertext
- nonce
- env key name with its value
- env key value

## 8. Verification ordering

HMAC verification happens **before** any sensor or idempotency write:

1. Shape validation.
2. Bridge credential lookup (server-only).
3. Secret resolution (decryption).
4. `verifyBridgeRequest` HMAC check.
5. Tent-scope check.
6. Idempotency lookup.
7. Sensor insert + idempotency insert (transactional).

If any step 1–5 fails, the pipeline returns a fail-closed response
and **zero rows are inserted**.

## 9. Auth-failure zero-write guarantee

On any auth failure (missing credential, inactive credential, invalid
status, missing ciphertext/nonce/key version, unknown key version,
missing env key, decrypt failure, signature mismatch, tent not
allowed):

- Zero rows are inserted into `sensor_readings`.
- Zero rows are inserted into `pi_ingest_idempotency_keys`.
- The response uses the fail-closed shapes defined in
  `src/lib/piIngestFailClosedResponses.ts`.

## 10. Invalid-payload zero-write guarantee

On any invalid payload (shape failure, missing tent id, malformed
metric, non-finite value, future-dated captured_at beyond the
allowed skew, etc.):

- Zero rows are inserted into `sensor_readings`.
- Zero rows are inserted into `pi_ingest_idempotency_keys`.
- The response is fail-closed.

## 11. No alert persistence

The `pi-ingest-readings` endpoint must **not** create alerts,
`alert_events`, or any alert-related rows. Alert derivation is the
responsibility of downstream code paths.

## 12. No Action Queue items

The endpoint must **not** create `action_queue` rows. Action Queue
items remain grower-approved and originate from explicit user flows.

## 13. No device control

The endpoint must **not** call any device-control surface (fans,
lights, pumps, heaters, humidifiers, dehumidifiers, irrigation,
dosing, MQTT publish, Home Assistant service calls, or any other
actuation API).

## 14. `secret_hash` → secret mapping is forbidden

`secret_hash` is a one-way digest. It **cannot** be used to verify
incoming HMAC signatures. The resolver must **not** map
`secret_hash` to `BridgeCredential.secret` under any name or alias.

## 15. `secret_ciphertext` → secret mapping is forbidden

`secret_ciphertext` is encrypted bytes. It must **not** be assigned
directly to `BridgeCredential.secret` without performing AES-256-GCM
decryption using the server-only key resolved from
`secret_key_version`.

## 16. Decryption output is the only valid secret source

The **only** valid source of `BridgeCredential.secret` is the UTF-8
string output of successful AES-256-GCM decryption of
`secret_ciphertext` using `secret_nonce` and the env key resolved
from `secret_key_version`. Any other source is a stop-ship.

## 17. Secret rotation is deferred

Secret rotation (issuing new ciphertext, bumping `secret_key_version`,
revoking old material) is **deferred** unless explicitly scoped in a
future task. This plan covers only the resolver read path.

## 18. Metadata UI is deferred

Any UI surface that exposes bridge credential metadata
(`secret_status`, `secret_key_version`, rotation timestamps, etc.)
is **deferred** until a safe server-side read path exists. See
`docs/pi-ingest-bridge-credential-metadata-deferred.md`.

---

## Stop-ship summary

Any of the following blocks shipping the resolver:

- Browser/client can read `secret_hash`, `secret_ciphertext`,
  `secret_nonce`, `secret_key_version`, or plaintext secret.
- Base credential table grants client SELECT.
- Decryption key sourced from client config.
- Decrypted secret is cached, logged, returned, or stored.
- HMAC verification runs after writes.
- Auth or payload failure inserts any row.
- Endpoint creates alerts, action queue items, or device commands.
- `secret_hash` → `BridgeCredential.secret`.
- `secret_ciphertext` → `BridgeCredential.secret` without decryption.
- `service_role` used outside the Edge Function.
