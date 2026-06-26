# Workbook Templates — Docs Artifacts (v1.3)

> **Docs-only artifacts.** These are reference templates that match the
> v1.3 specs at:
>
> - [`docs/seed-production-tracking-workbook-spec.md`](../seed-production-tracking-workbook-spec.md)
> - [`docs/commercial-release-review-traceability-workbook-spec.md`](../commercial-release-review-traceability-workbook-spec.md)
>
> No app code, schema, RLS, RPC, Edge Function, UI, entitlement logic, AI
> call, alert, Action Queue write, or device control is introduced by
> these files. Operators copy / import them into their own spreadsheet
> tool of choice (Google Sheets, Excel, Numbers, LibreOffice).

## Files

| File | Sheet name | Purpose |
| ---- | ---------- | ------- |
| [`seed-production-tracking.csv`](./seed-production-tracking.csv) | `Seed_Production_Tracking` | Header row + worked example rows that match spec §3 / §11 / §12 / §13 / §15 |
| [`seed-production-tracking.contracts.md`](./seed-production-tracking.contracts.md) | — | Column contracts: allowed values, validation, and exact formula text |
| [`commercial-release-review-traceability.csv`](./commercial-release-review-traceability.csv) | `Commercial_Release_Review_Traceability` | Header row + worked example rows that match spec §4 / §5 / §12 / §14 |
| [`commercial-release-review-traceability.contracts.md`](./commercial-release-review-traceability.contracts.md) | — | Column contracts: enums, formula guidance, traceability rules |

## Usage

1. Import the CSV into a fresh workbook tab; name the tab using the
   `Sheet name` column above.
2. Apply the formulas listed in the matching `*.contracts.md` file to the
   formula columns (`L`, `W` for seed production; `Review Status`,
   `Missing Evidence Count`, etc. for commercial release).
3. Add data validation (enums / numeric bounds) per the contracts file.
4. The example rows are reference fixtures — delete them before
   production use, or keep them as worked examples in a separate
   `Examples` tab.

## Safety

- Formulas are **signals only**. They never set `Released` or approve
  release.
- `Human Release Decision` is always manual.
- No automatic Action Queue creation.
- Premium workbook copy distribution follows the Premium Workbook Copy
  rules in §8 of the Commercial Release Review spec — public docs only
  show `{{PREMIUM_WORKBOOK_COPY_URL}}` and the exact fallback text.
