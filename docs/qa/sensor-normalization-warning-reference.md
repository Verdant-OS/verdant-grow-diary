# Sensor Normalization Warning Reference

Reference for every sensor normalization preview warning code currently produced by Verdant's pure normalizer.

**Source of truth:**

- `src/lib/sensors/normalizeSensorReading.ts` — emits warning codes onto `NormalizedSensorReading.warnings`.
- `src/lib/sensors/sensorNormalizationPreviewViewModel.ts` — maps warning codes to human-readable display labels via `WARNING_LABELS`.
- `src/test/normalize-sensor-reading.test.ts` — proves which codes are emitted under which inputs.
- `src/test/sensor-normalization-preview-warnings-gating.test.ts` — proves which codes still allow metric summaries and which gate long-form write-ready rows.

If new warning codes are added in the normalizer, this doc must be updated in the same change.

---

## How to read this table

- **Warning code** — exact string pushed onto `warnings[]` in `normalizeSensorReading`.
- **Display label** — operator-facing string from `WARNING_LABELS`.
- **Field affected** — which normalized field the warning concerns.
- **Typical trigger** — the condition in the normalizer that causes the warning.
- **Metric summary may still render?** — whether the compact metric summary may still appear.
- **Long-form write-ready rows?** — whether long-form rows should be treated as write-ready. Long-form rows are also gated on a verified linked tent, regardless of warnings.
- **Operator action** — what the operator should do.

> Warning chips are **data-quality signals**, not plant diagnosis. Suspicious telemetry must never be classified as healthy. When uncertain, treat the preview as **note-only** and do not import.

---

## Context warnings

### `missing_tent_id`

- **Display label:** Missing tent ID
- **Field affected:** `tent_id`
- **Typical trigger:** No tent ID passed in options, or empty/whitespace string.
- **Metric summary may still render?** Yes.
- **Long-form write-ready rows?** No — long-form rows require a verified linked tent.
- **Operator action:** Link a real tent before treating the preview as write-ready. Otherwise treat the preview as note-only.

### `missing_captured_at`

- **Display label:** Missing captured_at
- **Field affected:** `captured_at`
- **Typical trigger:** `capturedAt` is null/undefined or not a parseable date.
- **Metric summary may still render?** Yes.
- **Long-form write-ready rows?** No — sensor truth requires a timestamp.
- **Operator action:** Confirm CSV timestamp mapping or the Quick Log occurred-at value before treating the preview as write-ready.

### `unknown_input_shape`

- **Display label:** Unknown input shape
- **Field affected:** Whole payload.
- **Typical trigger:** Input is not a plain object (null, array, primitive).
- **Metric summary may still render?** Typically no — payload yields no metrics, which usually also produces `no_usable_metrics` and forces `source = "invalid"`.
- **Long-form write-ready rows?** No.
- **Operator action:** Fix the upstream payload shape. Do not import.

### `no_usable_metrics`

- **Display label:** No usable metrics found
- **Field affected:** All metrics.
- **Typical trigger:** Every metric field is null after parsing.
- **Metric summary may still render?** No — there is nothing to render.
- **Long-form write-ready rows?** No — top-level `source` is forced to `invalid`.
- **Operator action:** Treat the preview as invalid. Do not import. Check column mapping / payload contents.

### `stale_reading`

- **Display label:** Reading is stale
- **Field affected:** `captured_at`, top-level `source`.
- **Typical trigger:** `captured_at` is older than `staleAfterMinutes` (default 60). Sets `is_stale = true`. Top-level `source` becomes `stale` unless already `invalid` or `demo`.
- **Metric summary may still render?** Yes.
- **Long-form write-ready rows?** Treat with caution. Historical CSV imports are expected to be stale; live ingest should not be.
- **Operator action:** For CSV history, stale is expected and acceptable. For live ingest, investigate clock drift or delayed upload before treating as current.

---

## Range / unit warnings — humidity

### `humidity_stuck_value`

- **Display label:** Humidity stuck at 0% or 100%
- **Field affected:** `humidity_pct`
- **Typical trigger:** Humidity equals exactly 0 or exactly 100.
- **Metric summary may still render?** Yes — value is still recorded.
- **Long-form write-ready rows?** Caution — likely a stuck probe or bad column.
- **Operator action:** Verify sensor calibration or CSV column before trusting the value.

### `humidity_out_of_range`

- **Display label:** Humidity out of range
- **Field affected:** `humidity_pct`
- **Typical trigger:** Humidity < 0 or > 100. Value is dropped (not recorded).
- **Metric summary may still render?** No for humidity — but other metrics may still render.
- **Long-form write-ready rows?** No row is emitted for humidity.
- **Operator action:** Fix unit/column mapping. Do not import this metric as-is.

---

## Range / unit warnings — soil moisture

### `soil_moisture_stuck_value`

- **Display label:** Soil moisture stuck at 0% or 100%
- **Field affected:** `soil_moisture_pct`
- **Typical trigger:** Soil moisture equals exactly 0 or exactly 100.
- **Metric summary may still render?** Yes.
- **Long-form write-ready rows?** Caution — likely a stuck or disconnected probe.
- **Operator action:** Check sensor calibration or CSV column before trusting the value.

### `soil_moisture_out_of_range`

- **Display label:** Soil moisture out of range
- **Field affected:** `soil_moisture_pct`
- **Typical trigger:** Soil moisture < 0 or > 100. Value is dropped.
- **Metric summary may still render?** No for soil moisture.
- **Long-form write-ready rows?** No row is emitted for soil moisture.
- **Operator action:** Fix unit/column mapping.

---

## Range / unit warnings — EC

### `soil_ec_likely_us_cm`

- **Display label:** EC value looks like µS/cm shown as mS/cm
- **Field affected:** `soil_ec_ms_cm`
- **Typical trigger:** `soil_ec_ms_cm` / `soil_ec` field reports a value > 20, suggesting the value is actually µS/cm rather than mS/cm.
- **Metric summary may still render?** Yes — value is recorded as provided.
- **Long-form write-ready rows?** Caution — unit confusion likely.
- **Operator action:** Confirm units at the source before import. Consider remapping to `soil_ec_us_cm`.

### `reservoir_ec_likely_us_cm`

- **Display label:** Reservoir EC value looks like µS/cm shown as mS/cm
- **Field affected:** `reservoir_ec_ms_cm`
- **Typical trigger:** mS/cm-typed reservoir EC > 20, or ambiguous `ec` field > 20 (in the ambiguous case the normalizer also auto-converts by dividing by 1000).
- **Metric summary may still render?** Yes.
- **Long-form write-ready rows?** Caution — unit confusion likely.
- **Operator action:** Confirm units at the source before import.

---

## Range / unit warnings — temperature

### `temperature_c_likely_fahrenheit`

- **Display label:** Celsius value looks like Fahrenheit
- **Field affected:** `temperature_c`, `temperature_f`
- **Typical trigger:** A Celsius-typed field reports a value > 60.
- **Metric summary may still render?** Yes — value is recorded as Celsius.
- **Long-form write-ready rows?** Caution — unit confusion likely.
- **Operator action:** Verify the source units. If the value was actually Fahrenheit, remap the column.

### `temperature_f_likely_celsius`

- **Display label:** Fahrenheit value looks like Celsius
- **Field affected:** `temperature_f`, `temperature_c`
- **Typical trigger:** A Fahrenheit-typed field reports a value between -10 and 50.
- **Metric summary may still render?** Yes.
- **Long-form write-ready rows?** Caution — unit confusion likely.
- **Operator action:** Verify the source units.

---

## Range / unit warnings — pH

### `ph_out_of_range`

- **Display label:** pH out of range
- **Field affected:** `reservoir_ph`
- **Typical trigger:** pH < 0 or > 14. Value is dropped.
- **Metric summary may still render?** No for pH.
- **Long-form write-ready rows?** No row is emitted for pH.
- **Operator action:** Fix mapping/source. Do not import this metric.

### `ph_out_of_realistic_range`

- **Display label:** pH outside realistic range
- **Field affected:** `reservoir_ph`
- **Typical trigger:** pH is in [0, 14] but < 3 or > 9. Value is recorded.
- **Metric summary may still render?** Yes.
- **Long-form write-ready rows?** Caution — value is unusual for horticulture.
- **Operator action:** Verify probe calibration, buffering, and source column.

---

## Safety notes

- Warning chips are **data-quality signals**, not plant diagnosis. Do not infer plant health from warning chips alone.
- Suspicious telemetry must **never** be classified as healthy. When the normalizer emits any range/unit/stuck/shape warning, downstream UI must continue to label the data as suspect.
- When uncertain, treat the preview as **note-only** and do not import sensor rows.
- Long-form write-ready rows additionally require a verified linked tent (`tentStatus === "linked_verified"`), regardless of warnings.
- Preview view models advertise `writesEnabled: false`. Warnings exist to inform operators; they do not — and must not — create writes, alerts, or Action Queue items.

---

## Source-truth note

This document must be updated whenever:

- `normalizeSensorReading.ts` adds, removes, or renames a warning string.
- `WARNING_LABELS` in `sensorNormalizationPreviewViewModel.ts` changes.
- `normalize-sensor-reading.test.ts` or `sensor-normalization-preview-warnings-gating.test.ts` add or change tests that prove a warning code's behavior.

If this doc and the code disagree, the code and its tests win — then fix this doc in the same change.

---

## Related Docs

- [`docs/qa/sensor-normalization-preview-qa.md`](./sensor-normalization-preview-qa.md)
- [`docs/qa/csv-sensor-import-preview-qa.md`](./csv-sensor-import-preview-qa.md)
- [`docs/qa/quick-log-environment-check-preview-qa.md`](./quick-log-environment-check-preview-qa.md)
- [`docs/qa/preview-no-write-verification.md`](./preview-no-write-verification.md)
- [`docs/qa/preview-comparison-matrix.md`](./preview-comparison-matrix.md)
