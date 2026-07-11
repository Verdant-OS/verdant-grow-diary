
# One-Tent Loop Golden Path — Audit Findings + Scoped Plan

Per the task's "Audit before changes" directive, I inventoried existing coverage before proposing new files. The repo already has extensive per-stage coverage; the missing piece is a single end-to-end **stitched** regression that walks the entire loop with one deterministic fixture and asserts every handoff. Everything below is additive — no schema, no RLS, no production rewrites unless a handoff actually breaks.

## Audit findings — existing coverage per stage

| Loop stage | Already covered by |
|---|---|
| Grow / Tent / Plant | `fixtures/demo-grow-one-tent.json` (192 lines), `src/fixtures/operatorDiaryDataset.ts`, `plant-detail-*` tests |
| Quick Log | `plant-quick-log*.test.ts` (7 files), `legacy-quicklog-unified-save.test.ts`, `plant-detail-quicklog-handoff.test.ts` |
| Timeline | `DiaryTimelineCategorySections.test.tsx`, `diary-calendar-*`, `plant-timeline-quick-log-ui-accessibility.test.tsx` |
| Sensor Snapshot | `ManualSensorTrendChart.test.tsx`, `OneTentSensorProofSection.test.tsx`, `one-tent-loop-proof-*` |
| AI Doctor context/output | 40+ `ai-doctor-*` files, deterministic golden cases in `src/fixtures/aiDoctorGoldenCases.ts` |
| Alert → Action Queue | `action-queue-*` (60+ files) incl. `action-queue-landing-one-tent-loop.test.tsx`, `action-queue-one-tent-loop-tail-integrated.test.tsx` |
| Follow-up | `action-followup-timeline-visibility.test.ts`, `action-completion-followup.test.ts`, `action-followup-visibility-*` (3 files) |
| Browser proof | `e2e/one-tent-loop-proof-never-healthy.spec.ts` (read-only never-healthy) |
| Docs | `docs/one-tent-loop.md`, `docs/one-tent-loop-evidence-handoff-audit-v1.md`, `docs/one-tent-loop-smoke-test.md`, `docs/one-tent-loop-rc-smoke-test.md` |

**Gap:** no single deterministic fixture is walked stage-by-stage with explicit handoff assertions between neighbors. Individual stages are proven; the *seams* between them are only proven pairwise.

## First broken handoff

Unknown until the stitched test runs. I will not claim a defect exists before the assertion actually fails. If the stitched run is green, this is a tests-only PR.

## Proposed scope (minimal, additive)

### New files
1. `src/test/fixtures/oneTentGoldenPathFixture.ts` — one deterministic fixture (grow → tent → plant → note → manual snapshot @ fixed timestamp, 82°F / 48% RH, medium confidence, source=`manual`). Re-exports slices already present in `demo-grow-one-tent.json` / `operatorDiaryDataset.ts` rather than duplicating them.
2. `src/test/one-tent-loop-golden-path.test.ts` — integration test that stitches the 10 handoffs through **existing** pure helpers / view-models / rule modules (Quick Log save → timeline view model → sensor snapshot presenter → AI Doctor context compiler → alert rule → action-queue suggestion rule → approval transition → follow-up linkage). Deterministic AI stub, no network.
3. `src/test/one-tent-loop-safety-regression.test.ts` — 11 safety fences: manual never renders live, stale never healthy, AI cannot auto-approve actions, alerts cannot auto-create AQ items, AQ has no device payload, duplicate handoff produces one row, cross-user isolation (static + rule-level), no service_role import in loop modules, no device-control import, no paid AI call.
4. `docs/one-tent-loop-golden-path.md` — receipt template listing which stages are proven at rule/view-model level vs. browser level, and which handoffs (if any) are documented as **honestly unsupported**.

### Files I will NOT create
- New Playwright spec — existing `e2e/one-tent-loop-proof-never-healthy.spec.ts` + `e2e/quicklog-smoke.spec.ts` already cover the browser surface; adding another authenticated E2E risks duplicating harness. I'll extend the existing spec **only** if the Vitest stitched test uncovers a browser-only handoff gap.
- New fixture JSON — reuse `fixtures/demo-grow-one-tent.json` and `src/fixtures/operatorDiaryDataset.ts`.

### Production code
Untouched unless the stitched test fails. If a narrow handoff defect surfaces, I will fix that one seam only, add a regression test, and document it in the receipt. No refactors, no schema, no RLS, no new statuses.

## Loop-stage coverage matrix (what the new stitched test asserts)

| # | Handoff | Assertion source |
|---|---|---|
| 1 | Grow→Tent→Plant ownership | fixture + `useScopedGrow` rules |
| 2 | Quick Log save value fidelity + idempotency | `quicklog` save rule + `quicklog_idempotency` contract |
| 3 | Timeline shows event once, linked to plant | timeline view-model with double-mount |
| 4 | Sensor snapshot preserves source/captured_at/tent/plant/confidence/raw_payload; never live | sensor presenter + `sensorConfidence` rules |
| 5 | AI Doctor context compiler receives stage/note/snapshot/targets | existing context compiler |
| 6 | AI Doctor output contract (12 required fields, cautious, cites evidence, no device cmd) | deterministic stub matching `aiDoctorGoldenCases` |
| 7 | Alert derived only if rules support (test tweaks a **test-owned** grow target to force deterministic breach; restores after) | alert rule |
| 8 | Alert→AQ user-initiated, one suggestion per click, approval-required, no device payload | AQ suggestion rule |
| 9 | Approval transitions grower-initiated, no auto-approve | AQ lifecycle rule |
| 10 | Follow-up linked to action + visible in timeline, no duplicate on remount | follow-up rule + timeline view-model |

## Safety regression coverage
Every fence from the task's "Safety regression tests" list gets one explicit assertion. Cross-user isolation uses the existing RLS scope helpers plus a static-import scan (no runtime DB call).

## Validation I will run
- `bunx vitest run` on the three new files + the adjacent suites listed in the task (Quick Log, Timeline, sensor, AI Doctor, alerts, AQ, follow-up, one-tent-live-proof)
- `bunx tsgo --noEmit`
- Full-suite vitest **only if** targeted + adjacent are green and time permits; otherwise reported as "not run" (per the workspace rule against overclaiming green)
- Existing Playwright spec re-run only if a browser-only handoff surfaces
- Exact pass/fail/skip counts reported

## What I need from you before writing code

1. **Confirm scope** — three new Vitest files + one doc, no new Playwright spec, no fixture duplication. OK?
2. **AI Doctor stub source** — reuse `src/fixtures/aiDoctorGoldenCases.ts` for the deterministic cautious result, or generate a fresh minimal 12-field stub inline? (Reuse is smaller and stays in sync with existing golden cases.)
3. **Alert threshold breach** — OK to nudge a test-owned `grow_targets` value in-memory (not DB) rather than fabricating an unrealistic sensor value, as the task suggests?
4. **Follow-up handoff** — if the existing contract does not auto-create a diary event on action completion, I will document it as "honestly unsupported" in the receipt rather than inventing one. Confirm that's the desired posture.

I'll proceed as soon as you say go (or adjust). No files will be written until then.
