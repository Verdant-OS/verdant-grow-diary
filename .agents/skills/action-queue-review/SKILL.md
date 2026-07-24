---
name: action-queue-review
description: Summarizes pending, approval-required items in the grower's Action Queue (sourced from AI Doctor suggestions, alerts, and diary follow-ups) into a reviewable list, then asks the grower to approve, edit, defer, or dismiss each one before it becomes part of the weekly log. Use when the grower asks "what's in my Action Queue?", "review my pending actions", "what needs my approval?", "approve my actions for the week", or after a batch of AI Doctor sessions or alerts has produced new suggestions.
---

# Action Queue Review

Grower-decides review layer for the approval-required Action Queue. Turns a pile of pending suggestions into a short, structured review where the grower approves, edits, defers, or dismisses each item. **Nothing is auto-approved. Nothing is executed. No device commands. Ever.**

## When to activate

- Grower asks: "what's in my Action Queue?", "review pending actions", "what needs my approval?", "approve actions for this week", "clean up my queue".
- After a session that produced new suggestions (AI Doctor completion, alert acknowledgment, `nutrient-schedule-assistant` output).
- Manually via `/` in chat.

Do **not** activate on plants/tents the grower does not own (RLS enforces this; the skill also respects it).

## Inputs (read-only)

Pull only through existing seams:

1. **Pending queue items** — `action_queue` rows where `status` ∈ pending/approval-required, scoped by `auth.uid()` via RLS. Include `reason`, `risk_level`, `related_alert_id`, `related_plant_id`, `related_tent_id`, `suggested_at`, `source` (ai_doctor | alert | diary_followup | manual), and any linked evidence.
2. **Originating context** — for each item, the source AI Doctor session (`useAiDoctorSessions`), alert (`alerts` + `alert_events`), or diary entry (via normalized `growDiaryTimelineRules`). Never read raw `details` jsonb.
3. **Latest sensor snapshot** for the related plant/tent, respecting the six-label vocabulary (`live | manual | csv | demo | stale | invalid`). Stale/demo/invalid readings are shown with their label; they never justify an approval on their own.

Anything missing = **missing_info**, surfaced to the grower — never guessed.

## Grouping & ordering

Deterministic, stable sort:

1. **Risk level** — `critical` → `high` → `medium` → `low`.
2. **Freshness of evidence** — items backed by fresh (`live` / recent `manual`) readings before items backed only by stale/demo evidence.
3. **Age of suggestion** — oldest first within a risk tier (avoid burying a week-old ask under new noise).
4. **Grouped by plant, then tent** so the grower reviews one plant's stack together.

Cap the review at the top **10 items** per pass; tell the grower how many more remain.

## Per-item summary contract

For each pending item, render exactly:

1. **Title** — one short line (e.g. "Reduce feed EC to 1.6 for next watering").
2. **Plant / tent** — names, not IDs. If unknown, say "Unassigned".
3. **Source** — `AI Doctor` | `Alert` | `Diary follow-up` | `Manual` — plus timestamp.
4. **Reason** — one sentence, quoted from the originating suggestion.
5. **Evidence** — bullet list, each item cites a diary timestamp or a snapshot reading with its provenance label. If the only evidence is `demo` / `stale` / `invalid`, say so explicitly.
6. **Risk level** — `low | medium | high | critical`, as stored.
7. **What it changes** — describe the *log/reminder* effect only (e.g. "adds a feeding reminder for tomorrow", "creates a follow-up observation entry"). **Never** describe device actuation.
8. **Missing info** — anything that would raise confidence (e.g. "no runoff EC logged since last feed").
9. **Grower decision prompt** — offer four choices, no default:
   - **Approve** — item moves into the weekly log as approved; still no device command.
   - **Edit** — grower adjusts wording, timing, target value; then approve or defer.
   - **Defer** — snooze with a required "recheck after" observation (e.g. next trichome check, next runoff reading).
   - **Dismiss** — remove with a one-line reason kept in the audit trail.

## Weekly log framing

After per-item decisions, produce a **Weekly Log Preview** section:

- **Approved this pass** — count + one-line list, grouped by plant.
- **Edited** — count + short diff (original → edited).
- **Deferred** — count + the recheck trigger for each.
- **Dismissed** — count + reason.
- **Still pending (beyond the 10-item cap)** — remaining count only.
- **Coverage note** — "This preview reflects the grower's decisions only. Nothing has been sent to any device. Nothing runs automatically."

The weekly log entry itself is written only when the grower confirms the preview. Until then, decisions are a draft.

## Hard rules

- **Approval-required is inviolable.** Never auto-approve, never bulk-approve without an explicit grower confirmation for that exact batch.
- **No device control, no `functions.invoke` for actuation, no MQTT/relay/pump wording.** Suggestions describe log entries and reminders, not equipment commands.
- **No writes from this skill directly.** It composes the review; the existing Action Queue mutation path (grower-initiated, RLS-scoped) performs the state change. No `service_role`. No bypassing RLS.
- **Provenance honesty.** `demo`, `stale`, `invalid`, unknown-source readings are labeled as such and never inflate confidence.
- **No new alerts, no new AI calls** are produced by this skill — it only reads existing suggestions and organizes them.
- **Idempotent review.** Re-running the skill on the same queue must produce the same grouping and the same item IDs; no shuffling, no duplicate creation.
- **Copy voice.** Calm, grower-first, no urgency theatre. Say "needs your decision", not "act now".
- If the queue is empty, respond "Action Queue is clear — no pending items need your review" and stop. Do not invent items.

## Non-goals

- Not an execution engine.
- Not a diagnosis engine (that's AI Doctor).
- Not a schedule builder (that's `nutrient-schedule-assistant`).
- Not a notification system — the grower opens this skill; it does not push.
