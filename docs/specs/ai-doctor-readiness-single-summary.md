# AI Doctor readiness — one summary, provenance on demand

Status: DRAFT spec. No implementation in this slice. Author: Claude, 2026-11-03.
Base: `verdant-grow-diary` at `cd0fe0cd4353c0145eae9d1855b54427240c1f3a`.
Trigger: live read-only workflow audit, 2026-11-03, finding 3 ("Readiness statements require
mental reconciliation"). The audit did not record the served `/version.json` SHA, so its
screen observations are `source claim` against an unknown build; the source facts below are
`established fact` at the base SHA.

## 1. Problem

A grower on Plant Detail → AI review needs one answer: **can I use this context, what is
missing, and what should I do next?** Today the section answers five times, from five rule
sets, and the answers can disagree on the same screen.

| # | Surface (mounted in `src/pages/PlantDetail.tsx` ~L1035–1068) | Rule source | Vocabulary shown |
| - | --- | --- | --- |
| A | `PlantDetailAiDoctorContextReadinessMount` → `AiDoctorContextReadinessPanel` | `src/lib/aiDoctorReadinessViewModel.ts` (`classifyState` via `assessContextStrength`) | 5 states incl. "Ready for cautious check-in"; 3 confidence classes; a local "Preview only — not saved." result with confidence band and an action-suggestion preview |
| B | `PlantDetailTimelineEvidenceReadinessLaunch` | `src/lib/timelineEvidenceReadinessViewModel.ts` | timeline evidence readiness |
| C | `PlantDetailAiDoctorLiveReview` (run gate) | `src/lib/aiDoctorContextRules.ts` `evaluateAiDoctorContext` (strong/partial/insufficient) + `src/lib/aiDoctorReviewEligibilityRules.ts` (blocked/standard/historical_review) | "Context is partial — review may have limited confidence." / "Context is strong enough for a cautious review." |
| D | `PlantDetailAiDoctorContextPanel` | `src/lib/aiDoctorContextReadStateRules.ts` + `READINESS_STYLES[result.readiness]` | strong/partial/insufficient badge |
| E | Overview `SensorSnapshotCard` | `src/components/SensorSnapshotCard.tsx:80` | "No sensor snapshot available." |

Measured disagreements (`established fact`, source-level):

- **Different "good enough" bars.** A reaches `ready` with trustworthy sensors + recent events.
  C reaches `strong` only with profile, stage, known plant type, ≥2 recent events, a fresh
  manual snapshot, photo or water/feed, **and** root-zone history (`aiDoctorContextRules.ts`
  readiness block). So A can say "Ready for cautious check-in" while C says "Context is partial".
- **Different sensor scopes.** E is plant-scoped; A/C read assigned-tent manual readings
  (`plantAiDoctorContextAdapter.ts` "Project assigned-tent manual `sensor_readings`"). The
  mount explains this in a small scope paragraph (`PlantDetailAiDoctorContextReadinessMount.tsx`
  ~L287), but the overview still says no snapshot.
- **A diagnosis-shaped preview before any review.** A renders a locally generated summary,
  immediate action, confidence band and action-suggestion preview before the grower runs a
  review. It is labelled "Preview only — not saved." but sits beside the real run gate.

## 2. Requirements

R1. Exactly one **readiness summary** sits at the top of the AI review section, above every
existing panel. It states one verdict, one sensor-truth line, the missing items, and one next
step.

R2. The summary is **never more optimistic than the run gate** (C). If the gate blocks, the
summary says not ready. The gate's behavior, thresholds and copy are unchanged by this spec.

R3. The verdict is the **worst of** its inputs (§3). Agreement is required for "ready".

R4. Demo, stale and invalid sensor data are never summarised as ready or healthy. Unknown is
shown as unknown (AGENTS.md §4, §6).

R5. The sensor-truth line names scope, source and age in one sentence, for example
"Tent readings from Flower · Manual · 3 h ago". Scope is always named: plant or assigned tent.

R6. Missing items are ordered by cultivation priority: environment → root zone / watering →
feeding → stage/profile → photo. At most three are shown; the rest are under provenance.

R7. Existing panels A–D move into one collapsed **"How this was decided"** disclosure,
unchanged in content. Nothing is deleted in this slice.

R8. Pure and deterministic: a new `src/lib/aiDoctorReadinessSummaryRules.ts` consumes the
**already-computed outputs** of A and C. No new hooks, queries, Supabase calls, model calls,
credit use, alerts or Action Queue writes. `now` is injected; no `Date.now()`.

R9. Copy lives in `src/constants/aiDoctorReadinessSummaryCopy.ts` (`as const`).

## 3. Verdict rules

Inputs: `gate` = eligibility mode; `ctx` = C readiness; `view` = A state.

| Order | Condition | Verdict | Headline |
| - | --- | --- | --- |
| 1 | `gate === "blocked"` or `ctx === "insufficient"` | `not_ready` | "Not enough recent context to review yet." |
| 2 | `view === "demo_only"` | `limited` | "Only demo sensor data. A review won't treat it as real readings." |
| 3 | `view === "telemetry_limited"` | `limited` | "Sensor readings are stale or invalid. A review can run but can't rely on them." |
| 4 | `gate === "historical_review"` | `limited` | "Review would use imported history only, not current readings." |
| 5 | `ctx === "strong"` and `view === "ready"` | `ready` | "Ready for a cautious review." |
| 6 | anything else, including null/unknown inputs | `limited` | "A review can run, with limited confidence." |

Rows are evaluated in order; first match wins. A null or unrecognised input never yields
`ready`.

Next step: the first missing item from R6, as one plain action ("Add a manual tent reading",
"Log the last watering"). When `ready`, the next step is the existing Start review control.

## 4. Founder decisions (Matthew, 2026-11-03)

D1. **Local preview in A: keep, collapsed.** The local "Preview only — not saved." result and
its action-suggestion preview stay inside the collapsed "How this was decided" disclosure,
unchanged. They are not removed.

D2. **Overview card E: approved as a separate later slice.** When the plant has no plant-level
snapshot but its assigned tent has readings, the overview says "No plant snapshot. Tent
readings are used in AI review." It is not in the implementation slice of §6; it gets its own
spec addendum, tests and PR.

## 5. Out of scope

Run-gate thresholds, the AI Doctor Edge function, provider/model, credits, entitlements,
schema/RLS/migrations, Action Queue, device control, other pages (`/ai-doctor` start page,
Timeline), and Quick Log.

## 6. File-level plan (implementation slice, separate PR)

- New: `src/lib/aiDoctorReadinessSummaryRules.ts`, `src/constants/aiDoctorReadinessSummaryCopy.ts`,
  `src/components/AiDoctorReadinessSummary.tsx` (presenter only).
- Change: `src/pages/PlantDetail.tsx` AI section: summary first, panels A–D inside one
  disclosure. Lift the already-computed A view and C context/eligibility through props or a
  shared memo; no duplicate hook calls.
- Tests: `src/test/ai-doctor-readiness-summary-rules.test.ts`,
  `src/test/ai-doctor-readiness-summary-plant-detail.test.tsx`.
- Expected pin renegotiation (same commit, named in PR body): tests that assert panel order or
  visibility on Plant Detail, e.g. `ai-doctor-readiness-ui-v1-5.test.tsx`,
  `plant-detail-ai-doctor-medium-pot-provenance.test.tsx`. Copy pins in A and C stay unchanged.

## 7. Acceptance tests

1. Each row of §3 with the minimal input that reaches it; row order respected when several match.
2. Never more optimistic than the gate: for every combination of `gate` × `ctx` × `view`
   (3 × 3 × 5 = 45), `blocked` or `insufficient` ⇒ `not_ready`; `ready` only for row 5.
3. Null, undefined and unknown strings for each input ⇒ not `ready`.
4. Demo, stale and invalid ⇒ never `ready`, and the sensor line shows the source label.
5. Sensor line names scope, source and age; missing age renders "age unknown", never "now".
6. Missing items: priority order per R6, max three, deterministic tie-break by code.
7. Determinism: same inputs and `now` ⇒ deep-equal output across repeated calls.
8. Plant Detail renders exactly one summary element before the disclosure; panels A–D render
   inside it and are reachable by keyboard; the disclosure starts collapsed.
9. Safety fences: the rules module imports no React or Supabase, calls no clock, and the
   summary component triggers no fetch, model call, credit call or Action Queue write.
10. Each new test shown RED before the change, count in the PR body.

## 8. Known unknowns

- `NOT_MEASURED`: which production build the audit saw, and whether surface B also contributed
  the audit's "Strong" sensor-context label. Confirm on the live build before implementation.
- `NOT_MEASURED`: mobile layout of the collapsed disclosure.
- `missing evidence`: grower testing of the headline copy.

## 9. Collision check (2026-11-03)

Open-PR file lists were diffed against their merge base for `PlantDetail.tsx`, `aiDoctor*`,
`AiDoctor*` and `*readiness*`. Overlap: #2805 (photo viewer captions) changes
`src/pages/PlantDetail.tsx`, outside the AI section; the implementation slice should wait for
it to merge or rebase on it. #2807, #2802, #2799, #2795, #2794 and #2793 show no overlap.
`NOT_MEASURED`: the file lists of #2782, #2775, #2757, #2752, #2751, #2744, #2743, #2741 and
#2732 (fetch timed out); their titles are cultivar, CSV, MQTT, EcoWitt, dashboard-mobile and
onboarding work. Re-check all open PRs before the implementation branch is cut.
