# EcoWitt Real Ingest Phase 1.7 — Thin Edge Wrapper, No Persistence

## Status

Phase 1.7 creates the deployable Supabase Edge Function wrapper for EcoWitt real-ingest validation.

It does **not** enable live ingest persistence.

It does **not** store sensor readings.

It does **not** enable a live dashboard label.

It does **not** trigger alerts, AI, Action Queue writes, automation, or device control.

## What ships

- `supabase/functions/_shared/ecowittRealIngestHttp.ts`
  - Edge-safe HTTP request helper.
  - Handles `OPTIONS`, method fencing, JSON parsing, and safe JSON responses.
  - Calls the Phase 1.6 `_shared` endpoint handler.
  - Does not read environment variables.
  - Does not persist anything.

- `supabase/functions/ecowitt-real-ingest/index.ts`
  - Thin Supabase Edge wrapper.
  - Reads `ECOWITT_BRIDGE_TOKEN` from Edge environment.
  - Injects `reference_time` using server time.
  - Injects `freshness_window_ms` from `ECOWITT_REAL_INGEST_FRESHNESS_WINDOW_MS`, falling back safely.
  - Delegates behavior to `_shared/ecowittRealIngestHttp.ts`.

- `src/test/ecowitt-real-ingest-edge-http-wrapper.test.ts`
  - Tests request-level behavior without deploying the Edge Function.

- `src/test/ecowitt-real-ingest-edge-wrapper-static-safety.test.ts`
  - Static guardrails for the wrapper and HTTP helper.

## Endpoint behavior

`POST /functions/v1/ecowitt-real-ingest`

Required header:

```http
Authorization: Bearer <bridge token>
```

Expected environment variable:

```text
ECOWITT_BRIDGE_TOKEN
```

Optional environment variable:

```text
ECOWITT_REAL_INGEST_FRESHNESS_WINDOW_MS
```

Response meanings:

- `202 accepted_candidate` means the candidate passed validation only.
- `422 rejected_candidate` means the candidate was authenticated but failed validator rules.
- `401 unauthorized` means missing or malformed authorization.
- `403 forbidden` means the bearer token did not match the configured token.
- `503 not_configured` means the bridge token is missing from environment.
- `400 bad_request` means malformed JSON or missing body.
- `405 bad_request` with `method_not_allowed` means only `POST` and `OPTIONS` are allowed.

`accepted: true` does **not** mean persisted.

`can_persist_later: true` does **not** mean persisted.

## Redaction policy

The response must never echo raw private payload values.

Sensitive keys remain redacted by the Phase 0/1 redaction helper, including token, passkey, authorization, auth, secret, password, MAC, IP, station, and gateway-like fields.

## Token policy

The token must be configured in Supabase Edge environment settings.

The token must never be committed.

The token must never be returned in responses.

Missing token fails closed.

Rotation and revocation policy remain required before real production use.

## Phase 2 gate

Persistence remains blocked until:

1. Phase 1.7 wrapper tests pass.
2. Token storage, rotation, and revocation policy is approved.
3. Schema/RLS/idempotency audit approves the write path.
4. Live-label fencing policy is approved.

## Rollback

Remove:

```text
supabase/functions/_shared/ecowittRealIngestHttp.ts
supabase/functions/ecowitt-real-ingest/index.ts
src/test/ecowitt-real-ingest-edge-http-wrapper.test.ts
src/test/ecowitt-real-ingest-edge-wrapper-static-safety.test.ts
docs/ecowitt-real-ingest-phase-1-7-edge-wrapper.md
```

No persisted data exists from this phase.
