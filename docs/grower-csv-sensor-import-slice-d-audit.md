# Grower-facing CSV Sensor Import — Slice D Write-Boundary Audit

**Date:** 2026-06-28
**Slice:** Verdant Establishment Fix Train v1 — Slice D
**Verdict:** ALREADY IMPLEMENTED — the grower-facing CSV sensor import flow
with explicit approval and `source = "csv"` writes is shipped and mounted.
No new code introduced by this audit.

## Write-boundary answers

| Question | Answer |
| --- | --- |
| Safe write path exists? | **Yes** — `src/lib/environmentCsvImportPersistence.ts` (`persistCsvEnvironmentRows`) used by `EnvironmentCsvImportLauncher`. |
| Allows `source: "csv"`? | **Yes** — `CSV_SENSOR_SOURCE = "csv"` hard-set on every row; trigger `public.validate_sensor_reading` permits `'csv'`. |
| Requires `tent_id`? | **Yes** — schema (`sensor_readings.Insert.tent_id` is required); launcher gates the CTA on `growId && tentId`. |
| Supports `plant_id` when mapped? | `sensor_readings` has no `plant_id` column. Plant scope is preserved in `raw_payload.plant_id`. |
| Preserves `captured_at`? | **Yes** — each insert carries `r.captured_at` from the parsed row. |
| Preserves `confidence`? | **No `confidence` column** on `sensor_readings`. The schema uses `quality` (`ok|degraded|stale|invalid`). Current CSV path lets DB default (`'ok'`) stand; rows surface as "CSV" via `source`, never as Live. |
| `raw_payload` safe? | **Yes** — structured object with `source_tag`, scope ids, raw temperature + unit, raw row, optional `vpd_source`. No secrets, no `user_id`, no tokens. |
| RLS scopes to grower? | **Yes** — `sensor_readings` policies are owner-only (`user_id = auth.uid()`); trigger `set_user_id_from_auth` backstops; launcher reads tent from `useAuth()` user only. |
| Dedupe/idempotency? | **None** in the CSV path. Pi bridge has its own `pi_ingest_idempotency_keys`. CSV preview surfaces accepted/blocked counts only; duplicates re-inserted on re-upload. Documented as a follow-up gap. |
| Preview identifies duplicates? | **No.** Preview shows coverage, normalization warnings, unit confirmation, and accepted-row counts. |

## Shipped surfaces

- **Entry:** `src/pages/Sensors.tsx` line 396 — `<EnvironmentCsvImportLauncher growId tentId plantId />`.
- **Launcher:** `src/components/EnvironmentCsvImportLauncher.tsx` — guards on auth + grow + tent; opens modal.
- **Modal:** `src/components/EnvironmentCsvImportModal.tsx` — parse → unit confirm → coverage preview → **explicit `Confirm` CTA** → `inserting` → `done`. Cancel never inserts.
- **View model:** `src/lib/environmentCsvImportViewModel.ts` — pure phase reducer.
- **Persistence:** `src/lib/environmentCsvImportPersistence.ts` — confirm-only insert adapter; forces `source = "csv"`; per-row `raw_payload.source_tag = "csv"`; no updates/deletes; no alerts/action_queue/device tables.
- **Insert client:** `EnvironmentCsvImportLauncher.makeInsertClient` — single `supabase.from("sensor_readings").insert(rows)` call. After success, invalidates `sensor_readings` + `csv-timeline-context` caches and dispatches `verdant:csv-imported`.

## Safety properties verified by existing tests

- Preview render performs zero writes (`csv-import-review-gate.test.tsx`, `csv-import-review-ui.test.tsx` assert `data-writes-enabled="false"`).
- Confirm CTA required before insert (`environment-csv-import-ui.test.tsx`).
- Cancel/close never inserts (modal contract test).
- Source-safety static scan: `EnvironmentCsvImportModal.tsx` never emits "Live" copy for CSV.
- Launcher static safety scan: no AI calls, no alert/action_queue writes, no device-control imports (`environment-csv-import-mounting.test.tsx`, `sensors-csv-import-regression.test.tsx`).
- Insert row-shape parity with `public.sensor_readings.Insert` (`csv-history-insert-row-shape.test.ts`).
- `sensor-safety-check.mjs` clean.

## Out-of-scope / follow-ups (NOT this slice)

- CSV-side dedupe (e.g. a generated idempotency key per `(tent_id, metric, captured_at)`) would require either a schema unique index or an RPC analogous to `pi_ingest_commit_batch`. Either is a schema/migration change and outside Slice D's scope.
- Per-row `quality` mapping for stale/invalid CSV rows currently relies on the trigger default `'ok'`. A future slice could pass `quality: "degraded"` for rows that the preview already flags (e.g. suspicious unit conversions).
- `confidence` is not a `sensor_readings` column today. If a confidence surface is desired for CSV rows, that is a schema slice — not Slice D.

## Files changed by this audit

- `docs/grower-csv-sensor-import-slice-d-audit.md` (this file)

No runtime files, schema, RLS, edge functions, or hooks touched.

## Risk / rollback

Nothing to roll back. Doc-only change.
