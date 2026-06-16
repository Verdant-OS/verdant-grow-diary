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

### Provider usage measurement adapter (attachment boundary)

- Adapter: `src/lib/cost/aiDoctorProviderUsageMeasurementAdapter.ts`
  - `attachProviderReportedUsageToAiDoctorPromptMeasurement(measurement, providerUsage)` → `AiDoctorPromptMeasurement`
  - Calls `normalizeProviderReportedTokenUsage` internally.
  - If the provider usage normalizes successfully, returns a new measurement
    with `providerReportedTokens` attached.
  - If the usage is malformed, partial, unsafe, or rejected, returns a new
    measurement with `providerReportedTokens: null`.
  - Never mutates the input measurement.
  - Never alters existing byte counts, estimated tokens, or other fields.
  - Never preserves raw provider fields (raw responses, headers, secrets).
  - Pure logic only; not wired into live AI Doctor calls yet.
- Future wiring should inject provider response usage explicitly after a model
  call and before optional measurement capture/export:
  ```ts
  const normalizedMeasurement =
    attachProviderReportedUsageToAiDoctorPromptMeasurement(
      promptMeasurement,
      response.usage,
    );
  ```

### Provider response usage extractor (extraction boundary)

- Helper: `src/lib/cost/aiDoctorProviderResponseUsageExtractor.ts`
  - `extractProviderReportedUsageCandidate(providerResponse: unknown)` → `unknown | null`
  - Supports common OpenAI-compatible shapes:
    - `{ usage: { prompt_tokens, completion_tokens, total_tokens } }`
    - `{ usage: { promptTokens, completionTokens, totalTokens } }`
    - `{ response: { usage: ... } }`
    - `{ data: { usage: ... } }`
  - Returns only the candidate usage object (shallow copy); never returns the
    raw response, ids, model names, choices, headers, or metadata.
  - Does **not** normalize — that is `normalizeProviderReportedTokenUsage`'s job.
  - Does **not** attach to a measurement — that is the adapter's job.
  - Returns `null` for missing, malformed, array, primitive, or ambiguous shapes.
  - Pure, deterministic, non-mutating.

### Provider response measurement composer (composition boundary)

- Helper: `src/lib/cost/aiDoctorProviderResponseMeasurementComposer.ts`
  - `attachProviderResponseUsageToAiDoctorPromptMeasurement(measurement, providerResponse)` → `AiDoctorPromptMeasurement`
  - Internally calls `extractProviderReportedUsageCandidate(providerResponse)`,
    then `attachProviderReportedUsageToAiDoctorPromptMeasurement(measurement, candidate)`.
  - Returns a new measurement with `providerReportedTokens` set (when valid)
    or `null` (when extraction or normalization rejects the input).
  - Preserves every other measurement field (`summaryByteSize`,
    `estimatedPromptTokens`, `rawHistoryFallback`, `promptName`, `status`,
    `recordedAt`, etc.) exactly.
  - Never mutates the input measurement.
  - Never preserves raw provider fields (`id`, `model`, `choices`, `headers`,
    `metadata`, `authorization`, `message`, `content`, request ids).
  - Pure logic only. No persistence, no capture wiring, no budgets, no
    thresholds, no back-pressure.

#### Accepted provider response examples

Top-level snake_case usage:

```js
// raw provider response
{ id: "chatcmpl_1", model: "gpt-4o-mini",
  usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } }

// extractProviderReportedUsageCandidate(...) →
{ prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }

// composer/adapter providerReportedTokens →
{ promptTokens: 100, completionTokens: 50, totalTokens: 150 }
```

Top-level camelCase usage:

```js
// raw
{ usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } }

// candidate → { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
// providerReportedTokens → { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
```

Nested `response.usage`:

```js
// raw
{ response: { usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } } }

// candidate → { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }
// providerReportedTokens → { promptTokens: 1, completionTokens: 2, totalTokens: 3 }
```

Nested `data.usage`:

```js
// raw
{ data: { usage: { prompt_tokens: 7, completion_tokens: 11, total_tokens: 18 } } }

// candidate → { prompt_tokens: 7, completion_tokens: 11, total_tokens: 18 }
// providerReportedTokens → { promptTokens: 7, completionTokens: 11, totalTokens: 18 }
```

Invalid / missing usage:

```js
// raw
{ id: "chatcmpl_x", choices: [] }   // or null, [], "string", { usage: { prompt_tokens: -1 } }

// candidate → null
// providerReportedTokens → null
```

In every case the raw response's `id`, `model`, `choices`, `headers`,
`metadata`, `authorization`, and message content are **never** preserved on
the returned measurement.

### Future live provider call-site wiring — blocked

- The future attachment point is the AI Doctor provider response boundary,
  immediately after the model response is received in
  `supabase/functions/ai-doctor-review/index.ts`.
- Wiring the composer into the live provider call must be a separate,
  explicit PR. This slice intentionally does **not** modify the Edge Function
  runtime, the model call, the prompt content, or the AI Doctor output.
- The composer enables **no** persistence, capture-store wiring,
  budget enforcement, back-pressure, or cost-driven AI degradation.
- Raw provider responses must never be stored. Only the normalized
  `ProviderReportedTokenUsage` shape (`promptTokens`, `completionTokens`,
  `totalTokens`) may be attached to a measurement; nothing else from the
  response is allowed downstream.

Future wiring would compose:

```ts
const next = attachProviderResponseUsageToAiDoctorPromptMeasurement(
  promptMeasurement,
  providerResponse,
);
```

## Future AI Doctor provider response boundary contract

This contract describes the exact attachment boundary a future AI Doctor
wiring PR must use. Live wiring is still blocked — the Edge Function
(`supabase/functions/ai-doctor-review/index.ts`) is not modified in this
slice.

**When the boundary runs**

- Only **after** the AI Doctor provider response is received from the model
  gateway. Never before the call. Never inside prompt assembly.

**Inputs**

- Input A: an existing `AiDoctorPromptMeasurement` built by
  `buildAiDoctorPromptMeasurement(...)`.
- Input B: the raw provider response, typed as `unknown`.

**Function**

```ts
import { attachProviderResponseUsageToAiDoctorPromptMeasurement } from "@/lib/cost";

const measured = attachProviderResponseUsageToAiDoctorPromptMeasurement(
  promptMeasurement,
  providerResponse,
);

// Only `measured.providerReportedTokens` is safe to pass onward.
// Do NOT store providerResponse. Do NOT pass providerResponse to any
// capture store, CSV export, persistence layer, or log line.
```

**Output**

- A **new** `AiDoctorPromptMeasurement`. The original is never mutated.
- Only `providerReportedTokens` may change vs. the input measurement; every
  other field (`promptName`, `summaryByteSize`, `estimatedPromptTokens`,
  `rawHistoryFallback`, `status`, `errorCode`, `recordedAt`, `domain`) is
  preserved exactly.

**Behavior guarantees**

- Provider usage is **optional**: missing or malformed usage clears
  `providerReportedTokens` to `null`. The function never throws.
- The raw provider response is **never** stored or returned.
- The raw provider response is **never** forwarded to persistence/capture
  stores, CSV exporters, logs, or alerts.
- No budget, threshold, alert, back-pressure, model-selection, or AI
  degradation behavior is triggered by this function.

**Adapter input/output cases**

| Input shape                                                          | Result                                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Valid top-level `usage` (snake or camel)                             | `providerReportedTokens` populated                                     |
| Valid `response.usage`                                               | `providerReportedTokens` populated                                     |
| Valid `data.usage`                                                   | `providerReportedTokens` populated                                     |
| `{ usage: null }`, `{ usage: [] }`, `{ usage: "x" }`                 | `providerReportedTokens: null`                                         |
| `{ usage: { prompt_tokens: 10 } }` (missing completion)              | `providerReportedTokens: null`                                         |
| `{ usage: { prompt_tokens: -1, completion_tokens: 5 } }`             | `providerReportedTokens: null`                                         |
| `{ usage: { input_tokens, output_tokens } }` (Anthropic-style keys)  | `providerReportedTokens: null` (not in supported key set)              |
| `{ result: { usage: ... } }`, `{ choices: [{ usage: ... }] }`        | `providerReportedTokens: null` (boundary does **not** search recursively) |
| Top-level `usage` AND nested `response.usage`                        | Top-level wins                                                         |
| Deeply nested usage objects                                          | `providerReportedTokens: null` (not searched)                          |

The extractor only inspects the documented shapes
(`usage`, `response.usage`, `data.usage`). It does **not** walk arbitrary
trees, does **not** look inside `choices[*]`, and does **not** accept
Anthropic-style or unrelated key names. This is intentional: the boundary
prefers a clean `null` over a guessed match.


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




## Runtime provider usage wiring

The `ai-doctor-review` Edge Function now calls
`attachProviderResponseUsageToAiDoctorPromptMeasurement` at the provider
response boundary (immediately after `await upstream.json()`), producing a
local `measurementWithProviderUsage` that lives only in the request scope.

Guarantees of this wiring (measurement-only):

- The raw provider response is **not stored** anywhere. Only the normalized
  `providerReportedTokens` derived from it is safe to pass onward.
- Provider usage is optional: missing, malformed, or unexpectedly-nested
  usage clears `providerReportedTokens` to `null`. AI Doctor output content
  is unaffected.
- No persistence, capture store, CSV export, alert, Action Queue write,
  budget enforcement, back-pressure, threshold, or model degradation
  behavior is introduced by this wiring.
- The original prompt measurement is never mutated; a new measurement
  object is returned.
- Future persistence of `providerReportedTokens` must be a separate,
  explicitly-requested PR (it would require a new metrics table).

### Import example

```ts
import {
  attachProviderResponseUsageToAiDoctorPromptMeasurement,
} from "@/lib/cost";

const measurementWithProviderUsage =
  attachProviderResponseUsageToAiDoctorPromptMeasurement(
    promptMeasurement,
    providerResponse,
  );

// Safe to pass onward:
const providerReportedTokens =
  measurementWithProviderUsage.providerReportedTokens;

// Do not store providerResponse.
// Do not log providerResponse.
// Do not pass providerResponse to capture/persistence.
```

### Safety note

- Only `providerReportedTokens` (a `{ promptTokens, completionTokens,
  totalTokens }` numeric triple) is safe to pass onward.
- The raw provider response is **not** safe to persist or log.
- This wiring does **not** create cost enforcement.
- This wiring does **not** change AI Doctor prompt text, model selection,
  or returned diagnosis content.
