# Verdant — V1 AI Correction Spec (Docs Only)

> **Status:** Specification only. **No implementation.** This document captures
> the future V1 scope for AI-assisted correction of manual sensor logs so the
> team can design, test, and review it before any code is written.
>
> **Owner:** Sensors + AI surface area.
> **Depends on:** Quick Log, Manual Sensor Memory, chronology delta helper,
> source labels, basic sensor timeline.

---

## 1. North Star

> Plant memory + sensor truth + cautious AI + grower-approved action.

AI Correction sits **between Sensors and AI**. In V1 its only job is:

**Help growers notice and fix their own data entry mistakes or extreme
anomalies after saving a Quick Log — using clear evidence and zero automatic
changes.**

---

## 2. Core philosophy

- The grower remains the author of the record.
- AI can **suggest** review.
- AI **cannot** silently rewrite data.
- Original values are **never lost**.
- Corrections are **low-urgency review items**, not Action Queue items.
- Corrections never trigger alerts, automation, or device control.

---

## 3. V1 Scope

### 3.1 Post-log anomaly flagging

- After a Quick Log is saved, evaluate whether `pH`, `EC`, `temp_f`, or
  `humidity_percent` moved **extremely** vs the plant's recent manual history
  (chronology-aware, source = `manual` only).
- Show a **non-blocking "Review this entry?" banner** on Plant Detail / the
  saved entry **only when**:
  - the anomaly is clear (well above per-metric noise threshold), **and**
  - it is high-impact (e.g. pH jump > ~1.0 in < 12h), **and**
  - prior history is sufficient (see 3.2 sparse-data gate).
- The banner **must show evidence**:
  - last N manual readings for the metric
  - the magnitude and time window of the jump
  - any other relevant context already on the entry (note excerpt, photo
    presence) — never invented
- Banner copy must be cautious and grower-centered. Never "wrong", "bad",
  "dangerous". Use: *"Does this look right?"*

### 3.2 Very limited typo suggestion

- Trigger **only** when a typo is structurally obvious from value and unit:
  - `pH 68` → suggest `6.8` (pH is bounded 0–14; one missing decimal)
  - `EC 160` → suggest `1.60` only when units/context make it obvious
- Must **require explicit grower approval** before any value is changed.
- Allowed even with sparse history **only** if the typo is structural
  (out-of-physical-range). Otherwise gate behind 3.1's evidence rules.

### 3.3 Deferred to V1.5: cross-source conflict detection

- Conflict detection between CSV-imported and manual readings is **V1.5**,
  after CSV import + manual sensor history are stable and have produced
  multiple weeks of real overlapping data.

---

## 4. Explicitly out of scope for V1

- ❌ No automatic rewriting of any saved value.
- ❌ No "Clean my grow history" bulk flow.
- ❌ No smoothing or back-filling of historical logs.
- ❌ No hidden edits anywhere.
- ❌ No "Apply All" / multi-entry batch acceptance.
- ❌ No correction-triggered Action Queue items.
- ❌ No device control.
- ❌ No alerts (DB row or push) created by correction logic.
- ❌ No overconfident diagnosis language ("you have lockout", "this killed your
  plant", etc.).
- ❌ No AI Doctor recommendations tied to correction suggestions yet.
- ❌ No correction of non-manual (live / CSV / demo) rows in V1.

---

## 5. Safety & trust requirements

### 5.1 Evidence first

Every suggestion must include human-readable evidence drawn from the
chronology delta helper. Example:

> "Your last 4 pH logs were **6.3–6.5**. This new log of **7.9** is **+1.4
> in 5 hours** with no noted nutrient change."

If evidence cannot be assembled, **do not show a suggestion**.

### 5.2 Confidence + uncertainty

- Render a simple confidence chip: `low`, `medium`, `high`.
- When prior history is sparse, say so explicitly:
  > "Only 2 prior manual pH logs — limited confidence."
- Never imply diagnostic certainty.

### 5.3 Original value is never lost

- On accepted correction, store both `original_value` and `suggested_value`
  on the audit record.
- Entry detail must display provenance, e.g.:
  > *Edited from **7.9 → 6.5** by you on Jun 14, following AI suggestion.*
- Original value remains visible on the entry forever.

### 5.4 Grower decides

Every correction surface must offer exactly these three actions:

1. **Keep original** (dismiss; remember dismissal for this entry)
2. **Accept suggestion** (writes correction record; original preserved)
3. **Edit manually** (opens an editor; grower types their own value;
   audit trail captures both original and final)

### 5.5 Frequency control

- High-signal only. No nagging.
- At most **one open correction suggestion per entry**.
- A plant should not display more than one active "Review this entry?" banner
  at a time on Plant Detail.
- Dismissed suggestions do not re-appear for the same entry.

### 5.6 Source labeling

Corrected readings must preserve full provenance:

- `original manual entry` (source = `manual`)
- `ai_suggestion` (source of the suggested change)
- `grower-approved correction` (who applied it and when)

Timeline / freshness card / chronology delta must read the **corrected**
value going forward but always disclose the **original** on the entry.

---

## 6. Timing gate — do not implement until ALL are true

1. Manual Quick Log is stable and published.
2. Delta logic is chronology-safe (`manualSensorChronologyDeltaRules.ts`).
3. Manual Sensor Memory freshness card is stable.
4. Source labels are visible on Plant timeline + freshness card.
5. Basic sensor timeline exists.
6. Users have **multiple weeks** of real manual and/or CSV data so the
   anomaly thresholds can be tuned on real distributions, not guesses.

If any gate is not met, do not start V1 AI Correction work.

---

## 7. Suggested future data model

> Sketch only — finalize at implementation time. Tables and column names
> below are illustrative.

### `manual_sensor_corrections` (new)

| Column                  | Type        | Notes                                      |
| ----------------------- | ----------- | ------------------------------------------ |
| `id`                    | uuid pk     |                                            |
| `diary_entry_id`        | uuid fk     | The original Quick Log row.                |
| `plant_id`              | uuid fk     | Denormalized for RLS scoping.              |
| `metric`                | text        | `temp_f` / `humidity_percent` / `ph` / `ec`|
| `original_value`        | numeric     | The value the grower first entered.        |
| `suggested_value`       | numeric \| null | Null when grower picked "edit manually". |
| `applied_value`         | numeric \| null | Null when status = `dismissed`.        |
| `correction_status`     | enum        | `suggested` / `accepted` / `dismissed` / `edited_manually` |
| `correction_reason`     | text        | e.g. "extreme_jump", "out_of_range_typo".  |
| `correction_confidence` | enum        | `low` / `medium` / `high`.                 |
| `correction_source`     | enum        | `ai_suggestion` only in V1.                |
| `evidence`              | jsonb       | Snapshot of evidence shown to grower.      |
| `suggested_at`          | timestamptz |                                            |
| `corrected_by_user_at`  | timestamptz \| null |                                    |
| `created_at`            | timestamptz | default now()                              |

### RLS

- Owner-only via plant → user. **No `service_role` in client code.**
- No client-trusted `user_id` on insert.

### Audit trail invariants

- `original_value` is **immutable** after insert.
- `diary_entry.details.manual_sensor_snapshot[metric]` may be updated to
  `applied_value`, but only via a server-side path that writes the matching
  correction row in the same transaction.
- The original value must remain reconstructable from the correction record.

---

## 8. Suggested future tests

Pure-helper / contract tests (no live AI calls in CI):

- ✅ Flags extreme pH delta with evidence (e.g. +1.4 in 5h).
- ✅ Does **not** flag normal drift (within per-metric epsilon × N).
- ✅ Does **not** suggest correction with sparse data **unless** typo is
  structurally obvious (out-of-physical-range).
- ✅ Original value remains visible after accepted correction.
- ✅ "Keep original" dismisses suggestion and does not re-surface.
- ✅ "Edit manually" preserves audit trail with both original and final.
- ✅ No `alerts` / `action_queue` / device-control writes occur on any path.
- ✅ No bulk apply surface exists (no `applyAll`, no multi-select).
- ✅ No silent mutation: every value change is traceable to a correction row
  with grower-supplied timestamp.
- ✅ Confidence is `low` when history < N prior manual logs.
- ✅ Suggestions are gated to source = `manual` only.
- ✅ Source-level safety regex: no `openai|anthropic|mqtt|webhook|relay|
  actuator|service_role|autopilot|auto-execute` in correction modules.

---

## 9. UX surface notes (non-binding)

- Banner lives **on the saved entry**, not in Quick Log itself. Quick Log
  stays a frictionless write surface.
- Banner is dismissible inline and never blocks navigation.
- Confidence and evidence are visible **before** the grower decides — never
  hidden behind a "Why?" expander on the primary path.
- Copy avoids: *wrong, bad, dangerous, critical, urgent, lockout, deficiency*.
- Copy prefers: *Does this look right? • Possible typo • Big jump vs your
  recent logs • Keep original • Use 6.8 instead • Edit manually*.

---

## 10. Recommended future implementation prompt (do NOT run now)

> Implement Verdant V1 AI Correction — post-log anomaly banner + obvious-typo
> suggestion only.
>
> Pre-flight: confirm all 6 timing gates in `docs/ai-correction-v1-spec.md`
> are met. If any gate fails, stop and report which.
>
> Scope: pure helpers first (`src/lib/manualSensorCorrectionRules.ts` +
> typo detector), then a `manual_sensor_corrections` table with RLS and
> insert-only audit trail, then a presenter-only "Review this entry?"
> banner on Plant Detail and the entry detail. Three actions only:
> Keep original / Accept suggestion / Edit manually.
>
> Hard constraints (mirrors spec §4): no auto-rewrite, no Apply All, no
> Action Queue, no alerts, no device control, no AI Doctor coupling, no
> bulk history cleanup, no smoothing, no service_role on client, no
> client-trusted user_id, no AI calls in CI tests (use fixtures).
>
> Tests: implement every case in spec §8 plus a source-level safety regex.
> Validation: full vitest suite green, plus targeted correction tests.

---

*End of spec. Implementation is intentionally deferred.*
