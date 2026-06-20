# EcoWitt Real Ingest — Phase 1.6: Edge `_shared` Mirror + Parity Harness

**Status:** Mirror modules + parity harness only. No endpoint, no persistence, no live label.

## What this phase adds

Phase 1.6 implements the Phase 1.5 recommendation (**Option B**) by creating
Deno/Edge-safe mirror modules under `supabase/functions/_shared/` for every
Phase 0/1 EcoWitt real-ingest module:

- `ecowittRealIngestTypes.ts`
- `ecowittRealIngestRedaction.ts`
- `ecowittRealIngestDedupe.ts`
- `ecowittRealIngestValidator.ts`
- `ecowittRealIngestAuth.ts`
- `ecowittRealIngestEndpoint.ts`

These files intentionally duplicate behavior from `src/lib/ecowittRealIngest*`
because Supabase Edge Functions cannot import from `src/lib`. The existing
`supabase/functions/_shared/vpdRules.ts` follows the same pattern.

Each mirror file carries a top-of-file warning:

> Edge mirror of src/lib EcoWitt real-ingest logic. Keep behavior in parity
> with src/lib via ecowitt-real-ingest-edge-parity tests. Do not add
> persistence, Supabase writes, network calls, alerts, Action Queue writes,
> AI calls, automation, or device control here.

## Drift control

`src/test/ecowitt-real-ingest-edge-parity.test.ts` runs both implementations
through `src/test/fixtures/ecowitt-real-ingest-phase1-fixtures.ts` and asserts
deep-equal output for:

- validator results (every fixture)
- redaction of sensitive payloads + primitive passthrough
- dedupe key generation + null-on-missing-identity
- auth helper across missing/empty/malformed/wrong/correct/not-configured cases
- endpoint handler across accepted/rejected/wrong-token/not-configured/malformed-body cases
- deterministic repeat calls
- response never echoes token or fixture sensitive strings

`src/test/ecowitt-real-ingest-edge-static-safety.test.ts` scans the `_shared`
mirror files for: `service_role`, committed bridge tokens, Supabase imports,
`supabase.from(`, `.insert(/.update(/.upsert(/.delete(/.rpc(`,
`functions.invoke`, `fetch(`, `axios`, `localStorage`/`sessionStorage`,
`action_queue`/`alerts` writes, device-control words, executable command
phrasing, AI/model surfaces, and `Deno.env` reads.

The existing `src/test/ecowitt-real-ingest-static-safety.test.ts` continues to
scan the `src/lib` modules unchanged.

## What this phase does NOT do

- Does **not** create `supabase/functions/ecowitt-real-ingest/index.ts`.
- Does **not** deploy or wire any HTTP route.
- Does **not** persist any sensor reading.
- Does **not** import the Supabase client in `_shared` modules.
- Does **not** read environment variables in `_shared` modules.
- Does **not** enable a "live" dashboard label.
- Does **not** alter schema, RLS, alerts, Action Queue, AI, or device-control surfaces.
- Does **not** weaken existing src/lib static safety scans.

## Phase 2 gate

Persistence remains **blocked**. Before persistence can begin, the following
must be approved as separate scoped tasks:

1. **Phase 1.7** — Thin Edge Function wrapper that:
   - reads `ECOWITT_BRIDGE_TOKEN` (and optional `_NEXT` rotation key) from `Deno.env`
   - calls `handleEcoWittRealIngestRequest` from this `_shared` module
   - translates the typed envelope to an HTTP response
   - never logs, returns, or stores secrets
2. **Token policy approval** — rotation, fail-closed semantics, no commits.
3. **Schema / RLS / idempotency audit** — confirming a safe write path that
   satisfies the `sensor_readings` `WITH CHECK` (`user_id` resolution) without
   exposing service-role to the client.
4. **Live label policy** — when/whether `source = "live"` rows are surfaced
   in the dashboard, and how stale/invalid telemetry is fenced.

Until those land, real ingest stays dry-run.
