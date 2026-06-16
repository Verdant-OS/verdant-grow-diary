# Verdant Cost-Domain Measurement Model

This module separates **DB refresh cost** from **LLM prompt/token cost** so
future back-pressure work can target the right surface. It is measurement-only:
no throttling, no automation, no device control, no schema changes.

## Why three domains?

| Domain        | What it bills          | Failure mode if conflated                               |
| ------------- | ---------------------- | ------------------------------------------------------- |
| `db_refresh`  | Postgres CPU / IO      | Token budgets blamed for slow refreshes (wrong knob).   |
| `llm_prompt`  | Provider tokens (USD)  | DB tuning blamed for prompt-token blow-ups (wrong knob).|
| `ingest_rate` | Inbound writes / pressure | Burst alarms hidden behind aggregated refresh stats. |

Cross-contamination is rejected at type-construction time via
`detectCrossDomainViolations` and the `asWindowRefreshMeasurement` /
`asAiDoctorPromptMeasurement` wrappers.

## What measurements include

### `WindowRefreshMeasurement` (db_refresh)
`refreshName, durationMs, queueWaitMs, deltaRowCount, rowsRead?, rowsWritten?,
status, errorCode?, recordedAt`. **No** token, summary-size, or provider fields.

### `AiDoctorPromptMeasurement` (llm_prompt)
`promptName, summaryByteSize, estimatedPromptTokens, providerReportedTokens,
rawHistoryFallback, status, errorCode?, recordedAt`. **No** duration, queue,
or row-count fields. Raw-history fallback is the explicit *token-risk event*;
stale/missing summary state lives on `rawHistoryFallback` and is **never**
collapsed into a token field.

### `IngestRateMeasurement` (ingest_rate)
`gardenId, tentId, source, observedAt, readingsPer{1m,5m,1h,24h}`. Computed
by the pure helper `computeObservedCadence` from a list of timestamped
readings.

## Thresholds

`costThresholds.ts` carries only `TBD_MEASURED` and `TBD_LOAD_TEST` markers.
Do **not** invent numeric limits. Replace a marker only with evidence:

- `TBD_MEASURED` → backed by recorded production measurements.
- `TBD_LOAD_TEST` → backed by a reproducible load-test report.

## Audit (current repo state)

| Path / capability                | Exists? | Files                                                                 | Current cost domain (today) | Missing measurements                                     | Risk if left as-is                                                           |
| -------------------------------- | ------- | --------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Materialized views               | No      | —                                                                     | n/a                         | n/a                                                      | None today; revisit when introduced.                                         |
| Window summary refresh jobs      | No (UI-only refresh) | `src/lib/quickLogV2RefreshRules.ts`, `src/lib/dailyCheckRefreshRules.ts` | client refresh, untracked  | duration, queue wait, delta count                        | DB cost invisible; cannot tune cadence without measurements.                 |
| AI Doctor context compiler       | Yes     | `src/lib/aiDoctorContextCompiler.ts`, `src/lib/aiDoctorContextRules.ts`, `src/lib/aiDoctorPromptAssembly.ts` | llm_prompt (uninstrumented) | summary byte size, estimated tokens, fallback state      | Token cost unobservable; raw-history fallback silent.                        |
| Raw-history fallback             | Yes (CSV-history path) | `src/lib/aiDoctorCsvHistoryContextRules.ts`, `src/lib/aiDoctorImportedHistoryPromptRules.ts` | llm_prompt (uninstrumented) | fallback state classification                            | Token spikes when summaries stale go undetected.                             |
| Token-usage logging              | No      | —                                                                     | llm_prompt                  | provider-reported tokens, estimated tokens               | $ cost of AI Doctor / Coach not attributable.                                |
| Sensor ingest cadence            | Yes (writes only) | `src/lib/sensor/*`, `supabase/functions/*` (ingest)                  | ingest_rate (uninstrumented) | readings per 1m/5m/1h/24h by garden/tent/source          | Burst pressure invisible; can't size queue.                                  |
| Refresh queue                    | No      | —                                                                     | db_refresh                  | queue wait                                               | When added, must record `queueWaitMs`.                                       |
| Existing metrics tables          | No safe metrics sink found | `sensor_ingest_audit_log` exists but is ingest-only | n/a                       | n/a                                                      | No table reused; no schema change made.                                      |

## What remains blocked until real measurements exist

1. Any numeric threshold in `costThresholds.ts`.
2. Any back-pressure controller / throttle.
3. Any cost-driven AI Doctor degradation behavior.
4. Any cadence-driven ingest rejection.
5. Any persistence target for these measurements (no metrics table exists; one
   would require an explicit, separately-requested schema change).
