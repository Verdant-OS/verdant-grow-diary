# One-Tent Loop Evidence Handoff Audit v1

**Scope:** Timeline → AI Doctor → Alert → approval-required Action Queue.
**Mode:** Read-only audit. No schema/RLS/Edge/migration/auth changes. No
automation, no device control, no automatic writes.
**Status:** PASS WITH FOLLOW-UPS (no stop-ships found in the pure handoff
layer; gaps are documented below).

---

## 1. Loop summary (current code)

```text
Timeline event (diary / photo / manual snapshot / sensor reading)
        │
        │  plant_id, tent_id, grow_id, source preserved
        ▼
Normalized sensor reading        (src/lib/sensorReadingNormalizationRules.ts)
        │  source ∈ {live, manual, csv, demo, stale, invalid, imported}
        ▼
AI Doctor sensor context         (src/lib/aiDoctorSensorContextRules.ts)
        │  isStale, isInvalid, confidenceImpact, usable/missing/invalid metrics,
        │  safetyNotes — never claims certainty from one reading
        ▼
AI Doctor context compiler       (src/lib/aiDoctorContextCompiler.ts,
        │                         aiDoctorContextViewModel.ts,
        │                         aiDoctorReadinessViewModel.ts)
        │  source-trust badges; missing context surfaces instead of guesses
        ▼
Alert candidate / persisted alert (src/lib/alerts.ts, environmentAlerts.ts,
        │                          alertReadingSourceRules.ts)
        │  invalid/stale/demo cannot be classified as healthy
        ▼
Alert → Action Queue handoff     (src/lib/alertActionQueueHandoffRules.ts,
        │                         alertToActionQueueRules.ts,
        │                         aiDoctorSessionToActionQueueRules.ts)
        │  Every output is pending_approval and non-executable.
        ▼
Action Queue suggestion (review) (src/lib/actionQueueViewModel.ts,
                                   actionQueueTransitions.ts,
                                   ActionQueueDetailDrawer.tsx)
        Approve → ApprovedQueuedAction { status: "queued_non_executable" }
        Reject  → RejectionRecord     { rejectedBy: "grower" }
```

The handoff is implemented as **pure modules with no I/O, no `supabase.*`
calls, no `fetch`, no React, no hooks**. Persistence happens only at the
Action Queue boundary via explicit, RLS-gated writes elsewhere; the
handoff rules themselves never write.

---

## 2. Timeline layer

| Question | Answer |
| --- | --- |
| Event types that carry plant/tent evidence | diary entry, photo, manual sensor snapshot, watering, feeding, sensor reading, environment check, harvest/cure events, AI Doctor check-in receipt. |
| plant_id / tent_id / grow_id preserved? | Yes — see `timelineEvidenceDetailViewModel.ts`, `timelineSensorSnapshotViewModel.ts`, `diaryTimelineViewModel.ts`. |
| Source labels surfaced in UI? | Yes — `TimelineSensorSourceBadge.tsx` + `timelineSensorSourceBadgeRules.ts` render `live / manual / csv / demo / stale / invalid` with distinct styling. |
| Demo/stale/invalid leakage as "live"? | Not observed — `sensor-safety-check.mjs` blocks "fake-live" wording across the surface. |

**Gap:** Timeline-side evidence cards rely on `source` being correct; no
runtime test currently asserts that the full chain (timeline event →
sensor context → suggestion) keeps the same `plant_id`/`tent_id` and
source label end-to-end. **Closed by** the new
`one-tent-loop-evidence-handoff.test.ts`.

---

## 3. AI Doctor layer

| Question | Answer |
| --- | --- |
| Context compilers that consume timeline/sensor evidence | `aiDoctorContextCompiler.ts`, `aiDoctorContextViewModel.ts`, `aiDoctorReadinessViewModel.ts`, `plantAiDoctorContextAdapter.ts`, `aiDoctorPhase1TimelineEvidenceViewModel.ts`. |
| Source trust + missing context preserved? | Yes — `AiDoctorSensorContext` carries `sourceState`, `sourceLabel`, `isStale`, `isInvalid`, `usableMetrics`, `missingMetrics`, `invalidMetrics`, `confidenceImpact`, `safetyNotes`. |
| Avoids certainty from single photo/reading? | Yes — every context produced by `mapSensorReadingToAiDoctorContext` includes the literal safety note "Sensor telemetry alone cannot confirm or deny plant health with certainty." Phase 1 result view-model blocks `confidence === "high"`. |
| Demo/stale/invalid downgraded? | Yes — `confidenceImpact` becomes `"reduced" | "severely-reduced" | "untrusted"`; invalid critical metrics block any healthy/normal summary. |

**Gap:** No regression that pins "demo cannot be presented as healthy"
in the chain output. **Closed by** the new chain test and the new
static safety scanner.

---

## 4. Alert layer

| Question | Answer |
| --- | --- |
| Candidate vs. persisted alerts? | Candidates live in `environmentAlerts.ts` rules; persisted shape is `AlertLike` (`alertToActionQueueRules.ts`). UI separates review vs. persisted via `AlertsAutoPersistForGrow.tsx` + `alertStatusTransitionRules.ts`. |
| Auto-classified as healthy when invalid/stale/demo? | No — `alertReadingSourceRules.ts` and `alertFreshnessContext.ts` carry source and freshness into the alert; invalid telemetry caps recommendation risk and forces caution notes. |
| Automatic alert creation? | Persisted alert writes flow through explicit RLS-gated paths; no automation from raw readings in the pure rules layer. |

**Gap:** None new — the chain test now asserts invalid telemetry forces
`riskLevel === "low"` and adds an "invalid telemetry" caution before any
suggestion ever leaves the handoff.

---

## 5. Action Queue layer

| Question | Answer |
| --- | --- |
| Handoff path | `alertActionQueueHandoffRules.createActionSuggestion` (pure), then `approveSuggestion` / `rejectSuggestion`. `aiDoctorSessionToActionQueueRules.ts` covers the AI-Doctor-origin path. |
| Approval-required? | Yes — every `ActionSuggestion` is created with `status: "pending_approval"`; `ApprovedQueuedAction.status` is the literal `"queued_non_executable"`. `approvalNote` records grower intent. |
| Automatic execution / device control? | None in the handoff rules. `STANDARD_DO_NOT_DO` explicitly forbids it: "Do not command or control any hardware devices." |
| Command payload / setpoint fields? | None on `ActionSuggestion` or `ApprovedQueuedAction`. |

**Gap:** No single test pinned the "no command payload / no setpoint /
approval-required" invariants together. **Closed by** the new chain test.

---

## 6. Cross-cutting findings

1. **Evidence IDs.** `ActionSuggestion` carries `originatingAlertId` and
   `sensorContextId`. Timeline event IDs are *not* threaded through the
   handoff rules directly; today they live in the alert's `reason` /
   audit note. No regression — but worth tracking in a future slice.
2. **Source labels.** Carried via `sourceContext.sourceLabel` +
   `sourceContext.sourceState`. Test now pins both.
3. **Fallback copy.** When `sensorContext` is omitted, the handoff
   builds a conservative default and still emits the
   "telemetry alone cannot confirm or deny plant health" note.
4. **Unsafe wording.** None found in the handoff modules. Static
   safety scanner added to keep it that way.

---

## 7. New regression coverage (this slice)

- `src/test/one-tent-loop-evidence-handoff.test.ts` — fixture-driven
  Timeline → Sensor Context → Suggestion → Approval/Rejection chain.
  Pins plant/tent IDs, source labels, stale/invalid behavior,
  approval-required status, no command/setpoint/device fields,
  determinism given the same fixture.
- `src/test/one-tent-loop-evidence-handoff-static-safety.test.ts` —
  scans the pure handoff modules (no Supabase, no fetch, no automation
  verbs, no "guaranteed/definitely/certain diagnosis", no
  "healthy" near "invalid/stale/demo/unknown/untrusted"). Negation
  clauses ("do not ...", "never ...") are intentionally allowed.

---

## 8. Out of scope (deferred)

- Schema / RLS / migration / Edge Function changes.
- Wiring a timeline-event-id field into `ActionSuggestion`.
- New UI surfaces beyond the existing presenters.
- Any change to alert persistence or write paths.

---

## 9. Safety verdict

**PASS.** Pure handoff layer is approval-required, non-executable,
source-truthful, and deterministic. New tests pin those invariants.
