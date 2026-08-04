# Bridge sensor trust chain — PlantUML architecture pack

**Owner:** Grok (Staff Product Integrity / Diagram Truth)  
**Audience:** security reviewers, Cheek release sign-off, engineers changing mint/revoke/ingest  
**Authoritative branch:** `verdant-grow-diary`  
**Pack landed:** merge commit `0818ca67205a2005fce71e44e7e4583cbd02cc91` (#718)  
**PlantUML foundation:** `#716` @ `8a0c537c0cb9e613145855b7f8857a72a15d9162`  
**Premature mint-only PR `#717`:** CLOSED / UNMERGED — **not authority** (ideas only if re-validated)

**Style:** every diagram starts with source-relative:

```plantuml
!include ../style.puml
```

Do **not** use `!include docs/plantuml/style.puml` from this folder.

---

## Purpose

Document the **load-bearing trust chain** for Verdant’s hardware-neutral live sensor path:

1. How a grower mints / revokes a tent-scoped bridge secret.  
2. How a headless bridge authenticates and writes telemetry.  
3. What is **forbidden** (JWT live write, body ownership, side effects, reverse-revoke).  
4. How sibling ingest lanes stay isolated (generic `vbt_`, EcoWitt, Pi HMAC, validation-only).

This pack is **docs + contract tests only**. It does not change handlers, migrations, RLS, or entitlements.

---

## Diagrams (one question each)

| File | Kind | Question |
|------|------|----------|
| [`bridge-token-mint-use-revoke-sequence.puml`](./bridge-token-mint-use-revoke-sequence.puml) | Sequence | Who mints, uses, and revokes — and with which credential? |
| [`sensor-ingest-verification-activity.puml`](./sensor-ingest-verification-activity.puml) | Activity | What is the exact verify order and stable HTTP contract? |
| [`bridge-token-lifecycle-state.puml`](./bridge-token-lifecycle-state.puml) | State | Which token modes exist, and which transitions are forbidden? |
| [`sensor-ingest-trust-boundaries-component.puml`](./sensor-ingest-trust-boundaries-component.puml) | Component | Where do JWT, `vbt_`, and service_role boundaries sit? |
| [`ingest-auth-sibling-isolation.puml`](./ingest-auth-sibling-isolation.puml) | Component | How do generic / EcoWitt / Pi / validation-only lanes differ? |

---

## Text alternatives (full prose)

These sections are the **accessible source of truth** when diagrams are not rendered (GitHub raw view, screen readers, offline review). They must stay aligned with the `.puml` files and the Edge handlers.

### 1. Mint → use → revoke sequence

**Participants:** Grower (browser, user JWT) · `mint-bridge-token` · liveSensors entitlement · `tents` · `bridge_tokens` · headless Bridge · `sensor-ingest-webhook` · `authenticateBearer` · `sensor_readings` · `bump_bridge_token_usage` · `sensor_ingest_audit_log` · `revoke-bridge-token`.

**Mint (user JWT, `verify_jwt = true`):**

1. Grower sends `POST` with `Authorization: Bearer <user JWT>` and body `{ tent_id, name?, ttl_days? }`.  
2. Gateway accepts a valid JWT; handler resolves `userId` from `auth.getClaims` (`claims.sub`). Plan fields in the body are never read.  
3. `requireLiveSensorEntitlement(userId)` runs. Failures: `403 upgrade_required` or `503 entitlement_lookup_failed`.  
4. Handler loads the tent; if missing or `user_id ≠ claims.sub` → `403 forbidden_tent`.  
5. Handler generates **32** CSPRNG bytes, forms plaintext `vbt_` + base64url(rand), computes **SHA-256** hex hash and a short non-secret **prefix** (first 12 characters).  
6. Inserts into `bridge_tokens`: hash, prefix, tent, owner, expiry — **no plaintext column**.  
7. Returns `200` with `{ token: "vbt_…" **once**, record }`. Client must store plaintext offline; server cannot re-show it.

**Use (headless bridge, Bearer `vbt_…`):**

1. Bridge sends `POST` to `sensor-ingest-webhook` with `Authorization: Bearer "vbt_…"`.  
2. Gateway has **`verify_jwt = false`**. That does **not** mean public live writes: the handler requires a bridge token (`allowJwt: false`).  
3. `authenticateBearer`: must start with `vbt_`; hash lookup on `token_hash`; reject revoked (`401 token_revoked`), expired (`401 token_expired`), missing/short (`401 unauthorized`), non-bridge (`403 bridge_required`), config/lookup failure (`503`).  
4. Entitlement is **re-checked** for the server-resolved owner (token is not billing authority).  
5. Payload is normalized; **request body `user_id` is ignored**; tent must match token scope (`403 forbidden_tent` otherwise).  
6. Freshness uses a **30-minute** server-clock window. Stale → `200 accepted:false`, `inserted:0`, **zero live writes**.  
7. Fresh rows upsert via **service_role** into `sensor_readings` with owner from auth.  
8. If `insertedCount > 0`, call `bump_bridge_token_usage`; duplicate-only skips the bump.  
9. Best-effort insert into `sensor_ingest_audit_log` (must not fail the ingest).  
10. Success `200` with inserted / skipped_duplicate counts. Sanitized errors only.

**Revoke (user JWT, one-way):**

1. Grower `POST` `{ id }` with user JWT (`verify_jwt = true`).  
2. Owner-scoped `UPDATE … SET revoked_at WHERE revoked_at IS NULL`.  
3. First success → `200 { ok: true }`. Already revoked → `200 { ok: true, already_revoked: true }`. Missing → `404`.  
4. **Revoked → Active is forbidden** (handler + DB immutability guard).  
5. Later ingest with that secret → `401 token_revoked`.

**Safety note (no side-effect arrows):** No AI Doctor, no alert creation, no Action Queue write, no automation, no device control on the ingest path.

---

### 2. Verification activity (ordered spine)

**Question answered:** What is the exact order of checks on one generic webhook request, and which stable HTTP outcomes apply?

**Order (load-bearing — later steps never run after a stop):**

```text
OPTIONS short-circuit
→ method must be POST
→ read Bearer
→ authenticateBearer (allowJwt: false)
→ auth.kind === bridge (defense-in-depth)
→ requireLiveSensorEntitlement
→ parse JSON + normalizeWebhookIngestPayload
→ tentScopeMatches
→ classifyIngestTimestampFreshness (30 minutes)
→ service_role upsert sensor_readings
→ if insertedCount > 0: bump_bridge_token_usage
→ best-effort audit
→ 200 success
```

**Stable outcomes:**

| Condition | Result |
|-----------|--------|
| OPTIONS | **204**, no auth / body / DB |
| Wrong method | **405** `method_not_allowed` |
| Missing Bearer | **401** `unauthorized` |
| Non-`vbt_` bearer (e.g. user JWT) | **403** `bridge_required` |
| Short / unknown hash | **401** `unauthorized` |
| Revoked | **401** `token_revoked` |
| Expired | **401** `token_expired` |
| Auth config / lookup failure | **503** |
| No `liveSensors` | **403** `upgrade_required` |
| Billing lookup failure | **503** `entitlement_lookup_failed` |
| Invalid JSON / payload | **400** |
| Tent mismatch | **403** `forbidden_tent` |
| Stale timestamp | **200** `accepted:false`, `inserted:0`, reason `timestamp_stale`, **no live write** |
| Insert failure | **400** `insert_failed` (sanitized) |
| Success | **200** `inserted` + `skipped_duplicate` |

**Freshness note:** Ingest **acceptance** window is **30 minutes** (`LIVE_INGEST_FRESHNESS_WINDOW_MS`). UI / current-state “how old is this reading” presentation windows are **separate** and out of scope for this pack.

---

### 3. Token lifecycle state

**States:**

| State | Predicate |
|-------|-----------|
| **Not issued** | No `bridge_tokens` row; no plaintext at rest |
| **Active / never used** | Row exists; `revoked_at` null; not expired at auth; `first_used_at` null; `ingest_count = 0`; born-clean insert (no seeded usage, not pre-revoked) |
| **Active / used** | Same validity; `first_used_at` set; `ingest_count ≥ 1` |
| **Expired** | `expires_at ≤ request now` at `authenticateBearer`; not revoked; **401 token_expired** |
| **Revoked** | `revoked_at` set; terminal; **401 token_revoked**; re-revoke → `already_revoked` |

**Transitions:**

- Mint → Active / never used (JWT + entitlement + tent owner + hash store + plaintext once).  
- Active / never used → Active / used only when a live insert succeeds with **`insertedCount > 0`** (usage RPC).  
- Duplicate-only accepted request: remains in current Active substate; **no** usage increment.  
- Stale `accepted:false` or entitlement 403: **token state unchanged**.  
- Active → Expired when auth compares `expires_at` to request clock (**no scheduler invented**).  
- Active → Revoked via owner JWT revoke.  
- **Forbidden:** Revoked → Active (no edge).

---

### 4. Trust-boundary component view

**Boundaries and flows:**

| Boundary | What crosses it |
|----------|-----------------|
| Browser / user JWT | Mint and revoke only; session Bearer |
| Headless bridge secret | Offline `vbt_…` plaintext held by device |
| Supabase Edge gateway | `mint`/`revoke`: `verify_jwt=true`; `sensor-ingest-webhook`: `verify_jwt=false` |
| Handler-owned bridge authentication | `authenticateBearer` + SHA-256 hash lookup; **not** public write |
| Billing entitlement | Canonical `liveSensors` check (mint and every ingest) |
| RLS-protected token metadata | Hash/prefix listing under caller JWT; clients cannot clear `revoked_at` or forge usage |
| Service-role persistence | Upsert `sensor_readings`; usage RPC; audit log |

**Critical pairing:**  
`verify_jwt = false` **and** handler-owned bridge authentication → **not** public live-write permission.

**Side-effect ban (text only; no arrows to these systems):**  
Telemetry storage only. No AI Doctor. No alert creation. No Action Queue write. No automation. No device control.

**Evidence honesty:** Client-role immutability and born-clean inserts are implemented in migrations `20260804213000` / `20260804220000`. Strict zero-skip DB harness runtime proof may still be **BLOCKED** — do not promote that lane on this diagram.

---

### 5. Sibling isolation

Four **distinct** lanes (do not mix credentials or headers):

| Lane | Endpoint | Auth model | Live write? |
|------|----------|------------|-------------|
| **A — Generic webhook** | `sensor-ingest-webhook` | Bearer `vbt_…`, `allowJwt: false`, SHA-256 `bridge_tokens` | Yes, if entitled + fresh + tent match |
| **B — EcoWitt sanctioned live** | `ecowitt-ingest` | Same shared bridge auth (`vbt_…`, `allowJwt: false`) | Yes, if entitled (vendor fields redacted; passkey may appear as fingerprint for routing only — not a second auth system) |
| **C — Pi HMAC** | `pi-ingest-readings` | Headers `x-bridge-id`, `x-bridge-signature`, `x-bridge-timestamp`; HMAC over raw body; separate credential store | Yes, if HMAC + owner entitlement |
| **D — EcoWitt validation-only** | `ecowitt-real-ingest` | Static env token `ECOWITT_BRIDGE_TOKEN` | **No** — validate + redacted accept/reject only; no `sensor_readings` write |

**Explicit rule:**  
**Do not mix Pi HMAC headers with `vbt_` bearer semantics.**

---

## Source anchors

- `supabase/functions/mint-bridge-token/index.ts`  
- `supabase/functions/revoke-bridge-token/index.ts`  
- `supabase/functions/sensor-ingest-webhook/index.ts`  
- `supabase/functions/_shared/sensorIngestAuth.ts` (`BRIDGE_PREFIX`, `allowJwt`)  
- `supabase/functions/_shared/sensorIngestFreshness.ts` (30 minutes)  
- `supabase/functions/_shared/liveSensorEntitlementGate.ts`  
- `supabase/functions/ecowitt-ingest/index.ts`  
- `supabase/functions/ecowitt-real-ingest/index.ts`  
- `supabase/functions/pi-ingest-readings/index.ts`  
- `supabase/config.toml` (`verify_jwt` per function)  
- Migrations `20260804213000_*`, `20260804220000_*`  
- `docs/bridge-sensor-ingest-security-audit-checklist.md`  
- Evidence: `scripts/security/bridge-sensor-ingest-evidence-checks.mjs`

---

## Honesty vocabulary

| Label | Meaning |
|-------|---------|
| **Implemented** | Code path exists on product branch |
| **Statically proven** | Evidence scripts / unit-edge tests green |
| **Runtime proven** | Live/local harness green with real DB |
| **BLOCKED** | Strict zero-skip DB harness not yet green — keep the BLOCKED label; do not upgrade the verdict |
| **NOT_MEASURED** | Not claimed |

Strict database harness remains **BLOCKED** until the zero-skip criteria hold: nonzero suite successes, zero failures, zero skips (checklist G3).

---

## Safety non-goals

Sensor ingest must not invoke or imply:

- AI Doctor  
- Alert creation  
- Action Queue writes  
- Automation  
- Device control  
- Irrigation / lighting commands  
- Setpoint changes  

---

## Contract tests

```bash
bunx vitest run src/test/bridge-sensor-plantuml-contract.test.ts
bunx vitest run src/test/plantuml-docs-static-safety.test.ts
```

The architecture contract pins load-bearing strings in the five `.puml` files, verification order, sibling isolation, secret shape bans, and BLOCKED honesty. Foundation static safety owns `style.puml` / examples — do not edit those from this pack.

---

## Render (local only — do not commit binaries)

```bash
# PlantUML 1.2024+; state/component diagrams use !pragma layout smetana
java -jar plantuml.jar -tsvg docs/plantuml/architecture/*.puml
# inspect SVGs, then delete them — generated binaries in git must remain 0
```

---

## Update procedure (when source changes)

1. Re-read the Edge handlers, `config.toml`, and relevant migrations at the new tip.  
2. Update the affected `.puml` **and** the matching text alternative above in the same PR.  
3. Extend `bridge-sensor-plantuml-contract.test.ts` if a new load-bearing fact is introduced.  
4. Re-run contract + evidence + edge tests.  
5. Do **not** reopen `#717` or change foundation `style.puml` unless a foundation defect blocks all five diagrams (then stop and report).

---

## Related

- Shared style: [`../style.puml`](../style.puml)  
- Style pack README: [`../README.md`](../README.md)  
- Bridge security checklist: [`../../bridge-sensor-ingest-security-audit-checklist.md`](../../bridge-sensor-ingest-security-audit-checklist.md)  
- General security checklist: [`../../security-checklist.md`](../../security-checklist.md)
