# Bridge sensor trust chain — PlantUML architecture pack

**Owner:** Grok (Staff Product Integrity / Diagram Truth)  
**Base:** `verdant-grow-diary` (requires merged PlantUML foundation `#716`)  
**Style:** every diagram starts with `!include ../style.puml` (source-relative)

## Diagrams

| File | Kind | Load-bearing question |
|------|------|------------------------|
| [`bridge-token-mint-use-revoke-sequence.puml`](./bridge-token-mint-use-revoke-sequence.puml) | Sequence | Who mints, uses, revokes — and with which credential? |
| [`sensor-ingest-verification-activity.puml`](./sensor-ingest-verification-activity.puml) | Activity | Exact verify order + stable HTTP outcomes |
| [`bridge-token-lifecycle-state.puml`](./bridge-token-lifecycle-state.puml) | State | Token modes; one-way revoke; usage on insert only |
| [`sensor-ingest-trust-boundaries-component.puml`](./sensor-ingest-trust-boundaries-component.puml) | Component | JWT vs vbt_ vs service_role boundaries |
| [`ingest-auth-sibling-isolation.puml`](./ingest-auth-sibling-isolation.puml) | Component | Generic vbt_ / EcoWitt / Pi HMAC / validation-only |

## Include convention

PlantUML resolves `!include` from the **diagram file directory**:

```plantuml
!include ../style.puml
```

Do **not** use `!include docs/plantuml/style.puml` from this folder.

## Source anchors (non-exhaustive)

- `supabase/functions/mint-bridge-token/index.ts`
- `supabase/functions/revoke-bridge-token/index.ts`
- `supabase/functions/sensor-ingest-webhook/index.ts`
- `supabase/functions/_shared/sensorIngestAuth.ts` (`BRIDGE_PREFIX`, `allowJwt`)
- `supabase/functions/_shared/sensorIngestFreshness.ts` (30 minutes)
- `supabase/functions/_shared/liveSensorEntitlementGate.ts`
- `supabase/functions/ecowitt-ingest/index.ts` (vbt_ sibling)
- `supabase/functions/ecowitt-real-ingest/index.ts` (validation-only static token)
- `supabase/functions/pi-ingest-readings/index.ts` (HMAC headers)
- `supabase/config.toml` (`verify_jwt` per function)
- Migrations `20260804213000_*`, `20260804220000_*`
- `docs/bridge-sensor-ingest-security-audit-checklist.md`

## Honesty

| Label | Meaning on these diagrams |
|-------|---------------------------|
| Implemented | Code path exists on product branch |
| Statically proven | Evidence scripts / unit-edge tests |
| Runtime proven | Live/local harness green |
| **BLOCKED** | Strict zero-skip DB harness not yet green — keep the BLOCKED label; do not upgrade the verdict |
| NOT_MEASURED | Not claimed |

Strict database harness status is documented as **BLOCKED** in the bridge security checklist until the zero-skip criteria hold (nonzero successes, zero failures, zero skips).

### Lifecycle correction note (#718 follow-up)

- **Expired is not terminal.** Owner revoke filters only `revoked_at IS NULL` (no `expires_at` gate), so **Expired → Revoked** is allowed. Auth checks `revoked_at` before `expires_at`, so a revoked-expired token presents as `token_revoked`.
- **Revoked → Active remains forbidden.**

### Trust-boundary correction note

- After a successful `sensor_readings` upsert, **the webhook handler** (not the DB or validation gates) calls `bump_bridge_token_usage` when `insertedCount > 0`, then best-effort inserts `sensor_ingest_audit_log`.

### Auth outcome correction note

- Too-short or unknown `vbt_` tokens map to **`401 unauthorized`** (not success). Non-`vbt_` bearers map to **`403 bridge_required`**.

## Safety non-goals (must not appear as ingest side effects)

No AI Doctor, alert creation, Action Queue write, automation, device control, irrigation commands, lighting commands, or setpoint changes from sensor ingest.

## Contract test

```bash
bunx vitest run src/test/bridge-sensor-plantuml-contract.test.ts
```

Pins load-bearing strings and rejects secret-shaped content / forbidden side-effect arrows.

## Render (local only — do not commit binaries)

```bash
java -jar plantuml.jar -tsvg -Slayout=smetana docs/plantuml/architecture/*.puml
# inspect, then delete *.svg
```

## Related

- Shared style: [`../style.puml`](../style.puml)
- Style pack README: [`../README.md`](../README.md)
- Security checklist: [`../../bridge-sensor-ingest-security-audit-checklist.md`](../../bridge-sensor-ingest-security-audit-checklist.md)
