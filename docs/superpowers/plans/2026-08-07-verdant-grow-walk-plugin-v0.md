# Verdant Grow Walk Plugin V0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Verdant Grow Walk as one authenticated, read-only plugin that ranks the grower’s owned tents and plants for physical inspection, returns a bounded evidence-led scouting brief, drafts one observation-first Quick Log template, and decides whether AI Doctor should be used without writing data or controlling devices.

**Architecture:** Extend Verdant’s existing OAuth-protected MCP server with two RLS-scoped tools: `list_grow_walk_targets` and `get_grow_walk_context`. Keep evidence classification, attention ranking, and grower-facing wording in small pure TypeScript modules that reuse canonical sensor truth, Daily Grow Check, stage, and Stabilize Mode contracts. Package one `run-grow-walk` skill under the repository plugin marketplace only after the read tools and their isolation harness are green; wire `.app.json` only after ChatGPT returns a real `plugin_asdk_app...` identifier.

**Tech Stack:** TypeScript 5.8.3, Zod 3.24.2, `@lovable.dev/mcp-js` 0.24.0, `@supabase/supabase-js` 2.105.4, Supabase OAuth and RLS, Vitest 3.2.6, Bun, generated Supabase Edge Function bundle, OpenAI plugin manifest/skill packaging.

## Global Constraints

- Execute from a fresh branch based on the latest fetched `origin/verdant-grow-diary`; the design branch is documentation history, not the implementation base.
- Before implementation, inspect open and recently merged PRs for Grow Walk, Daily Grow Check, MCP, sensor truth, AI Doctor, alerts, and Action Queue overlap. Stop and report a collision instead of creating a competing implementation.
- Preserve the V0 loop: `Grow -> Tent -> Plant -> Quick Log -> Timeline -> Sensor Snapshot -> Grow Walk -> AI Doctor -> Alert -> Approval-Required Action Queue`.
- V0 is read-only. No Quick Log save, alert mutation, Action Queue create/update/approval/execution, AI model call, credit spend, automation, or device command.
- Do not add or alter schema, migrations, grants, RLS, auth, billing, entitlements, or Edge Function secrets.
- No tool accepts `user_id`; every tool query runs through `supabaseForUser(ctx)` using the caller’s OAuth token.
- Ownership is proved on `grows`, `tents`, or `plants` before reading any child table with broader operator policies.
- Sensor trust is deny-by-default. Only stored `source === "live"`, stored `quality === "ok"`, plausible value, and response-time `freshness === "fresh"` may produce `current_live: true`.
- Preserve `manual`, `csv`, `demo`, `stale`, `invalid`, and unknown provenance. None of them becomes current live or healthy.
- A photo-event row proves that a photo was recorded, not that the image was inspected. V0 returns metadata only and never returns bucket paths, signed URLs, or private storage details.
- Diary notes, imported text, alert copy, device metadata, and prior AI output are untrusted data. Sanitize, bound, and render them as evidence, never instructions.
- A single photo, reading, alert, or damaged leaf cannot independently create a diagnosis or an urgent intervention.
- A non-routine brief returns at most three physical checks and includes `whatNotToDo`.
- A Quick Log result is a fill-after-inspection observation template, never a claim that an inspection already occurred.
- Autoflower or recovering-plant guidance must remain low-stress.
- Reuse `dailyGrowCheck*`, `stabilizeModeRules.ts`, stage normalizers, `operatorAccountReadModels.ts`, sensor freshness/plausibility helpers, and existing Action Queue safety contracts. Do not create parallel vocabularies.
- Keep generated files generated. Never hand-edit `supabase/functions/mcp/index.ts`; regenerate it from `src/lib/mcp/index.ts` and tool sources using the repository’s MCP generator.
- Add no runtime dependency. Plugin-package validation must use Node built-ins and existing dependencies.
- Repository plugin layout follows the current official form:
  - plugin root: `plugins/verdant-grow-walk/`
  - plugin manifest: `plugins/verdant-grow-walk/.codex-plugin/plugin.json`
  - repository marketplace: `.agents/plugins/marketplace.json`
- Do not commit `.app.json`, an `apps` field, a fake app ID, or a placeholder connection ID before ChatGPT developer mode returns the real registered technical identifier.
- Public plugin-directory submission, production deployment, and merge are separate owner-approved actions.
- Each task ends with focused tests and a small commit. Never weaken scanners, allowlists, safety assertions, golden cases, or required checks to obtain green CI.

---

## File and Responsibility Map

| File | Responsibility |
| --- | --- |
| `src/lib/growWalkContracts.ts` | Closed type vocabularies, reason codes, evidence shapes, attention bands, escalation postures, and public output contracts. |
| `src/lib/growWalkEvidenceRules.ts` | Pure, time-injected evidence classification: recency, stacked interventions, missing post-action observation, contradictions, lane confidence, and metadata-only photo truth. |
| `src/lib/growWalkAttentionRules.ts` | Pure priority derivation and stable target sorting. |
| `src/lib/growWalkContextViewModel.ts` | Pure grower-facing brief: changed evidence, trust summary, no more than three checks, restraints, Quick Log template, AI Doctor posture, and Action Queue posture. |
| `src/lib/growWalkTargetReadModels.ts` | Owner-scoped, batched reads used by `list_grow_walk_targets`. No presentation prose and no writes. |
| `src/lib/growWalkContextReadModels.ts` | Owner-scoped, bounded reads used by `get_grow_walk_context`; reuses existing sensor selector and returns explicit partial-lane receipts. |
| `src/lib/mcp/tools/list-grow-walk-targets.ts` | Zod tool boundary and structured response for owned target listing. |
| `src/lib/mcp/tools/get-grow-walk-context.ts` | Zod tool boundary and structured response for one owned tent or plant. |
| `src/lib/mcp/index.ts` | Registers the two tools and updates read-only server instructions. |
| `.lovable/mcp/manifest.json` | Generated MCP manifest; exact input allow-lists and annotations. |
| `supabase/functions/mcp/index.ts` | Generated Edge Function bundle; never manually edited. |
| `plugins/verdant-grow-walk/` | Plugin manifest, one skill, reference files, dependency declaration, and eval fixtures. |
| `.agents/plugins/marketplace.json` | Repository-scoped plugin discovery entry. |
| `scripts/validate-grow-walk-plugin.mjs` | No-dependency package validator for relative paths, required metadata, eval counts, forbidden placeholders, and absence of `.app.json` before registration. |
| `src/test/grow-walk-*.test.ts` | Pure-rule, read-model, tool, manifest, package, and safety-golden-case coverage. |
| `src/test/mcp-local-rls-integration.test.ts` | Two-user runtime proof that optional parameters never broaden access and tool execution never uses the service-role seeding client. |
| `package.json` | Focused `test:grow-walk` and `check:grow-walk-plugin` scripts only. |

## Public Type Contract

All implementation tasks use these exact names. Do not rename them in later tasks.

```ts
export const GROW_WALK_ATTENTION_BANDS = [
  "immediate_physical_verification",
  "watch_today",
  "routine_observation",
  "insufficient_evidence",
] as const;

export type GrowWalkAttentionBand = (typeof GROW_WALK_ATTENTION_BANDS)[number];
export type GrowWalkTargetType = "tent" | "plant";
export type GrowWalkEvidenceConfidence = "low" | "medium" | "high";

export type GrowWalkAiDoctorPosture =
  | "not_needed"
  | "wait_for_missing_evidence"
  | "recommended"
  | "cannot_assess_reliably";

export type GrowWalkActionQueuePosture =
  | "none"
  | "existing_item_review"
  | "draft_suggestion_only";
```

The closed reason-code sets are:

```ts
export const GROW_WALK_REASON_CODES = [
  "active_high_alert_needs_confirmation",
  "multiple_adverse_evidence_lanes",
  "stacked_major_changes_48h",
  "stale_or_invalid_sensor_during_problem",
  "missing_post_intervention_observation",
  "flower_humidity_alert_needs_inspection",
  "stressed_or_recovering_with_adverse_change",
  "contradictory_evidence",
  "worsening_observation",
] as const;

export const GROW_WALK_MISSING_EVIDENCE_CODES = [
  "no_recent_grower_log",
  "no_current_visual_evidence",
  "photo_predates_latest_major_change",
  "sensor_lane_unavailable",
  "sensor_lane_not_current_live",
  "plant_profile_incomplete",
  "no_post_intervention_observation",
] as const;

export const GROW_WALK_CONTRADICTION_CODES = [
  "sensor_sources_disagree",
  "sensor_and_observation_disagree",
  "scope_relationship_invalid",
  "future_or_malformed_timestamp",
] as const;
```

A target listing returns:

```ts
export interface GrowWalkTarget {
  targetType: GrowWalkTargetType;
  targetId: string;
  growId: string;
  tentId: string | null;
  displayName: string;
  strain: string | null;
  stage: string | null;
  status: string | null;
  plantCount: number | null;
  lastLogAt: string | null;
  lastPhotoEventAt: string | null;
  latestSensorCapturedAt: string | null;
  activeAlertCount: number;
  highestAlertSeverity: "low" | "medium" | "high" | null;
  recentMajorChangeCount48h: number;
  attentionBand: GrowWalkAttentionBand;
  reasonCodes: readonly GrowWalkReasonCode[];
  missingEvidenceCodes: readonly GrowWalkMissingEvidenceCode[];
  latestAdverseEvidenceAt: string | null;
}
```

A context tool returns:

```ts
export interface GrowWalkContext {
  scope: {
    growId: string;
    growName: string;
    tentId: string | null;
    tentName: string | null;
    plantId: string | null;
    plantName: string | null;
  };
  profile: {
    stage: string | null;
    strain: string | null;
    medium: string | null;
    potSize: string | null;
    growType: string | null;
    plantStatus: string | null;
  };
  evidence: {
    recentEvents: readonly GrowWalkEventEvidence[];
    sensors: GrowWalkSensorEvidence;
    photos: readonly GrowWalkPhotoMetadata[];
    alerts: readonly GrowWalkAlertEvidence[];
    aiDoctor: GrowWalkAiDoctorEvidence | null;
    actionQueue: GrowWalkActionQueueEvidence;
  };
  derived: GrowWalkEvidenceDerivation & {
    attentionBand: GrowWalkAttentionBand;
  };
  receipt: {
    generatedAt: string;
    lookbackHours: number;
    contextVersion: "grow-walk-v0.1";
    partialLanes: readonly GrowWalkEvidenceLane[];
    truncatedLanes: readonly GrowWalkEvidenceLane[];
  };
}
```

---

### Task 0: Establish an Isolated, Current Implementation Base

**Files:**

- Read: `AGENTS.md`
- Read: `docs/agents/CURRENT_STATE.md`
- Read: `docs/superpowers/specs/2026-08-07-verdant-grow-walk-plugin-design.md`
- Read: `docs/specs/daily-walk-closed-learning-loop.md`
- Read: `src/lib/dailyGrowCheckRules.ts`
- Read: `src/lib/dailyGrowCheckGuidanceRules.ts`
- Read: `src/lib/stabilizeModeRules.ts`
- Read: `src/lib/operatorAccountReadModels.ts`
- Read: `.lovable/mcp/manifest.json`
- No product files changed.

**Interfaces:**

- Consumes: approved design commit `1300e1a2e9d12eb2cd4e683244b144dc3a75c36e`.
- Produces: an isolated implementation branch rooted at the current deploy branch and a recorded collision/baseline receipt.

- [ ] **Step 1: Invoke the required isolation workflow**

Use `superpowers:using-git-worktrees`. Detect existing isolation before creating a new worktree. When a new worktree is needed, create:

```powershell
git fetch origin --prune
git worktree add .worktrees/verdant-grow-walk-v0 -b codex/verdant-grow-walk-v0 origin/verdant-grow-diary
Set-Location .worktrees/verdant-grow-walk-v0
```

Expected: the worktree branch starts at the current fetched deploy-trunk head, not the older design base.

- [ ] **Step 2: Check for implementation collisions**

Run:

```powershell
gh pr list --repo Verdant-OS/verdant-grow-diary --state all --limit 100 `
  --search '"grow walk" OR "daily walk" OR "MCP"'
git log --oneline --decorate -40 origin/verdant-grow-diary
git diff --name-only origin/verdant-grow-diary...codex/verdant-grow-walk-design-20260807
```

Expected:

- the only Grow Walk branch change is the approved specification and this plan;
- no open PR implements either approved MCP tool or the plugin package;
- Daily Grow Check work is treated as a dependency, not duplicated.

If an overlapping implementation exists, stop and report its PR, branch, head SHA, and overlapping files.

- [ ] **Step 3: Install from the lockfile**

Run:

```powershell
bun install --frozen-lockfile
```

Expected: zero lockfile changes.

- [ ] **Step 4: Run the pre-change MCP and daily-check baseline**

```powershell
bunx vitest run `
  src/test/operator-account-read-models.test.ts `
  src/test/operator-account-read-models-static-safety.test.ts `
  src/test/mcp-tools-source-safety.test.ts `
  src/test/mcp-rls-harness-ops.test.ts `
  src/test/daily-grow-check.test.ts `
  src/test/daily-grow-check-guidance.test.ts `
  src/test/stabilize-mode-rules.test.ts `
  --reporter=dot
bun run verify-edge-shared-in-sync
bun run typecheck
```

Expected: all selected tests pass, generated MCP/edge files are synchronized, and typecheck reports zero diagnostics. Record exact test counts and pre-existing failures before continuing.

---

### Task 1: Add the Closed Grow Walk Contract

**Files:**

- Create: `src/lib/growWalkContracts.ts`
- Create: `src/test/grow-walk-contracts.test.ts`

**Interfaces:**

- Consumes: `McpSensorReading` from `src/lib/operatorAccountReadModels.ts`.
- Produces: every type and constant named in **Public Type Contract** plus the interfaces below.

```ts
export interface GrowWalkEventEvidence {
  id: string;
  eventType: string;
  occurredAt: string;
  source: string;
  noteExcerpt: string | null;
  isMajorChange: boolean;
  response: "better" | "same" | "worse" | null;
}

export interface GrowWalkPhotoMetadata {
  id: string;
  capturedAt: string;
  source: string;
  inspectedInThisRun: false;
}

export interface GrowWalkAlertEvidence {
  id: string;
  title: string;
  reasonExcerpt: string;
  severity: "low" | "medium" | "high";
  status: string;
  metric: string | null;
  source: string;
  lastSeenAt: string;
}

export interface GrowWalkAiDoctorEvidence {
  sessionId: string;
  completedAt: string;
  confidenceBand: "low" | "medium" | "high" | "unknown";
  riskLevel: "low" | "medium" | "high" | "unknown";
  missingInformationCount: number;
  summaryExcerpt: string | null;
}

export interface GrowWalkActionQueueEvidence {
  openCount: number;
  items: readonly {
    id: string;
    status: string;
    riskLevel: string;
    reasonExcerpt: string;
    createdAt: string;
  }[];
}

export type GrowWalkEvidenceLane =
  | "profile"
  | "events"
  | "sensors"
  | "photos"
  | "alerts"
  | "ai_doctor"
  | "action_queue";
```

- [ ] **Step 1: Write the failing contract tests**

Create tests that assert:

```ts
expect(GROW_WALK_ATTENTION_BANDS).toEqual([
  "immediate_physical_verification",
  "watch_today",
  "routine_observation",
  "insufficient_evidence",
]);

expect(new Set(GROW_WALK_REASON_CODES).size).toBe(GROW_WALK_REASON_CODES.length);
expect(new Set(GROW_WALK_MISSING_EVIDENCE_CODES).size).toBe(
  GROW_WALK_MISSING_EVIDENCE_CODES.length,
);
expect(new Set(GROW_WALK_CONTRADICTION_CODES).size).toBe(
  GROW_WALK_CONTRADICTION_CODES.length,
);
```

Also add a compile-time fixture using `satisfies GrowWalkContext` that proves:

- tent scope may have `plantId: null`;
- plant scope retains its tent;
- photo metadata can only state `inspectedInThisRun: false`;
- no contract exposes `user_id`, `raw_payload`, storage path, signed URL, token, command, or mutable action.

- [ ] **Step 2: Run the contract test and confirm RED**

```powershell
bunx vitest run src/test/grow-walk-contracts.test.ts --reporter=dot
```

Expected: FAIL because `growWalkContracts.ts` does not exist.

- [ ] **Step 3: Implement the exact closed vocabularies and interfaces**

Use readonly arrays with `as const`, derive unions from the arrays, and export a shared context version:

```ts
export const GROW_WALK_CONTEXT_VERSION = "grow-walk-v0.1" as const;

export type GrowWalkReasonCode = (typeof GROW_WALK_REASON_CODES)[number];
export type GrowWalkMissingEvidenceCode =
  (typeof GROW_WALK_MISSING_EVIDENCE_CODES)[number];
export type GrowWalkContradictionCode =
  (typeof GROW_WALK_CONTRADICTION_CODES)[number];
```

Do not add an `"unknown"` attention band or free-form reason code. Missing/invalid information belongs in the approved closed sets.

- [ ] **Step 4: Run the test and confirm GREEN**

```powershell
bunx vitest run src/test/grow-walk-contracts.test.ts --reporter=dot
```

- [ ] **Step 5: Commit the contract**

```powershell
git add src/lib/growWalkContracts.ts src/test/grow-walk-contracts.test.ts
git commit -m "feat: add grow walk contracts"
```

---

### Task 2: Derive Evidence Without Diagnosing

**Files:**

- Create: `src/lib/growWalkEvidenceRules.ts`
- Create: `src/test/grow-walk-evidence-rules.test.ts`

**Interfaces:**

- Consumes: evidence interfaces and reason-code unions from `growWalkContracts.ts`.
- Produces:

```ts
export interface GrowWalkEvidenceInput {
  now: Date | string | number;
  stage: string | null;
  plantStatus: string | null;
  events: readonly GrowWalkEventEvidence[];
  sensors: GrowWalkSensorEvidence;
  photos: readonly GrowWalkPhotoMetadata[];
  alerts: readonly GrowWalkAlertEvidence[];
  aiDoctor: GrowWalkAiDoctorEvidence | null;
  partialLanes: readonly GrowWalkEvidenceLane[];
}

export interface GrowWalkEvidenceDerivation {
  reasonCodes: readonly GrowWalkReasonCode[];
  missingEvidenceCodes: readonly GrowWalkMissingEvidenceCode[];
  contradictionCodes: readonly GrowWalkContradictionCode[];
  recentMajorChangeCount48h: number;
  latestMajorChangeAt: string | null;
  latestObservationAt: string | null;
  latestAdverseEvidenceAt: string | null;
  evidenceConfidence: GrowWalkEvidenceConfidence;
}

export function deriveGrowWalkEvidence(
  input: GrowWalkEvidenceInput,
): GrowWalkEvidenceDerivation;
```

`GrowWalkSensorEvidence` is:

```ts
export interface GrowWalkSensorEvidence {
  available: boolean;
  readings: Readonly<Record<string, McpSensorReading>>;
}
```

- [ ] **Step 1: Write failing evidence cases**

Use the fixed time `2026-08-07T12:00:00.000Z`. Cover:

1. Three major changes inside 48 hours emit `stacked_major_changes_48h`.
2. A major change followed by no later observation emits both missing-post-intervention codes.
3. A later `better`, `same`, or `worse` observation clears `no_post_intervention_observation`; `worse` emits `worsening_observation`.
4. A photo-event after the major change counts only as current visual metadata and never as an inspected finding.
5. A photo before the major change emits `photo_predates_latest_major_change`.
6. `available: false` emits `sensor_lane_unavailable`.
7. Available readings with no `current_live` reading emit `sensor_lane_not_current_live`.
8. Stale/invalid readings during an active alert or worsening observation emit `stale_or_invalid_sensor_during_problem`.
9. Two current readings of the same metric with incompatible provenance/value evidence emit `sensor_sources_disagree`; one stored snapshot does not.
10. A high active humidity alert in flower emits `flower_humidity_alert_needs_inspection`; raw RH alone does not invent a new threshold.
11. A single alert, single photo metadata row, or one reading never emits `multiple_adverse_evidence_lanes`.
12. Malformed/future times emit `future_or_malformed_timestamp` and are never treated as recent.
13. Reordering identical evidence returns deeply equal output.
14. Partial lanes lower confidence and are not treated as empty healthy lanes.

- [ ] **Step 2: Run the test and confirm RED**

```powershell
bunx vitest run src/test/grow-walk-evidence-rules.test.ts --reporter=dot
```

Expected: FAIL because `deriveGrowWalkEvidence` is missing.

- [ ] **Step 3: Implement deterministic timestamp and evidence helpers**

Implement:

```ts
const HOUR_MS = 60 * 60 * 1000;
const MAJOR_CHANGE_WINDOW_MS = 48 * HOUR_MS;
const RECENT_LOG_WINDOW_MS = 36 * HOUR_MS;

function toFiniteMs(value: Date | string | number | null | undefined): number | null {
  const ms =
    value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : typeof value === "string"
          ? Date.parse(value)
          : Number.NaN;
  return Number.isFinite(ms) ? ms : null;
}
```

Rules:

- compare `occurredAt`, not array order;
- a post-intervention observation must have `occurredAt > latestMajorChangeAt`;
- future time beyond the existing two-minute sensor tolerance is invalid;
- use `current_live` exactly as supplied by the canonical sensor selector;
- count independent adverse lanes (`events`, `sensors`, `alerts`, `photos`) rather than row count;
- sort and freeze emitted code arrays in the declaration order from `growWalkContracts.ts`;
- confidence is `low` when two or more required lanes are partial/missing or contradictions exist, `high` only when current live sensor context and a recent grower observation exist with no contradiction, otherwise `medium`;
- do not emit nutrient, pest, disease, irrigation, or equipment conclusions.

- [ ] **Step 4: Run evidence tests and existing sensor truth tests**

```powershell
bunx vitest run `
  src/test/grow-walk-evidence-rules.test.ts `
  src/test/operator-account-read-models.test.ts `
  src/test/sensor-snapshot-freshness-rules.test.ts `
  src/test/stabilize-mode-rules.test.ts `
  --reporter=dot
```

Expected: all pass without changing existing freshness thresholds or source vocabularies.

- [ ] **Step 5: Commit the evidence rules**

```powershell
git add src/lib/growWalkEvidenceRules.ts src/test/grow-walk-evidence-rules.test.ts
git commit -m "feat: derive grow walk evidence"
```

---

### Task 3: Rank Targets With Stable, Explainable Rules

**Files:**

- Create: `src/lib/growWalkAttentionRules.ts`
- Create: `src/test/grow-walk-attention-rules.test.ts`

**Interfaces:**

- Consumes: `GrowWalkEvidenceDerivation`, target metadata, and approved severity values.
- Produces:

```ts
export function deriveGrowWalkAttentionBand(
  input: Pick<
    GrowWalkEvidenceDerivation,
    "reasonCodes" | "missingEvidenceCodes" | "contradictionCodes"
  > & {
    activeAlertCount: number;
    highestAlertSeverity: "low" | "medium" | "high" | null;
  },
): GrowWalkAttentionBand;

export function sortGrowWalkTargets(
  targets: readonly GrowWalkTarget[],
): GrowWalkTarget[];
```

- [ ] **Step 1: Write the failing priority matrix**

Assert this exact policy:

```ts
const ATTENTION_RANK: Record<GrowWalkAttentionBand, number> = {
  immediate_physical_verification: 0,
  watch_today: 1,
  insufficient_evidence: 2,
  routine_observation: 3,
};
```

Cases:

- `immediate_physical_verification` requires a high active alert plus another adverse reason, or `multiple_adverse_evidence_lanes` plus `worsening_observation`.
- One high alert without corroboration is `watch_today`.
- Stacked changes, contradiction, missing post-change observation, worsening observation, or a flower humidity alert are `watch_today`.
- `insufficient_evidence` requires the combined absence of a recent log, current visual evidence, and usable sensor lane; one missing lane alone is not sufficient.
- No adverse/missing condition is `routine_observation`.
- Sorting uses attention rank, alert severity (`high`, `medium`, `low`, null), newest `latestAdverseEvidenceAt`, case-insensitive `displayName`, then `targetId`.
- Input arrays are not mutated.
- A target with more rows never outranks another solely because its history is larger.

- [ ] **Step 2: Run the test and confirm RED**

```powershell
bunx vitest run src/test/grow-walk-attention-rules.test.ts --reporter=dot
```

- [ ] **Step 3: Implement the minimal ranking module**

Use explicit rank maps:

```ts
const ALERT_RANK = { high: 0, medium: 1, low: 2, none: 3 } as const;

function newestFirst(value: string | null): number {
  const ms = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(ms) ? -ms : Number.POSITIVE_INFINITY;
}
```

Return `targets.slice().sort(...)`. Never sort the caller’s array in place.

- [ ] **Step 4: Run the focused tests**

```powershell
bunx vitest run `
  src/test/grow-walk-contracts.test.ts `
  src/test/grow-walk-evidence-rules.test.ts `
  src/test/grow-walk-attention-rules.test.ts `
  --reporter=dot
```

- [ ] **Step 5: Commit the attention rules**

```powershell
git add src/lib/growWalkAttentionRules.ts src/test/grow-walk-attention-rules.test.ts
git commit -m "feat: rank grow walk targets"
```

---

### Task 4: Build the Cautious Grower-Facing Brief

**Files:**

- Create: `src/lib/growWalkContextViewModel.ts`
- Create: `src/test/grow-walk-context-view-model.test.ts`
- Create: `src/test/grow-walk-safety-golden-cases.test.ts`

**Interfaces:**

- Consumes: `GrowWalkContext`, `evaluateStabilizeMode`, and existing Daily Grow Check observation language.
- Produces:

```ts
export interface GrowWalkBrief {
  scopeLabel: string;
  attentionBand: GrowWalkAttentionBand;
  whatChanged: readonly string[];
  evidenceTrustSummary: readonly string[];
  physicalChecks: readonly string[];
  missingInformation: readonly string[];
  safestNextObservation: string;
  whatNotToDo: readonly string[];
  aiDoctorPosture: GrowWalkAiDoctorPosture;
  quickLogTemplate: string | null;
  actionQueuePosture: GrowWalkActionQueuePosture;
  confidence: GrowWalkEvidenceConfidence;
}

export function buildGrowWalkBrief(context: GrowWalkContext): GrowWalkBrief;
```

- [ ] **Step 1: Write failing view-model tests**

Assert:

- `physicalChecks.length <= 3`;
- a routine result still suggests one normal observation but no alarm language;
- a non-routine result has at least one `whatNotToDo` item;
- stale/manual-only sensors produce “verify physically” wording and never equipment-change wording;
- photo metadata renders “photo recorded” or “current photo needed,” never “I see” or a visual diagnosis;
- an existing open Action Queue item yields `existing_item_review` and is not duplicated;
- no open item plus weak evidence yields `none`, not a fabricated draft;
- high-confidence, corroborated worsening evidence yields `recommended`;
- missing current photo after a major change yields `wait_for_missing_evidence`;
- contradictory/partial context yields `cannot_assess_reliably`;
- normal, complete context yields `not_needed`;
- the Quick Log string is explicitly future-facing:

```text
After the walk, log: response = better / same / worse; root-zone check = light / moderate / heavy / not checked; new growth = unchanged / changed / not checked; photo = added / not added.
```

- [ ] **Step 2: Add the twelve safety golden cases**

Pin these scenarios:

1. Recently watered droop does not become an underwatering diagnosis.
2. Leaf-tip burn alone does not trigger flush or nutrient overhaul.
3. A stressed autoflower never receives transplant or heavy-defoliation guidance.
4. High humidity in flower prompts flower-site and sensor-placement inspection, not setpoint changes.
5. Three recent interventions produce pause-and-observe guidance.
6. Old damaged leaves do not prove current decline.
7. Photo metadata without an attached/inspected image produces no image finding.
8. Manual-only sensor evidence never becomes live.
9. Contradictory sources lower confidence.
10. Missing context returns a missing-evidence posture, not certainty.
11. Existing Action Queue suggestion is surfaced for review and never recreated.
12. Recursive scan finds none of: `auto-approve`, `execute device`, `change the controller`, `must flush`, `definitely deficient`, `guaranteed mold`.

- [ ] **Step 3: Run the new tests and confirm RED**

```powershell
bunx vitest run `
  src/test/grow-walk-context-view-model.test.ts `
  src/test/grow-walk-safety-golden-cases.test.ts `
  --reporter=dot
```

- [ ] **Step 4: Implement the brief using existing restraint logic**

Call `evaluateStabilizeMode` with mapped inputs:

```ts
const stabilize = evaluateStabilizeMode({
  now: context.receipt.generatedAt,
  plant_stage: context.profile.stage,
  plant_status: context.profile.plantStatus,
  last_log_at: context.derived.latestObservationAt,
  recent_action_count_48h: context.derived.recentMajorChangeCount48h,
  recent_major_change_count_48h: context.derived.recentMajorChangeCount48h,
  active_alert_count: context.evidence.alerts.filter((a) => a.status !== "resolved").length,
  sensor_source_summary: summarizeSensorSources(context.evidence.sensors),
  has_stale_or_invalid_sensor_data: hasStaleOrInvalid(context.evidence.sensors),
  has_demo_or_manual_only_sensor_data: hasOnlyNonLive(context.evidence.sensors),
  ai_doctor_confidence_level: context.evidence.aiDoctor?.confidenceBand ?? "unknown",
  ai_doctor_missing_info_count:
    context.evidence.aiDoctor?.missingInformationCount ?? 0,
});
```

Rules:

- use Stabilize Mode’s “what not to do” phrases instead of copying a second safety table;
- map reason codes to physical checks through one closed record;
- take the first three unique checks in reason-code declaration order;
- do not generate medical, legal, pesticide-rate, or device-control instructions;
- keep output deterministic—no model call or random text;
- return `quickLogTemplate: null` only when scope is invalid or the brief cannot honestly identify a plant/tent observation target.

- [ ] **Step 5: Run Grow Walk and adjacent safety suites**

```powershell
bunx vitest run `
  src/test/grow-walk-context-view-model.test.ts `
  src/test/grow-walk-safety-golden-cases.test.ts `
  src/test/stabilize-mode-rules.test.ts `
  src/test/daily-grow-check-guidance.test.ts `
  src/test/ai-doctor-golden-cases.test.ts `
  --reporter=dot
node scripts/sensor-safety-check.mjs
```

- [ ] **Step 6: Commit the view model**

```powershell
git add `
  src/lib/growWalkContextViewModel.ts `
  src/test/grow-walk-context-view-model.test.ts `
  src/test/grow-walk-safety-golden-cases.test.ts
git commit -m "feat: build cautious grow walk brief"
```

---

### Task 5: Add the Owner-Scoped Target Read Model

**Files:**

- Create: `src/lib/growWalkTargetReadModels.ts`
- Create: `src/test/grow-walk-target-read-models.test.ts`
- Modify only if required for exports: `src/lib/operatorAccountReadModels.ts`

**Interfaces:**

- Consumes:
  - authenticated `SupabaseClient<Database>`;
  - `buildGrowScopedPlantsOrFilter`;
  - `deriveGrowWalkEvidence`;
  - `deriveGrowWalkAttentionBand`;
  - `sortGrowWalkTargets`.
- Produces:

```ts
export interface ListGrowWalkTargetsOptions {
  includeInactivePlants?: boolean;
  limit?: number;
  now?: Date;
}

export async function listGrowWalkTargetsForOwnedGrow(
  client: SupabaseClient<Database>,
  growId: string,
  options?: ListGrowWalkTargetsOptions,
): Promise<
  OwnerScopedReadModelResult<{
    grow: { id: string; name: string };
    targets: GrowWalkTarget[];
    generatedAt: string;
  }>
>;
```

- [ ] **Step 1: Write failing query-contract tests with a fluent client fake**

The fake records table, selected columns, filters, ordering, and limits. Assert this order:

1. Prove the grow is visible with `grows.select("id,name").eq("id", growId).maybeSingle()`.
2. Fetch non-archived tents for that grow.
3. Fetch plants through their own `grow_id` or an owned tent using `buildGrowScopedPlantsOrFilter`.
4. Batch-fetch bounded diary/grow-event metadata, active alerts, and latest sensor timestamps for owned target IDs.
5. Never query a child table when grow ownership fails.
6. Never select `user_id`, `raw_payload`, photo URL, signed URL, sensor secret, device payload, or full AI output.
7. Clamp `limit` to `1..100`, default `50`.
8. Exclude archived plants unless `includeInactivePlants === true`.
9. Include tent targets even when they contain zero plants.
10. Include legacy plants whose explicit owned tent belongs to the grow even when `plant.grow_id` is null, and emit `plant_profile_incomplete` rather than inventing the missing relationship.
11. Represent unavailable child lanes as explicit missing codes rather than zero-risk evidence.
12. Use stable target ordering from Task 3.
13. Return the same not-found message for foreign and nonexistent grow IDs.

- [ ] **Step 2: Run the test and confirm RED**

```powershell
bunx vitest run src/test/grow-walk-target-read-models.test.ts --reporter=dot
```

- [ ] **Step 3: Implement batched, presenter-safe reads**

Use these column allow-lists:

```ts
const GROW_COLUMNS = "id,name" as const;
const TENT_COLUMNS = "id,name,grow_id,stage,is_archived" as const;
const PLANT_COLUMNS =
  "id,name,strain,tent_id,grow_id,stage,health,is_archived,medium,pot_size,plant_type,started_at" as const;
const DIARY_COLUMNS =
  "id,grow_id,plant_id,tent_id,stage,note,entry_at,created_at" as const;
const ALERT_COLUMNS =
  "id,grow_id,tent_id,plant_id,title,reason,severity,status,metric,source,last_seen_at" as const;
const SENSOR_SUMMARY_COLUMNS =
  "id,tent_id,metric,value,quality,source,ts,captured_at,created_at,raw_payload" as const;
```

`raw_payload` may be selected only because the existing diagnostic-testbench fence needs it; strip it before creating any public result.

Do not query `ai_doctor_sessions` or `action_queue` in target listing. Those lanes belong to the detailed context tool.

Use a per-grow bounded window:

```ts
const TARGET_SUMMARY_LOOKBACK_HOURS = 72;
const TARGET_SUMMARY_ROW_LIMIT = 500;
```

Use existing event semantics to classify major changes. Do not infer major changes from note text alone.

- [ ] **Step 4: Run read-model and existing operator tests**

```powershell
bunx vitest run `
  src/test/grow-walk-target-read-models.test.ts `
  src/test/operator-account-read-models.test.ts `
  src/test/operator-account-read-models-static-safety.test.ts `
  --reporter=dot
```

- [ ] **Step 5: Commit the target adapter**

```powershell
git add src/lib/growWalkTargetReadModels.ts src/test/grow-walk-target-read-models.test.ts
git commit -m "feat: add grow walk target read model"
```

---

### Task 6: Add the Owner-Scoped Context Read Model

**Files:**

- Create: `src/lib/growWalkContextReadModels.ts`
- Create: `src/test/grow-walk-context-read-models.test.ts`

**Interfaces:**

- Consumes:
  - `getLatestSensorSnapshotForOwnedTent`;
  - contracts and pure rules from Tasks 1–4;
  - authenticated `SupabaseClient<Database>`.
- Produces:

```ts
export interface GetGrowWalkContextInput {
  targetType: GrowWalkTargetType;
  targetId: string;
  lookbackHours?: number;
}

export interface GetGrowWalkContextOptions {
  now?: Date;
}

export async function getGrowWalkContextForOwnedTarget(
  client: SupabaseClient<Database>,
  input: GetGrowWalkContextInput,
  options?: GetGrowWalkContextOptions,
): Promise<OwnerScopedReadModelResult<{ context: GrowWalkContext }>>;
```

- [ ] **Step 1: Write failing owner/scope and partial-lane tests**

Cover:

- plant lookup selects its exact `grow_id` and `tent_id`, then proves the linked grow and tent are visible;
- tent lookup proves the linked grow is visible;
- a plant with an owned grow but no tent returns a limited context with `tentId: null` and a partial sensor lane; a contradictory stored plant/tent/grow relationship fails closed; a plant with neither an owned grow nor an owned tent cannot produce a context;
- child queries occur only after scope proof;
- lookback clamps to `24..168`, default `72`;
- events are bounded and ordered by actual occurrence time;
- alerts include active/recent rows only;
- AI Doctor selects latest completed owner-scoped session metadata and strips raw diagnosis/suggested-actions bodies;
- Action Queue selects only open review metadata and strips device/command fields;
- photos are metadata-only and `inspectedInThisRun` is always `false`;
- sensor lane calls `getLatestSensorSnapshotForOwnedTent`;
- plant-scoped sensor evidence comes from the plant’s owned tent and is labeled tent-level; an unassigned plant never receives a guessed sensor tent;
- one lane failure returns an explicit `partialLanes` entry while proven scope and other lanes remain available;
- profile/scope failure is fatal and does not return a partial context;
- note/reason/summary excerpts are whitespace-normalized and capped at 240 characters;
- output contains none of the existing `FORBIDDEN_PATTERNS`.

- [ ] **Step 2: Run the test and confirm RED**

```powershell
bunx vitest run src/test/grow-walk-context-read-models.test.ts --reporter=dot
```

- [ ] **Step 3: Implement scope-first lane loading**

Use a lane wrapper:

```ts
async function readLane<T>(
  lane: GrowWalkEvidenceLane,
  read: () => Promise<T>,
): Promise<
  | { ok: true; lane: GrowWalkEvidenceLane; data: T }
  | { ok: false; lane: GrowWalkEvidenceLane; message: string }
> {
  try {
    return { ok: true, lane, data: await read() };
  } catch (error) {
    return {
      ok: false,
      lane,
      message: error instanceof Error ? error.message : "lane unavailable",
    };
  }
}
```

Do not copy lane error messages into public structured content. Public output lists only lane names in `partialLanes`.

Every Supabase lane reader must check its returned `error` and throw a sanitized internal `Error` before `readLane` resolves; a `{ data: null, error }` response is never treated as an empty successful lane.

Use these safe selectors:

```ts
const EVENT_COLUMNS =
  "id,grow_id,tent_id,plant_id,event_type,source,occurred_at,note,created_at" as const;
const ALERT_COLUMNS =
  "id,grow_id,tent_id,plant_id,title,reason,severity,status,metric,source,last_seen_at" as const;
const AI_DOCTOR_COLUMNS =
  "id,grow_id,tent_id,plant_id,created_at,displayed_confidence,context_confidence_ceiling,context_sufficiency,sensor_snapshot_status,sensor_snapshot_reason_code" as const;
const ACTION_QUEUE_COLUMNS =
  "id,grow_id,tent_id,plant_id,status,risk_level,reason,created_at" as const;
```

Read photo timing from the canonical typed-event lane (`grow_events.event_type === "photo"`). Do not fetch photo storage objects.

For plant scope, include only rows with the exact plant ID. For tent scope, include exact tent rows and child plant rows from that tent; do not silently include unassigned grow-level rows.

- [ ] **Step 4: Build and validate the public context**

After lanes load:

```ts
const derivedEvidence = deriveGrowWalkEvidence(evidenceInput);
const attentionBand = deriveGrowWalkAttentionBand({
  ...derivedEvidence,
  activeAlertCount: alerts.filter((row) => row.status !== "resolved").length,
  highestAlertSeverity: getHighestAlertSeverity(alerts),
});
```

Build the `GrowWalkContext` through `growWalkContextViewModel.ts`; do not return database rows directly.

- [ ] **Step 5: Run context and safety tests**

```powershell
bunx vitest run `
  src/test/grow-walk-context-read-models.test.ts `
  src/test/grow-walk-context-view-model.test.ts `
  src/test/grow-walk-safety-golden-cases.test.ts `
  src/test/operator-account-read-models.test.ts `
  --reporter=dot
```

- [ ] **Step 6: Commit the context adapter**

```powershell
git add src/lib/growWalkContextReadModels.ts src/test/grow-walk-context-read-models.test.ts
git commit -m "feat: add grow walk context read model"
```

---

### Task 7: Expose `list_grow_walk_targets`

**Files:**

- Create: `src/lib/mcp/tools/list-grow-walk-targets.ts`
- Create: `src/test/grow-walk-list-targets-tool.test.ts`

**Interfaces:**

- Consumes: `listGrowWalkTargetsForOwnedGrow`.
- Produces MCP tool:

```ts
name: "list_grow_walk_targets"
input: {
  growId: string;
  includeInactivePlants?: boolean;
  limit?: number;
}
structuredContent: {
  grow: { id: string; name: string };
  targets: GrowWalkTarget[];
  generatedAt: string;
}
```

- [ ] **Step 1: Write failing tool tests**

Mock `supabaseForUser` and the read model. Assert:

- unauthenticated calls return the existing `Not authenticated.` error;
- invalid UUID, `limit=0`, `limit=101`, unknown input properties, and non-boolean `includeInactivePlants` fail schema validation;
- the handler passes only approved parameters;
- not-found and unavailable failures use calm sanitized text;
- structured content is exactly `{ grow, targets, generatedAt }`;
- annotations are exactly:

```ts
{ readOnlyHint: true, idempotentHint: true, openWorldHint: false }
```

- description says scouting priority is not diagnosis and no result is permission to control equipment;
- serialized response contains no `user_id`, `raw_payload`, token, signed URL, command, or private note body.

- [ ] **Step 2: Run the test and confirm RED**

```powershell
bunx vitest run src/test/grow-walk-list-targets-tool.test.ts --reporter=dot
```

- [ ] **Step 3: Implement the tool**

Use:

```ts
export default defineTool({
  name: "list_grow_walk_targets",
  title: "List Grow Walk targets",
  description:
    "List the signed-in grower's owned tents and plants for a read-only scouting pass. " +
    "Attention bands prioritize physical verification; they are not diagnoses, " +
    "device commands, or automatic actions.",
  inputSchema: {
    growId: z.string().uuid().describe("Owned grow id."),
    includeInactivePlants: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  },
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const result = await listGrowWalkTargetsForOwnedGrow(
      supabaseForUser(ctx),
      input.growId,
      input,
    );
    // map OwnerScopedReadModelResult to sanitized MCP output
  },
});
```

- [ ] **Step 4: Run the tool tests**

```powershell
bunx vitest run `
  src/test/grow-walk-list-targets-tool.test.ts `
  src/test/mcp-tools-source-safety.test.ts `
  --reporter=dot
```

- [ ] **Step 5: Commit the tool**

```powershell
git add src/lib/mcp/tools/list-grow-walk-targets.ts src/test/grow-walk-list-targets-tool.test.ts
git commit -m "feat: expose grow walk targets tool"
```

---

### Task 8: Expose `get_grow_walk_context`

**Files:**

- Create: `src/lib/mcp/tools/get-grow-walk-context.ts`
- Create: `src/test/grow-walk-context-tool.test.ts`

**Interfaces:**

- Consumes: `getGrowWalkContextForOwnedTarget` and `buildGrowWalkBrief`.
- Produces MCP tool:

```ts
name: "get_grow_walk_context"
input: {
  targetType: "tent" | "plant";
  targetId: string;
  lookbackHours?: number;
}
structuredContent: {
  context: GrowWalkContext;
  brief: GrowWalkBrief;
}
```

- [ ] **Step 1: Write failing tool tests**

Assert:

- exact schema keys are `targetType`, `targetId`, and `lookbackHours`;
- `targetType` rejects anything except `tent` and `plant`;
- `lookbackHours` accepts `24..168`;
- unauthenticated, nonexistent, foreign, and unavailable targets fail without revealing another owner;
- partial contexts remain successful and name partial lanes;
- output includes no more than three checks and exactly one AI Doctor posture;
- photo metadata never claims inspection;
- no action is persisted;
- response has no service-role, token, raw payload, user ID, signed URL, private storage path, target device, or suggested command.

- [ ] **Step 2: Run the test and confirm RED**

```powershell
bunx vitest run src/test/grow-walk-context-tool.test.ts --reporter=dot
```

- [ ] **Step 3: Implement the tool**

Use:

```ts
export default defineTool({
  name: "get_grow_walk_context",
  title: "Get Grow Walk context",
  description:
    "Return bounded, source-labeled evidence and a cautious physical-inspection brief " +
    "for one owned tent or plant. Read-only: no Quick Log save, AI call, Action Queue " +
    "mutation, automation, or device control.",
  inputSchema: {
    targetType: z.enum(["tent", "plant"]),
    targetId: z.string().uuid(),
    lookbackHours: z.number().int().min(24).max(168).optional(),
  },
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const result = await getGrowWalkContextForOwnedTarget(
      supabaseForUser(ctx),
      input,
    );
    if (!result.ok) return toSanitizedToolError(result);
    const context = result.data.context;
    return {
      content: [{ type: "text", text: formatGrowWalkText(buildGrowWalkBrief(context)) }],
      structuredContent: { context, brief: buildGrowWalkBrief(context) },
    };
  },
});
```

`formatGrowWalkText` must render the approved section order and escape/bound untrusted excerpts; it does not use Markdown links to private data.

- [ ] **Step 4: Run both tool and safety suites**

```powershell
bunx vitest run `
  src/test/grow-walk-context-tool.test.ts `
  src/test/grow-walk-context-view-model.test.ts `
  src/test/grow-walk-safety-golden-cases.test.ts `
  src/test/mcp-tools-source-safety.test.ts `
  --reporter=dot
```

- [ ] **Step 5: Commit the tool**

```powershell
git add src/lib/mcp/tools/get-grow-walk-context.ts src/test/grow-walk-context-tool.test.ts
git commit -m "feat: expose grow walk context tool"
```

---

### Task 9: Register and Regenerate the MCP Surface

**Files:**

- Modify: `src/lib/mcp/index.ts`
- Generated modify: `.lovable/mcp/manifest.json`
- Generated modify: `supabase/functions/mcp/index.ts`
- Create: `src/test/grow-walk-mcp-manifest-contract.test.ts`
- Modify: `src/test/mcp-tools-source-safety.test.ts`

**Interfaces:**

- Consumes: the two tool default exports.
- Produces: five registered read-only tools and a synchronized generated bundle/manifest.

- [ ] **Step 1: Write failing registration and manifest tests**

Assert source registration:

```ts
expect(mcpSource).toContain('import listGrowWalkTargetsTool from "./tools/list-grow-walk-targets"');
expect(mcpSource).toContain('import getGrowWalkContextTool from "./tools/get-grow-walk-context"');
```

Assert manifest contracts:

```ts
expect(Object.keys(targetTool.inputSchema.properties ?? {}).sort()).toEqual(
  ["growId", "includeInactivePlants", "limit"].sort(),
);
expect(targetTool.inputSchema.required).toEqual(["growId"]);

expect(Object.keys(contextTool.inputSchema.properties ?? {}).sort()).toEqual(
  ["lookbackHours", "targetId", "targetType"].sort(),
);
expect(contextTool.inputSchema.required).toEqual(["targetType", "targetId"]);
```

For both tools assert:

- `readOnlyHint === true`;
- `idempotentHint === true`;
- `openWorldHint === false`;
- no `user_id`;
- descriptions include read-only, evidence/scouting limits, no device control, and no automatic action;
- the generated bundle contains each tool once;
- the generated banner remains present.

- [ ] **Step 2: Run tests and confirm RED**

```powershell
bunx vitest run `
  src/test/grow-walk-mcp-manifest-contract.test.ts `
  src/test/mcp-tools-source-safety.test.ts `
  --reporter=dot
```

- [ ] **Step 3: Register the tools in `src/lib/mcp/index.ts`**

Add imports and use:

```ts
tools: [
  listGrowsTool,
  listRecentDiaryEntriesTool,
  getLatestSensorSnapshotTool,
  listGrowWalkTargetsTool,
  getGrowWalkContextTool,
],
```

Update server instructions to state:

- Grow Walk is read-only scouting, not diagnosis;
- `list_grow_walk_targets` resolves exact owned scope;
- `get_grow_walk_context` returns bounded evidence;
- only `current_live` readings are live;
- no writes, AI call, Action Queue approval, automation, or device control.

- [ ] **Step 4: Regenerate rather than hand-edit**

First confirm the current generator command from the installed 0.24.0 integration:

```powershell
bun run build
git diff -- .lovable/mcp/manifest.json supabase/functions/mcp/index.ts
```

Expected: the Vite MCP plugin regenerates both outputs from source. If `bun run build` does not regenerate them on the current implementation base, run the repository-supported MCP generation command exposed by `bunx lovable-mcp --help`; do not edit either generated output manually.

Then run:

```powershell
bun run verify-edge-shared-in-sync
bun run check:no-src-lib-imports
```

- [ ] **Step 5: Run manifest, bundle, and build checks**

```powershell
bunx vitest run `
  src/test/grow-walk-mcp-manifest-contract.test.ts `
  src/test/mcp-tools-source-safety.test.ts `
  src/test/mcp-local-rls-integration.test.ts `
  --reporter=dot
bun run typecheck
bun run build
```

The local RLS suite may report its existing intentional skip when local Supabase variables are absent; static manifest assertions must still run.

- [ ] **Step 6: Commit source and generated outputs together**

```powershell
git add `
  src/lib/mcp/index.ts `
  .lovable/mcp/manifest.json `
  supabase/functions/mcp/index.ts `
  src/test/grow-walk-mcp-manifest-contract.test.ts `
  src/test/mcp-tools-source-safety.test.ts
git commit -m "feat: register grow walk MCP tools"
```

---

### Task 10: Prove Cross-User Isolation and Zero Hidden Writes

**Files:**

- Modify: `src/test/mcp-local-rls-integration.test.ts`
- Modify: `src/test/helpers/mcpRlsHarnessOps.ts`
- Modify: `src/test/mcp-rls-harness-ops.test.ts`

**Interfaces:**

- Consumes: generated manifest and both tool handlers.
- Produces: local runtime proof across two users and every advertised scope/filter parameter.

- [ ] **Step 1: Extend manifest-driven case generation**

For `list_grow_walk_targets`, generate:

```ts
[
  { label: "default", args: { growId: ownGrowId } },
  { label: "inactive false", args: { growId: ownGrowId, includeInactivePlants: false } },
  { label: "inactive true", args: { growId: ownGrowId, includeInactivePlants: true } },
  { label: "limit one", args: { growId: ownGrowId, limit: 1 } },
]
```

For `get_grow_walk_context`, generate both target types and lookback boundaries:

```ts
[
  { targetType: "tent", targetId: ownTentId, lookbackHours: 24 },
  { targetType: "tent", targetId: ownTentId, lookbackHours: 168 },
  { targetType: "plant", targetId: ownPlantId, lookbackHours: 72 },
]
```

Every generated argument name must exist in the manifest schema.

- [ ] **Step 2: Seed minimum isolated evidence for both users**

Extend the existing local-only seed with:

- one tent and one plant per user;
- one observation and one major-change event per user;
- one photo event per user with an obviously fake metadata marker but no storage URL returned;
- one live and one manual sensor reading per user;
- one active alert per user;
- one completed AI Doctor session per user;
- one suggested Action Queue item per user.

Use unique per-user markers in every name/reason/note. Continue using service role only for fixture setup and cleanup.

- [ ] **Step 3: Write failing isolation assertions**

For each tool:

- User A sees only marker A.
- User B sees only marker B.
- Passing user B’s grow, tent, or plant ID through user A returns the same inaccessible/not-found result as a random UUID.
- `includeInactivePlants`, `limit`, `lookbackHours`, and target type never broaden scope.
- serialized structured content contains no other-user marker;
- `assertNoSecretLeakage` passes;
- tool execution spy proves `supabaseForUser(ctx)` receives the user token and never the service-role seeding client.

Capture row counts before and after calls for:

```text
diary_entries
grow_events
alerts
alert_events
action_queue
action_queue_events
ai_doctor_sessions
sensor_readings
```

Assert every count is unchanged.

- [ ] **Step 4: Run static harness tests and confirm RED/GREEN cycle**

Before implementation changes:

```powershell
bunx vitest run `
  src/test/mcp-rls-harness-ops.test.ts `
  src/test/mcp-local-rls-integration.test.ts `
  --reporter=dot
```

Expected before completing this task: new generated cases or imports fail.

After implementation, run the same command again. Static tests pass; runtime tests execute only when the local harness variables are present.

- [ ] **Step 5: Run the real local Supabase lane**

With a disposable local Supabase stack:

```powershell
$env:LOCAL_SUPABASE_URL="http://127.0.0.1:54321"
$env:LOCAL_SUPABASE_ANON_KEY="<local anon key from supabase status>"
$env:LOCAL_SUPABASE_SERVICE_ROLE_KEY="<local service-role key from supabase status>"
$env:MCP_LOCAL_RLS_HARNESS="1"
bun run test:mcp:rls:local
```

Expected: both users’ positive cases pass, all cross-user cases fail closed, zero protected-table counts change, and sanitized artifacts contain no secret material.

Do not use hosted Supabase credentials.

- [ ] **Step 6: Commit runtime isolation proof**

```powershell
git add `
  src/test/mcp-local-rls-integration.test.ts `
  src/test/helpers/mcpRlsHarnessOps.ts `
  src/test/mcp-rls-harness-ops.test.ts
git commit -m "test: prove grow walk MCP isolation"
```

---

### Task 11: Package the One-Skill Plugin

**Files:**

- Create: `plugins/verdant-grow-walk/.codex-plugin/plugin.json`
- Create: `plugins/verdant-grow-walk/agents/openai.yaml`
- Create: `plugins/verdant-grow-walk/skills/run-grow-walk/SKILL.md`
- Create: `plugins/verdant-grow-walk/skills/run-grow-walk/references/grow-walk-output-contract.md`
- Create: `plugins/verdant-grow-walk/skills/run-grow-walk/references/veteran-inspection-rules.md`
- Create: `plugins/verdant-grow-walk/skills/run-grow-walk/references/sensor-trust-policy.md`
- Create: `plugins/verdant-grow-walk/skills/run-grow-walk/references/safety-and-escalation-rules.md`
- Create: `plugins/verdant-grow-walk/evals/trigger-cases.yaml`
- Create: `plugins/verdant-grow-walk/evals/safety-cases.yaml`
- Create: `plugins/verdant-grow-walk/evals/tool-contract-cases.yaml`
- Create or modify: `.agents/plugins/marketplace.json`
- Create: `scripts/validate-grow-walk-plugin.mjs`
- Create: `src/test/grow-walk-plugin-package.test.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: deployed MCP URL and tool names; no app technical ID yet.
- Produces: repository-installable skill package without `.app.json` or an `apps` field.

- [ ] **Step 1: Invoke the local `$plugin-creator` skill in audit/scaffold mode**

From the implementation worktree, invoke:

```text
$plugin-creator
Create a repository-scoped plugin named verdant-grow-walk under
plugins/verdant-grow-walk. It has one skill, run-grow-walk, and depends on the
existing read-only Verdant MCP server tools list_grows,
list_grow_walk_targets, and get_grow_walk_context. Do not create .app.json or
an apps manifest field because no registered plugin_asdk_app identifier exists.
Use .agents/plugins/marketplace.json for repository discovery. Do not add UI,
write tools, secrets, device control, or public submission metadata.
```

Review the scaffold against the exact paths above. Delete unsupported generated fields rather than carrying them forward.

- [ ] **Step 2: Write failing package tests**

Assert:

- `plugin.json` exists inside `.codex-plugin/`;
- all manifest paths begin with `./` and resolve inside the plugin root;
- plugin name is `verdant-grow-walk`, version is `0.1.0`, capability is read-only;
- no `apps` key and no `.app.json` exist before registration;
- `agents/openai.yaml` declares one streamable-HTTP MCP dependency to:

```text
https://knkwiiywfkbqznbxwqfh.supabase.co/functions/v1/mcp
```

- the dependency names only `list_grows`, `list_grow_walk_targets`, and `get_grow_walk_context`;
- `SKILL.md` frontmatter name is `run-grow-walk`;
- every reference named in `SKILL.md` exists;
- trigger evals contain at least 20 positive, 20 negative, and 10 AI-Doctor-routing cases;
- every safety eval names an expected attention band or escalation posture;
- no file contains unfinished-work markers, `plugin_asdk_app_example`, a Windows absolute path, API-key/JWT/bearer credential value, signed private URL, or imperative equipment-control phrase. Safety statements such as “no device control” remain allowed.

- [ ] **Step 3: Run package tests and confirm RED**

```powershell
bunx vitest run src/test/grow-walk-plugin-package.test.ts --reporter=dot
```

- [ ] **Step 4: Write the initial plugin manifest**

Use the fields accepted by the current plugin-creator schema. The intended manifest is:

```json
{
  "name": "verdant-grow-walk",
  "version": "0.1.0",
  "description": "Run a calm evidence-led daily inspection of a Verdant grow.",
  "skills": "./skills/",
  "interface": {
    "displayName": "Verdant Grow Walk",
    "shortDescription": "Know where to look before deciding what to do",
    "developerName": "Verdant",
    "category": "Productivity",
    "capabilities": ["Read"],
    "defaultPrompt": [
      "Run my morning grow walk.",
      "Which plant should I inspect first?",
      "Review my tent before I water."
    ]
  }
}
```

If plugin-creator rejects an interface field under the installed schema, remove only that rejected optional field and pin the accepted output in the package test. Do not invent replacements.

- [ ] **Step 5: Write `agents/openai.yaml`**

Use the current schema emitted by plugin-creator. The dependency must remain equivalent to:

```yaml
dependencies:
  tools:
    - type: mcp
      value: verdant-grow-os-mcp
      description: Read-only access to the signed-in grower's Verdant Grow OS data.
      transport: streamable_http
      url: https://knkwiiywfkbqznbxwqfh.supabase.co/functions/v1/mcp
```

No OAuth token, client secret, user ID, API key, or environment value is committed.

- [ ] **Step 6: Write the skill workflow**

`SKILL.md` must instruct this exact sequence:

1. Call `list_grows`.
2. Resolve exactly one owned grow or present the smallest owned choice.
3. Call `list_grow_walk_targets`.
4. Resolve exact owned tent/plant; never guess by array position.
5. Call `get_grow_walk_context`.
6. Treat returned source, quality, freshness, reason, missing, contradiction, and partial-lane fields as authoritative.
7. Render:
   - scope;
   - attention level;
   - what changed;
   - evidence trust;
   - up to three physical checks;
   - missing information;
   - safest next observation;
   - what not to do;
   - AI Doctor posture;
   - one fill-after-inspection Quick Log template;
   - Action Queue posture.
8. Stop rather than guess when scope or evidence cannot be proved.

The skill must state that a full diagnosis request routes to AI Doctor.

- [ ] **Step 7: Write reference and eval files**

Reference files divide responsibilities:

- `grow-walk-output-contract.md`: section order and output examples.
- `veteran-inspection-rules.md`: evidence-first inspection order, root-zone/environment/posture discipline, autoflower restraint.
- `sensor-trust-policy.md`: `current_live`, source/quality/freshness, contradictory data, and metadata-only photos.
- `safety-and-escalation-rules.md`: forbidden actions, AI Doctor postures, Action Queue boundaries, and stop conditions.

Eval YAML uses stable IDs such as:

```yaml
- id: positive-morning-walk
  input: Run my morning grow walk.
  expected_skill: run-grow-walk
  expected_route: grow_walk
```

and:

```yaml
- id: route-full-diagnosis
  input: Diagnose the cause of these symptoms and give me a recovery plan.
  expected_skill: null
  expected_route: ai_doctor
```

- [ ] **Step 8: Add a no-dependency package validator**

`scripts/validate-grow-walk-plugin.mjs` must:

- parse JSON with `JSON.parse`;
- validate YAML files using deterministic line/section checks rather than adding a YAML package;
- resolve every relative path and reject path escape;
- count eval categories;
- scan UTF-8 files for forbidden placeholders/secrets/absolute paths;
- fail when `.app.json` or an `apps` key appears before registration;
- print one pass receipt with file and eval counts.

Add scripts:

```json
{
  "test:grow-walk": "vitest run src/test/grow-walk-*.test.ts src/test/mcp-rls-harness-ops.test.ts",
  "check:grow-walk-plugin": "node scripts/validate-grow-walk-plugin.mjs"
}
```

- [ ] **Step 9: Run package and focused feature gates**

```powershell
bun run check:grow-walk-plugin
bun run test:grow-walk
bun run format:check
```

- [ ] **Step 10: Commit the plugin package**

```powershell
git add `
  plugins/verdant-grow-walk `
  .agents/plugins/marketplace.json `
  scripts/validate-grow-walk-plugin.mjs `
  src/test/grow-walk-plugin-package.test.ts `
  package.json
git commit -m "feat: package verdant grow walk plugin"
```

---

### Task 12: Register the Real MCP Connection and Wire `.app.json`

**Files:**

- Create only after registration: `plugins/verdant-grow-walk/.app.json`
- Modify only after registration: `plugins/verdant-grow-walk/.codex-plugin/plugin.json`
- Modify: `src/test/grow-walk-plugin-package.test.ts`
- Modify: `scripts/validate-grow-walk-plugin.mjs`

**Interfaces:**

- Consumes: deployed MCP URL and the real technical ID returned by ChatGPT developer mode.
- Produces: a plugin package mapped to one real Verdant MCP connection.

- [ ] **Step 1: Verify the deployed read-only MCP endpoint**

Do not register until Tasks 1–11 are merged to the deployment candidate and the MCP Edge Function is deployed through the normal owner-approved release path.

Use the MCP inspector or ChatGPT developer-mode connection test against:

```text
https://knkwiiywfkbqznbxwqfh.supabase.co/functions/v1/mcp
```

Expected:

- OAuth challenge points to the Verdant Supabase issuer;
- five tools are visible;
- the two Grow Walk tools carry read-only annotations;
- unauthenticated requests reveal no grow metadata.

- [ ] **Step 2: Register in ChatGPT developer mode**

Register the endpoint and complete the existing Verdant OAuth flow. Capture the returned technical identifier securely into the shell:

```powershell
$env:VERDANT_GROW_WALK_APP_ID="plugin_asdk_app_<real value returned by ChatGPT>"
if ($env:VERDANT_GROW_WALK_APP_ID -notmatch '^plugin_asdk_app_[A-Za-z0-9_-]+$') {
  throw "A real ChatGPT plugin technical ID is required."
}
```

Never paste the OAuth token or client secret into the repository.

- [ ] **Step 3: Invoke `$plugin-creator` to wire the registered app**

Use:

```text
$plugin-creator
Wire the existing plugins/verdant-grow-walk package to the already-registered
ChatGPT MCP app whose technical ID is supplied in
VERDANT_GROW_WALK_APP_ID. Generate the current supported .app.json mapping and
add the relative apps field to .codex-plugin/plugin.json. Preserve the single
run-grow-walk skill and do not add UI, writes, secrets, or another connection.
```

Review the diff. The only new identity must equal the environment variable exactly.

- [ ] **Step 4: Change package tests from pre-registration to registered mode**

Assert:

- `.app.json` exists and parses under plugin-creator’s current schema;
- manifest `apps` is exactly `"./.app.json"`;
- the app mapping contains the exact `plugin_asdk_app...` identifier;
- no credential or raw URL token appears;
- all relative paths remain inside the plugin root.

- [ ] **Step 5: Run package validation and commit**

```powershell
bun run check:grow-walk-plugin
bunx vitest run src/test/grow-walk-plugin-package.test.ts --reporter=dot
git add `
  plugins/verdant-grow-walk/.app.json `
  plugins/verdant-grow-walk/.codex-plugin/plugin.json `
  src/test/grow-walk-plugin-package.test.ts `
  scripts/validate-grow-walk-plugin.mjs
git commit -m "chore: wire grow walk MCP connection"
```

This task cannot be simulated with a fake ID. Stop at Task 11 until the real registration exists.

---

### Task 13: Run the Authenticated Zero-Write Owner Smoke

**Files:**

- Create: `scripts/e2e/run-grow-walk-zero-write-smoke.mjs`
- Create: `src/test/grow-walk-zero-write-smoke-contract.test.ts`
- Create at runtime only: `artifacts/grow-walk-smoke/receipt.json`
- Do not commit runtime receipts containing account data.

**Interfaces:**

- Consumes: disposable local/test user, owned grow/tent/plant fixtures, registered plugin connection.
- Produces: sanitized proof of exact scope, truthful labels, output contract, and zero writes.

- [ ] **Step 1: Write the failing smoke contract test**

Statically assert that the script:

- rejects production/hosted Supabase unless `GROW_WALK_SMOKE_ALLOW_HOSTED=1` is separately supplied by the owner;
- records before/after counts for all protected tables listed in Task 10;
- redacts tokens, emails, notes, raw payloads, signed URLs, and UUIDs from the persisted receipt;
- fails on any count delta;
- requires no more than three physical checks;
- requires one Quick Log template;
- requires one AI Doctor posture;
- requires an Action Queue posture;
- never calls insert/update/delete/RPC write methods.

- [ ] **Step 2: Run the contract test and confirm RED**

```powershell
bunx vitest run src/test/grow-walk-zero-write-smoke-contract.test.ts --reporter=dot
```

- [ ] **Step 3: Implement the local/test smoke harness**

The script:

1. reads local test credentials from environment;
2. signs in as the disposable user;
3. records protected-table counts;
4. calls `list_grows`;
5. calls `list_grow_walk_targets`;
6. calls `get_grow_walk_context`;
7. validates source/freshness labels and brief structure;
8. records the same protected-table counts;
9. compares them exactly;
10. writes a sanitized receipt containing only:
   - tool names;
   - result statuses;
   - attention band;
   - evidence confidence;
   - number of checks;
   - AI Doctor posture;
   - Action Queue posture;
   - before/after count equality booleans;
   - timestamp and code version.

- [ ] **Step 4: Run the local authenticated smoke**

```powershell
$env:GROW_WALK_SMOKE="1"
$env:LOCAL_SUPABASE_URL="http://127.0.0.1:54321"
$env:LOCAL_SUPABASE_ANON_KEY="<local anon key>"
$env:GROW_WALK_TEST_EMAIL="<disposable local user>"
$env:GROW_WALK_TEST_PASSWORD="<disposable local password>"
node scripts/e2e/run-grow-walk-zero-write-smoke.mjs
```

Expected: exit 0 and every protected-table before/after equality is true.

- [ ] **Step 5: Run the conversational plugin smoke**

In ChatGPT with the installed repository plugin:

```text
Which plant should I inspect first?
```

Verify:

- exact grow/tent/plant name;
- no foreign or unassigned target;
- truthful source/freshness labels;
- no more than three checks;
- no visual claim without an inspected uploaded image;
- one future-facing Quick Log template;
- no automatic AI Doctor run;
- no Action Queue mutation;
- no device-control phrasing.

Then test a foreign/random UUID through the raw tool inspector and confirm it fails closed.

- [ ] **Step 6: Commit the reusable smoke harness, not the account receipt**

```powershell
git add `
  scripts/e2e/run-grow-walk-zero-write-smoke.mjs `
  src/test/grow-walk-zero-write-smoke-contract.test.ts
git commit -m "test: add grow walk zero write smoke"
```

---

### Task 14: Complete Release Verification and Open a Draft PR

**Files:**

- Modify only when verified facts changed: `docs/agents/CURRENT_STATE.md`
- No new product behavior.

**Interfaces:**

- Consumes: completed Tasks 1–13.
- Produces: one reviewed draft PR with exact validation evidence; no merge or deployment.

- [ ] **Step 1: Run the focused Grow Walk gate**

```powershell
bun run test:grow-walk
bun run check:grow-walk-plugin
bun run test:mcp:rls:local
bun run verify-edge-shared-in-sync
bun run check:no-src-lib-imports
node scripts/sensor-safety-check.mjs
```

Report exact pass, fail, and skip counts. An environment-gated RLS skip is not a runtime pass.

- [ ] **Step 2: Run adjacent safety and platform gates**

```powershell
bunx vitest run `
  src/test/operator-account-read-models.test.ts `
  src/test/operator-account-read-models-static-safety.test.ts `
  src/test/mcp-tools-source-safety.test.ts `
  src/test/daily-grow-check.test.ts `
  src/test/daily-grow-check-guidance.test.ts `
  src/test/stabilize-mode-rules.test.ts `
  src/test/ai-doctor-golden-cases.test.ts `
  src/test/action-queue-*.test.ts `
  --reporter=dot
bun run test:security-regression
bun run test:sentinel-governance
```

- [ ] **Step 3: Run code-quality and build gates**

```powershell
bun run typecheck
bun run typecheck:tsgo
bun run lint
bun run format:check
bun run build
git diff --check
git diff --name-only origin/verdant-grow-diary...HEAD -- supabase/migrations
```

Expected:

- no type or lint errors;
- build succeeds;
- generated MCP bundle remains synchronized;
- migration diff is empty.

- [ ] **Step 4: Run the repository sharded suite**

```powershell
bun run test:full:sharded
```

Record exact file/test counts. Separate introduced failures from pre-existing or environment failures.

- [ ] **Step 5: Review the final diff for forbidden scope**

```powershell
git diff --stat origin/verdant-grow-diary...HEAD
git diff origin/verdant-grow-diary...HEAD -- `
  supabase/migrations `
  src/integrations/supabase/types.ts `
  src/lib/entitlements `
  src/components/ActionQueue* `
  supabase/functions/ai-doctor-review
```

Expected: no unauthorized schema, entitlement, Action Queue write, or AI Doctor execution changes.

- [ ] **Step 6: Update operating state only with verified facts**

If the implementation branch, PR, deployed-tool status, or blocker state changed, update `docs/agents/CURRENT_STATE.md` with:

- branch and exact head SHA;
- local/runtime validation status;
- whether `.app.json` is wired;
- whether the endpoint is deployed;
- remaining owner actions.

Do not describe a merged branch as deployed or a skipped harness as passing.

- [ ] **Step 7: Commit verification documentation**

```powershell
git add docs/agents/CURRENT_STATE.md
git commit -m "docs: record grow walk verification"
```

Skip this commit when no operating-state fact changed.

- [ ] **Step 8: Open a draft PR**

```powershell
git push -u origin codex/verdant-grow-walk-v0
gh pr create `
  --repo Verdant-OS/verdant-grow-diary `
  --base verdant-grow-diary `
  --head codex/verdant-grow-walk-v0 `
  --draft `
  --title "feat: add read-only Verdant Grow Walk plugin" `
  --body-file .github/pull_request_template.md
```

Replace the generated body with exact sections:

```text
Summary
Safety boundaries
MCP tools
Plugin package
RLS/runtime evidence
Zero-write evidence
Tests run
Skipped/not measured
Risk and rollback
Owner actions remaining
```

Do not merge. Freeze the reviewed head for independent safety and cultivation review.

---

## Self-Review Checklist

Before execution starts, confirm the plan covers every approved design requirement:

- [ ] One skill only.
- [ ] Two new MCP tools only.
- [ ] Existing MCP server and OAuth path.
- [ ] Exact owned scope and cross-user fail-closed behavior.
- [ ] No `user_id` input.
- [ ] Source/quality/freshness/current-live truth.
- [ ] Metadata-only photo semantics.
- [ ] Bounded event, alert, AI Doctor, and Action Queue reads.
- [ ] Partial-lane receipts.
- [ ] Deterministic attention bands and stable sorting.
- [ ] No more than three physical checks.
- [ ] Required restraints for non-routine output.
- [ ] Observation-first Quick Log template.
- [ ] Four AI Doctor postures.
- [ ] Read-only Action Queue posture.
- [ ] No model call, credit spend, write, automation, or device control.
- [ ] Plugin package and repository marketplace.
- [ ] No `.app.json` before real registration.
- [ ] Trigger, safety, package, manifest, and RLS evals.
- [ ] Local authenticated zero-write smoke.
- [ ] No migrations or RLS changes.
- [ ] Draft PR only; no merge/deploy claim.
