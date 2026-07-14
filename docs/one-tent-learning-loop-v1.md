# One-Tent Learning Loop V1

Action-to-outcome plant memory, grower-approved follow-up review, and a
Next Run Playbook. This document describes the data flow, the linkage and
truth rules, the learning-decision contract, and the safety boundary.

## Product outcome

Verdant helps the grower answer, for each completed Action Queue item:

```
What changed?            → the completed action
What evidence existed?   → readings recorded BEFORE the action (a time window)
What action did I take?  → the manually-completed action, with provenance
How did the plant respond? → the grower-recorded outcome (improved/…)
What supports that?      → readings recorded AFTER the action + photos
What remains uncertain?  → the mandatory uncertainty line, always shown
Repeat / avoid / adjust / monitor next run? → the grower's own decision
```

The journey:

```
Completed Action → Follow-up Due → Grower Records Response → Evidence Linked
→ Learning Decision → Plant Memory Episode → Grow-Level Learning Review
→ Next Run Playbook → Post-Grow Report
```

## Truth boundary (non-negotiable)

Verdant never claims an action *caused* an improvement or decline merely
because two events happened in sequence.

- Outcomes and learning decisions are **grower-entered**. Nothing infers
  them from sensor readings, alert state, or AI output.
- Copy uses "the grower recorded improvement after this action", "readings
  recorded before/after", "evidence is limited", "other factors may have
  contributed". Never "fixed", "caused recovery", "proved", "guaranteed",
  "best intervention", or automatic keeper/winner/treatment decisions.
- No effectiveness score or confidence percentage for causal effectiveness.
- No device commands, automation, MQTT/webhook writes, actuator/irrigation/
  nutrient/environment control.
- No schema, migration, RLS, auth, Edge Function, or service-role changes:
  the whole feature is derived from existing tables.

## Data flow

```
action_queue (status=completed, completed_at)
  └─ diary_entries.details.event_type = "action_followup"   (auto reminder note)
  └─ diary_entries.details.event_type = "action_outcome"    (grower response)
  └─ diary_entries.details.event_type = "run_learning_decision" (grower decision, NEW)
        │
        ▼
  plantMemoryEpisodeService.loadPlantMemoryEpisodes  (read-only, bounded)
        │  (1 action query + 1 diary query + ≤1 sensor query per tent)
        ▼
  plantMemoryEpisodeAdapter.buildPlantMemoryEpisodes (pure)
        │
        ▼
  plantMemoryEpisodeRules.buildPlantMemoryEpisode    (pure, deterministic)
        │
        ├─ outcomeFollowUpQueueViewModel  → GrowFollowUpReviewSection (GrowDetail, Reports)
        ├─ PlantMemoryEpisodeCard         → PlantDetail, GrowLearning
        ├─ growLearningReviewViewModel    → GrowLearning page (/grows/:growId/learning)
        ├─ nextRunPlaybookRules           → NextRunPlaybook
        └─ postGrowLearningLoopSummaryRules → post-grow PDF / print learning section
```

The only Supabase touchpoint is `plantMemoryEpisodeService`. Everything
else is a pure function over already-fetched rows.

## Episode linkage rules

Episodes link by **explicit references only** — never free-text similarity:

- `action_queue_id` ties follow-up / outcome / decision diary rows to their
  completed action.
- `action_outcome_entry_id` and `followup_entry_id` tie a decision to its
  outcome and follow-up.

When explicit references **disagree**, the episode is marked `needs_review`
with a deterministic, id-free warning — nothing is silently chosen, nothing
from another plant/grower is attached. Review triggers:

- action plant/grow/tent differs from a linked entry's
- two outcome (or two decision) rows for one action → surfaced, neither chosen
- outcome timestamped before action completion
- a learning decision with no outcome
- a future or unreadable timestamp
- a sensor snapshot from another tent (excluded + surfaced)

State machine: `action_completed → follow_up_due → follow_up_recorded →
outcome_recorded (more-data) / learning_decision_pending → closed`, with
`needs_review` dominating whenever a review-severity warning is present.

## Time handling

Pure rules take an injected `now` (never `new Date()` inside logic). Windows:

- follow-up due: the existing 24h product contract
  (`PENDING_OUTCOME_REVIEW_THRESHOLD_MS`).
- before-action / after-action evidence: 6h each
  (`EPISODE_BEFORE_WINDOW_MS` / `EPISODE_AFTER_WINDOW_MS`), aligned with the
  existing photo/sensor context-linking window.

Timing proximity is presented as a **time window**, never as causation.

## Sensor provenance behavior

Every sensor evidence item preserves `source`, `captured_at`, `tent_id`,
`plant_id`, `confidence`, `status`. Provenance labels: `live | manual | csv
| demo | stale | invalid`.

- `live` / `manual` / `csv` → usable evidence.
- `demo` → labeled demo, **never** usable.
- unknown provenance → `needs_review`, never presented as live.
- future `captured_at` → invalid.
- `invalid` is never usable; `stale` is never presented as current.
- Raw payloads are excluded from the service `SELECT` and never render.
- No sensor reading changes the grower's recorded response. "Improved" is a
  grower judgment, not a sensor classification.

## Learning-decision contract

New application-level diary event (no schema change, no DB enum/column):

```ts
details: {
  event_type: "run_learning_decision";
  action_queue_id: string;
  action_outcome_entry_id: string;
  followup_entry_id: string | null;
  decision: "repeat" | "avoid" | "adjust" | "monitor";
  rationale: string | null;   // required for avoid/adjust; capped at 400 chars
  recorded_by: "grower";
  recorded_at: string;        // injected ISO
}
```

- The insert payload **omits `user_id`** — database ownership is
  authoritative.
- Validation: the outcome must exist and be grower-recorded; the decision
  must be one of the four; rationale required for `avoid`/`adjust`, optional
  for `repeat`/`monitor`; whitespace-only rationale is empty; no HTML.
- **No automatic promotion**: an improved outcome may still be `monitor`; a
  worsened outcome may still be `adjust`. The grower always chooses.

## Idempotency & conflict handling

One current decision per action/outcome pair:

- probe existing decisions by explicit reference;
- exactly one → **update** it (grower edit), never a silent duplicate;
- two or more → refuse with `needs_review`; nothing is deleted or chosen.

## Report behavior

The post-grow report/PDF gains a bounded learning section (repeat / avoid /
adjust / open questions / evidence-quality notes + counts + a non-causal
caveat), threaded through the builders' optional options — never a required
view-model field. It renders id-free line fields only, is capped at 20 items
per section, and reuses the existing sanitized-report behavior. Existing PDF
anchors, section labels, and tests are unchanged.

## Timeline behavior

`action_followup`, `action_outcome`, and `run_learning_decision` render as
distinct, labeled, linked entries — "Follow-up check", "Grower-recorded
outcome", "Next-run learning decision" — never collapsed into generic notes.
Rows expose only friendly enum fields (decision label, outcome status) and
route-helper back-links ("View original action", "View full learning
episode"); raw join ids never appear as text.

## Limitations

- Checkpoint copy is observational; no causal effectiveness is asserted or
  scored.
- The follow-up "due" signal uses the existing 24h contract; it is not a
  per-metric adaptive window.
- Sensor evidence is contextual only; its absence produces an honest
  "evidence is limited" state, never a hard failure and never a demo row.

## Rollback path

Every artifact is additive and read-shaped:

- Revert the feature commits — no schema/RLS/migration to undo.
- Existing `action_outcome` / `action_followup` diary entries remain valid.
- Any `run_learning_decision` diary rows already written stay as inert diary
  entries (they render as a labeled timeline note); nothing depends on them.
- The Action Queue, alerts, and device layers are never touched.
