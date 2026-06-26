# Release Workbook Templates — v1.3

Docs-only artifacts for the Seed Production Tracking and Commercial Release Review + Traceability workbooks. No app runtime, schema, RLS, RPC, Edge Function, UI, AI, alert, Action Queue, or automation surface is touched by anything in this folder.

## What lives here

| File | Purpose |
| --- | --- |
| `seed-production-tracking-v1.3-template.xlsx` / `.csv` | Canonical A–AA headers (27 cols), formulas, and worked example rows for the Seed Production Tracking workbook. |
| `commercial-release-review-traceability-v1.3-template.xlsx` / `.csv` | Canonical A–AI headers (35 cols), formulas, and worked example rows for the Commercial Release Review workbook. |
| `release-workbook-formula-contracts.md` | Plain-text source of truth for every formula. Cross-checked by snapshot tests. |
| `release-workbook-template-manifest.json` | Version, file list, premium-link safety attestation. |

> Excel limits sheet names to 31 characters. The XLSX tab for the Commercial Release Review sheet is named `Commercial_Release_Review_Trace`. The canonical full name `Commercial_Release_Review_Traceability` is preserved in CSVs, contracts, and the manifest.

## Generate

```bash
bun run docs:generate-release-workbook-templates
```

This is deterministic — re-running over an unchanged generator produces byte-identical CSVs and structurally identical XLSX files.

## Verify

```bash
bun run docs:release-workbook-safety
```

That composite script runs, in order:

1. `docs:assert-premium-workbook-access` — `scripts/assert-premium-workbook-access-docs.mjs`
2. `docs:assert-release-traceability` — `scripts/assert-release-traceability-mapping.mjs`
3. `docs:generate-release-workbook-templates` — regenerates artifacts

Targeted vitest coverage:

```bash
bunx vitest run \
  src/test/assert-premium-workbook-access-docs.test.ts \
  src/test/assert-release-traceability-mapping.test.ts \
  src/test/generate-release-workbook-templates.test.ts \
  src/test/release-workbook-formula-snapshots.test.ts
```

## Safety checks guaranteed

The validators and snapshot tests collectively guarantee:

- **No real premium workbook URLs in public docs.** `docs.google.com`, `drive.google.com`, `sheets.googleapis.com`, `storage.googleapis.com`, `dropbox.com`, `notion.so`, `notion.site`, and `supabase.co/storage` are blocked. Only the `{{PREMIUM_WORKBOOK_COPY_URL}}` placeholder is allowed.
- **No leaked credentials or signed URLs.** `Bearer …`, `access_token=`, `token=`, `signature=`, `expires=`, `X-Amz-Signature`, `SUPABASE_SERVICE_ROLE_KEY=…`, and `entitlement|premium|workbook *_(token|secret|key)='…'` literals fail the scanner.
- **Required safety copy is present.** Fallback text and server-side enforcement copy must appear in the Commercial Release spec.
- **All 7 cross-sheet traceability mappings are present** in §12 of the Commercial Release spec (Seed Lot ID, Checklist forward + reverse, Pheno Comparison, F1/Backcross/Stabilization, Verdant Diary, Action Queue Draft).
- **All 7 traceability rules are documented** including: Seed Lot ID uniqueness, missing-evidence behavior, and the prohibition on auto-creating Action Queue items.
- **Formulas match the v1.3 contract exactly** — viability, viable-seed ratio, quality flag, and review status formulas in the XLSX, CSV, and contracts markdown are snapshot-compared on every CI run.
- **Review Status never auto-outputs `Released`.** Released and Rejected are human-only transitions driven by `AD Human Release Decision`. The snapshot test asserts the string `"Released"` never appears in the suggestion formula or its CSV serialization.
- **Generated CSVs contain no real URLs, no `SUPABASE_SERVICE_ROLE_KEY`, no `private/…` paths, no `auto-release` wording, and no `automatic Action Queue` wording.**

## What this is not

- Not a runtime feature. Nothing in this folder is imported by app code.
- Not a delivery channel for the real premium workbook link. The real link is served behind server-side entitlement enforcement, never from this folder.
- Not editable by hand — regenerate via the script so the snapshot tests stay green.

## Rollback

Delete `docs/artifacts/`, the `docs:*` scripts in `package.json`, and the matching tests in `src/test/`. No runtime impact, no migration to revert.
