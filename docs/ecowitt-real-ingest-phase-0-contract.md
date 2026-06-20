# EcoWitt Real Ingest — Phase 0 Contract

> **Status:** Server contract + pure validator only. Phase 0 does **not**
> enable live ingest, persistence, or any network/server endpoint.

## What Phase 0 ships

- Pure TypeScript types (`src/lib/ecowittRealIngestTypes.ts`)
- Pure validator (`src/lib/ecowittRealIngestValidator.ts`)
- Pure redaction helper (`src/lib/ecowittRealIngestRedaction.ts`)
- Pure dedupe / idempotency key builder (`src/lib/ecowittRealIngestDedupe.ts`)
- Targeted unit + static-safety tests

## What Phase 0 does NOT ship

- No ingest endpoint
- No Edge Function
- No Supabase reads or writes
- No schema or migration changes
- No RLS changes
- No auth / token storage
- No bridge client
- No network calls (`fetch`, `axios`, `functions.invoke`)
- No alerts, Action Queue writes, AI calls, automation, or device control
- No fake live data
- No payload is persisted by Phase 0 code
- No existing EcoWitt dry-run behavior is altered

## Source-truth rules (non-negotiable)

The validator accepts only candidates whose `source === "live"`. The labels
`manual`, `csv`, `demo`, `stale`, and `invalid` may appear in test fixtures
as rejected/degraded inputs but are **never** upgraded to `live`. Unknown
or missing `source` is rejected with `source_unknown`.

## Acceptance rules

`accepted` and `can_persist_later` are `true` only when every rule passes:

- `tent_id` exists and is UUID-shaped (placeholder IDs rejected)
- `plant_id` is absent (warning only) or UUID-shaped
- `source === "live"`
- `captured_at` parses as a valid ISO timestamp
- `captured_at` is within `freshness_window_ms` before `reference_time`
  (small future tolerance for clock drift; further future is rejected)
- `device_identity` exists and is not placeholder
- `source_identity` exists
- `air_temp_f` and `humidity_pct` exist and are valid
- no `blocked_reasons` were emitted

## Determinism

- `reference_time` is required and injected.
- The validator never calls `Date.now()` and never reads the system clock.
- Same input + same options → identical output.
- The validator never mutates its input and never throws.

## Future phases (out of scope here)

- **Phase 1:** define an authenticated ingest endpoint + token model. RLS
  and schema review required before any persistence path lands.
- **Phase 2:** persist accepted candidates as `source: "live"` rows, with
  full RLS coverage, append-only history, and grower-visible provenance.
- **No device control** in any future phase without an explicit safety
  review.
