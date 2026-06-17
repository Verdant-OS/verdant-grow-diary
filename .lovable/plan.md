## Goal

Remove operator-facing XLSX and spreadsheet/CSV import surfaces (routes, nav, pages, components, copy, docs, tests) now that Verdant has real sensor ingest. Preserve pure helpers still used by AI Doctor imported-history context. No schema/RLS/Edge/auth/ingest changes.

## Audit findings

Operator-facing surfaces to remove:

- Routes in `src/App.tsx`:
  - `/operator/genetics-import` → `OperatorGeneticsImportPage`
  - `/imports/representative-csv` → `RepresentativeCsvPreview`
  - `/sensors/csv-preview` → `SensorCsvPreview`
  - `/partners/csv-preview` → `PartnerCsvPreviewLanding`
- Sidebar entry "Genetics XLSX Import (Preview-only)" in `src/components/AppSidebar.tsx`.
- Operator XLSX pages/components:
  - `src/pages/OperatorGeneticsImportPage.tsx`
  - `src/pages/SensorCsvPreview.tsx`
  - `src/pages/RepresentativeCsvPreview.tsx`
  - `src/pages/PartnerCsvPreviewLanding.tsx`
  - `src/components/VerdantGeneticsXlsx*.tsx`, `VerdantGeneticsImportPreviewTable.tsx`
  - `src/components/TentCsvImportCard.tsx`, `EnvironmentCsvImportModal.tsx`, `EnvironmentCsvImportLauncher.tsx`, `CsvPreviewReviewGate.tsx`, `CsvPreviewRecordingGuide.tsx`, `CsvPreviewHelpPanel.tsx`, `CsvSensorPreviewPanel.tsx`
- XLSX-only lib files:
  - `src/lib/verdantGeneticsXlsx*.ts`, `verdantGeneticsImportPreviewRules.ts`
- Mount points in `src/pages/TentDetail.tsx` and `src/pages/Sensors.tsx` (remove TentCsvImportCard/EnvironmentCsvImportLauncher usage and any related copy/anchors).
- Route manifest entries in `src/lib/appRouteManifest.ts`.
- Docs: `docs/csv-preview-partner-demo.md` and any "Genetics XLSX Import" / "Upload spreadsheet" copy in docs.
- `xlsx` package in `package.json` (only used by `verdantGeneticsXlsxFileLoader.ts`).

Preserve (still referenced by AI Doctor imported-history pure logic):

- `src/lib/aiDoctorCsvHistoryContextRules.ts`, `aiDoctorContextCompiler.ts`, `aiDoctorImportedHistoryPromptRules.ts`, `aiDoctorImportedHistoryDisclosureViewModel.ts`, `aiDoctorPromptAssembly.ts`
- `src/components/AiDoctorImportedHistoryDisclosurePanel.tsx` (read-only AI surface)
- `src/lib/csvSensorPreviewRules.ts`, `csvSensorPreviewPdf.ts`, `csvMappingPresetStorage.ts`, `environmentCsvPreviewCopyRules.ts`, `sensorHistoryImportFingerprintRules.ts`, `sensorHistoryImportAuditLog.ts`, `sensorHistoryImportAuditEventBuilders.ts` only if still referenced after page/component removal; otherwise delete.
- Backend (`supabase/functions/ai-doctor-review/index.ts`) — unchanged.

## File-level plan

1. `src/App.tsx`: remove 4 routes + 4 imports listed above.
2. `src/components/AppSidebar.tsx`: remove the "Operator" group's Genetics XLSX item; drop unused `FileSpreadsheet` import. (If group becomes empty, remove the group.)
3. Delete pages: `OperatorGeneticsImportPage.tsx`, `SensorCsvPreview.tsx`, `RepresentativeCsvPreview.tsx`, `PartnerCsvPreviewLanding.tsx`.
4. Delete components: all `VerdantGeneticsXlsx*`, `VerdantGeneticsImportPreviewTable`, `TentCsvImportCard`, `EnvironmentCsvImportModal`, `EnvironmentCsvImportLauncher`, `CsvPreviewReviewGate`, `CsvPreviewRecordingGuide`, `CsvPreviewHelpPanel`, `CsvSensorPreviewPanel`.
5. Delete libs: all `verdantGeneticsXlsx*`, `verdantGeneticsImportPreviewRules`. Re-scan remaining `csv*`/`sensorHistoryImport*` libs and delete any that become orphaned (kept only if AI Doctor or sensor-truth code still imports them).
6. `src/pages/TentDetail.tsx`, `src/pages/Sensors.tsx`: remove import-card mounts, related section headings, anchors, and replacement copy → small honest note: "Sensor readings come from live ingest, manual entry, CSV history where explicitly labeled, or demo data in demo mode." Keep all live/manual sensor UI intact.
7. `src/lib/appRouteManifest.ts`: remove the four route entries.
8. Delete now-obsolete tests under `src/test/` matching: `verdant-genetics-*`, `operator-genetics-*`, `csv-import-review-*`, `csv-mapping-*`, `csv-preview-*`, `csv-sensor-preview-*`, `csv-row-validation-*`, `csv-timeline-preview-*`, `csv-normalization-preview-embed*`, `csv-history-duplicate-aware-import*`, `csv-sensor-import*`, `representative-csv-*`, `tent-csv-import-card-*`, `environment-csv-import-ui*`, `sensor-import-preview-copy*`, `sensors-import-anchor*`, `registry-csv-insert-rows-adapter*`, `sensor-readings-batch-insert*` if it covers removed import path, `sensor-history-import-replay-guard*` / `sensor-history-import-audit-wiring*` if dependent on removed UI. Keep AI Doctor imported-history tests.
9. Docs cleanup: delete or archive `docs/csv-preview-partner-demo.md`; sweep `docs/` for "XLSX import"/"Upload spreadsheet"/"Excel import" operator copy.
10. `package.json`: remove `xlsx` dependency after step 3 leaves no `xlsx` import.
11. Add tests:
    - `src/test/operator-import-routes-removed.test.ts`: assert `/operator/genetics-import`, `/imports/representative-csv`, `/sensors/csv-preview`, `/partners/csv-preview` are absent from `appRouteManifest` and `App.tsx`.
    - `src/test/sidebar-no-xlsx-import.test.tsx`: render `AppSidebar`; assert no link contains "XLSX", "Spreadsheet", or "Genetics Import".
    - `src/test/no-operator-spreadsheet-copy-static-safety.test.ts`: scan `src/pages/**` and `src/components/**` for forbidden strings ("XLSX import", "Excel import", "Upload spreadsheet", "Import readings from XLSX") and fail if found; ignore `src/test/**` and `docs/`.
12. Validation: `bun run typecheck`, then targeted `bunx vitest run` on new tests plus AI Doctor imported-history suites and Quick Log/Timeline suites to confirm no regression.

## Preserved active sensor paths

- Live ingest (Ecowitt, Pi), manual sensor entry, sensor-truth source labeling (`live|manual|csv|demo|stale|invalid`), AI Doctor imported-history context (pure helpers + disclosure panel), Quick Log + Timeline.

## Safety

- No schema/RLS/Edge/auth/ingest changes.
- No new write paths.
- No Action Queue / alert / device-control changes.
- Pure deletions + small copy update + new guard tests.

## Risk / rollback

Risk: a non-import surface may transitively import a deleted CSV component. Mitigation: typecheck after each deletion batch; restore the file if a non-import caller surfaces. Rollback: revert the change set; no data migration involved.
