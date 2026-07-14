# AI Doctor Output Evaluation — Audit Findings (v1)

> Grounding document for the deterministic AI Doctor **output evaluator**
> (`src/lib/aiDoctorOutputEvaluation.ts`) and its golden cases. Records the
> repository types the evaluator extends so no invented enums or duplicate
> engines are introduced. Written before Commit 1.

## 1. Executive summary

The repository already has a mature AI Doctor **readiness gate** and a
**Phase 1 diagnosis engine**, plus engine-facing golden cases. It does **not**
have a standalone, reusable _semantic output evaluator_ that takes a finished
result and returns `{ status, findings[] }` with stable machine-readable codes.
The safety logic that would belong in such an evaluator currently lives inside
test-file matchers (`expectNoDeviceCommands`, `UNIVERSAL_FORBIDDEN_PHRASES`, …)
and inside the engine's own `applyAiDoctorSafetyRules` (which _strips_ unsafe
output rather than _reporting_ on it).

**Verdict: partial overlap → extend.** This build is additive. It reuses the
real result/context/readiness types and the existing safety vocabulary, and
introduces one new pure evaluator + adversarial golden cases that can test
_bad_ results the safe engine never emits.

## 2. Repository identity

- Root: `verdant-grow-diary` (worktree `ai-doctor-safety-eval-895fbd`)
- Branch: `claude/ai-doctor-safety-eval-895fbd`
- Stack: Vite + React + TS (non-strict), Vitest, Supabase; Bun scripts.
- Typecheck: `tsc -p tsconfig.app.json --noEmit` (spec also allows `bunx tsgo`).

## 3. Canonical types the evaluator extends (do not redefine)

### 3.1 Result under evaluation — `Phase1DiagnosisResult`

`src/lib/aiDoctorEngine.ts`

```ts
export type Phase1RiskLevel = "low" | "medium" | "high";

export interface Phase1ActionQueueSuggestion {
  action_type: "advisory"; // always advisory — never executable
  status: "pending_approval"; // always approval-required
  reason: string;
  risk_level: Phase1RiskLevel;
}

export interface Phase1DiagnosisResult {
  summary: string;
  likely_issue: string; // MAY be empty (weak context ⇒ no certain issue)
  confidence: number; // 0..1 calibrated
  evidence: readonly string[];
  missing_information: readonly string[];
  possible_causes: readonly string[];
  immediate_action: string;
  what_not_to_do: readonly string[];
  twenty_four_hour_follow_up: string;
  three_day_recovery_plan: string;
  risk_level: Phase1RiskLevel;
  action_queue_suggestion: Phase1ActionQueueSuggestion | null;
}
```

Field-mapping to the spec's 13 conceptual fields:

| Spec field              | Repo field (`Phase1DiagnosisResult`)                        |
| ----------------------- | ----------------------------------------------------------- |
| Summary                 | `summary`                                                   |
| Likely issue            | `likely_issue` (empty allowed)                              |
| Confidence              | `confidence` (numeric 0..1)                                 |
| Evidence                | `evidence[]`                                                |
| Missing information     | `missing_information[]`                                     |
| Possible causes         | `possible_causes[]`                                         |
| Immediate action        | `immediate_action`                                          |
| What not to do          | `what_not_to_do[]`                                          |
| 24-hour follow-up       | `twenty_four_hour_follow_up`                                |
| 3-day recovery plan     | `three_day_recovery_plan`                                   |
| Risk level              | `risk_level` (`low\|medium\|high`)                          |
| Action Queue suggestion | `action_queue_suggestion` (`advisory` / `pending_approval`) |

> The repo actually carries **four** result shapes, which is exactly why the
> scope lock pins one target. All but Phase 1 are **out of scope for v1** (no
> thin adapter exists):
>
> - `AiDoctorReviewResult` (`aiDoctorReviewResultContract.ts`) — the only one
>   with a runtime validator (`validateAiDoctorReviewResult`); **enum**
>   confidence, risk vocab `low|watch|elevated|high`, `what_not_to_do` is a
>   _string_, suggestion `{title, rationale}`. Useful as a reference for
>   banned-word / device-control / sensitive-key patterns, but a different type.
> - `Diagnosis` (`aiDoctorDiagnosisRules.ts`) — camelCase, numeric confidence,
>   `validateAndSanitizeDiagnosis` + `CAUTIOUS_FALLBACK`, `MAX_SUGGESTED_ACTIONS=2`.
> - `AiDoctorResult` (`aiDoctorSafetyRules.ts`) — numeric confidence + `confidence_band`.

### 3.2 Compiled context — `Phase1PlantContextPayload` (= `PlantContextPayload`)

`src/lib/aiDoctorContextCompiler.ts` (re-exported from `aiDoctorEngine.ts:52`)

Key fields the evaluator reads for evidence tracing: `sensor_groups[].source`,
`recentSensorReadings[].source_tag`, `averages_7d`, `source_tags[]`,
`recent_grow_events[]`, `hasLiveSensorReadings`, `notable_deviations[]`.

Provenance union (closed, 6 values):

```ts
export type SensorSourceTag = "live" | "manual" | "csv" | "demo" | "stale" | "invalid";
```

`classifySource()` defaults unrecognized runtime sources to `"live"` at compile
time; the **evaluator** must therefore treat any tag it cannot positively map to
`live`/`manual` (or that is not one of the six) **conservatively** — it cannot
support a healthy conclusion. `TRUSTWORTHY = { live, manual }` (`aiDoctorSafetyRules.ts`).

### 3.3 Final gate decision (the stop-condition answer) — `AiDoctorContextResult.readiness`

`src/lib/aiDoctorContextRules.ts`

```ts
// line 20 — THE canonical readiness enum (the real strong|partial|insufficient)
export type AiDoctorContextReadiness = "strong" | "partial" | "insufficient";

export interface AiDoctorContextResult {
  readiness: AiDoctorContextReadiness;
  missing: string[]; // UI-safe short codes only, no raw payloads
  evidence: string[]; // UI-safe short codes
  counts: AiDoctorContextCounts;
  latest: AiDoctorContextLatest;
  safeNextStep: string;
  diagnosisClaimed: false;
}
```

- Computed by `evaluateAiDoctorContext(input): AiDoctorContextResult`.
- Consumed by `buildAiDoctorSafeReviewStart(result)` →
  `{ allowStart, variant: "blocked" | "partial" | "strong" }`
  (`insufficient` ⇒ `allowStart:false`/`blocked`; `strong` ⇒ `strong`; else `partial`).

**This is the decision that permits a diagnosis. Confidence ceilings attach
here.** The file itself notes (line 17): _"this is the user-facing readiness
summary, **not the AI confidence ceiling**"_ — the evaluator supplies the
ceiling policy on top of it.

**Not the gate (the "convenient labels" trap):**

- `ContextStrength` (`aiDoctorSafetyRules.ts`) — a bag of signal booleans/counts.
- `AiDoctorReadinessState` = `ready|needs_more_context|sensor_missing|telemetry_limited|demo_only` — panel presenter state.
- `AiDoctorReadinessConfidenceClass` = `ready|limited|not_trustworthy` — panel presenter class.
- `AiDoctorReadinessResult` (`plantDetailAiDoctorReadiness.ts`, `level: ready|partial|empty`) — a _different_ card; its name is already taken, so the evaluator does **not** reuse that name for its readiness input.

### 3.4 Confidence — reuse, do not rebuild

`src/lib/aiDoctorConfidenceAdapter.ts`

```ts
export type AiDoctorConfidenceLevel = "very_low" | "low" | "medium" | "high"; // 25/50/75 cutoffs
export interface AiDoctorConfidenceResult {
  score;
  level;
  explanation;
  positive_factors;
  limiting_factors;
  source_quality;
  safety_flags;
}
export function calculateAiDoctorConfidence(input): AiDoctorConfidenceResult;
```

`bandForConfidence(c)` (`aiDoctorSafetyRules.ts`): `≥0.7 high`, `≥0.4 medium`, else `low`.
Conservative fallback for the edge path is `CONSERVATIVE_FALLBACK` (`aiDoctorEngine.ts`).

## 4. Existing safety vocabulary the evaluator reuses (no re-invention)

| Symbol                          | File                                      | Use                                     |
| ------------------------------- | ----------------------------------------- | --------------------------------------- |
| `DEVICE_COMMAND_PATTERNS`       | `aiDoctorSafetyRules.ts`                  | device-control detection                |
| `NEVER_DO_BASELINE`             | `aiDoctorSafetyRules.ts`                  | baseline "do not" set                   |
| `AUTOFLOWER_NEVER_DO`           | `aiDoctorSafetyRules.ts`                  | autoflower high-stress set              |
| `isLikelyAutoflower`            | `aiDoctorSafetyRules.ts`                  | autoflower detection                    |
| `assessContextStrength`         | `aiDoctorSafetyRules.ts`                  | signal counts (context, not gate)       |
| `UNIVERSAL_FORBIDDEN_PHRASES`   | `test/fixtures/ai-doctor-golden-cases.ts` | absolute-certainty + device phrases     |
| `advisory` / `pending_approval` | `aiDoctorEngine.ts`                       | approval-required Action Queue contract |

## 5. Evaluator input contract (extends, does not invent)

```ts
interface AiDoctorOutputEvaluationInput {
  result: Phase1DiagnosisResult; // aiDoctorEngine
  context: Phase1PlantContextPayload; // aiDoctorContextCompiler
  readiness: AiDoctorContextResult; // aiDoctorContextRules — the gate decision
  automatedConfidence?: AiDoctorConfidenceResult; // aiDoctorConfidenceAdapter (optional)
}
```

Confidence-calibration policy attaches to `readiness.readiness`:

| `readiness.readiness` | Evaluation treatment                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `insufficient`        | A diagnosis result must **fail** → `diagnosis_generated_while_insufficient`                                                                                               |
| `partial`             | Require populated `missing_information`, a visible limitation, qualified (non-absolute) issue language, bounded confidence (`confidence_exceeds_readiness` above ceiling) |
| `strong`              | Permit stronger claims but still reject absolute certainty, unsupported evidence, conflicts, aggressive/device advice                                                     |

## 6. Duplicate-work check

| Searched name                             | Result                                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `aiDoctorOutputEvaluation`                | none (new)                                                                                                       |
| `aiDoctorGoldenCases`                     | _engine_ golden cases exist (`test/fixtures/ai-doctor-golden-cases.ts`) — different purpose; keep, do not modify |
| `diagnosisQuality` / `semanticValidation` | none                                                                                                             |
| `recommendationConflict`                  | none (no contradiction detector exists)                                                                          |
| `unsupportedEvidence`                     | partial (`aiDoctorDiagnosisEvidenceAlignmentRules.ts` — reviewed in Commit 2)                                    |
| `confidenceCalibration`                   | none as a gate-attached ceiling (confidence adapter exists, reused)                                              |

## 7. File plan (create unless noted)

- `src/lib/aiDoctorOutputEvaluation.ts` — types, stable code union, `evaluateAiDoctorOutput()` (Commits 1–3).
- `src/test/ai-doctor-output-evaluation.test.ts` — evaluator unit tests (Commits 1–3).
- `src/test/fixtures/ai-doctor-output-evaluation/` + `src/test/ai-doctor-output-golden-cases.test.ts` — adversarial golden cases (Commit 4).
- report generator + `test:ai-doctor-output-evaluation` script + static-safety scanner + CI step + `docs/ai-doctor-output-evaluation.md` (Commit 5).

**Not modified:** `aiDoctorContextRules.ts`, `aiDoctorContextCompiler.ts`, readiness UI, readiness CI, `strong|partial|insufficient` terminology, the existing engine golden cases.
