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

## Measurement attachment points

### AI Doctor prompt (llm_prompt)

- Helper: `src/lib/cost/aiDoctorPromptMeasurement.ts`
  - `buildAiDoctorPromptMeasurement(input)` → `{ measurement, metadata }`
  - `classifyRawHistoryFallback(...)` and `computeUtf8ByteSize(...)` are exported pure helpers.
- Attach at the AI Doctor review call site, after
  `buildAiDoctorPromptMessages` (see `src/lib/aiDoctorPromptAssembly.ts`)
  produces `{ system, user, importedHistoryBlock, missingLiveReadingsBlock }`.
  Pass the assembled `user` text plus the two block flags:
  - `userPromptText`
  - `importedHistoryBlockPresent` ← `messages.importedHistoryBlock !== null`
  - `missingLiveReadingsBlockPresent` ← `messages.missingLiveReadingsBlock !== null`
  - Optional caller-known flags: `staleSummaryUsed`, `missingSummaryUsed`,
    `summaryErrored`, `rawHistoryEventCount`, `includedWindows`, `sourceTags`.
  - `providerReportedTokens` only if the model response already includes
    usage; otherwise leave undefined.
- The helper does NOT mutate prompt content, does NOT call any model, and
  does NOT persist. Callers decide what (if anything) to do with the bundle.
- `estimatedPromptTokens` is `null` unless a `PromptTokenEstimator` is
  injected via `setPromptTokenEstimator(...)` or passed through
  `buildAiDoctorPromptMeasurement({ tokenEstimator })`.

### Optional prompt-token estimator

- Adapter: `src/lib/cost/promptTokenEstimator.ts`
  - `setPromptTokenEstimator(estimator | null)` registers or clears a
    global estimator.
  - `estimatePromptTokensIfAvailable(text, estimator?)` returns `number`
    or `null`. Never falls back to a character-count heuristic.
  - No `MAX_`, `THRESHOLD_`, `TOKEN_LIMIT`, or budget constants.
- Verdant ships no estimator today; the adapter exists so a real tokenizer
  (e.g. `tiktoken`) can be wired in without scattered conditionals.

### Provider-reported token capture (call-site attachment point)

- The AI Doctor provider call lives in
  `supabase/functions/ai-doctor-review/index.ts`. The OpenAI-compatible
  gateway response includes a `usage` object with `prompt_tokens`,
  `completion_tokens`, `total_tokens` when the provider reports it.
- To capture provider tokens, normalize that usage with
  `normalizeProviderReportedTokenUsage(input)` from
  `src/lib/cost/aiDoctorProviderUsageRules.ts`. This helper accepts both
  snake_case and camelCase keys, validates every field, derives `totalTokens`
  only when `total` is missing, and returns `null` for unsafe or malformed
  usage — never clamps silently.
- Pass the normalized result to `buildAiDoctorPromptMeasurement({ providerReportedTokens })`.
  If normalization returns `null`, leave `providerReportedTokens` undefined — the
  measurement keeps `providerReportedTokens: null`. Never log prompt text,
  raw provider response, API keys, or headers.
- **Edge Function runtime is intentionally not changed in this slice.**
  The normalizer is pure logic ready for future wiring at the call site.

### Provider usage normalizer

- Helper: `src/lib/cost/aiDoctorProviderUsageRules.ts`
  - `normalizeProviderReportedTokenUsage(input: unknown)` → `ProviderReportedTokenUsage | null`
  - Supports `prompt_tokens` / `completion_tokens` / `total_tokens` (OpenAI)
    and `promptTokens` / `completionTokens` / `totalTokens` (common camelCase).
  - Rejects: `null`, `undefined`, non-objects, negative values, `NaN`,
    `Infinity`, string numbers, fractional counts, and partial objects missing
    prompt or completion.
  - Derives `totalTokens = promptTokens + completionTokens` only when total
    is absent; preserves provider-reported total when present.
  - Does not export, log, or embed raw prompts, responses, headers, or secrets.
  - Does not mutate input.

### Local-only measurement capture store

- Sink: `src/lib/cost/aiDoctorPromptMeasurementCaptureStore.ts`
  - In-memory ring buffer, default safety bound
    `CAPTURE_STORE_SAFETY_BOUND = 200` records. This is a **storage safety
    bound**, not a token budget or threshold.
  - Rejects bundles carrying `userPromptText`, `promptText`, `rawResponse`,
    `providerResponse`, `apiKey`, or `authorization`.
  - No localStorage, no Supabase, no fetch.

### CSV export

- Helper: `src/lib/cost/aiDoctorPromptMeasurementCsvExport.ts`
- Columns (deterministic order): `recordedAt, promptName, domain, status,
  errorCode, summaryByteSize, estimatedPromptTokens, providerPromptTokens,
  providerCompletionTokens, providerTotalTokens, rawHistoryFallback,
  rawHistoryEventCount, staleSummaryUsed, missingSummaryUsed, summaryErrored,
  includedWindows, sourceTags`.
- Arrays are pipe-delimited. CSV cells are quote-escaped. Empty values are
  rendered as blank.
- UI: `src/components/AiDoctorPromptMeasurementExportButton.tsx` — a
  presenter-only diagnostics button that downloads
  `verdant-ai-doctor-prompt-measurements.csv`. **Mounting is currently
  blocked**: there is no operator/diagnostics panel approved for grower
  builds. Mount only inside an explicit operator/diagnostics surface.

## What remains blocked until real measurements exist

1. Any numeric threshold in `costThresholds.ts`.
2. Any back-pressure controller / throttle.
3. Any cost-driven AI Doctor degradation behavior.
4. Any cadence-driven ingest rejection.
5. Any token-budget enforcement.
6. Any durable persistence target for these measurements (no metrics table
   exists; one would require an explicit, separately-requested schema
   change).
7. A real prompt-token estimator (today `estimatedPromptTokens` stays
   `null` unless an estimator is injected by the caller).
8. A grower-visible mount point for the CSV export button.


