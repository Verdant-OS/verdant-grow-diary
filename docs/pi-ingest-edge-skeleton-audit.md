# pi-ingest-readings Edge Function Skeleton Audit

**Scope:** Audit + docs + static tests only. No credential lookup
implementation, no decryption implementation, no encryption
implementation, no new `service_role` usage, no schema/UI changes,
no sensor/idempotency/alert/action-queue writes added in this task.

This audit was performed against the live tree.

## Important deviation from the audit prompt

The audit prompt assumed the Edge Function was a thin fail-closed
skeleton with `secretResolver.ts` / `crypto.ts` stubs and no
decryption. That assumption is **out of date**. The actual current
state is:

- `supabase/functions/pi-ingest-readings/index.ts` is an operational
  orchestrator (auth headers → lookup → resolve → HMAC verify →
  tent authorization → envelope validation → normalization →
  idempotency lookup → atomic commit via SECURITY DEFINER RPC).
- `supabase/functions/pi-ingest-readings/secretResolver.ts`
  implements AES-GCM decryption via `crypto.subtle`, gated to the
  Edge Function path only. This is the **intended** location per
  `docs/pi-ingest-server-secret-resolver-contract.md`.
- `supabase/functions/pi-ingest-readings/crypto.ts` does **not**
  exist. Decryption uses `crypto.subtle` directly inside
  `secretResolver.ts`. The optional `crypto.ts` wrapper described in
  the implementation plan was never broken out.

Despite the deviation from the prompt's assumed starting state, the
**safety-relevant invariants still hold**, as documented below.

## Files inspected

- `supabase/functions/pi-ingest-readings/index.ts` (452 lines)
- `supabase/functions/pi-ingest-readings/secretResolver.ts` (197 lines)
- `supabase/functions/pi-ingest-readings/bridgeCredentialLookup.ts` (162)
- `supabase/functions/pi-ingest-readings/bridgeCredentialRow.ts` (106)
- `supabase/functions/pi-ingest-readings/tentOwnerLookup.ts` (124)
- `supabase/functions/pi-ingest-readings/idempotencyLookup.ts` (155)
- `supabase/functions/pi-ingest-readings/commitBatch.ts` (221)
- Contract docs:
  - `docs/pi-ingest-readings-contract.md`
  - `docs/pi-ingest-secret-resolution-plan.md`
  - `docs/pi-ingest-server-secret-resolver-contract.md`

## Audit findings

| # | Question | Finding |
|---|---|---|
| 1 | Does the function fail closed? | **Yes.** Every error path returns a generic 401/400/405/503 from `piIngestFailClosedResponses`. Missing env config → 503 `secret_resolver_not_implemented`. |
| 2 | Avoids direct writes to `sensor_readings`? | **Yes.** No `.insert(...)` in `index.ts`, `commitBatch.ts`, or `secretResolver.ts`. Writes go through the `pi_ingest_commit_batch` SECURITY DEFINER RPC. |
| 3 | Avoids direct writes to `pi_ingest_idempotency_keys`? | **Yes.** No direct insert. Same RPC handles atomic insert. |
| 4 | Avoids direct writes to `alerts`? | **Yes.** No `from("alerts")` reference anywhere in the function dir. |
| 5 | Avoids direct writes to `action_queue`? | **Yes.** No `from("action_queue")` reference anywhere in the function dir. |
| 6 | Avoids device-control / automation surfaces? | **Yes.** No MQTT, Home Assistant, fan/light/pump, or actuation references. |
| 7 | Avoids decryption implementation? | **No — but intentional.** AES-GCM decryption is implemented inside `secretResolver.ts`, which is the contract-sanctioned location. Decryption is confined to the Edge Function path; no decryption appears under `src/`. |
| 8 | Avoids mapping `secret_hash` → secret? | **Yes.** `secret_hash` is not referenced as a secret source anywhere. |
| 9 | Avoids mapping `secret_ciphertext` → secret without decryption? | **Yes.** `secret_ciphertext` is only fed into AES-GCM decryption inside `secretResolver.ts`. |
| 10 | Avoids logging secrets / signatures / raw bodies / payloads / sensor values? | **Yes.** No `console.log`/`console.error` of `rawBody`, `signature`, `secret`, `secret_hash`, `secret_ciphertext`, `secret_nonce`, `value`, or `raw_payload`. Errors return generic shapes. |
| 11 | Avoids broad `service_role` usage? | **Constrained.** `SUPABASE_SERVICE_ROLE_KEY` is read only in `buildDefaultLookupClient()` inside `index.ts`. It is not referenced under `src/`. |
| 12 | Uses pure modules safely? | **Yes.** Imports from `src/lib/*Rules.ts`, `piIngestFailClosedResponses.ts`, `piIngestAuthRules.ts`, and `piIngestCommitPlan.ts`. All are pure. |
| 13 | Smallest safe next implementation step | Land the optional `crypto.ts` wrapper from the implementation plan (pure helpers around `crypto.subtle.importKey` / `decrypt`) so `secretResolver.ts` no longer touches the WebCrypto surface directly. Pure refactor, no behavior change, easy to test in isolation. |

## Safety verdict

**PASS.** The skeleton is fail-closed at every entry point, performs
all DB writes through a single SECURITY DEFINER RPC, never references
`alerts` / `action_queue` / device-control surfaces, never logs
secrets or raw bodies, and confines decryption + `service_role` usage
to the Edge Function path.

## Next step (recommended)

Extract the WebCrypto import/decrypt calls from `secretResolver.ts`
into a new `supabase/functions/pi-ingest-readings/crypto.ts` pure
wrapper, with Deno tests that exercise:

- successful decrypt of a known fixture
- tampered ciphertext → throws / fails closed
- wrong nonce → throws / fails closed
- wrong key length → caller-side rejection

This unblocks isolated crypto testing without changing behavior or
adding any write/automation surface.
