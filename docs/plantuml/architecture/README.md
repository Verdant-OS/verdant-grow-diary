# Bridge sensor trust chain — architecture pack

Docs-only PlantUML for Verdant’s **bridge token + live sensor ingest** trust chain.  
Read this file when you cannot render the diagrams (screen readers, raw GitHub, offline).

| | |
|--|--|
| **Owner** | Grok (diagram truth) |
| **Branch** | `verdant-grow-diary` |
| **Pack PR** | #718 @ `0818ca6` |
| **Style foundation** | #716 @ `8a0c537` |
| **#717 mint-only PR** | Closed, unmerged — **not** authority |

Every `.puml` file starts with:

```plantuml
!include ../style.puml
```

(That path is relative to the diagram file. Do not write `docs/plantuml/style.puml` here.)

---

## What this pack is for

Answer four questions without opening Edge Function source:

1. **Who** may mint, use, or revoke a bridge secret — and with which credential?  
2. **In what order** does generic live ingest check a request?  
3. **What states** can a token be in, and what can never happen?  
4. **Which lanes** (generic / EcoWitt / Pi / validation-only) must stay separate?

This pack does **not** change runtime code, migrations, RLS, or entitlements.

---

## Diagram index

| Diagram file | Kind | Question |
|--------------|------|----------|
| [bridge-token-mint-use-revoke-sequence.puml](./bridge-token-mint-use-revoke-sequence.puml) | Sequence | Who mints, uses, revokes — with which credential? |
| [sensor-ingest-verification-activity.puml](./sensor-ingest-verification-activity.puml) | Activity | Exact check order + HTTP outcomes? |
| [bridge-token-lifecycle-state.puml](./bridge-token-lifecycle-state.puml) | State | Token modes and forbidden transitions? |
| [sensor-ingest-trust-boundaries-component.puml](./sensor-ingest-trust-boundaries-component.puml) | Component | Where JWT / `vbt_` / service_role meet? |
| [ingest-auth-sibling-isolation.puml](./ingest-auth-sibling-isolation.puml) | Component | How sibling ingest lanes stay isolated? |

---

## Text alternatives

Each section below restates one diagram in plain language. Keep these in sync with the `.puml` files when source changes.

---

### 1. Mint → use → revoke

**Diagram:** sequence  
**Question:** Who does what, with which secret?

#### Actors

| Who | Credential |
|-----|------------|
| Grower in the browser | User session JWT |
| Headless bridge / device | Bridge secret `vbt_…` (shown once at mint) |
| Edge functions | See each step |

#### A. Mint a token

**Function:** `mint-bridge-token` · gateway `verify_jwt = true`

1. Grower calls mint with `Authorization: Bearer <user JWT>` and `{ tent_id, name?, ttl_days? }`.  
2. Server reads **user id only from the JWT** (`claims.sub`). Plan fields in the JSON body are ignored.  
3. Server checks **liveSensors** entitlement for that user.  
   - No capability → `403 upgrade_required`  
   - Billing lookup broken → `503 entitlement_lookup_failed`  
4. Server checks the tent is owned by that user.  
   - Not owned → `403 forbidden_tent`  
5. Server creates a secret: **32 random bytes** → plaintext `vbt_` + base64url.  
6. Server stores only **SHA-256 hash** + short **non-secret prefix** + tent + expiry. **No plaintext column.**  
7. Response returns the plaintext **`vbt_…` once**. The client must save it; the server will not show it again.

#### B. Use a token (live ingest)

**Function:** `sensor-ingest-webhook` · gateway `verify_jwt = false` · handler `allowJwt: false`

1. Bridge calls ingest with `Authorization: Bearer "vbt_…"`.  
2. **Important:** `verify_jwt = false` means the gateway does not require a *user* JWT. It does **not** mean the endpoint is public. The handler still requires a valid bridge token.  
3. Handler authenticates the bearer:  
   - Must start with `vbt_` (otherwise `403 bridge_required` — user JWTs are rejected)  
   - Lookup by SHA-256 hash  
   - Revoked → `401 token_revoked`  
   - Expired → `401 token_expired`  
4. Handler re-checks **liveSensors** for the token’s owner (token ≠ plan).  
5. Handler parses the body. **Body `user_id` is not ownership.** Owner comes from the token row.  
6. Payload tent must match the token’s tent (`403 forbidden_tent` if not).  
7. Timestamp must be within **30 minutes** on the server clock.  
   - Too old → `200` with `accepted: false`, `inserted: 0`, **no live write**  
8. Fresh rows are upserted with **service_role** into `sensor_readings`.  
9. Usage telemetry (`bump_bridge_token_usage`) runs **only if** `insertedCount > 0`. Duplicates alone do not bump.  
10. Audit log insert is **best-effort** (must not fail the request).  
11. Success → `200` with insert / duplicate counts. Errors are sanitized (no secrets, no raw DB text).

#### C. Revoke a token

**Function:** `revoke-bridge-token` · gateway `verify_jwt = true`

1. Grower calls revoke with user JWT and `{ id }`.  
2. Server sets `revoked_at` only for rows owned by the caller and still unrevoked (`WHERE revoked_at IS NULL`).  
3. First revoke → `200 { ok: true }`.  
4. Already revoked → `200 { ok: true, already_revoked: true }` (calm retry).  
5. **Cannot un-revoke.** There is no path from Revoked back to Active.  
6. Later ingest with that secret → `401 token_revoked`.

#### Forbidden on this path

- Treating a user JWT as live-ingest auth  
- Taking ownership from request JSON  
- Storing stale samples as live  
- Reverse-revoking a token  
- Calling AI Doctor, creating alerts, writing Action Queue, automation, or device control from ingest  

---

### 2. Verification activity (one request)

**Diagram:** activity  
**Question:** What runs first, second, third — and what status codes mean?

#### Order (must not be rearranged)

```text
1. OPTIONS? → if yes, stop with 204 (no auth, no body, no DB)
2. Method must be POST → else 405
3. Bearer present? → else 401 unauthorized
4. authenticateBearer with allowJwt: false
5. auth must be kind "bridge"
6. liveSensors entitlement
7. Parse + normalize JSON body
8. Tent scope match
9. Freshness (30-minute server clock)
10. Persist with service_role (if still allowed)
11. Usage bump only if insertedCount > 0
12. Best-effort audit
13. 200 success
```

Any failure **stops**. Later steps do not run.

#### HTTP outcomes (stable contract)

| When | Status | Body idea |
|------|--------|-----------|
| CORS preflight OPTIONS | **204** | Empty; no auth |
| GET / PUT / etc. | **405** | `method_not_allowed` |
| No `Authorization: Bearer` | **401** | `unauthorized` |
| Bearer is a user JWT or other non-`vbt_` | **403** | `bridge_required` |
| Bad / unknown / too-short `vbt_` | **401** | `unauthorized` |
| Token revoked | **401** | `token_revoked` |
| Token expired | **401** | `token_expired` |
| Server cannot look up token / misconfigured | **503** | config / lookup error |
| Plan lacks liveSensors | **403** | `upgrade_required` |
| Billing cannot be read | **503** | `entitlement_lookup_failed` |
| Bad JSON or payload | **400** | `invalid_json` / `invalid_payload` |
| Tent does not match token | **403** | `forbidden_tent` |
| Reading older than 30 minutes | **200** | `accepted: false`, `inserted: 0`, reason `timestamp_stale` — **no write** |
| DB insert fails | **400** | `insert_failed` (sanitized) |
| Happy path | **200** | `inserted` + `skipped_duplicate` |

#### Freshness note

- **Ingest acceptance** window = **30 minutes** (this pack).  
- **UI “how current is this reading?”** windows are separate product rules — not defined here.

---

### 3. Token lifecycle

**Diagram:** state  
**Question:** What modes exist, and what transitions are allowed?

#### States

| State | Meaning |
|-------|---------|
| **Not issued** | No row in `bridge_tokens`. Nothing to present. |
| **Active / never used** | Valid row; not revoked; not expired at last auth; `ingest_count = 0`; never successfully inserted live data. |
| **Active / used** | Same validity; at least one real insert (`ingest_count ≥ 1`). |
| **Expired** | `expires_at` is in the past when auth runs. Ingest returns `token_expired`. |
| **Revoked** | `revoked_at` is set. Terminal. Ingest returns `token_revoked`. |

#### What moves the token

| Event | Result |
|-------|--------|
| Successful mint | Not issued → Active / never used |
| Live insert with `insertedCount > 0` | Active / never used → Active / used |
| Duplicate-only ingest (`insertedCount = 0`) | Stays Active; **usage does not increase** |
| Stale ingest (`accepted: false`) | Token state unchanged; no live write |
| Entitlement denied | Token state unchanged |
| Auth sees `expires_at ≤ now` | Active → Expired (computed at request time; **no cron required**) |
| Owner revoke | Active → Revoked |
| Revoke again | Stays Revoked (`already_revoked`) |

#### Forbidden

```text
Revoked → Active     (never)
Revoked → never used (never)
Revoked → used       (never)
```

Rows are born clean: no pre-revoked inserts, no seeded usage counters from the client.

---

### 4. Trust boundaries

**Diagram:** component  
**Question:** What sits on which side of the wall?

```text
[ Grower browser ]                    [ Headless bridge ]
   user JWT                              vbt_… secret
        |                                      |
        v                                      v
+------------------+              +---------------------------+
| mint / revoke    |              | sensor-ingest-webhook     |
| verify_jwt=true  |              | verify_jwt=false          |
+--------+---------+              | handler allowJwt:false    |
         |                        +-------------+-------------+
         |                                      |
         v                                      v
   RLS metadata                         SHA-256 hash lookup
   (list prefix only)                   entitlement re-check
                                        tent + 30m freshness
                                                |
                                                v
                                    service_role upsert
                                    sensor_readings
                                    usage RPC (if inserts)
                                    best-effort audit
```

#### Rules in one line each

| Rule | Meaning |
|------|---------|
| Mint / revoke use user JWT | Grower identity from session |
| Ingest uses `vbt_…` only | User JWT cannot write live telemetry |
| `verify_jwt = false` on webhook | Gateway skips user JWT; **handler still authenticates the bridge** |
| Entitlement is separate | Holding a token ≠ paid plan |
| Service role is server-only | Clients do not upsert live readings |
| Telemetry only | No AI Doctor, no alerts, no Action Queue, no automation, no device control |

#### Evidence honesty

Migrations make revocation one-way and usage server-maintained.  
The **strict local DB harness** may still be **BLOCKED** until it runs with nonzero successes and zero skips. Do not upgrade that verdict on these diagrams.

---

### 5. Sibling isolation

**Diagram:** component lanes  
**Question:** Can I reuse one auth model across all ingest endpoints? **No.**

| Lane | Endpoint | How it authenticates | Writes live readings? |
|------|----------|----------------------|------------------------|
| **A — Generic** | `sensor-ingest-webhook` | Bearer `vbt_…`, `allowJwt: false` | Yes, if checks pass |
| **B — EcoWitt live** | `ecowitt-ingest` | Same shared `vbt_…` bridge auth | Yes, if checks pass |
| **C — Pi** | `pi-ingest-readings` | HMAC headers: `x-bridge-id`, `x-bridge-signature`, `x-bridge-timestamp` | Yes, if HMAC + entitlement pass |
| **D — EcoWitt validate-only** | `ecowitt-real-ingest` | Static env secret `ECOWITT_BRIDGE_TOKEN` | **No** — validate only |

#### Hard rule

> **Do not mix Pi HMAC headers with `vbt_` bearer semantics.**

Pi never authenticates with `Authorization: Bearer vbt_…`.  
Generic / EcoWitt live never authenticate with Pi HMAC headers.  
EcoWitt “real ingest” is a validation endpoint, not a second live-write path.

Passkey / vendor fields on EcoWitt may be used for **routing or redaction**, not as a replacement for bridge authentication on the live lane.

---

## Status words (do not mix them up)

| Word | Means |
|------|--------|
| **Implemented** | Code exists on the product branch |
| **Statically proven** | Evidence scripts / unit tests green |
| **Runtime proven** | Real DB harness green |
| **BLOCKED** | Strict zero-skip harness not green yet — keep saying BLOCKED |
| **NOT_MEASURED** | We did not claim it |

---

## Source files (for reviewers)

- `supabase/functions/mint-bridge-token/index.ts`  
- `supabase/functions/revoke-bridge-token/index.ts`  
- `supabase/functions/sensor-ingest-webhook/index.ts`  
- `supabase/functions/_shared/sensorIngestAuth.ts`  
- `supabase/functions/_shared/sensorIngestFreshness.ts`  
- `supabase/functions/_shared/liveSensorEntitlementGate.ts`  
- `supabase/functions/ecowitt-ingest/index.ts`  
- `supabase/functions/ecowitt-real-ingest/index.ts`  
- `supabase/functions/pi-ingest-readings/index.ts`  
- `supabase/config.toml`  
- Migrations `20260804213000_*`, `20260804220000_*`  
- `docs/bridge-sensor-ingest-security-audit-checklist.md`  
- `scripts/security/bridge-sensor-ingest-evidence-checks.mjs`  

---

## Tests and render

```bash
# Contract: diagrams + text-alternative coverage in this README
bunx vitest run src/test/bridge-sensor-plantuml-contract.test.ts

# Foundation style pack safety (do not edit style.puml from this pack)
bunx vitest run src/test/plantuml-docs-static-safety.test.ts

# Optional local render — delete SVGs after inspect; never commit them
java -jar plantuml.jar -tsvg docs/plantuml/architecture/*.puml
```

---

## When source changes

1. Re-read the handlers and migrations at the new tip.  
2. Update the matching `.puml` **and** the matching text alternative above in the **same** PR.  
3. Adjust the contract test if a new load-bearing fact appears.  
4. Do not reopen #717. Do not edit `docs/plantuml/style.puml` unless the foundation is broken for all five diagrams (then stop and report).

---

## Related docs

- Style pack: [../style.puml](../style.puml) · [../README.md](../README.md)  
- Bridge security checklist: [../../bridge-sensor-ingest-security-audit-checklist.md](../../bridge-sensor-ingest-security-audit-checklist.md)  
- General security checklist: [../../security-checklist.md](../../security-checklist.md)
