# Verdant V0 Zip Strategy Audit

Source reviewed: `Verdant-20260609T230414Z-3-001.zip` uploaded 2026-06-09.

This zip contains 41 strategy/spec/reference documents. It is not safe to implement the entire pack as one build. The correct execution model is to convert the pack into scoped slices that protect the One-Tent Loop:

```text
Grow → Tent → Plant → Quick Log → Timeline → Sensor Snapshot → AI Doctor → Alert → Approval-Required Action Queue
```

## Applied in this slice

### Auth tab crowding fix

The screenshot showed the auth mode tabs crowding on narrow screens, specifically:

- `Create account`
- `Forgot password`

Implemented:

- Moved auth tab metadata and styling into `src/lib/authModeTabRules.ts`.
- Targeted long auth tab labels with compact text sizing.
- Allowed long labels to wrap with `whitespace-normal` and `leading-tight`.
- Added spacing and auto-height to the tab list.
- Kept labels unchanged for clarity and accessibility.
- Added regression coverage in `src/test/auth-mode-tab-rules.test.ts`.

## Strategy lanes extracted from the zip

### 1. Stressed cultivator UX

Files include:

- `Verdant V0 Stressed Cultivator Experience Principles.docx`
- `Verdant V0 - What Easy Looks Like.docx`
- `quick-log-component-review*.docx`

Safe implementation rule:

- Prioritize one-handed, tired-grower workflows.
- Reduce cognitive load.
- Keep Quick Log action-first.
- Keep response checks separate from actions.
- Avoid shame/guilt copy.

Current status:

- Partially implemented through Quick Log action-first model, outcome follow-up, stabilize mode, action-response pairing, and auth tab cleanup.

### 2. Sensor truth and normalization

Files include:

- `sensor-data-normalization (V0 Refined).docx`
- `Verdant V0 Sensor Normalization Pipeline*.docx`
- `Verdant V0 Sensor Failure Scenarios Simulation.docx`

Safe implementation rule:

- Every sensor reading must preserve source, timestamp, tent context, plant context when relevant, confidence, and raw payload when available.
- Never classify unknown, stale, demo, invalid, or malformed telemetry as healthy.
- Celsius/Fahrenheit, EC unit, stuck humidity/moisture, pH, and stale-reading detection stay mandatory.

Current status:

- Existing sensor truth helpers and EcoWitt/Spider Farmer mapping work align with this lane.
- Future work should continue with targeted tests only. Do not add new schema/RLS changes unless explicitly scoped.

### 3. Conflict handling

Files include:

- `Verdant V0 Conflict Handling Playbook*.docx`
- `Verdant V0 Conflict Detection Algorithms.docx`
- `Verdant V0 Conflict Resolution Logic.docx`
- `Verdant V0 Conflict Resolution Strategies*.docx`

Safe implementation rule:

- Conflicts should be surfaced as explanations, not automated actions.
- Weak or conflicting evidence should lower confidence and prompt observation.
- Do not recommend aggressive nutrient, irrigation, or hardware changes from weak evidence.

Current status:

- Stabilize Mode V0 is the first safe UI expression of this lane.
- Next safe slice: pure conflict-summary helper for AI Doctor context, read-only only.

### 4. Approval-required Action Queue

Files include:

- `approval-required-action-queue (V0 Refined).docx`
- `Verdant V0 Action Queue Conflict Scenarios.docx`
- `Verdant V0 Implementation Guidance - Action Pipeline.docx`

Safe implementation rule:

- Action Queue stays approval-required.
- No hidden device commands.
- No automatic execution.
- Outcome recording is grower observation only.

Current status:

- Existing outcome recording and audit history behavior supports this lane.
- No additional Action Queue writes were added in recent builds.

### 5. AI Doctor context and RAG

Files include:

- `Verdant V0 AI Doctor Context Building - Implementation Guidance.docx`
- `Verdant V0 RAG Strategies for Plant Health Data.docx`
- `Verdant V0 RAG Retrieval Accuracy Evaluation.docx`
- `Verdant V0 RAG Evaluation Harness - Implementation Guidance.docx`

Safe implementation rule:

- AI Doctor should use context from plant history, diary, recent photos, sensor snapshots, alerts, targets, and missing information.
- RAG/evaluation should not be built before One-Tent Loop evidence is clean.

Current status:

- Deferred. Do not implement broad RAG until diary + sensor truth + action-response memory are stable.

### 6. Entitlements and monetization

Files include:

- `Verdant Entitlements & Monetization Foundation Spec.docx`

Safe implementation rule:

- Entitlement source of truth can be built as a read path foundation only.
- No checkout, webhook, route gating, or paywall claims until explicitly scoped.

Current status:

- Deferred. Not part of Gate 1 behavior.

### 7. shadcn / Radix UI consistency

Files include:

- `Radix + shadcn Patterns for Verdant (Reference).docx`
- `shadcn-consistent-ui*.docx`
- `shadcn - composition.md (original rules).docx`
- `shadcn - forms.md (original rules).docx`
- `shadcn - styling.md (original rules).docx`

Safe implementation rule:

- Use existing shadcn primitives.
- Keep overlays accessible.
- Use semantic tokens.
- Avoid brittle custom positioning when a component pattern exists.
- Preserve mobile ergonomics.

Current status:

- Auth tabs were improved by centralizing tab metadata and responsive class rules.
- Further form refactors should be scoped because replacing all form markup at once is high-risk.

## Recommended next safe slices

1. **Auth Form FieldGroup cleanup**
   - Scope: Auth page form structure only.
   - No auth behavior changes.
   - Add tests for labels, tab readability, password reset path.

2. **Sensor Truth Card copy audit**
   - Scope: presenter copy only.
   - Ensure live/manual/demo/stale/invalid labels are never ambiguous.

3. **AI Doctor missing-context preflight**
   - Scope: pure helper + tests.
   - Output missing context before diagnosis.
   - No model/prompt changes unless explicitly scoped.

4. **Conflict summary read-only card**
   - Scope: pure rules + Plant Detail or AI Doctor surface.
   - No Action Queue writes.

## Safety verdict

Do not implement this zip as a single build. Use it as a strategy library. The safe path is small scoped slices with tests and rollback.
