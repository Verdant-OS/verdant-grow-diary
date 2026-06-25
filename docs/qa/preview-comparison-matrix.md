# Sensor Preview Comparison Matrix

> Back to [Verdant QA Checklists](./README.md).

Purpose: Document how normalization preview behavior differs between CSV import preview and Quick Log manual Environment Check preview.

---

## Behavior comparison

| Behavior | CSV sensor import preview | Quick Log Environment Check preview |
| --- | --- | --- |
| **Source label** | `csv` | `manual` |
| **Source identity** | `csv_import` | `manual_entry` |
| **Transport** | `csv` | `manual` |
| **Input source** | Accepted sampled CSV row | Manual Environment Check fields |
| **Preview trigger** | CSV review gate with accepted row | Manual measurement entered |
| **Note-only behavior** | Not applicable | No preview for notes only |
| **Accepted/rejected rows** | Yes, CSV review concern | Not applicable |
| **Existing CTA** | Import/convert remains disabled/coming later | Quick Log save unchanged |
| **Writes enabled?** | No | No |
| **data-writes-enabled** | `false` | `false` |
| **Raw payload display** | Field count / preserved note only | Field count / preserved note only if applicable |
| **Long-form row gating** | Requires valid tent context | Requires verified tent context |
| **Missing tent behavior** | Metric summary may show; long-form rows hidden/empty | Metric summary may show; long-form rows hidden/empty |
| **Warning chips** | Data-quality warnings | Data-quality warnings |
| **Save path** | No CSV sensor save path | Existing diary/Quick Log save path only |
| **Database sensor rows** | None | None |
| **Alerts / Action Queue** | None | None |
| **Device control** | None | None |

---

## Interpretation

- **CSV preview answers:** “How would this accepted CSV row be interpreted?”
- **Quick Log preview answers:** “How would these manual Environment Check measurements be interpreted?”
- Neither flow writes sensor readings today.
- Neither flow should be treated as live telemetry.
- Warning chips are data-quality signals, not plant diagnosis.

---

## Related Docs

- [`sensor-normalization-preview-qa.md`](./sensor-normalization-preview-qa.md)
- [`csv-sensor-import-preview-qa.md`](./csv-sensor-import-preview-qa.md)
- [`quick-log-environment-check-preview-qa.md`](./quick-log-environment-check-preview-qa.md)
- [`preview-no-write-verification.md`](./preview-no-write-verification.md)

---

## Static safety reminder

These are QA docs only. Do not paste real secrets into DevTools notes, CSVs, screenshots, docs, tests, or prompts. Preview QA should use fake test data only.
