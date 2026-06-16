# EcoWitt Real Ingest Phase 1.6.1 — Restore Shared Baseline, No Writes

## Status

This repair slice restores the missing validation-only baseline required by the Phase 1.7 Edge wrapper.

It does **not** persist sensor readings.
It does **not** create Supabase clients.
It does **not** change schema, RLS, Edge secrets, alerts, AI, Action Queue, automation, or device control.
It does **not** make live telemetry visible in the product.

## Files added

- `src/lib/ecowittRealIngestTypes.ts`
- `src/lib/ecowittRealIngestRedaction.ts`
- `src/lib/ecowittRealIngestDedupe.ts`
- `src/lib/ecowittRealIngestValidator.ts`
- `src/lib/ecowittRealIngestAuth.ts`
- `src/lib/ecowittRealIngestEndpoint.ts`
- `supabase/functions/_shared/ecowittRealIngestTypes.ts`
- `supabase/functions/_shared/ecowittRealIngestRedaction.ts`
- `supabase/functions/_shared/ecowittRealIngestDedupe.ts`
- `supabase/functions/_shared/ecowittRealIngestValidator.ts`
- `supabase/functions/_shared/ecowittRealIngestAuth.ts`
- `supabase/functions/_shared/ecowittRealIngestEndpoint.ts`
- `src/test/fixtures/ecowitt-real-ingest-phase1-fixtures.ts`
- `src/test/ecowitt-real-ingest-auth.test.ts`
- `src/test/ecowitt-real-ingest-validator.test.ts`
- `src/test/ecowitt-real-ingest-redaction-dedupe.test.ts`
- `src/test/ecowitt-real-ingest-endpoint.test.ts`
- `src/test/ecowitt-real-ingest-edge-parity.test.ts`

## Safety rules preserved

- Source must be `live` to become an accepted candidate.
- Non-UUID tent IDs are rejected.
- Optional plant IDs must be UUIDs when present.
- Stale or future readings are rejected.
- Suspicious boundary humidity/soil moisture values are flagged.
- Sensitive payload fields are redacted.
- Accepted means validation-only, not persisted.
- `can_persist_later` is a future gate signal only.

## Required validation

Use PowerShell-safe npm command shims on Windows:

```powershell
npm.cmd exec vitest -- run src/test/ecowitt-real-ingest-auth.test.ts src/test/ecowitt-real-ingest-validator.test.ts src/test/ecowitt-real-ingest-redaction-dedupe.test.ts src/test/ecowitt-real-ingest-endpoint.test.ts src/test/ecowitt-real-ingest-edge-parity.test.ts src/test/ecowitt-real-ingest-edge-http-wrapper.test.ts src/test/ecowitt-real-ingest-edge-wrapper-static-safety.test.ts
```

Phase 2 remains blocked until Phase 1.7 wrapper tests, token policy, schema/RLS/idempotency audit, and live-label fencing are approved.
