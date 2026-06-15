# Sensor Normalization Preview QA

> Back to [Verdant QA Checklists](./README.md).

Run before any partner demo or release-candidate sign-off that includes the CSV review gate or Quick Log Environment Check preview.

Scope: read-only preview only. This checklist verifies that Verdant shows how CSV/manual sensor data would be interpreted **before any save/write path exists**.

---

## Purpose

Verdant now surfaces a read-only sensor normalization preview so growers and operators can see exactly how Verdant would interpret CSV or manual sensor data.

State clearly to any operator running this checklist:

- Preview only.
- No sensor readings are saved.
- No device control.
- No automation.
- No raw payload dump.
- Long-form rows are preview rows, not database rows.

---

## Flow A — CSV Normalization Preview

### Where to click

1. Open the CSV sensor preview/import flow.
2. Load or use a CSV preview with at least one accepted sensor row.
3. Go to the CSV review gate.
4. Find the section titled:

   ```txt
   CSV normalization preview
   ```

5. Confirm the preview panel is visible.

### Labels that must appear

- [ ] `CSV normalization preview`
- [ ] `Preview only — no sensor readings will be saved.`
- [ ] `source: csv`
- [ ] `source_identity: csv_import`
- [ ] `transport: csv`
- [ ] `data-writes-enabled="false"` on the preview container or panel

Also verify:

- [ ] Confidence score is visible.
- [ ] `captured_at` is visible when available.
- [ ] Tent status is visible.
- [ ] Plant status is visible if present.
- [ ] Warning chips/list appears when warnings exist.
- [ ] Normalized metric summary appears.
- [ ] Long-form row preview appears **only when valid tent context exists**.

### How to verify writes are disabled

- [ ] The preview section has `data-writes-enabled="false"`.
- [ ] The panel has `data-writes-enabled="false"` if rendered there too.
- [ ] The existing import/convert CTA remains disabled or “coming later” if that was the prior state.
- [ ] No new save/import button appears.
- [ ] No network request is made to insert sensor readings.
- [ ] No `sensor_readings` row is created.
- [ ] No Action Queue item or alert is created.

Suggested browser/devtools checks:

- Open DevTools Network tab.
- Interact with the preview.
- Confirm no request is made to Supabase insert/update endpoints.
- Confirm no Edge Function call is made.
- Confirm no `functions.invoke`-style request occurs.

### How to verify raw payload does not leak

Use a CSV row containing obvious raw/private-looking keys for QA only, such as:

```txt
secret_test_key
raw_payload
bridge_token
service_role
```

> **Note:** The strings above are fake QA tokens only. Do not use real secrets in CSV QA files.

Expected result:

- [ ] UI may show `Raw fields: X`.
- [ ] UI may show `Raw payload preserved for future ingest/debug context.`
- [ ] UI **must NOT** show raw object keys.
- [ ] UI **must NOT** show raw JSON.
- [ ] UI **must NOT** show `raw_payload`.
- [ ] UI **must NOT** show `service_role`.
- [ ] UI **must NOT** show `bridge_token`.
- [ ] UI **must NOT** show secret-looking values.

### How to verify missing tent blocks long-form rows

Use a CSV preview without a valid tent id.

Expected result:

- [ ] Tent status shows missing/invalid/not verified.
- [ ] Normalized metric summary may still appear.
- [ ] Long-form row preview is empty or hidden.
- [ ] Required empty-state copy appears:

  ```txt
  No write-ready metric rows were generated because a valid tent context is missing.
  ```

---

## Flow B — Quick Log Manual Environment Check Preview

### Where to click

1. Open Quick Log.
2. Select a plant/tent context if available.
3. Choose Event Type:

   ```txt
   Environment Check
   ```

4. Enter at least one manual measurement, such as:
   - room temperature
   - humidity
   - soil moisture
   - EC
   - pH

5. Find the compact sensor normalization preview inside the Environment Check section.

### Labels that must appear

- [ ] `Preview only — no sensor readings will be saved.`
- [ ] `source: manual`
- [ ] `source_identity: manual_entry`
- [ ] `transport: manual`
- [ ] `data-writes-enabled="false"` on the preview container or panel

Also verify:

- [ ] Confidence score is visible.
- [ ] Tent status is visible.
- [ ] Plant status is visible if present.
- [ ] Warning chips/list appears when warnings exist.
- [ ] Normalized metric summary appears when measurements exist.
- [ ] Long-form rows appear only when tent context is verified.

### Note-only behavior

- [ ] If the Environment Check contains only notes and no measurements, the normalization preview does not appear.

### Save behavior

- [ ] Saving the Quick Log still uses the existing diary save path.
- [ ] No sensor reading is inserted.
- [ ] No normalized long-form rows are added to the save payload.
- [ ] EC @25°C preview is **not** stored as canonical sensor data.

---

## Suspicious Telemetry Checks

| Input                         | Expected warning                             |
| ----------------------------- | -------------------------------------------- |
| humidity = 0                  | humidity stuck/invalid warning               |
| humidity = 100                | humidity stuck/invalid warning               |
| soil moisture = 0             | soil moisture stuck/invalid warning          |
| soil moisture = 100           | soil moisture stuck/invalid warning          |
| reservoir pH = 12             | pH outside realistic range warning           |
| EC = 1450 mS/cm-looking field | EC suspicious magnitude warning              |
| missing captured_at           | missing/invalid captured_at warning          |
| missing tent id               | missing tent warning and zero long-form rows |

---

## Pass / Fail Checklist

- [ ] CSV preview section appears.
- [ ] CSV source is labeled `csv`.
- [ ] CSV identity is labeled `csv_import`.
- [ ] CSV transport is labeled `csv`.
- [ ] Manual preview source is labeled `manual`.
- [ ] Manual identity is labeled `manual_entry`.
- [ ] Manual transport is labeled `manual`.
- [ ] `data-writes-enabled="false"` is present.
- [ ] No save/import button is enabled by the preview.
- [ ] No Supabase insert/update request occurs.
- [ ] No Edge Function request occurs.
- [ ] No Action Queue item is created.
- [ ] No alert is created.
- [ ] Raw payload keys are not rendered.
- [ ] Secret-looking keys are not rendered.
- [ ] Missing tent context blocks long-form rows.
- [ ] Metric summaries remain visible when safe, even if long-form rows are blocked.
- [ ] Suspicious telemetry shows field-specific warnings.
- [ ] Quick Log note-only Environment Check does not render preview.
- [ ] Quick Log save behavior is unchanged.

---

## Static Safety Reminder

If this checklist mentions forbidden terms like `service_role` or `bridge_token`, they are QA fake strings only and must never be real secrets. No production code should reference them.

---

## Related Docs

- [`docs/sensor-truth-rules.md`](./sensor-truth-rules.md)
- [`docs/qa/v0-manual-qa-checklist.md`](./v0-manual-qa-checklist.md)
- [`docs/data-labeling-spec.md`](./data-labeling-spec.md)
