# Verdant QA Checklists

These checklists help operators verify Verdant flows without changing data, enabling writes, or pretending preview data is live.

---

## Sensor normalization preview

- [`sensor-normalization-preview-qa.md`](./sensor-normalization-preview-qa.md) — Full QA checklist for CSV and Quick Log Environment Check normalization preview behavior, including write-disabled verification, raw-payload non-leakage, missing-tent gating, suspicious telemetry checks, no-write verification, warning-chip troubleshooting, and the warning-chip flowchart.
- [`csv-sensor-import-preview-qa.md`](./csv-sensor-import-preview-qa.md) — Focused CSV review-gate QA covering accepted vs rejected rows, write-disabled signals, raw payload non-leak, and missing tent behavior.
- [`quick-log-environment-check-preview-qa.md`](./quick-log-environment-check-preview-qa.md) — Focused Quick Log manual Environment Check QA covering required labels, preview-only verification, preview-vs-database row distinction, note-only behavior, and warning chips.

---

## CSV sensor import preview

Compact checklist for the CSV review gate normalization preview:

- [ ] CSV review gate opens.
- [ ] Accepted/rejected row counts are visible if the UI provides them.
- [ ] Rejected rows remain rejected.
- [ ] One sampled accepted row renders normalization preview.
- [ ] `source` is `csv`.
- [ ] `source_identity` is `csv_import`.
- [ ] `transport` is `csv`.
- [ ] `data-writes-enabled="false"` is present.
- [ ] Existing import/convert CTA remains disabled or “coming later.”
- [ ] No sensor readings are saved.
- [ ] Raw payload keys are not rendered.

See the full checklist in [`sensor-normalization-preview-qa.md`](./sensor-normalization-preview-qa.md).

---

## Quick Log manual Environment Check preview

Compact checklist for the Quick Log Environment Check normalization preview:

- [ ] Quick Log opens.
- [ ] Event selector is accessible as **Event**.
- [ ] Environment Check can be selected.
- [ ] Note-only Environment Check does not render preview.
- [ ] Manual measurements render compact preview.
- [ ] `source` is `manual`.
- [ ] `source_identity` is `manual_entry`.
- [ ] `transport` is `manual`.
- [ ] Warning chips appear for suspicious inputs.
- [ ] Metric summaries remain visible when safe.
- [ ] Long-form rows are shown only with verified tent context.
- [ ] No sensor data is added to the save payload.
- [ ] Save still uses existing diary save behavior.

See the full checklist in [`sensor-normalization-preview-qa.md`](./sensor-normalization-preview-qa.md).

---

## Troubleshooting common normalization preview warnings

| Warning | Meaning | Typical trigger | Operator action |
| --- | --- | --- | --- |
| Missing tent context | No tent ID or non-UUID/demo tent | CSV or manual input without a linked tent | Link a real tent/plant, or treat the preview as note-only |
| Missing captured_at | CSV/manual row lacks timestamp | Missing timestamp mapping, or Quick Log without an occurred-at value | Confirm timestamp mapping or the Quick Log occurred-at value |
| Humidity stuck at 0/100 | Sensor or CSV value is 0 or 100 | Bad sensor reading, wrong column, or stuck probe | Check mapping/source before trusting the reading |
| Soil moisture stuck at 0/100 | Sensor/CSV value is 0 or 100 | Bad sensor reading, wrong column, or stuck probe | Check sensor calibration or CSV column |
| EC suspicious magnitude | mS/cm field contains µS/cm-like value such as 1450 | Unit confusion between mS/cm and µS/cm | Confirm units before import |
| pH outside realistic range | pH is far outside normal horticultural range | Bad probe, wrong column, or unbuffered solution | Check mapping/unit/source |
| Stale reading | captured_at older than threshold | Imported history, clock drift, or delayed upload | Confirm timestamp/source freshness |
| Invalid preview | No usable metrics or invalid critical context | Missing required fields, extreme outliers, or corrupted data | Do not treat as write-ready |

Important notes:

- Warning chips do not always block metric summaries.
- Missing/invalid tent context blocks long-form write-ready rows.
- Preview warnings are **not** a diagnosis.
- The grower/operator decides whether the source data is trustworthy.
- Use the warning-chip troubleshooting section in [`sensor-normalization-preview-qa.md`](./sensor-normalization-preview-qa.md#when-warning-chips-appear-but-metrics-still-look-usable) when metric summaries appear but Verdant flags source, timestamp, unit, or context concerns.
- Use the [warning-chip flowchart](./sensor-normalization-preview-qa.md#warning-chip-troubleshooting-flowchart) when preview metrics appear plausible but Verdant flags source, timestamp, unit, or context concerns.

---

## Static safety reminder

If any checklist mentions fake QA strings like `service_role`, `bridge_token`, or secret-looking values, use fake QA-only values. Never paste real secrets into CSVs, screenshots, docs, tests, or prompts.
