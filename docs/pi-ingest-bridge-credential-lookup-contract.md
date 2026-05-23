# pi-ingest Bridge Credential Lookup — Contract (DOCS ONLY)

**Status:** Contract + Deno/static guardrail tests only. **No DB lookup
implementation, no Supabase client, no `service_role` runtime usage,
and no schema migration** are introduced in this task.

This document defines the server-only lookup of encrypted bridge
credential rows that the future `pi-ingest-readings` Edge Function
will perform **before** HMAC verification. The lookup itself does NOT
authenticate the bridge — it only resolves *candidate* row(s) so the
resolver in
[`secretResolver.ts`](../supabase/functions/pi-ingest-readings/secretResolver.ts)
can derive in-memory HMAC key material for verification via
[`verifyBridgeRequest`](../src/lib/piIngestAuthRules.ts).

Related contracts:

- [`docs/pi-ingest-readings-contract.md`](./pi-ingest-readings-contract.md)
- [`docs/pi-ingest-secret-key-management.md`](./pi-ingest-secret-key-management.md)
- [`docs/pi-ingest-server-secret-resolver-contract.md`](./pi-ingest-server-secret-resolver-contract.md)
- [`docs/pi-ingest-server-secret-resolver-implementation-plan.md`](./pi-ingest-server-secret-resolver-implementation-plan.md)
- [`docs/pi-ingest-tent-owner-lookup-contract.md`](./pi-ingest-tent-owner-lookup-contract.md)

---

## 1. Purpose

The future server-only credential lookup:

- Loads encrypted bridge credential row(s) for a given `bridge_id`
  from `public.pi_ingest_bridge_credentials`.
- Runs **inside the `pi-ingest-readings` Edge Function only**.
- Runs **before** HMAC verification, but does **not** itself
  authenticate the bridge. It only produces *candidate* row(s) for
  the resolver + verifier to evaluate.
- Feeds rows shaped by
  [`bridgeCredentialRow.ts`](../supabase/functions/pi-ingest-readings/bridgeCredentialRow.ts)
  into the resolver. Plaintext secret material is produced only by
  the resolver, only in-memory, and is dropped immediately after
  HMAC verification.

The lookup must **not** insert sensor readings, write idempotency
keys, derive alerts, enqueue actions, control devices, or affect AI
Doctor surfaces.

---

## 2. Allowed runtime surface

The lookup may run **only** inside
`supabase/functions/pi-ingest-readings/`.

The lookup MUST NOT run in:

- Any file under `src/` (including `src/lib/`, `src/hooks/`,
  `src/components/`, `src/pages/`, `src/store/`).
- React components, hooks, pages.
- Any browser/client bundle.
- Any shared pure module.

Shared `src/lib/` modules may define **types/contracts only** for
input/output shapes (already covered by
`src/lib/piIngestServerSecretResolverTypes.ts` and the Edge-Function
local `bridgeCredentialRow.ts`).

---

## 3. Bridge id uniqueness — architecture decision

> **⚠️ Current DB state:** `public.pi_ingest_bridge_credentials` has
> `UNIQUE (user_id, bridge_id)` only — `bridge_id` is **NOT globally
> unique**. Two different `user_id`s could theoretically own the same
> `bridge_id`. Until that changes, any singular
> `loadBridgeCredentialRow(bridgeId)` helper is **unsafe** and MUST
> NOT be implemented.

Two options. **Option A is recommended.**

### Option A — preferred: add a global `bridge_id` uniqueness constraint

- Add a DB constraint making `bridge_id` globally unique across
  `public.pi_ingest_bridge_credentials` (e.g. a `UNIQUE` index on
  `bridge_id` alone, or a partial unique index on active rows).
- After the constraint ships and is verified in the database, the
  future helper may be:

  ```ts
  loadBridgeCredentialRow(
    bridgeId: string,
  ): Promise<PiIngestBridgeCredentialRow | null>;
  ```

- This is the simplest, safest model and matches the resolver +
  HMAC verification flow.

### Option B — keep `(user_id, bridge_id)` uniqueness only

- The future helper MUST be named and shaped as a **candidate**
  lookup that can return zero, one, or many rows:

  ```ts
  loadBridgeCredentialCandidates(
    bridgeId: string,
  ): Promise<PiIngestBridgeCredentialRow[]>;
  ```

- The future auth flow MUST try candidate credentials safely (e.g.
  attempt HMAC verification against each active candidate in a
  constant-time-ish loop) **without** leaking which `user_id` or
  which candidate matched.
- Failure responses MUST be indistinguishable across "no candidate",
  "one candidate failed", and "many candidates all failed". No
  `user_id` may appear in logs that the bridge caller can observe.

### Hard rule

A singular `loadBridgeCredentialRow(bridgeId)` is **unsafe unless
`bridge_id` is globally unique** in the database. The endpoint MUST
NOT assume a single row exists when only `(user_id, bridge_id)`
uniqueness is enforced.

---

## 4. Required SELECT columns

The future lookup MUST select **only** these columns from
`public.pi_ingest_bridge_credentials`:

- `bridge_id`
- `user_id`
- `is_active`
- `secret_ciphertext`
- `secret_nonce`
- `secret_key_version`
- `secret_status`
- `allowed_tent_ids`
- `last_used_at`

The lookup MUST NOT select:

- `secret_hash`
- any plaintext `secret` column
- `secret_hint`
- `raw_body`
- `raw_payload`
- sensor values (`temp_c`, `rh_pct`, `co2_ppm`, `vpd_kpa`, etc.)
- bridge signatures (`x-bridge-signature` / stored signature columns)

Selecting any of those is a stop-ship condition.

---

## 5. Security model

- A server-only Supabase client may be constructed **inside the
  Edge Function only** to perform this lookup.
- If `SUPABASE_SERVICE_ROLE_KEY` is used, it MUST be read only inside
  this Edge Function path. The elevated role MUST NEVER be:
  - imported, read, referenced, or logged in any file under `src/`,
  - shipped in any browser/client bundle,
  - exposed to the bridge caller, the bridge response body, or any
    structured log destination accessible to clients.
- Use of the elevated role is limited to:
  - this credential lookup,
  - the future tent-owner lookup
    (`docs/pi-ingest-tent-owner-lookup-contract.md`),
  - and the future idempotency-key insert path.
- The lookup MUST NOT write any row in any table. It is read-only.

---

## 6. Input rules

- The lookup's sole input is `bridge_id`.
- `bridge_id` MUST come from request headers
  (`x-bridge-id`) or a route/auth envelope that the Edge Function
  derived from headers — never from a body field claimed by the
  caller.
- The lookup MUST NOT accept a client-provided `user_id`.
- The lookup MUST NOT accept a bridge-provided owner id.
- The lookup MUST NOT accept a client-provided `secret_key_version`.
- The lookup MUST NOT accept any value from the JSON body for the
  purpose of resolving which credential to load.

---

## 7. Failure behavior

The lookup MUST fail closed in every error path:

- **Missing `bridge_id`** (absent / empty / whitespace-only) →
  reject (HTTP 401, zero inserts).
- **Unknown `bridge_id`** (no matching row, or no active row) →
  reject (HTTP 401, zero inserts).
- **Multiple rows for the same `bridge_id`** under Option A (global
  uniqueness assumed) → reject (HTTP 401, zero inserts). This must
  fail closed; do not silently pick one.
- **Multiple rows** under Option B → only permitted when the helper
  is explicitly the *candidate* helper
  (`loadBridgeCredentialCandidates`) and the auth flow is built to
  evaluate each candidate safely. Otherwise → reject.
- Any lookup failure MUST result in:
  - **Zero** `sensor_readings` rows inserted.
  - **Zero** `pi_ingest_idempotency_keys` rows recorded.
  - **Zero** `alerts` / `alert_events` rows derived.
  - **Zero** `action_queue` rows created.
- Failure responses MUST NOT reveal whether a `bridge_id` exists,
  which `user_id` owns it, how many candidates were considered, or
  which key version was tried.

---

## 8. Prohibited behavior

The future lookup MUST NOT:

- Run in any browser/client code path.
- Live under `src/lib/` (or anywhere else in `src/`).
- Return an encrypted credential row to the client or bridge caller.
- Select `secret_hash`.
- Select any plaintext secret column.
- Select raw body, raw payload, signature, or sensor value columns.
- Write to `sensor_readings`.
- Write to `pi_ingest_idempotency_keys`.
- Write to `alerts`, `alert_events`, or `action_queue`.
- Call any automation or device-control surface.
- Call `resolveBridgeSecret` before the row shape has been validated
  via `toResolveBridgeSecretInput` (and, under Option B, before
  candidate selection rules have been applied).
- Assume global `bridge_id` uniqueness unless a DB constraint
  enforces it.
- Use `SUPABASE_SERVICE_ROLE_KEY` outside this Edge Function path.

---

## 9. Stop-ship conditions

Any of the following blocks shipping the future lookup:

- A singular `loadBridgeCredentialRow(bridgeId)` is implemented while
  `bridge_id` is not globally unique in the database.
- The lookup runs in browser/client code.
- The lookup accepts a client-provided `user_id`.
- The lookup accepts a bridge-provided owner id.
- The lookup returns the encrypted credential row to the bridge
  caller.
- The lookup selects `secret_hash` or a plaintext secret column.
- The lookup selects raw body, raw payload, signature, or sensor
  value columns.
- The lookup writes to any table.
- The lookup uses `SUPABASE_SERVICE_ROLE_KEY` from any code path
  outside this Edge Function directory.
- The lookup's success path is wired into the endpoint while the
  endpoint still lacks the full HMAC / tent authorization /
  idempotency / rate-limit checks required by
  `docs/pi-ingest-readings-contract.md`.
- The Edge Function caches credential rows across requests.

---

## 10. Out of scope for this contract

- The DB migration that adds global `bridge_id` uniqueness (Option
  A). Recommended as the next build step.
- The actual `loadBridgeCredentialRow` / `loadBridgeCredentialCandidates`
  implementation.
- The Supabase server client construction inside the Edge Function.
- HMAC verification, idempotency, rate-limiting, sensor insert
  pipeline, alert derivation, action queue, automation, and device
  control — all governed by other contracts and out of scope here.
