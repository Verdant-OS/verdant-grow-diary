# Quick Log Environment Check Preview QA

> Back to [Verdant QA Checklists](./README.md).

Purpose: Verify that manual Environment Check measurements show a compact read-only normalization preview without adding sensor data to the save payload or creating database sensor rows.

---

## Where to click

1. Open Quick Log.
2. Confirm the `Event` selector is accessible.
3. Select `Environment Check`.
4. Enter one or more manual measurements:
   - room temperature
   - humidity
   - soil moisture
   - EC
   - pH
5. Confirm the compact normalization preview appears.
6. Confirm note-only Environment Check entries do not render the preview.

---

## Required labels

- [ ] `Preview only — no sensor readings will be saved.`
- [ ] `source: manual`
- [ ] `source_identity: manual_entry`
- [ ] `transport: manual`
- [ ] `data-writes-enabled="false"`
- [ ] Tent status is visible.
- [ ] Plant status is visible when available.
- [ ] Confidence is visible.
- [ ] Warning chips appear when suspicious values are entered.
- [ ] Metric summaries remain visible when safe.

---

## Preview-only verification

- [ ] No new sensor save button appears.
- [ ] Quick Log save button behavior is unchanged.
- [ ] Quick Log save uses the existing diary / manual Quick Log path.
- [ ] No sensor rows are added to the save payload.
- [ ] No normalized long-form rows are added to the save payload.
- [ ] No `sensor_readings` database row is created.
- [ ] No Supabase insert/update request occurs from the preview.
- [ ] No Edge Function request occurs from the preview.
- [ ] No Action Queue item or alert is created.
- [ ] EC @25°C preview is not stored as canonical sensor data.

---

## Preview rows vs database rows

- Metric summaries show what Verdant parsed from manual inputs.
- Long-form rows are preview-only.
- Long-form rows are **not** database rows.
- A valid tent context may allow long-form preview rows to display.
- Missing / invalid tent context must hide or empty long-form rows.
- The presence of a preview row does **not** mean a write occurred.

---

## Note-only behavior

- [ ] Notes alone do not render normalization preview.
- [ ] Adding a measurement renders preview.
- [ ] Removing measurements should return to note-only / no-preview behavior if supported by the current UI.

---

## Warning chips

- Warning chips identify data-quality concerns.
- Warning chips do not always hide metric summaries.
- Warning chips must not be treated as plant diagnosis.
- Suspicious values must not be treated as healthy without review.

See the [warning-chip troubleshooting flowchart](./sensor-normalization-preview-qa.md#warning-chip-troubleshooting-flowchart) for step-by-step operator decisions.

---

## Static safety reminder

If this checklist mentions strings like `service_role`, `bridge_token`, or other secret-looking values, use fake QA-only values. Never paste real secrets into CSVs, screenshots, docs, tests, or prompts.

---

## Related Docs

- [`sensor-normalization-preview-qa.md`](./sensor-normalization-preview-qa.md)
- [`csv-sensor-import-preview-qa.md`](./csv-sensor-import-preview-qa.md)
