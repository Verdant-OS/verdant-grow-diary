# CSV Sensor Import Preview QA

> Back to [Verdant QA Checklists](./README.md).

Purpose: Verify that the CSV review gate distinguishes accepted/rejected rows, shows normalization preview for one accepted sample row, and keeps writes disabled.

---

## Where to click

1. Open the CSV sensor import/preview flow.
2. Load a CSV with both valid and invalid rows if possible.
3. Continue to the CSV review gate.
4. Confirm accepted/rejected row counts or row statuses are visible if the UI provides them.
5. Find the section titled `CSV normalization preview`.

---

## Accepted rows

- [ ] Accepted / importable rows remain accepted.
- [ ] One sampled accepted row is used for normalization preview.
- [ ] Normalized metric summaries appear when usable measurements exist.
- [ ] `source` is `csv`.
- [ ] `source_identity` is `csv_import`.
- [ ] `transport` is `csv`.
- [ ] Confidence is visible.
- [ ] Captured timestamp is visible when available.
- [ ] Tent status is visible.
- [ ] Plant status is visible when available.
- [ ] Long-form preview rows appear only when valid tent context exists.

---

## Rejected rows

- [ ] Rejected rows remain rejected.
- [ ] Rejected rows are not silently used as write-ready sensor rows.
- [ ] Rejected row warnings/errors remain visible.
- [ ] Rejected rows do not enable import/write behavior.
- [ ] Rejected rows do not create preview write-ready rows unless the current UI explicitly samples an accepted row separately.

---

## Writes remain disabled

- [ ] `data-writes-enabled="false"` is present.
- [ ] Copy appears: `Preview only — no sensor readings will be saved.`
- [ ] Existing disabled import/convert CTA remains disabled or “coming later.”
- [ ] No new save/import button appears.
- [ ] No Supabase insert/update request occurs.
- [ ] No Edge Function request occurs.
- [ ] No `sensor_readings` row is created.
- [ ] No Action Queue item or alert is created.

---

## Raw payload non-leak

Expected:

- [ ] Raw field count may appear.
- [ ] Preserved-note copy may appear.
- [ ] Raw JSON must **not** appear.
- [ ] Raw object keys must **not** appear.
- [ ] Secret-looking QA keys must **not** appear.

Use fake QA-only strings only:

```txt
secret_test_key
raw_payload
bridge_token
service_role
```

> Never paste real secrets into CSVs, screenshots, docs, tests, or prompts.

---

## Missing tent behavior

- [ ] Tent status shows missing / invalid / not verified.
- [ ] Metric summaries may still appear when safe.
- [ ] Long-form rows are hidden or empty.
- [ ] Empty-state copy appears:

  ```txt
  No write-ready metric rows were generated because a valid tent context is missing.
  ```

---

## Related Docs

- [`sensor-normalization-preview-qa.md`](./sensor-normalization-preview-qa.md) — full preview QA, no-write verification, and warning-chip troubleshooting.
