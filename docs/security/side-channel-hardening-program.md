# Verdant Side-Channel Hardening Program

**Status:** Research / specification only (no production code changes in this artifact)  
**Date:** 2026-08-07  
**Branch basis:** `origin/verdant-grow-diary` at discovery time  
**Author role:** Grok (assignment: Side-Channel Security Program)  
**Sentinel:** Research docs only — no secrets accessed, no live probing, no config changes

---

## 1. Executive summary

Verdant’s realistic side-channel surface is **web/Edge TypeScript**: HMAC and
bearer comparisons, webhook verification, auth error wording, logs, and
missing-secret behavior. Hardware (power/EM/acoustic) and browser microarchitecture
attacks are **out of scope** unless a concrete runtime path makes one relevant
(none found).

**Already strong (verified in-repo):**

| Control                                            | Where                                                 |
| -------------------------------------------------- | ----------------------------------------------------- |
| Pure HMAC + multi-h1 rotation scan + replay bounds | `paddle-webhook/verifyPaddleSignature.ts` + handler   |
| Fail-closed EcoWitt bearer                         | `ecowittRealIngestAuth.ts` (safeEqual, no token echo) |
| Pi bridge HMAC + uniform 401 bodies                | `piIngestAuthRules` + `pi-ingest-readings`            |
| Transactional email multi-key constant-time OR     | `send-transactional-email/contract.ts`                |
| Opaque unauthorized responses (no reason leak)     | Pi-ingest fail-closed builders                        |

**Priority gaps (tip of `verdant-grow-diary`):**

| Gap                                                                                                                                                   | Severity                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `payments-webhook` verifies via Paddle SDK `unmarshal` only (not pure path, no explicit replay bounds, generic catch, missing-secret throws into 400) | **P0/P1**                             |
| Multiple ad-hoc `constantTimeEqual` / `safeEqual` copies (drift risk)                                                                                 | **P1**                                |
| EcoWitt / some paths distinguish `not_configured` vs `token_mismatch`                                                                                 | **P1** (enum aid)                     |
| Sensor-ingest bridge auth has no secret-string constant-time compare (hash lookup)                                                                    | **PASS** for compare; still inventory |
| No shared program document before this file                                                                                                           | **P2** (this program closes it)       |

**Note:** Open research-era PRs may already implement pure payments-webhook
verification and shared `constantTimeEqual` on feature branches; **this inventory
reflects deploy-branch tip only** and must be re-checked at implementation time.

---

## 2. Threat model (Verdant-specific)

### 2.1 Assets

| Asset                                          | Why it matters                                             |
| ---------------------------------------------- | ---------------------------------------------------------- |
| Paddle webhook secrets                         | Forged billing events → wrong entitlements / credits       |
| Bridge / EcoWitt tokens                        | Fake sensor writes, tent pollution                         |
| Service-role / transactional send keys         | Open relay, data exfil                                     |
| User JWTs                                      | Session hijack (transport + storage; not primary SC focus) |
| HMAC bridge secrets                            | Same as bridge tokens                                      |
| AuthZ state (entitled vs free, tent ownership) | Billing / live-sensor abuse                                |

### 2.2 Attacker capabilities (in scope)

- Unauthenticated or weakly authenticated HTTP client on the public internet
- Ability to send many crafted requests (rate limits may apply; not assumed perfect)
- Observation of **status codes, response bodies, approximate latency, body size**
- Knowledge of algorithms (HMAC-SHA256, Paddle header format) — security by obscurity is out
- Ability to read **client bundles** (no secrets may live there)

### 2.3 Attacker exclusions

- Physical access to hosts, power/EM/acoustic side channels
- Speculative-execution / shared-cache cross-tenant on browser JS (not Verdant-owned)
- Compromised Supabase dashboard / secret store (out of band)
- Quantum / formal crypto breaks of SHA-256

### 2.4 Goals we defend against

1. Forging webhooks/ingest without the secret
2. Recovering secrets/tokens via **timing** on naive equality
3. Learning secrets from **errors or logs**
4. Replaying old valid signatures outside the intended window
5. Exploiting **rotation short-circuit** to learn which key matched
6. Reaching **billing / entitlement / sensor write** paths without auth

---

## 3. Canonical terminology

| Term                                   | Meaning                                                                                |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| **Raw body**                           | Exact HTTP body bytes/string as received; used for HMAC. Never re-serialized JSON.     |
| **Best-effort constant-time**          | JS loop without early-exit on mismatch; **not** a formal crypto proof under all JITs   |
| **Fail closed**                        | Missing secret / bad sig / bad ts → deny; never process business logic                 |
| **Opaque public failure**              | Client sees generic unauthorized/invalid without stage detail when enumeration matters |
| **Reason code (internal)**             | Machine token for logs/metrics; must not include digests or secrets                    |
| **Rotation scan**                      | Compare expected MAC to **every** candidate signature; no early success exit           |
| **Replay window**                      | Max age + max future skew on signature timestamp                                       |
| **PASS / FAIL / RISK / BLOCKED / N/A** | Inventory verdicts (see inventory JSON schema)                                         |

---

## 4. Accepted patterns

### 4.1 HMAC webhook (Paddle-shaped)

```text
1. Resolve secret from env (missing → 500 or not_configured; do not compare to empty)
2. Read exact raw body once
3. Parse signature header (malformed → 400)
4. Check timestamp window if provider supplies ts
5. expected = HMAC-SHA256(secret, message)
6. constant-time compare to all candidates (rotation)
7. Only then JSON.parse / business logic
```

Reference implementation: `supabase/functions/paddle-webhook/verifyPaddleSignature.ts`.

### 4.2 Bearer shared secret

```text
1. Parse Authorization: Bearer <token> (malformed → unauthorized)
2. If server secret unset → not_configured (do not compare)
3. constant-time equal(token, expected)
4. Never echo token in response or logs
```

Reference: `src/lib/ecowittRealIngestAuth.ts`.

### 4.3 Multi-key acceptance (email send)

```text
Scan all accepted keys with constant-time equal; OR results without early exit.
Reject client-side/publishable keys at configuration resolve time.
```

Reference: `send-transactional-email/contract.ts` `authorizeTransactionalEmailCaller`.

### 4.4 Bridge HMAC (Pi)

```text
Sign method\npath\nts\nrawBody; window ±5m; constantTimeEqualHex; owner from credential not body.
```

Reference: `src/lib/piIngestAuthRules.ts`.

### 4.5 Public vs internal errors

| Audience | Content                                                                          |
| -------- | -------------------------------------------------------------------------------- |
| Client   | Stable, non-enumerating where required; safe for webhook retries (4xx vs 5xx)    |
| Logs     | Reason codes only; redact secrets/MACs/tokens; `redactError` style where present |

---

## 5. Prohibited patterns

| Pattern                                                                               | Why                                                |
| ------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `===` / early-exit loops on secrets or MAC hex                                        | Timing oracle                                      |
| `JSON.parse` then re-stringify before HMAC                                            | Signature never matches or forge window            |
| Compare before checking secret is configured                                          | Weird failures; potential empty-secret accept      |
| Echo signature, secret, or full Authorization in body/logs                            | Direct leak                                        |
| Return distinct errors for “user exists” vs “bad password” when enumeration is a goal | Account oracle (auth pages — inventory separately) |
| Early `return true` on first matching rotation key                                    | Which-key timing                                   |
| Claiming “constant-time” without equal-length fixed work                              | False security in tests/docs                       |
| Service role in browser                                                               | Total auth bypass                                  |

---

## 6. Response and logging policy

### 6.1 Webhooks (Paddle / payments)

| Condition                             | Public status | Public body                                           | Internal                  |
| ------------------------------------- | ------------- | ----------------------------------------------------- | ------------------------- |
| Missing secret                        | **500**       | `webhook_secret_not_configured` (or generic internal) | Alert ops; do not process |
| Bad/malformed signature header        | 400           | stable reason or generic invalid                      | reason code               |
| Signature mismatch / stale / future   | 401           | stable reason or generic invalid                      | reason code               |
| Invalid JSON after good sig           | 400           | invalid_json                                          | —                         |
| Business processing transient failure | **500**       | internal / retryable                                  | redacted error            |
| Success / duplicate idempotent        | 200           | status reason without secrets                         | —                         |

**Webhook retry rule:** Prefer **5xx** when the operator must fix config (missing secret) so providers retry after remediation; **4xx** when the payload/signature will never become valid without re-signing.

### 6.2 Bridge / sensor ingest

| Condition                                     | Public               | Notes                                 |
| --------------------------------------------- | -------------------- | ------------------------------------- |
| Auth fail (any stage that must not enumerate) | 401 + uniform body   | Pi-ingest model                       |
| Entitlement missing                           | 403 upgrade_required | Product-visible; not a secret compare |
| Invalid envelope after auth                   | 400 generic          | No body echo                          |

### 6.3 Logging

- Never log: secrets, bearer tokens, HMAC hex, raw Authorization headers, service_role keys
- Prefer: `signature_mismatch`, `timestamp_stale`, `not_authenticated`
- Use existing redact helpers where present (`redactError` in payments orchestrator)

---

## 7. Replay and rotation policy

| Mechanism            | Policy                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------- |
| Signature timestamp  | Enforce max age (e.g. 300s) and max future skew (e.g. 60s) when provider includes `ts` |
| Event idempotency    | Unique event id after verify (Paddle event_id); separate from crypto replay            |
| Multi-h1 / multi-key | Always scan all candidates; accumulate match without early success return              |
| Secret rotation      | Dual-secret window at provider; server accepts either via multi-candidate compare      |

**BYO paddle-webhook (verified):** `SIGNATURE_MAX_AGE_SECONDS = 300`, `SIGNATURE_MAX_FUTURE_SKEW_SECONDS = 60`, multi-h1 loop.

**payments-webhook (tip):** relies on SDK; **no explicit** maxAge/maxFuture in app code — **RISK** until pure path lands.

---

## 8. Limits of JS / Deno “constant-time”

**VERIFIED FACT:** JavaScript engines may optimize or vary instruction timing; there is no portable guarantee equivalent to carefully written C with memory barriers.

**INFERENCE:** XOR-loop compares still remove the **dominant practical oracle** (early exit on first mismatched character) for remote attackers under network noise.

**Policy for Verdant:**

1. Always use best-effort constant-time compares for secrets/MACs.
2. Never claim formal constant-time in product marketing or tests without a controlled harness.
3. Tests must assert **correctness and structure** (no early-exit source patterns), not wall-clock equality.
4. Optional P2 research: offline `dudect`-style experiments in CI — not a merge blocker.

---

## 9. Rollout order and rollback

### 9.1 Order

1. **P0** — payments-webhook pure verify + fail-closed secret missing (money path)
2. **P0/P1** — shared compare helper + eliminate unsafe equality on active crypto boundaries
3. **P1** — unify public error policy where enumeration aids attackers without breaking retries
4. **P1** — static CI fences for `===` on signature/secret symbols in edge functions
5. **P2** — docs, helper consolidation, optional timing research

### 9.2 Principles

- One boundary or one shared helper per PR
- Pure helpers + static/unit tests first; wire one edge function second
- Feature flags not required if fail-closed and behavior is strictly safer
- Rollback = revert PR; webhooks must remain verifiable on previous pure path

### 9.3 Recommended first Codex implementation slice

See `side-channel-remediation-backlog.md` card **SC-P0-01**:  
**payments-webhook pure HMAC verification (align with BYO paddle-webhook).**

---

## 10. Facts vs inferences vs unknowns

### Verified facts (source-cited)

- BYO paddle-webhook uses pure HMAC, multi-h1, replay bounds, raw body first.
- payments-webhook (tip) uses `paddle.webhooks.unmarshal` via `verifyWebhook`.
- EcoWitt auth uses safeEqual and fail-closed not_configured.
- Pi-ingest uses verifyBridgeRequest + uniform 401 bodies.
- Multiple independent constant-time helpers exist (drift risk).
- No `src/lib/constantTimeEqual.ts` on tip at discovery time.

### Inferences

- SDK unmarshal likely performs HMAC verification correctly, but app-level policy (replay bounds, reason codes, missing secret → 500) is not visible/controlled.
- Distinct EcoWitt status codes aid configuration debugging more than secret recovery, but still enumerate stages.

### Unknowns / blocked

- Exact Paddle SDK internal compare implementation (not vendored in-repo as source).
- Production rate limits on edge functions (platform-side).
- Whether open PRs #826/#827 (if any) have merged since discovery — re-verify at implement time.
- Live latency distributions (no production probing authorized).

---

## 11. Related artifacts

| File                                                 | Role                       |
| ---------------------------------------------------- | -------------------------- |
| `docs/security/side-channel-boundary-inventory.json` | Machine-readable inventory |
| `docs/security/side-channel-remediation-backlog.md`  | PR-sized cards             |

---

## 12. Safety statement

This program document and sibling inventory/backlog were produced by **read-only repository inspection**. No production code, secrets, Supabase/Edge configuration, DNS, CI settings, or live endpoints were modified or probed.
