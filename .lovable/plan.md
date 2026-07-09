# Operator Mode SensorSnapshot Review Panel

## Summary
Add a pre-save review panel that validates a **manual** sensor snapshot draft before it gets attached to a diary/Quick Log entry, so growers catch bad or suspicious readings before they become plant history. Pure logic + presenter + tests. No schema, RLS, Edge, AI, Action Queue, or automation work.

## Requirements / assumptions
- Operator Mode only. Manual snapshots only. Source label is always `manual`.
- No writes anywhere — this is a read-only pre-save gate. Whether/how the parent screen wires the panel to an actual save action is out of scope for this slice.
- Existing `sensorReadingManualEntryRules.ts` covers per-metric form validation for saving to `sensor_readings`. This new module operates on the **snapshot-shape** payload (tempF, humidity, VPD, soil %/EC, reservoir EC/pH, CO2, PPFD, capturedAt, tent/plant) and adds cross-field, staleness, and provenance checks that a snapshot needs.
- No schema change: fields not supported by `sensor_readings` (soilEc, reservoirEc/pH) still surface in the snapshot review and normalizedPreview; the parent decides which subset to persist. The panel does not attempt to persist those columns.

## File-level plan
1. `src/lib/sensorSnapshotReviewRules.ts` — new pure module.
   - Types exactly as specified in the request: `SensorSnapshotReviewSeverity`, `SensorSnapshotReviewFinding`, `SensorSnapshotReviewResult`.
   - Input type `SensorSnapshotReviewInput` accepting the raw draft fields (strings or numbers), plus `capturedAt`, `tentId`, `plantId`, and an injectable `now` for deterministic staleness tests.
   - `reviewManualSensorSnapshot(input, opts?)` returns `SensorSnapshotReviewResult`:
     - Coerces + range-checks each metric.
     - Emits `blocker` findings for impossible values (RH outside 0–100, soil % outside 0–100, negative EC/CO2/PPFD/VPD, pH outside 0–14, PPFD > `PPFD_MAX`, missing `tentId`, `capturedAt` in the future beyond a small skew, `capturedAt` older than 24h → blocker for a "current" snapshot).
     - Emits `warning` findings for suspicious-but-possible values (unit-mismatch heuristics — °C-looking values in the °F field, RH stuck at exactly 0/100, soil stuck at 0/100, pH outside 5.0–7.5 in hydro, reservoir EC outside 0.3–4.0 mS/cm, VPD > 2.5 kPa, PPFD > 1500, `capturedAt` older than 1h).
     - `canSave = findings.every(f => f.severity !== "blocker")` AND at least one metric present.
     - `confidence`: `high` when no warnings and ≥3 metrics; `medium` when warnings only; `low` when any near-blocker heuristic (stale > 1h, stuck-rail values, unit-mismatch suspicion).
     - `source` fixed as `"manual"`.
     - `normalizedPreview` echoes the coerced fields (numbers or null), plus `capturedAt`/`tentId`/`plantId`.
   - No I/O, no React, no Supabase, no `Date.now()` at module scope.

2. `src/components/ManualSensorSnapshotReviewPanel.tsx` — new presenter.
   - Props: `{ result: SensorSnapshotReviewResult }` (pure — parent owns the draft state and calls the rules helper).
   - Renders:
     - Header with a `manual` source chip (never `live`), confidence badge, and captured-at line.
     - Findings list grouped by severity (`blocker` → `warning` → `ok`) with semantic roles (`role="alert"` for blockers, `role="status"` for warnings).
     - Normalized preview table (only fields present).
     - `data-can-save` attribute + a disabled-looking "Ready to save" / "Fix blockers first" status line. This component does not render a Save button — parent screen owns the action.
   - Semantic HSL tokens only, no inline colors. `data-testid="manual-sensor-snapshot-review-panel"`.

3. `src/lib/sensorSnapshotReviewRules.test.ts` — targeted unit tests.
   - Happy path (all fields valid, no warnings) → `canSave: true`, `confidence: "high"`, `source: "manual"`.
   - Blockers: RH 120, soil 150, negative CO2/PPFD/VPD/EC, pH 15, missing tent, future capturedAt, > 24h stale.
   - Warnings: RH 100 stuck, soil 0 stuck, °F field with a 22 (°C-looking), VPD 3.0, reservoir EC 5.5, pH 4.2, PPFD 1800, 90min stale.
   - Determinism: identical input → identical result (including finding order).
   - `normalizedPreview` echoes coerced numbers and never fabricates missing fields.
   - `source` is always `"manual"`, never `"live"`.

4. `src/components/ManualSensorSnapshotReviewPanel.test.tsx` — presenter tests.
   - Renders a `manual` chip and never the string "live".
   - Blocker finding renders with `role="alert"`; warning with `role="status"`.
   - `data-can-save="false"` when any blocker is present; `"true"` otherwise.
   - Normalized preview only lists fields present in the result.

## Implementation notes
- Reuse `PPFD_MAX` from `src/lib/ppfdRules` and `computeVpdKpa`/`fahrenheitToCelsius` from `sensorReadingManualEntryRules` where a computed preview helps (VPD auto-preview when temp+RH present but VPD absent, marked as derived in the finding message, not silently written).
- Staleness compares `capturedAt` against injectable `now` (default `new Date()`), so tests pin time explicitly.
- Finding `key` values are stable snake_case strings (e.g. `humidity_out_of_range`, `captured_at_stale`) so parents can dedupe / suppress deterministically.
- Deterministic ordering: findings emitted in a fixed rule order, not insertion-observed order.

## Tests added
- `src/lib/sensorSnapshotReviewRules.test.ts`
- `src/components/ManualSensorSnapshotReviewPanel.test.tsx`

## Validation commands
```bash
bunx tsgo --noEmit
bunx vitest run src/lib/sensorSnapshotReviewRules.test.ts src/components/ManualSensorSnapshotReviewPanel.test.tsx --reporter=dot
```

## Safety verdict
Safe. Pure module + presenter + tests. No Supabase, no schema/RLS/Edge/auth, no AI, no Action Queue, no device control, no automation. Snapshots surfaced by the panel are always labeled `manual`, never `live`. No fake live data. No secrets or `raw_payload` exposed. Existing manual-entry save path is untouched.

## Deferred / not in this slice
- Wiring the panel into any specific Quick Log or Operator screen (parent integration).
- Persisting new snapshot-only columns (soilEc, reservoirEc/pH) — would require a migration to extend `validate_sensor_reading`; explicitly out of scope.
- Any Action Queue / AI / device suggestions triggered by findings.

## Risk / rollback
Purely additive: 2 new files under `src/lib` and `src/components`, plus 2 test files. No existing file is modified. Rollback = delete the 4 new files.
