---
name: action-queue-audit-trail
description: Renders a read-only, provenance-labeled audit trail for a single Action Queue item — showing exactly why it was suggested, which diary events, sensor snapshots, alerts, or AI Doctor sessions fed the suggestion, each with its six-label provenance, timestamps, and every subsequent grower decision (approve/edit/defer/dismiss). Use when the grower asks "why was this suggested?", "where did this come from?", "show the audit trail", "what evidence backs this action?", or when a suggestion is disputed.
---

# Action Queue Audit Trail

Per-item forensic view for the Action Queue. Answers one question honestly: **"Why is this here, and where did the evidence come from?"** Never rewrites history, never edits the item, never invents evidence, never contradicts what the source records actually said.

## When to activate

- Grower asks: "why was this suggested?", "where did this come from?", "show the audit trail", "what's the evidence?", "who added this?".
- Grower disputes a suggestion or is about to dismiss one and wants context first.
- Opened from within `action-queue-review` for a single item drill-down.
- Manually via `/` in chat.

Scope: **one Action Queue item per invocation.** If the grower asks about the whole queue, redirect to `action-queue-review` and offer to open the audit trail for a specific item.

## Inputs (read-only, existing seams only)

1. **The Action Queue row** — `action_queue` + `action_queue_events` for that item, RLS-scoped. Read every column that already exists: `reason`, `risk_level`, `source`, `suggested_at`, `related_alert_id`, `related_plant_id`, `related_tent_id`, `related_ai_doctor_session_id`, `status`, and the full `action_queue_events` history (each state change with actor + timestamp).
2. **Origin record** — depending on `source`:
   - `ai_doctor` → `ai_doctor_sessions` row (summary, likely_issue, confidence, evidence, missing_info, model tier, timestamp).
   - `alert` → `alerts` + `alert_events` (rule that fired, threshold, first/last triggered).
   - `diary_followup` → the normalized diary event via `growDiaryTimelineRules`.
   - `manual` → the grower's own note + timestamp.
3. **Evidence trail** — the specific diary events, feedings, waterings, observations, photos, and sensor snapshots the origin record cited. Read via existing hooks; never touch raw `details` jsonb.
4. **Sensor snapshots cited** — classified through `sensorSnapshot.ts` with the six-label vocabulary (`live | manual | csv | demo | stale | invalid`). Every reading is rendered with its label — no exceptions.
5. **Grow / tent / plant** records for names (never IDs) and stage/age at the time of suggestion.

Anything missing = a **Missing evidence** row in the trail — never guessed, never backfilled.

## Rendered structure

Fixed sections, in this exact order:

### 1. Item header
- Title of the queue item (verbatim from stored `reason`).
- Plant / tent (names) and stage/age at time of suggestion.
- Current status: `pending | approved | edited | deferred | dismissed`.
- Risk level as stored.
- Suggested at (grower-local time) + who/what added it (`AI Doctor` / `Alert rule <name>` / `Diary follow-up` / `Manual — <grower>`).

### 2. Origin summary
One short paragraph, quoted from the origin record. No paraphrase. If the origin was AI Doctor, include its stated **confidence** and its **missing_info** list verbatim.

### 3. Evidence chain
Chronological list (oldest → newest), each row:
- **When** — event timestamp, grower-local.
- **What** — event type + one factual detail (e.g. "Feeding — 1.4 EC, pH 6.1, 800 ml").
- **Source** — which table/record it came from.
- **Provenance label** — for any sensor reading, one of the six labels, styled distinctly for `demo | stale | invalid`.
- **Role in the suggestion** — one sentence explaining how this row fed the reason (e.g. "Cited by AI Doctor as evidence of over-feeding trend").
- If the origin cited a reading that was `demo | stale | invalid`, flag it: **"This reading was labeled `<label>` at the time and should not be treated as live evidence."**

### 4. Missing evidence
Explicit list of anything the origin *asked for* but wasn't present when the suggestion was made — e.g. "AI Doctor requested runoff EC; none logged in the 48h before suggestion." This is not blame; it explains why confidence was what it was.

### 5. Decision history
Every `action_queue_events` row, chronological:
- Timestamp, actor, action (`suggested | approved | edited | deferred | dismissed | reopened`).
- For `edited`: show the diff (original → edited text, original → edited target value).
- For `deferred`: show the recheck trigger.
- For `dismissed`: show the grower's one-line reason.
- For `approved`: note explicitly "No device command was sent. This moved the item into the weekly log only."

### 6. Integrity notes
Short, factual:
- "Audit trail is read-only. Nothing in this view can be edited from here."
- If any cited record has since been deleted or is no longer visible under current RLS, say so plainly ("Original AI Doctor session no longer available") — do not silently omit.
- Report ID: deterministic hash of `action_queue.id` + last `action_queue_events.id` so the same trail state produces the same ID.

### 7. Next steps (grower-decides, optional)
Offer only navigation, never mutation:
- "Open the source AI Doctor session" (link).
- "Open the source alert" (link).
- "Open this plant's diary at [timestamp]" (link).
- "Review this item in the Action Queue" (opens `action-queue-review` scoped to this item).

## Hard rules

- **Read-only.** No writes to any table. No `functions.invoke` for mutations. No status changes from this view. No AI model calls. No new alerts.
- **No device control.** Ever.
- **No paraphrase of origin records.** Reason, evidence, missing_info, confidence, and grower notes are quoted verbatim from storage. If the stored copy is awkward, that is data, not something to smooth over.
- **Provenance honesty is absolute.** Every sensor reading is labeled. `demo | stale | invalid` are visually distinct and never counted as live evidence. Unrecognized source strings render as "Unverified source", never "Live sensor".
- **No cross-grower data.** RLS-scoped reads only. Never surface another user's rows, even if joined through an alert or session ID.
- **No secrets, no IDs in URLs, no raw `details` jsonb, no service_role.** Grower privacy is inviolable.
- **No retroactive rewriting.** If a diary event was later corrected, show both the value at time of suggestion and the current value, side by side — never overwrite history in the trail.
- **Deterministic + idempotent.** Same item + same event history = same trail, same order, same Report ID.
- **No motivational or blame copy.** Neutral, factual, grower-first. "This reading was `stale`" — not "you let the sensor go stale".
- **Handle deleted records gracefully.** Missing origin → "Original record no longer available"; never fabricate a plausible-looking origin.

## Non-goals

- Not an editor for Action Queue items (that's `action-queue-review`).
- Not a diagnosis engine (that's AI Doctor).
- Not a bulk audit-log export (that's a separate exports feature; if the grower asks for a queue-wide CSV, point them there).
- Not a moderation or admin tool — this is the grower's own view of their own item.
- Not a push notification surface.
