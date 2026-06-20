# Preview No-Write Verification QA

> Back to [Verdant QA Checklists](./README.md).

Purpose: Verify that sensor normalization previews are read-only and do not save sensor data, create database rows, trigger alerts, or enable automation.

---

## Where this applies

- CSV sensor import preview
- Quick Log manual Environment Check preview
- Any future normalization preview panel using `SensorNormalizationPreviewPanel`

---

## UI signals to confirm

- [ ] `data-writes-enabled="false"` appears on the preview section and/or panel.
- [ ] Copy appears: `Preview only — no sensor readings will be saved.`
- [ ] No new sensor Save button appears.
- [ ] Existing disabled/import/convert CTA remains disabled or “coming later.”
- [ ] Preview rows are labeled or understood as preview-only.
- [ ] Long-form rows are not described as saved rows.
- [ ] Raw payload is not rendered.

---

## DevTools verification

1. Open DevTools.
2. Open the Network tab.
3. Interact with the preview.
4. Enter or inspect manual/CSV values.

Confirm:

- [ ] No Supabase insert/update/delete request occurs.
- [ ] No Edge Function request occurs.
- [ ] No `sensor_readings` write occurs.
- [ ] No Action Queue or alert side-effect occurs.

> **Note:** Read-only fetches may occur elsewhere in the app; this checklist is specifically looking for writes caused by the preview.

---

## Database verification

- [ ] Snapshot current `sensor_readings` count for the test user/tent if available.
- [ ] Interact with preview.
- [ ] Confirm `sensor_readings` count did not increase.
- [ ] Confirm no new Action Queue row was created.
- [ ] Confirm no new alert row was created.

> **Note:** Database verification is optional and intended for admin-level QA. Operators without direct database access should rely on UI signals and DevTools Network checks.

---

## Pass / fail

**Pass:**

- UI says preview-only.
- `data-writes-enabled="false"` is present.
- No write request occurs.
- No database row appears.

**Fail:**

- A save/import button becomes enabled because of preview.
- A Supabase insert/update/delete request is observed.
- An Edge Function write is called.
- A sensor row, alert, or Action Queue item is created.

---

## Related Docs

- [`sensor-normalization-preview-qa.md`](./sensor-normalization-preview-qa.md)
- [`csv-sensor-import-preview-qa.md`](./csv-sensor-import-preview-qa.md)
- [`quick-log-environment-check-preview-qa.md`](./quick-log-environment-check-preview-qa.md)

---

## Static safety reminder

These are QA docs only. Do not paste real secrets into DevTools notes, CSVs, screenshots, docs, tests, or prompts. Preview QA should use fake test data only.
