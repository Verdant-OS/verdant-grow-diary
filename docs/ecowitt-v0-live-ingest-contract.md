# EcoWitt V0 Live Ingest Contract

## Purpose

This document captures the verified end-to-end contract for EcoWitt live sensor
ingest in Verdant V0, along with the regression gates required before any
future sensor or vendor changes ship. It is the source of truth for what
"EcoWitt live ingest" means in V0 and what must never regress.

Scope: documentation and regression checklist only. No schema, RLS, edge
function, auth, UI, AI, alerts, Action Queue, automation, or device control
changes are implied by this document.

## Current status

EcoWitt live ingest is verified end-to-end:

- EcoWitt gateway posts to the local Windows testbench bridge.
- Bridge labels the latest local reading as `source="live"` when real LAN
  EcoWitt markers are present, otherwise it labels demo/stale/invalid as
  appropriate.
- Bridge forwards to the `sensor-ingest-webhook` Edge Function.
- Webhook stores rows as canonical `source="live"` for real LAN EcoWitt
  evidence.
- EcoWitt transport / vendor lineage is preserved in
  `raw_payload.vendor` and `raw_payload.metadata.transport_source`.
- `sensor_readings` upsert works correctly after the dedupe index migration
  that made the dedupe index non-partial and aligned with the upsert conflict
  target.
- `validate_sensor_reading` accepts canonical V0 source labels.
- Tent and Dashboard EcoWitt snapshot cards render canonical live EcoWitt
  readings.
- AI Doctor context readiness recognizes canonical live sensor evidence.
- Operator Mode surfaces a failure banner, a debug route, a sanitized report
  copy, and a Live Ingest Verified marker.

## End-to-end path

```
EcoWitt gateway (LAN)
  → Local Windows testbench bridge
      → labels latest local reading: live | demo | stale | invalid
      → forwards POST to sensor-ingest-webhook
          → validate_sensor_reading
              → public.sensor_readings upsert (dedupe index)
                  → Tent / Dashboard EcoWitt snapshot cards
                  → AI Doctor context readiness (live evidence)
                  → Operator Mode status / debug / verified marker
```

## Source truth contract

Canonical stored `source` values in `public.sensor_readings`:

- `live`
- `manual`
- `csv`
- `demo`
- `stale`
- `invalid`

EcoWitt-specific rules:

- EcoWitt is **vendor / transport lineage**, not the canonical stored source.
- Stored EcoWitt readings use `source="live"` **only** when they come from
  real live EcoWitt bridge evidence (real LAN EcoWitt markers present at the
  bridge).
- EcoWitt vendor / transport lineage is preserved in `raw_payload.vendor`
  and `raw_payload.metadata.transport_source`. It is never used as the
  canonical `source`.
- A bare `source="live"` row may count as live sensor evidence for AI Doctor
  readiness, but it must not be treated as EcoWitt-specific unless EcoWitt
  lineage exists in `raw_payload`.
- `demo`, `manual`, `csv`, `stale`, and `invalid` rows must remain distinct
  and must never be silently promoted to `live`.
- No fake-live fallback. Unknown or unverified evidence must never render as
  `live`.

## Forwarding payload contract

The bridge forwards a structured JSON payload to `sensor-ingest-webhook`
containing:

- `source` (one of the canonical labels above)
- `captured_at` (ISO timestamp from the bridge / vendor)
- `tent_id` (when known)
- `metrics` (e.g. `temp_f`, `humidity_percent`, `soil_moisture_pct`,
  `co2_ppm`)
- `raw_payload` with `vendor` and `metadata.transport_source` lineage

The forwarder must:

- Never include the EcoWitt `PASSKEY` in the forwarded payload.
- Never include the bridge token / `Authorization` header value in the
  payload body.
- Never include any `service_role` key or other server secret.
- Preserve raw vendor lineage in `raw_payload` for audit and AI Doctor
  evidence.

## Stored row contract

Each stored row in `public.sensor_readings` must include:

- `source` — canonical V0 source label
- `captured_at` — required, non-null
- `tent_id` — required for tent / dashboard visibility
- `plant_id` — when relevant
- `confidence` — when computed
- `raw_payload` — preserved; vendor / transport lineage retained

Rows must never be mutated to change `source` after insert. Stale or invalid
classifications are produced at write time, not by silently rewriting older
rows.

## Dedupe / upsert contract

- The dedupe index on `public.sensor_readings` is **non-partial** and matches
  the upsert conflict target exactly (no `WHERE captured_at IS NOT NULL`
  partial clause).
- The webhook performs an idempotent upsert using that conflict target.
- Re-posting the same `(tent_id, captured_at, source, …)` tuple must not
  create duplicates.
- The dedupe migration changes index shape only and requires no row-data
  mutation.

## Trigger / source allow-list contract

- The `validate_sensor_reading` trigger allow-list accepts the canonical V0
  source labels: `live`, `manual`, `csv`, `demo`, `stale`, `invalid`.
- Older source labels are preserved for back-compat so existing rows continue
  to validate.
- Insert failures from the trigger must surface a specific diagnostic reason
  (not the generic `insert_column_mismatch` or
  `insert_source_constraint_failed` legacy reasons) so Operator Mode can
  report a useful next step.

## Operator debug contract

Operator Mode for EcoWitt must:

- Show a failure banner when `forward_failure_count > 0` or
  `last_forward_status` is non-2xx.
- Expose a debug route that renders a sanitized bridge report.
- Sanitize the copyable report so it never contains `PASSKEY`,
  `Authorization`, `Bearer`, `service_role`, bridge tokens, `vbt_` strings,
  or raw `raw_payload` content with secrets.
- Render a Live Ingest Verified marker only when forwarding is enabled,
  `forward_success_count > 0`, `last_forward_status === 200`, the latest
  stored source is `live`, and the latest `captured_at` is within the
  configured staleness threshold.
- Provide a GET-only refresh action. No trigger-forward UI. No write paths.

## Snapshot visibility contract

- Tent and Dashboard EcoWitt snapshot surfaces must show canonical live
  EcoWitt rows (`source="live"` with EcoWitt lineage in `raw_payload`).
- Bare `source="live"` rows without EcoWitt lineage must not be rendered as
  EcoWitt-specific.
- Demo, manual, CSV, stale, and invalid readings must remain visually and
  semantically distinct from live readings.
- No `raw_payload`, token, `PASSKEY`, or `Authorization` strings may leak
  into rendered snapshot UI.

## AI Doctor readiness contract

- Rows with canonical `source="live"` count as live sensor evidence in AI
  Doctor context readiness.
- Stale or invalid rows (whether by source label or by age) must not count
  as current / live evidence.
- Demo, manual, and CSV labels remain distinct in readiness classification.
- Readiness computation must not invoke AI, must not call edge functions
  that cost credits, and must not write to `sensor_readings` or any other
  table.

## Safety rules

- No fake live data.
- No blind automation.
- No device control.
- No trigger-forward UI in Operator Mode.
- No Action Queue writes from ingest.
- No alert creation from ingest in V0.
- No secrets in payloads, logs, UI, or copyable reports: never expose
  `PASSKEY`, `Authorization`, `Bearer`, `service_role`, bridge tokens, or
  `vbt_` strings.
- Server-side validation must not trust client-supplied `user_id`.

## Known non-goals (V0)

- Cloud-direct EcoWitt ingest (without local bridge).
- Multi-vendor unified live ingest beyond EcoWitt + canonical sources.
- Automatic alerting from raw ingest events.
- Automatic Action Queue creation from sensor readings.
- Device control of EcoWitt-attached hardware.
- Real-time AI Doctor invocation from ingest.

## Regression checklist

Run this checklist before shipping any change that touches sensor ingest,
the EcoWitt bridge, the webhook, the dedupe index, the validator trigger,
Operator Mode EcoWitt surfaces, snapshot visibility, or AI Doctor readiness.

### Bridge

- [ ] `source` labeling tests pass (live vs demo vs stale vs invalid).
- [ ] Forwarding config tests pass.
- [ ] Golden forwarding payload contract test passes.
- [ ] No `PASSKEY` or bridge token leakage in forwarded payload or logs.

### Edge / webhook

- [ ] CORS tests pass.
- [ ] Auth / bridge token tests pass.
- [ ] Source remap tests pass (vendor / transport lineage → canonical
      `source`).
- [ ] Insert reason diagnostics are specific (not legacy
      `insert_column_mismatch` / `insert_source_constraint_failed`).
- [ ] Idempotency / upsert behavior verified (no duplicates on replay).
- [ ] No secret leakage in responses or logs.

### Database

- [ ] Dedupe index is non-partial and matches the upsert conflict target.
- [ ] `validate_sensor_reading` trigger accepts canonical V0 source labels.
- [ ] Older source labels still validate (back-compat preserved).
- [ ] No row-data mutation required by the migration.

### UI

- [ ] Tent / Dashboard live snapshot visibility verified for canonical
      `source="live"` EcoWitt rows.
- [ ] Operator failure banner renders on forwarding failure.
- [ ] Operator debug route renders the sanitized report.
- [ ] Sanitized copy report contains no `PASSKEY`, `Authorization`,
      `Bearer`, `service_role`, bridge tokens, or `vbt_` strings.
- [ ] Live Ingest Verified marker renders only when all verification
      criteria are met.
- [ ] No `raw_payload` or token leakage in any rendered surface.

### AI Doctor readiness

- [ ] `source="live"` rows count as live evidence.
- [ ] Stale / invalid rows do not count as current / live evidence.
- [ ] Demo, manual, and CSV labels remain distinct.
- [ ] Readiness does not invoke AI or any credit-costing edge function.

### Safety

- [ ] No fake live data.
- [ ] No blind automation.
- [ ] No device control.
- [ ] No trigger-forward UI.
- [ ] No Action Queue writes from ingest.
- [ ] No alert creation from ingest in V0.

## Validation commands

```bash
python3 -m unittest test_forwarding_config test_source_labeling test_forwarding_contract
bunx vitest run src/test/ecowitt-live-source-snapshot-visibility.test.ts src/test/ai-doctor-context-ecowitt-live-evidence.test.ts
bunx vitest run src/test/ecowitt-local-forwarding-status-widget.test.tsx src/test/ecowitt-bridge-debug-page.test.tsx src/test/ecowitt-live-ingest-verified-rules.test.ts src/test/ecowitt-windows-testbench-static-safety.test.ts
bunx vitest run src/test/sensor-readings-dedupe-index-migration.test.ts
bun run test:edge:sensor-ingest-webhook
bun run typecheck
```

## Rollback notes

This document is informational. Rolling it back has no runtime effect.

If a future change reintroduces the partial dedupe index or the legacy
trigger allow-list, follow the rollback notes captured in the original
migration slice:

- Recreate the previous partial dedupe index with
  `WHERE captured_at IS NOT NULL` only if absolutely required.
- Revert the trigger allow-list to the previous source labels only if
  absolutely required.
- No data rollback is required because no row data is mutated by the
  dedupe / allow-list migrations.
