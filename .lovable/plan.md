# EcoWitt Live Ingest Proof Gate — Revised Plan

Read-only proof panel that confirms whether a tent is currently receiving valid live EcoWitt sensor data, with explicit canonical-source vs vendor distinction, real invalid checks, deterministic sorting, a named proof window, and no raw-payload leakage.

## Scope guardrails

- Read-only only. No writes, no schema/RLS/Edge/auth/AI/alerts/Action Queue/automation/device control. No fake live data.
- No new Supabase query surface. Reuse existing RLS-safe loaders only.
- No raw payload values rendered. Optional payload field-name display is allowlist-only.

## Audit findings (existing reuse)

- Canonical stale threshold: `STALE_THRESHOLD_MS` (30 min) exported from `src/lib/sensorReadingNormalizationRules.ts` (already reused by `ecowittLiveIngestVerifiedRules.ts`). Import path is unblocked.
- Sensor truth helpers: `src/lib/sensorMetricStateRules.ts` (`isOptionalMetricInvalid`, bounds for CO₂/PPFD/soil), `src/lib/sensorValidation.ts` (pH, EC+unit, temp °C, humidity stuck 0/100), `src/lib/sensorReadingNormalizationRules.ts` (normalization, freshness). Reuse — do not duplicate.
- EcoWitt source/vendor classification: `src/lib/ecowittLatestSnapshotFilter.ts` already encodes "canonical source + raw_payload/vendor/transport lineage" detection. Reuse its candidate selector for vendor detection rather than re-rolling string matching.
- RLS-safe live row loader: `src/hooks/useEcowittLatestSnapshot.ts` (tent-scoped sensor_readings, read-only, capped limit). This is the wiring source for the proof panel. No new query needed.
- Ingest audit rows: `sensor_ingest_audit_log` table exists, but **no existing client-side RLS-safe hook reads it**. Per scope ("stop and report missing wiring instead of adding schema/RLS/Edge changes"), v1 will NOT surface accepted/rejected counts from `sensor_ingest_audit_log`. Instead, the proof-window accepted/rejected counts will be **derived from the same RLS-safe `sensor_readings` rows already loaded** (accepted = valid live EcoWitt rows in window; rejected = invalid/suspicious EcoWitt-vendor rows in window). Copy will say "in the current proof window (last 24 hours)" and will not imply all-time ingestion status. If the user wants true ingest-audit counts later, that requires a separate audit-hook task and is explicitly deferred.

## Source / provider contract

A row counts as an EcoWitt live candidate only if **both** hold:

1. Canonical `source`:
   - `"live"` → preferred path, or
   - `"ecowitt"` → legacy live-bridge source. Allowed, but proof copy must explicitly say "EcoWitt bridge source (legacy)".
   - Any of `demo | manual | csv | stale | invalid` → never promoted to live.
2. Vendor/transport indicates EcoWitt: detected via the existing `ecowittLatestSnapshotFilter` candidate predicate (checks `raw_payload.vendor`, `metadata.vendor`, `transport_source`, etc.). For canonical `source === "ecowitt"`, vendor is implied.

Rows with `source === "live"` but no EcoWitt vendor lineage → not counted (out of scope for this panel; shown as "not EcoWitt").

## Freshness / invalid contract

Per-row classification, in order:

1. **Missing timestamp** (`captured_at ?? ts` unparseable) → `unknown`. Not live.
2. **Future timestamp** (> 60s skew ahead of `now`) → `invalid`. Not live.
3. **Stale** (age > `STALE_THRESHOLD_MS` from `sensorReadingNormalizationRules`) → `stale`. Not live.
4. **Invalid metric/value** via reused helpers:
   - Humidity 0/100 stuck (`validateHumidity`).
   - Soil moisture stuck at 0/100 across recent rows (3+ consecutive) using `sensorMetricStateRules`/`isOptionalMetricInvalid` pattern.
   - pH outside 3.0–9.0 (`validatePh`).
   - Celsius/Fahrenheit mismatch heuristic + EC µS/mS mismatch (`validateTempC`, `validateEcWithUnit`) where unit is known.
   - CO₂/PPFD out of bounds via `sensorMetricStateRules` bounds constants.
   → `invalid`. Not live.
5. If invalid-detection helper requires multiple rows and only one is available → `limited`. Not live.
6. Otherwise → `live_confirmed`.

Sorting: helper sorts the input rows by `Date.parse(captured_at ?? ts)` descending; rows with unparseable timestamps go last. Never assumes `rows[0]` is newest.

## Proof window contract

- Window = **last 24 hours** from injected `now`. Named constant `ECOWITT_PROOF_WINDOW_MS`.
- `acceptedCount` = EcoWitt-vendor rows in window classified `live_confirmed`.
- `rejectedCount` = EcoWitt-vendor rows in window classified `stale | invalid | unknown | limited`.
- Copy: "X accepted / Y rejected in the current proof window (last 24 hours)". Never "all-time".
- If zero EcoWitt rows in window → calm empty state: "No EcoWitt readings observed in the current proof window."

## Payload display

- v1: **no raw payload key or value rendering.** Only render canonical safe field labels from `src/constants/sensorFields.ts` (`SENSOR_FIELD_LABELS`) for metrics that the chosen latest row actually carries. Unknown metrics omitted, not shown raw.
- Never render `raw_payload`, MAC, PASSKEY, Authorization, Bearer, service_role, JWT, ingest URL, or vendor secrets.

## File-level plan

New files:

- `src/lib/ecowittLiveProofRules.ts`
  - Exports: `ECOWITT_PROOF_WINDOW_MS = 24 * 60 * 60 * 1000`, `EcowittProofRowStatus = "live_confirmed" | "stale" | "invalid" | "unknown" | "limited" | "not_ecowitt"`, `classifyEcowittProofRow(row, ctx, nowMs)`, `sortRowsByCapturedAtDesc(rows)`.
  - Pure. Imports `STALE_THRESHOLD_MS` from `sensorReadingNormalizationRules`, validators from `sensorValidation`, bounds from `sensorMetricStateRules`, vendor-detect from `ecowittLatestSnapshotFilter`.
- `src/lib/ecowittLiveProofViewModel.ts`
  - Exports: `EcowittLiveProofViewModel`, `buildEcowittLiveProofViewModel(rows, { tentId, now })`.
  - Sorts rows, picks newest valid EcoWitt row as proof candidate, computes `acceptedCount` / `rejectedCount` scoped to proof window, builds calm copy strings (including legacy "EcoWitt bridge source" label when `source === "ecowitt"`), exposes allowlisted metric field labels only.
- `src/components/EcowittLiveProofPanel.tsx`
  - Presenter only. Consumes `useEcowittLatestSnapshot` (existing RLS-safe loader) for rows; calls `buildEcowittLiveProofViewModel`. Renders headline, tone badge, accepted/rejected counts with proof-window copy, metric field labels (no values), and calm empty state. No writes, no buttons that mutate.
- `src/test/ecowittLiveProofRules.test.ts`
- `src/test/ecowittLiveProofViewModel.test.ts`
- `src/test/EcowittLiveProofPanel.test.tsx`
- `src/test/ecowittLiveProof-static-safety.test.ts` (greps the three new files for forbidden tokens / writes)

No edits to existing product files.

## Tests

Rules + view-model:
- Fresh canonical `source: "live"` + EcoWitt vendor → `live_confirmed`, accepted++.
- Legacy `source: "ecowitt"` fresh + valid → `live_confirmed`, copy contains "EcoWitt bridge source".
- Legacy `source: "ecowitt"` old → `stale`, rejected++.
- `demo` / `manual` / `csv` with EcoWitt vendor → `not_ecowitt`-or-rejected, never `live_confirmed`.
- Humidity 100 stuck → `invalid`.
- pH 12 → `invalid`.
- Soil EC 1450 (µS/mS mismatch) → `invalid`.
- Missing `captured_at` and `ts` → `unknown`.
- Future timestamp (+10 min) → `invalid`.
- Unsorted input rows still pick newest valid reading.
- Proof-window scoping: row 25h old ignored from counts.
- Accepted/rejected math matches classifications.

Component:
- Empty rows → calm empty state, no "Live" claim.
- Mixed window → renders accepted/rejected with "current proof window (last 24 hours)" copy.
- Legacy ecowitt source → "EcoWitt bridge source (legacy)" copy visible.
- Renders only allowlisted metric labels; never raw payload values.

Static safety:
- Forbid `.insert(`, `.update(`, `.delete(`, `.upsert(`, `.rpc(`, `functions.invoke(`, `service_role`, `PASSKEY`, `Authorization`, `Bearer`, `vbt_`, `raw_payload[`, JWT regex.
- Forbid imports from AI, alerts, action_queue, device-control modules.

## Validation

```
npx vitest run ecowittLiveProof EcowittLiveProof sensorMetricStateRules sensorReadingNormalizationRules --reporter=verbose
npx tsc -p tsconfig.app.json --noEmit
```

## Safety verdict

Read-only, additive. Reuses canonical thresholds and validators; no duplicated rules; no schema/RLS/Edge/auth changes; no AI; no alerts; no Action Queue; no device control; no raw payload leakage; no fake live data.

## Rollback

- Delete `src/lib/ecowittLiveProofRules.ts`, `src/lib/ecowittLiveProofViewModel.ts`, `src/components/EcowittLiveProofPanel.tsx`, and the four new test files.
- No existing files modified, so no further rollback steps.

## Deferred / blockers

- True ingest-audit accepted/rejected counts from `sensor_ingest_audit_log` are deferred — no RLS-safe client hook exists, and adding one would require schema/RLS/Edge scope which is out of bounds. v1 derives counts from the already-loaded `sensor_readings` rows and labels the window explicitly.
- Mounting `EcowittLiveProofPanel` into a specific page (e.g. Operator EcoWitt Bridge Debug) is **not** in this plan — component is built but unmounted. Wiring it into a route is a follow-up so this slice stays minimal.
