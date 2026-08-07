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

**→ SC-P0-01** (payments-webhook pure HMAC verification)

Money path on tip still uses SDK `unmarshal` only. Align with BYO `verifyPaddleWebhookSignature` (already PASS).

---

## P0 cards

### SC-P0-01 — payments-webhook pure HMAC verification (fail closed)

| Field                  | Content                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Problem**            | Production Lovable sink `payments-webhook` verifies via `paddle.webhooks.unmarshal` only. Missing secret throws into generic 400; no app-level replay window; SDK compare not source-auditable; `console.error(String(e))` may log noisy throws.                                                                                                                          |
| **Owned files**        | `supabase/functions/_shared/paddle.ts`, `supabase/functions/payments-webhook/index.ts`, optional re-use of `supabase/functions/paddle-webhook/verifyPaddleSignature.ts`, new static test under `src/test/`                                                                                                                                                                |
| **Non-goals**          | Change entitlement logic, orchestrator decisions, Paddle product mapping, BYO paddle-webhook sandbox policy                                                                                                                                                                                                                                                               |
| **Proposed change**    | Add `verifyPaymentsWebhookRequest(req, env)` pure path: resolve `PAYMENTS_{SANDBOX\|LIVE}_WEBHOOK_SECRET` (missing → `webhook_secret_not_configured`), raw body, `verifyPaddleWebhookSignature` with maxAge=300 / futureSkew=60, JSON parse after verify, normalize snake_case → EventLike. Map failures: 500 missing secret; 400 header/json; 401 mismatch/stale/future. |
| **Regression tests**   | Static pin that payments-webhook does not call `webhooks.unmarshal` for auth; unit/security tests already on verifyPaddleSignature; optional Deno tests if harness exists                                                                                                                                                                                                 |
| **Static-scan fences** | Assert `verifyPaddleWebhookSignature` or shared pure entry used; forbid `unmarshal` on verify path                                                                                                                                                                                                                                                                        |
| **Runtime harness**    | None required for merge; no live Paddle calls                                                                                                                                                                                                                                                                                                                             |
| **Validation**         | `npx vitest run src/test/payments-webhook-signature-static.test.ts` (add); existing paddle security tests                                                                                                                                                                                                                                                                 |
| **Rollout / rollback** | Single PR; revert restores SDK path. Paddle retries 5xx after secret fix.                                                                                                                                                                                                                                                                                                 |
| **Depends on**         | None (can import existing verifyPaddleSignature)                                                                                                                                                                                                                                                                                                                          |
| **Priority**           | **P0**                                                                                                                                                                                                                                                                                                                                                                    |
| **Inventory**          | `sc-payments-webhook-sdk-verify`, `sc-payments-webhook-handler`                                                                                                                                                                                                                                                                                                           |

---

### SC-P0-02 — payments-webhook: never log raw verify exceptions

| Field                  | Content                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Problem**            | `console.error("paddle signature verification failed:", String(e))` may include unexpected SDK message content. |
| **Owned files**        | `supabase/functions/payments-webhook/index.ts`                                                                  |
| **Non-goals**          | Change success path                                                                                             |
| **Proposed change**    | Log only stable reason codes after pure verify; never `String(e)` from crypto libraries                         |
| **Regression tests**   | Static scan: no `String(e)` on verify failure path                                                              |
| **Static-scan fences** | Same                                                                                                            |
| **Runtime harness**    | None                                                                                                            |
| **Validation**         | Vitest static                                                                                                   |
| **Rollout / rollback** | Trivial revert                                                                                                  |
| **Depends on**         | Ideally SC-P0-01 (reason codes available); can ship partial alone                                               |
| **Priority**           | **P0** (leakage)                                                                                                |
| **Inventory**          | `sc-payments-webhook-handler`                                                                                   |

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
