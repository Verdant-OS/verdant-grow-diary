# Side-Channel Hardening — Remediation Backlog

**Program:** `docs/security/side-channel-hardening-program.md`  
**Inventory:** `docs/security/side-channel-boundary-inventory.json`  
**Date:** 2026-08-07  
**Rule:** One security boundary or one reusable helper per PR. No broad rewrites.

---

## Priority legend

| P      | Meaning                                                                                                              |
| ------ | -------------------------------------------------------------------------------------------------------------------- |
| **P0** | Unauth business logic risk, secret/MAC leak, unsafe equality on money/security boundary, replay bypass on money path |
| **P1** | Enumeration, rotation short-circuit, raw-body gaps, missing static fences, helper drift                              |
| **P2** | Consistency, docs, optional timing research                                                                          |

---

## Recommended first implementation PR

**→ SC-P0-01** (payments-webhook pure HMAC verification) — **refined** implementation card below.

Money path on tip still uses SDK `unmarshal` only. Align with BYO `verifyPaddleWebhookSignature` (already PASS). Includes SC-P0-02 logging. See detailed API, HTTP matrix, normalize rules, and checklist under SC-P0-01.

---

## P0 cards

### SC-P0-01 — payments-webhook pure HMAC verification (fail closed)

| Field                         | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Problem**                   | Production Lovable sink `payments-webhook` verifies via `paddle.webhooks.unmarshal` only (`_shared/paddle.ts` `verifyWebhook`). Missing secret throws from `getEnv` into the same catch as bad signatures → **400 Invalid signature** (wrong retry class). No app-level replay window. SDK compare is not source-auditable. `console.error(..., String(e))` can log unexpected exception text.                                                                                                                                                            |
| **Owned files (edit)**        | `supabase/functions/payments-webhook/index.ts` (handler wire); **new** `supabase/functions/payments-webhook/verifyPaymentsWebhookRequest.ts` (pure verify + parse + normalize); **new** `supabase/functions/payments-webhook/verifyPaymentsWebhookRequest.test.ts` _or_ `src/test/payments-webhook-signature-static.test.ts` (Node/Vitest static + pure unit); optionally thin re-export of secrets from `_shared/paddle.ts` **without** deleting `getPaddleClient` / `gatewayFetch` (still used post-auth for price lookup in `index.ts` ~123–126, ~205) |
| **Owned files (import only)** | `supabase/functions/paddle-webhook/verifyPaddleSignature.ts` (`verifyPaddleWebhookSignature`, already multi-h1 + optional replay opts) — **do not fork** the compare algorithm                                                                                                                                                                                                                                                                                                                                                                            |
| **Do not touch**              | `orchestrator.ts`, `eventProcessor.ts`, `eventLogInsert.ts`, BYO `paddle-webhook/index.ts`, entitlements SQL, checkout UI                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Non-goals**                 | Shared `constantTimeEqual` extraction (SC-P1-01); EcoWitt; changing 200 body `{ status, email }` success contract; dual-secret env rotation matrix beyond multi-h1 already in verifier                                                                                                                                                                                                                                                                                                                                                                    |
| **Priority**                  | **P0**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Inventory IDs**             | `sc-payments-webhook-sdk-verify`, `sc-payments-webhook-handler`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Depends on**                | None. **Folds SC-P0-02** (reason-code logs only) into this PR if cheap.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Blocks**                    | Nothing hard; SC-P1-01 can still land independently                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

#### Current tip behavior (evidence)

| Step           | Today                                                              | File:line (tip)                     |
| -------------- | ------------------------------------------------------------------ | ----------------------------------- |
| Secret resolve | `getWebhookSecret` → `getEnv` **throws** if unset                  | `_shared/paddle.ts:58-62`, `11-15`  |
| Body           | `req.clone().text()` then `verifyWebhook(req)` reads body again    | `payments-webhook/index.ts:261-268` |
| Verify         | `paddle.webhooks.unmarshal(body, secret, signature)`               | `_shared/paddle.ts:64-75`           |
| Failure        | catch → `console.error(String(e))` → **400** `"Invalid signature"` | `index.ts:269-271`                  |
| Success event  | SDK camelCase `EventLikeWithId`                                    | cast `as EventLikeWithId`           |
| Post-auth      | `handleVerifiedEvent` + optional email                             | unchanged                           |

#### Target design

```text
POST /payments-webhook?env=sandbox|live
  → method/env gate (unchanged)
  → resolve secret (no throw): missing → 500 { error: "webhook_secret_not_configured" }
  → rawBody = await req.text()   // single read; no clone+double-read required
  → verifyPaddleWebhookSignature(secret, paddle-signature header, rawBody, {
        maxAgeSeconds: 300,
        maxFutureSkewSeconds: 60,
      })
  → if !ok → status by reason (below); log reason code only
  → JSON.parse(rawBody); if fail → 400 { error: "invalid_json" }
  → event = normalizePaddleWebhookEvent(parsed)  // snake_case + camelCase → EventLikeWithId
  → handleVerifiedEvent(...)  // UNCHANGED
```

**Recommended module API** (`verifyPaymentsWebhookRequest.ts`):

```ts
export const PAYMENTS_SIGNATURE_MAX_AGE_SECONDS = 300;
export const PAYMENTS_SIGNATURE_MAX_FUTURE_SKEW_SECONDS = 60;

export type PaymentsWebhookVerifyFailureReason =
  | "webhook_secret_not_configured"
  | "missing_header"
  | "invalid_signature_header"
  | "signature_mismatch"
  | "timestamp_stale"
  | "timestamp_future"
  | "invalid_json";

export type PaymentsWebhookVerifyResult =
  | { ok: true; event: EventLikeWithId; rawBody: string; payload: unknown }
  | { ok: false; reason: PaymentsWebhookVerifyFailureReason; httpStatus: 400 | 401 | 500 };

export function resolvePaymentsWebhookSecret(
  env: "sandbox" | "live",
  readEnv?: (k: string) => string | undefined,
): string | null; // null = not configured

export function normalizePaddleWebhookEvent(parsed: unknown): EventLikeWithId | null;

export async function verifyPaymentsWebhookRequest(input: {
  env: "sandbox" | "live";
  signatureHeader: string | null;
  rawBody: string;
  nowSeconds?: number;
  readEnv?: (k: string) => string | undefined;
}): Promise<PaymentsWebhookVerifyResult>;
```

**Secret names (unchanged):**  
`PAYMENTS_SANDBOX_WEBHOOK_SECRET` / `PAYMENTS_LIVE_WEBHOOK_SECRET` via `?env=`.

**HTTP mapping (public):**

| `reason`                                                      | HTTP    | Public body (JSON preferred)                   | Paddle retry? |
| ------------------------------------------------------------- | ------- | ---------------------------------------------- | ------------- |
| `webhook_secret_not_configured`                               | **500** | `{ "error": "webhook_secret_not_configured" }` | Yes (ops fix) |
| `missing_header` / `invalid_signature_header`                 | **400** | `{ "error": "<reason>" }`                      | No            |
| `signature_mismatch` / `timestamp_stale` / `timestamp_future` | **401** | `{ "error": "<reason>" }`                      | No            |
| `invalid_json`                                                | **400** | `{ "error": "invalid_json" }`                  | No            |

Plain-text `"Invalid signature"` may be **replaced** by JSON error objects for machine-stable clients; document as intentional. Do **not** put MAC/hex/secret in body or logs.

**Event normalization rules (critical):**

SDK historically returned **camelCase** (`eventType`, `eventId`, `data.customerId`, …). Paddle HTTP payloads are often **snake_case** (`event_type`, `event_id`, `data.customer_id`). Orchestrator/`EventLike` reads **camelCase** (`eventProcessor.ts:128-165`).

`normalizePaddleWebhookEvent` must:

1. Prefer camelCase if already present; else map snake_case top-level `event_type` → `eventType`, `event_id` → `eventId`.
2. Map `data` object keys used by `decide`/`auditFields` (at minimum: `id`, `customer_id`→`customerId`, `subscription_id`→`subscriptionId`, `custom_data`→`customData`, `current_billing_period`→`currentBillingPeriod`, `scheduled_change`→`scheduledChange`, nested `import_meta`→`importMeta`, `starts_at`/`ends_at`/`effective_at`, `product_id`→`productId`, items[].price).
3. Return `null` only if structure is not an object (caller treats as invalid_json or 400 invalid_event).
4. Never drop unknown fields if easier to shallow-map recursively for known Paddle shapes — **minimum** is what `decide` and `auditFields` touch; pin with unit fixtures copied from existing orchestrator tests if available.

**`_shared/paddle.ts` after change:**

| Symbol                                                     | Action                                                                                                                           |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `getPaddleClient` / `gatewayFetch` / `getConnectionApiKey` | **Keep** (post-auth price lookup)                                                                                                |
| `getWebhookSecret`                                         | Prefer move to payments helper or make non-throwing `tryGetWebhookSecret`; stop using throw-for-control-flow on the webhook path |
| `verifyWebhook`                                            | **Remove from payments-webhook call path.** Deprecate or delete if no other callers (grep: payments-webhook only for verify)     |

**Logging (includes SC-P0-02):**

```ts
// only
console.error("payments-webhook.verify", result.reason);
// never String(e) from verify path
```

#### Tests required

| Test                                   | Asserts                                                                                                                                         |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Static** `payments-webhook/index.ts` | Does **not** contain `webhooks.unmarshal` or `verifyWebhook(`; **does** import `verifyPaymentsWebhookRequest` or `verifyPaddleWebhookSignature` |
| **Unit** missing secret                | `httpStatus === 500`, reason `webhook_secret_not_configured`, no throw                                                                          |
| **Unit** bad header                    | 400 `missing_header` / `invalid_signature_header`                                                                                               |
| **Unit** wrong HMAC                    | 401 `signature_mismatch` (build body + header with known secret using same helpers as `paddle-webhook/security.test.ts`)                        |
| **Unit** stale/future ts               | 401 with bounds 300 / 60                                                                                                                        |
| **Unit** multi-h1                      | one of two h1 matches → ok (rotation)                                                                                                           |
| **Unit** normalize                     | snake_case fixture → `eventType` / `eventId` populated                                                                                          |
| **Unit** invalid JSON after good sig   | 400 `invalid_json` (sig over non-JSON still verifies)                                                                                           |
| **Regression**                         | Existing `paddle-webhook/security.test.ts` still green (untouched)                                                                              |

#### Static-scan fences

- Source of `payments-webhook/index.ts` must not match `/webhooks\.unmarshal|verifyWebhook\s*\(/`.
- Verify module must not match `/console\.(log|error|warn)\([^)]*secret|rawBody|signatureHeader/i` beyond reason codes.
- Optional: pin `maxAgeSeconds: 300` and `maxFutureSkewSeconds: 60` appear in payments verify path.

#### Validation commands

```bash
npx vitest run \
  src/test/payments-webhook-signature-static.test.ts \
  supabase/functions/paddle-webhook/security.test.ts
# plus any new pure unit file path chosen by implementer
```

#### Rollout / rollback

|              |                                                                                                                                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Rollout**  | Single PR; no feature flag. Deploy edge `payments-webhook` only.                                                                                                                                                                                                         |
| **Compat**   | Success path still returns 200 + `{ status, email }`. Failure bodies become structured JSON (document).                                                                                                                                                                  |
| **Ops**      | Missing secret now 500 (Paddle retries) — **fix** vs today’s silent 400. Alert on `webhook_secret_not_configured`.                                                                                                                                                       |
| **Rollback** | Revert PR; SDK path returns.                                                                                                                                                                                                                                             |
| **Risk**     | Snake_case→camelCase incomplete mapping could skip/mis-route events after verify. **Mitigation:** fixture tests from real-shaped payloads used in orchestrator tests; prefer reusing SDK unmarshal **only** as a offline fixture generator in tests, never in prod path. |

#### Implementation checklist (for Codex)

1. [ ] Add `verifyPaymentsWebhookRequest.ts` with secret resolve, signature verify, parse, normalize
2. [ ] Wire `index.ts`: single `rawBody` read; map `PaymentsWebhookVerifyResult` to Response; remove try/catch around SDK verify
3. [ ] Keep `getPaddleClient` imports for price lookup
4. [ ] Log reason codes only (SC-P0-02)
5. [ ] Static + unit tests as above
6. [ ] Grep repo: no remaining production caller of `verifyWebhook`
7. [ ] Do **not** change orchestrator/decide

#### Relationship to SC-P0-02

Ship logging fix **inside SC-P0-01**. Leave SC-P0-02 card as “satisfied by SC-P0-01” once merged, or close as duplicate.

### SC-P0-02 — payments-webhook: never log raw verify exceptions

| Field               | Content                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Status**          | **Fold into SC-P0-01** (same PR). Do not open a separate PR unless SC-P0-01 ships without log fix.              |
| **Problem**         | `console.error("paddle signature verification failed:", String(e))` may include unexpected SDK message content. |
| **Owned files**     | `supabase/functions/payments-webhook/index.ts` (with SC-P0-01)                                                  |
| **Proposed change** | `console.error("payments-webhook.verify", reason)` only; never `String(e)` on verify path                       |
| **Priority**        | **P0** (satisfied by SC-P0-01 checklist item 4)                                                                 |
| **Inventory**       | `sc-payments-webhook-handler`                                                                                   |

---

## P1 cards

### SC-P1-01 — Shared pure `constantTimeEqual` helper + migrate crypto call sites

| Field                  | Content                                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Problem**            | Four+ independent XOR-loop implementations (`verifyPaddleSignature`, `piIngestAuthRules`, `ecowittRealIngestAuth`, `send-transactional-email/contract`). Drift risk (one gains length-padding bugs, another early-exits).                               |
| **Owned files**        | **New** `src/lib/constantTimeEqual.ts`; migrate `src/lib/piIngestAuthRules.ts`, `src/lib/ecowittRealIngestAuth.ts`; edge mirror via `bun run sync-edge-shared`; `paddle-webhook/verifyPaddleSignature.ts` import from mirror; email contract optionally |
| **Non-goals**          | Formal timing proofs; changing algorithms                                                                                                                                                                                                               |
| **Proposed change**    | Export `constantTimeEqual`, `constantTimeEqualHex`, `constantTimeEqualBytes`, `constantTimeEqualAny` (full multi-candidate scan). Wire HMAC/token compares. Document JS best-effort limits in module header.                                            |
| **Regression tests**   | Unit tests for equal/unequal/length; piIngest + ecowitt existing suites; paddle security tests; static pin shared import                                                                                                                                |
| **Static-scan fences** | Optional: forbid new local `function constantTimeEqual` in supabase/functions except re-exports                                                                                                                                                         |
| **Runtime harness**    | None                                                                                                                                                                                                                                                    |
| **Validation**         | `npx vitest run src/test/constantTimeEqual.test.ts src/test/piIngestAuthRules.test.ts` (+ ecowitt auth tests)                                                                                                                                           |
| **Rollout / rollback** | Pure refactor; revert if needed                                                                                                                                                                                                                         |
| **Depends on**         | None                                                                                                                                                                                                                                                    |
| **Priority**           | **P1**                                                                                                                                                                                                                                                  |
| **Inventory**          | `sc-shared-constant-time-module`                                                                                                                                                                                                                        |

---

### SC-P1-02 — EcoWitt public failure enumeration policy

| Field                  | Content                                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Problem**            | `not_configured` vs `token_mismatch` vs `missing_authorization_header` are distinguishable. Helps operators but also stage-enumerates for attackers.                                                         |
| **Owned files**        | `src/lib/ecowittRealIngestAuth.ts`, edge shared twin, endpoint HTTP mapper, tests                                                                                                                            |
| **Non-goals**          | Weaken fail-closed; remove internal reason codes for metrics                                                                                                                                                 |
| **Proposed change**    | Keep internal `reason` for logs/metrics; map external HTTP body to a small stable set (e.g. unauthorized vs service_unavailable for not_configured). Document operator debugging via logs not response body. |
| **Regression tests**   | Auth pure tests still assert internal reasons; HTTP mapper tests assert public body policy                                                                                                                   |
| **Static-scan fences** | Endpoint must not `JSON.stringify(auth)` entire result to client                                                                                                                                             |
| **Runtime harness**    | None                                                                                                                                                                                                         |
| **Validation**         | Existing ecowitt auth vitest + new mapper tests                                                                                                                                                              |
| **Rollout / rollback** | May affect operator scripts that parse bodies — note in PR                                                                                                                                                   |
| **Depends on**         | None                                                                                                                                                                                                         |
| **Priority**           | **P1**                                                                                                                                                                                                       |
| **Inventory**          | `sc-ecowitt-bearer-src`, `sc-ecowitt-bearer-edge-shared`                                                                                                                                                     |

---

### SC-P1-03 — sensor-ingest AuthError HTTP mapping review

| Field                  | Content                                                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Problem**            | `authenticateBearer` returns distinct errors (`token_revoked`, `token_expired`, `unauthorized`). If exposed raw, enables token-state enumeration.           |
| **Owned files**        | `supabase/functions/_shared/sensorIngestAuth.ts`, `sensor-ingest-webhook` handler(s)                                                                        |
| **Non-goals**          | Change hash-lookup design (already good)                                                                                                                    |
| **Proposed change**    | Audit HTTP responses; collapse client-visible auth failures to `unauthorized` except where product requires expired messaging; keep internal codes for logs |
| **Regression tests**   | auth.test.ts mapping table                                                                                                                                  |
| **Static-scan fences** | No return of raw token or hash                                                                                                                              |
| **Runtime harness**    | None                                                                                                                                                        |
| **Validation**         | `deno test` / existing auth tests under sensor-ingest-webhook                                                                                               |
| **Rollout / rollback** | Document client impact                                                                                                                                      |
| **Depends on**         | None                                                                                                                                                        |
| **Priority**           | **P1**                                                                                                                                                      |
| **Inventory**          | `sc-sensor-ingest-bearer`                                                                                                                                   |

---

### SC-P1-04 — CI static fence: unsafe equality near secret/signature symbols

| Field                  | Content                                                                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Problem**            | No automated guard against reintroducing `signature ===` / `token === secret` in edge functions.                                                                            |
| **Owned files**        | `scripts/` new check or extend existing safety scanner; workflow invoke; unit test of the checker                                                                           |
| **Non-goals**          | Full dataflow analysis; ban all `===` in repo                                                                                                                               |
| **Proposed change**    | Heuristic scan of `supabase/functions/**/*.ts` for patterns like `signature ===`, `secret ===`, `hmac ===` excluding test fixtures and allowlisted files. Fail CI on match. |
| **Regression tests**   | Checker self-test with fixture snippets                                                                                                                                     |
| **Static-scan fences** | This card _is_ the fence                                                                                                                                                    |
| **Runtime harness**    | None                                                                                                                                                                        |
| **Validation**         | `node scripts/check-….mjs`                                                                                                                                                  |
| **Rollout / rollback** | Allowlist escape hatch documented in security-exceptions if needed                                                                                                          |
| **Depends on**         | None                                                                                                                                                                        |
| **Priority**           | **P1**                                                                                                                                                                      |
| **Inventory**          | `sc-ci-edge-import-guard` (extend)                                                                                                                                          |

---

### SC-P1-05 — Document and pin BYO paddle-webhook as reference (no code change)

| Field                | Content                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Problem**          | Implementers may re-discover pure HMAC path; payments must not diverge again.                                                                     |
| **Owned files**      | `docs/security/` (this program already); optional short pointer in `paddle-webhook/verifyPaddleSignature.ts` header only if code PR allowed later |
| **Non-goals**        | Behavior change                                                                                                                                   |
| **Proposed change**  | Already covered by program doc; optional ADR one-pager linking payments pure path to BYO reference                                                |
| **Regression tests** | Existing paddle-paid-launch-gate static tests                                                                                                     |
| **Validation**       | docs-only                                                                                                                                         |
| **Depends on**       | SC-P0-01 for dual-path consistency statement                                                                                                      |
| **Priority**         | **P1** (docs)                                                                                                                                     |

---

## P2 cards

### SC-P2-01 — JWT edge function log redaction consistency

| Field                | Content                                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Problem**          | User-JWT edges may log errors inconsistently; risk of header/token leakage in future edits.                                        |
| **Owned files**      | Sample set: `checkout-status`, `premium-export-entitlement`, `live-sensor-entitlement`, `ai-doctor-review`                         |
| **Non-goals**        | Rewrite all edges                                                                                                                  |
| **Proposed change**  | Shared `logEdgeError(reason, err)` that redacts Authorization and secret-shaped strings; adopt in 2–3 high-traffic functions first |
| **Regression tests** | Unit test redactor                                                                                                                 |
| **Priority**         | **P2**                                                                                                                             |
| **Inventory**        | `sc-jwt-edge-user-routes`                                                                                                          |

---

### SC-P2-02 — Classify `aiCoachRequestRecoveryRules` signature equality

| Field               | Content                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------- |
| **Problem**         | `pending?.signature === signature` may be non-crypto; inventory marks RISK until classified. |
| **Owned files**     | `src/lib/aiCoachRequestRecoveryRules.ts` + tests                                             |
| **Non-goals**       | Edge auth redesign                                                                           |
| **Proposed change** | Document as correlation id (N/A) **or** switch to constantTimeEqual if secret-derived        |
| **Priority**        | **P2**                                                                                       |
| **Inventory**       | `sc-ai-coach-request-recovery-signature`                                                     |

---

### SC-P2-03 — Optional offline timing research harness (non-blocking)

| Field               | Content                                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Problem**         | Tests must not claim wall-clock constant-time; optional research may validate XOR-loop vs early-exit under controlled local conditions. |
| **Owned files**     | `scripts/research/` or `docs/security/experiments/` — never production path                                                             |
| **Non-goals**       | Merge-blocking CI; production probing                                                                                                   |
| **Proposed change** | Document methodology; optional local script comparing early-exit vs XOR on synthetic secrets                                            |
| **Priority**        | **P2**                                                                                                                                  |

---

## Dependency graph (implementation order)

```text
SC-P0-01  payments pure verify
   └── SC-P0-02  log reason codes only
SC-P1-01  shared constantTimeEqual  (parallel with P0)
   └── migrate call sites (paddle pure already good; pi/ecowitt/email)
SC-P1-02  EcoWitt public body policy
SC-P1-03  sensor-ingest error mapping
SC-P1-04  CI unsafe-equality fence
SC-P2-*   cleanup / research
```

---

## Already satisfying policy (do not rework)

| Boundary                                                      | Why leave alone                                    |
| ------------------------------------------------------------- | -------------------------------------------------- |
| `verifyPaddleWebhookSignature` + BYO handler                  | Pure HMAC, multi-h1, replay bounds, opaque reasons |
| `verifyBridgeRequest` + pi-ingest 401 uniformity              | HMAC + window + opaque client body                 |
| Transactional email multi-key CT equal + reject publishable   | Strong                                             |
| EcoWitt safeEqual + fail closed not_configured before compare | Compare path good                                  |
| payments orchestrator `redactError`                           | Post-auth redaction good                           |
| Bridge token sha256 lookup                                    | No raw secret string compare                       |

---

## Explicit non-goals for all cards

- Production secret rotation ceremonies (ops runbook, not code PR)
- Power/EM/Spectre research
- Changing RLS or business entitlement formulas except where auth gate mapping requires
- Live load/timing probes against production

---

## First Codex slice (copy-paste ready)

**Title:** `fix(payments-webhook): pure HMAC signature verification fail-closed`

**Read first:**

- `docs/security/side-channel-hardening-program.md` §4.1, §6.1
- `supabase/functions/paddle-webhook/verifyPaddleSignature.ts`
- `supabase/functions/payments-webhook/index.ts`
- `supabase/functions/_shared/paddle.ts`

**Do:** SC-P0-01 (+ SC-P0-02 if cheap in same PR)

**Do not:** touch orchestrator billing decisions; do not probe live Paddle.
