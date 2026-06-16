# EcoWitt Real Ingest Phase 1.6.1 — Restore Missing Shared Baseline

## Summary

Restores the pure real-ingest baseline required by the Phase 1.7 Edge wrapper.

This slice is validation-only. It does not create persistence, schema, RLS, alerts, Action Queue writes, AI calls, automation, or device control.

## Files added

- `src/lib/ecowittRealIngestTypes.ts`
- `src/lib/ecowittRealIngestRedaction.ts`
- `src/lib/ecowittRealIngestDedupe.ts`
- `src/lib/ecowittRealIngestAuth.ts`
- `src/lib/ecowittRealIngestValidator.ts`
- `src/lib/ecowittRealIngestEndpoint.ts`
- `supabase/functions/_shared/ecowittRealIngestTypes.ts`
- `supabase/functions/_shared/ecowittRealIngestRedaction.ts`
- `supabase/functions/_shared/ecowittRealIngestDedupe.ts`
- `supabase/functions/_shared/ecowittRealIngestAuth.ts`
- `supabase/functions/_shared/ecowittRealIngestValidator.ts`
- `supabase/functions/_shared/ecowittRealIngestEndpoint.ts`
- `src/test/fixtures/ecowitt-real-ingest-phase1-fixtures.ts`
- `src/test/ecowitt-real-ingest-edge-parity.test.ts`

## Safety boundaries

- No database client.
- No table writes.
- No migrations.
- No RLS changes.
- No alerts.
- No Action Queue.
- No AI calls.
- No outbound network calls.
- No device-control language.
- Only accepts `source: "live"` as a candidate for future persistence.
- Manual, CSV, demo, stale, and invalid sources are rejected for this real-ingest candidate path.
- Accepted candidates still only mean `can_persist_later: true`; Phase 2 persistence is not enabled.

## Validation commands

Run from the repo root with `npm.cmd` on Windows PowerShell:

```powershell
npm.cmd exec vitest -- run src/test/ecowitt-real-ingest-edge-parity.test.ts --reporter=verbose
npm.cmd exec vitest -- run src/test/ecowitt-real-ingest-edge-http-wrapper.test.ts --reporter=verbose
npm.cmd exec vitest -- run src/test/ecowitt-real-ingest-edge-wrapper-static-safety.test.ts --reporter=verbose
```

Then run the broader source tests if present:

```powershell
npm.cmd exec vitest -- run src/test/ecowitt-real-ingest-auth.test.ts src/test/ecowitt-real-ingest-endpoint.test.ts --reporter=verbose
npm.cmd exec vitest -- run src/test/ecowitt-real-ingest-validator.test.ts src/test/ecowitt-real-ingest-redaction-dedupe.test.ts --reporter=verbose
```

If the last two commands report missing test files, treat that as absent baseline coverage, not a pass.

## Phase 2 status

Still blocked. Phase 2 persistence requires a separate schema/RLS/idempotency audit and explicit approval.
