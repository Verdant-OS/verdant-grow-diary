# pi-ingest Server-Only Bridge Secret Resolver — Implementation Plan (DOCS ONLY)

**Status:** Implementation **plan** + static guardrail tests only.
**No resolver code, no runtime decryption, no Edge Function behavior
change** may appear in this task.

This document is the detailed implementation plan for the future
server-only bridge secret resolver that will eventually run inside the
`pi-ingest-readings` Edge Function. It complements:

- `docs/pi-ingest-readings-contract.md`
- `docs/pi-ingest-server-secret-resolver-contract.md`
- `docs/pi-ingest-secret-key-management.md`
- `docs/pi-ingest-tent-owner-lookup-contract.md`

This is a **docs + static-tests only** scope. No resolver implementation,
no runtime encryption, no runtime decryption, no Edge Function behavior
change, no Supabase client changes, no `service_role` usage, no schema
changes, no UI changes, no sensor inserts, no idempotency inserts, no
alert persistence changes, no Action Queue changes, no automation, no
device control, and no AI Doctor changes are introduced here.

---

## 1. Purpose

The future resolver:

- Runs **only inside the `pi-ingest-readings` Edge Function**.
- Converts encrypted bridge credential fields
  (`secret_ciphertext`, `secret_nonce`, `secret_key_version`,
  `secret_status`) into temporary in-memory HMAC secret material.
- Feeds usable secret material **only** into
  [`verifyBridgeRequest`](../src/lib/piIngestAuthRules.ts).
- Fails closed on every missing field, inactive credential, unknown
  key version, decrypt failure, or invalid status.
- Never exposes secret material to browser/client code, logs,
  responses, or any other surface.

---

## 2. Files to create later

Future files (do **not** create in this task):

- `supabase/functions/pi-ingest-readings/secretResolver.ts`
  - Owns the high-level resolve flow: validate inputs, fetch the env
    key for the requested `secret_key_version`, call decrypt, return
    a discriminated result.
- `supabase/functions/pi-ingest-readings/crypto.ts` (optional)
  - Thin wrapper around the chosen decryption primitive
    (AES-256-GCM via WebCrypto `crypto.subtle`). Only this file may
    touch decrypt APIs.

No new files under `src/lib/`. Shared `src/lib` modules may carry
contracts/types **only** (already covered by
`src/lib/piIngestServerSecretResolverTypes.ts` when it lands).

---

## 3. Runtime boundary

- Resolver may exist **only** under
  `supabase/functions/pi-ingest-readings/`.
- Resolver must **not** exist under `src/lib/`.
- Resolver must **not** be imported by any file under
  `src/components/`, `src/pages/`, `src/hooks/`, `src/store/`, or any
  other React surface.
- Resolver must **not** run in the browser/client bundle.
- Vite must never bundle the resolver. The only entrypoint is the
  Edge Function `index.ts`.

---

## 4. Inputs

Future resolver input shape (all server-side, sourced from a
service-role read of `pi_ingest_bridge_credentials` performed
**after** the request is shape-validated):

```ts
interface ResolveBridgeSecretInput {
  bridgeId: string;
  secretCiphertext: string | null | undefined;
  secretNonce: string | null | undefined;
  secretKeyVersion: number | null | undefined;
  secretStatus: string | null | undefined;
}
```

The resolver must **not** accept:

- Raw secret material from the request.
- A client-provided key version.
- A client-provided `user_id` or owner id.

---

## 5. Output

Discriminated result:

```ts
type ResolveBridgeSecretResult =
  | { ok: true; bridgeId: string; secret: string }
  | { ok: false; reason: BridgeSecretResolverFailureReason };

type BridgeSecretResolverFailureReason =
  | "missing_credential"
  | "inactive_credential"
  | "invalid_secret_status"
  | "missing_ciphertext"
  | "missing_nonce"
  | "missing_key_version"
  | "unknown_key_version"
  | "missing_env_key"
  | "decrypt_failed";
```

- `secret` on success is a freshly allocated string used only to call
  `verifyBridgeRequest`. The caller MUST drop the reference
  immediately after verification.
- `secret` MUST NOT be logged, returned in the HTTP response,
  serialized into JSON, or written to any database row.

---

## 6. Failure reasons and HTTP mapping

The Edge Function is responsible for mapping resolver failures to
fail-closed HTTP responses. The resolver itself **only** returns the
discriminated reason — it never builds HTTP responses, never logs the
reason with secret context, and never throws raw errors that could
leak stack traces.

| Reason | HTTP status | Wire `error` |
| --- | --- | --- |
| `missing_credential` | 401 | `unauthorized` |
| `inactive_credential` | 401 | `unauthorized` |
| `invalid_secret_status` | 401 | `unauthorized` |
| `missing_ciphertext` | 500 | `secret_resolver_failed` |
| `missing_nonce` | 500 | `secret_resolver_failed` |
| `missing_key_version` | 500 | `secret_resolver_failed` |
| `unknown_key_version` | 500 | `secret_resolver_failed` |
| `missing_env_key` | 500 | `secret_resolver_failed` |
| `decrypt_failed` | 401 | `unauthorized` |

In every failure path: zero rows are inserted, no alerts are derived,
no action queue rows are created.

---

## 7. Step-by-step algorithm (future, do not implement now)

1. **Shape gate.** Reject if `bridgeId` is empty/whitespace →
   `missing_credential`.
2. **Status gate.** Require `secretStatus === "active"`. Any other
   value (including `null`, `undefined`, `"revoked"`, `"rotating"`)
   → `inactive_credential` or `invalid_secret_status`.
3. **Field gates.** Require non-empty `secretCiphertext`,
   `secretNonce`, and integer `secretKeyVersion >= 1`. Missing →
   matching `missing_*` reason.
4. **Env key lookup.** Resolve the env var name from
   `secret_key_version` via the documented key-management map
   (`docs/pi-ingest-secret-key-management.md`). If the env var is
   unknown for that version → `unknown_key_version`. If the env var
   name is known but `Deno.env.get(name)` is empty → `missing_env_key`.
5. **Decrypt.** Run AES-256-GCM decryption via WebCrypto
   `crypto.subtle.decrypt` using the resolved key bytes, the
   `secretNonce`, and the `secretCiphertext`. Any thrown error →
   `decrypt_failed`. Never rethrow the underlying error message.
6. **Encode.** Convert decrypted bytes to a UTF-8 string. Reject if
   empty → `decrypt_failed`.
7. **Return.** `{ ok: true, bridgeId, secret }`.

---

## 8. Lifetime and zeroization

- `secret` lives only for one request.
- The Edge Function MUST drop the reference immediately after
  calling `verifyBridgeRequest`.
- No caching. No memoization. No process-wide secret cache.
- No reuse across requests.
- The resolver MUST NOT keep a reference to the secret after
  returning.

---

## 9. Hard "must not" rules

The future resolver MUST NOT:

- Read or write `sensor_readings`.
- Read or write `pi_ingest_idempotency_keys`.
- Read or write `alerts`, `alert_events`, or `action_queue`.
- Call any automation or device-control surface.
- Build any HTTP response.
- Log the raw request body, signature, ciphertext, nonce, env key,
  or decrypted secret.
- Return the secret in the HTTP response.
- Return the secret to client/browser code.
- Map `secret_hash` → `secret`.
- Map `secret_ciphertext` → `secret` directly without decryption.
- Be imported from `src/`.

---

## 10. Test plan for the future resolver (future scope — not in this task)

When the resolver lands, its Deno test file
(`supabase/functions/pi-ingest-readings/secretResolver.test.ts`)
must cover at minimum:

- Each `BridgeSecretResolverFailureReason` returned for its trigger.
- Successful decrypt path with a known plaintext fixture.
- Status gate rejects `null`, `undefined`, `"revoked"`, `"rotating"`.
- Unknown `secret_key_version` → `unknown_key_version`.
- Missing env key → `missing_env_key` (env unset for the version).
- Decrypt failure with tampered ciphertext → `decrypt_failed`.
- Returned `secret` never appears in test logs or in any HTTP-style
  fixture body.

---

## 11. Stop-ship conditions

Any of the following blocks shipping the resolver:

- Resolver runs in `src/` or in any browser bundle.
- Resolver returns the secret outside the Edge Function process.
- Resolver logs the secret, ciphertext, nonce, or env key.
- Resolver uses `service_role` for anything beyond reading the
  bridge credential row.
- Resolver writes to `sensor_readings`, `pi_ingest_idempotency_keys`,
  `alerts`, or `action_queue`.
- Resolver maps `secret_hash` directly to `secret`.
- Resolver maps `secret_ciphertext` directly to `secret` without
  decryption.
- Resolver caches secrets across requests.
- Resolver builds the HTTP response itself.

---

## 12. Out of scope for this plan

- HMAC verification logic (already in
  `src/lib/piIngestAuthRules.ts`).
- Tent-owner lookup (covered by its own contract).
- Rate-limiting, idempotency, or sensor insert pipeline.
- UI for issuing or rotating bridge credentials.
- Any change to the fail-closed Edge Function skeleton.
