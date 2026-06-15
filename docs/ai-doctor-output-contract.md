# AI Doctor Output Contract

AI Doctor is a read-only advisor. It produces structured output for grower review.
It must never execute actions, control devices, or claim certainty it cannot justify.

## Required output fields (all 8, every session)

1. **confidence** — `low | medium | high`. Reflects evidence strength.
2. **evidence** — Bullet list of concrete observations used (entries, photos, snapshots, targets). Each item cites its source state (demo/manual/live/stale).
3. **missing_info** — Bullet list of what is needed to raise confidence. Populated whenever confidence is `low` or `medium`.
4. **immediate_action** — Single safest next step a grower can take in <10 minutes. May be "observe and re-check".
5. **do_not_do** — Explicit list of actions the grower should avoid right now (e.g., "do not increase feed strength", "do not defoliate").
6. **check_24h** — What to look at in 24 hours to confirm direction.
7. **plan_3day** — Conservative 3-day plan, written as observations/checkpoints, not commands.
8. **risk_level** — `low | medium | high`. Drives Action Queue framing if a draft is created.

## Confidence rules

- `high` requires ≥3 corroborating evidence items, at least one fresh (`live` or `manual` within 24 h) sensor snapshot, and no contradicting `stale`/`invalid` signals.
- `medium` requires ≥2 evidence items with at least one fresh snapshot OR a clear visual indicator with diary support.
- `low` is the default when context is thin, conflicting, or sensor data is stale/invalid. `missing_info` MUST be populated.

## Evidence requirements

- Each evidence item is short and verifiable.
- Each item is tagged with its source state.
- Demo data may be cited only in demo sessions and must be tagged "(demo)".

## Missing info rules

- Always populated for `low` confidence.
- Populated when any required input is `stale` or `invalid`.
- Examples: "humidity reading is stale (>15 min)", "no photo in last 48 h", "no defined VPD target for current stage".

## Risk level rules

- `high` → strongly suggest grower attention; recommend conservative `immediate_action`.
- `medium` → suggest re-check window; avoid aggressive recommendations.
- `low` → observation-focused plan.

## `do_not_do` behavior

- Always present. Even a healthy plant gets at least one entry (e.g., "do not change schedule based on a single reading").
- Bias toward stability for autoflowers: avoid aggressive nutrient swings, heavy defoliation, transplant.

## Hardware diagnosis prohibition

AI Doctor MUST NOT claim a specific hardware device, controller, relay, or partner product has failed.

- **Allowed phrasing**:
  - "Sensor data is stale."
  - "Humidity data is missing."
  - "More context is needed before changing the environment."
- **Forbidden phrasing**:
  - "Your controller failed."
  - "Your fan relay is broken."
  - "Your AROYA/SensorPush/AC Infinity device is malfunctioning."
  - Any claim blaming partner hardware.

## No action outside the Action Queue

AI Doctor may produce a draft suggestion. It must not:

- Send device commands.
- Invoke webhooks that mutate state.
- Auto-create approved actions.
- Trigger automation paths.

Any actionable output flows through the Approval-Required Action Queue.

## No certainty from a single signal

A single photo or single reading is never sufficient for `high` confidence.
Diagnoses from one input must be `low` or `medium` with populated `missing_info`.

## Imported history safety

Imported CSV/XLSX sensor history is **background only** — never live
telemetry. The safety contract for AI Doctor's handling of imported
history is documented and QA-tracked separately:

- Runbook: [`runbooks/ai-doctor-imported-history.md`](./runbooks/ai-doctor-imported-history.md)
- QA checklist: [`qa/ai-doctor-imported-history-safety-checklist.md`](./qa/ai-doctor-imported-history-safety-checklist.md)
- Release note: [`releases/ai-doctor-imported-history-safety.md`](./releases/ai-doctor-imported-history-safety.md)

This is documentation, QA, and safety validation only — no new AI
diagnosis behavior shipped.

## Action Queue suggestion preview

The Action Queue suggestion preview is a read-only, context-only
presenter embedded inside the AI Doctor readiness panel. It tells the
grower whether the current context is sufficient to later support a safe,
approval-required Action Queue suggestion.

What it does:
- Evaluates eligibility based on current live/manual sensor readings and
  plant/tent/stage context.
- Shows deterministic status chips (`eligible`, `needs_current_reading`,
  `missing_context`, `blocked_invalid_data`, `blocked_device_command_risk`).
- Lists missing context fields and invalid/unknown telemetry fields
  explicitly so growers know what to add or review.
- Renders conservative suggested copy and safety notes
  (`Approval required`, `No device control`, `Preview only`).

What it does NOT do:
- **Never creates an Action Queue row.**
- **Never calls Supabase, Edge Functions, or any model.**
- **Never emits executable device commands.**
- **Never promotes imported CSV history to live telemetry.**
- **Never classifies invalid or unknown telemetry as healthy.**

Eligibility rules:
- `eligible` requires plant context (plant, tent, stage) AND at least one
  current live or manual sensor snapshot.
- `needs_current_reading` is returned when only imported CSV history is
  available. Imported history is treated as background only.
- `missing_context` is returned when plant, tent, or stage is absent.
- `blocked_invalid_data` is returned when critical telemetry is flagged
  invalid or unknown.
- `blocked_device_command_risk` is returned when candidate suggestion text
  matches device-command patterns (e.g. "turn on", "pump", "dose",
  "setpoint", "mqtt publish").

UI safety boundaries:
- Safety notes always include: `Approval required`, `No device control`,
  `Preview only — no Action Queue item is created.`
- Suggested copy is conservative and avoids nutrient, irrigation, and
  equipment-control language.
- A UI-level `isUnsafePreviewText` filter drops any string containing
  `approved`, `queued`, `executed`, `turn on/off`, `pump`, `dose`,
  `set temp`, `set humidity`, or `mqtt publish` before it reaches the DOM.
- The preview card is a `<section>` with `aria-labelledby` and
  `aria-describedby`, including a `role="status"` screen-reader summary.
- No `<button>` elements are rendered inside the preview card.

Validation:
- Helper tests: `src/test/ai-doctor-action-suggestion-preview-rules.test.ts`
- Presenter tests: `src/test/ai-doctor-action-suggestion-preview-panel.test.tsx`
- Known good results: 27/27 helper + presenter tests pass; 38/38
  imported-history + readiness regression tests pass.

See also:
- Runbook: `runbooks/ai-doctor-imported-history.md`
- QA checklist: `qa/ai-doctor-imported-history-safety-checklist.md`
- Release note: `releases/ai-doctor-imported-history-safety.md`
