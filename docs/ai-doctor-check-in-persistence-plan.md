# AI Doctor Check-In Persistence Plan

Status: Planning / audit only. No runtime code, no schema, no RLS, no Edge
Function, and no write implementation are introduced by this document.

## 1. Summary

Verdant currently produces a deterministic, read-only AI Doctor "Check-In"
preview on the Plant Detail screen. The grower can copy the receipt to the
clipboard but nothing is saved, no live model is called, and no Action Queue
items or alerts are created.

This document plans the safest V1 path for **manually** saving an AI Doctor
Check-In preview to the grow diary/timeline in a future slice. It is grower-
initiated, explicitly confirmed, clearly labeled, never auto-actioned, and
preserves all source/limitation provenance from the deterministic engine.

## 2. Current state

- `src/lib/aiDoctorEngine.ts` — pure deterministic Phase 1 engine.
- `src/lib/aiDoctorCheckInPreviewViewModel.ts` — preview-only view model.
- `src/lib/aiDoctorCheckInReceiptView.ts` — plain-text receipt formatter.
- `src/components/AiDoctorCheckInPreviewPanel.tsx` — dialog with preview +
  copy-to-clipboard receipt.
- `src/components/PlantDetailAiDoctorContextReadinessMount.tsx` — mounts the
  readiness panel and preview CTA on Plant Detail.

Hard guarantees today (verified by static-import safety tests):

- No `fetch`, no `supabase` writes, no `functions.invoke`, no `.rpc`, no
  `.insert/.update/.delete`, no alert helpers, no Action Queue mutation
  helpers, and no model client imports anywhere in the check-in surface.
- Output is deterministic for identical context.
- Preview honestly labels demo / stale / invalid telemetry.

## 3. Existing write paths found

Two diary write surfaces already exist and are RLS-safe:

### 3a. Legacy diary path — `public.diary_entries`
- Hook: `src/hooks/use-diary-entries.ts` (read).
- Writer: `src/lib/legacyQuickLogUnifiedSave.ts` (referenced by
  `diary-timeline-event-wiring.test.ts`).
- Shape: `entry_type` + flexible `details` jsonb (see
  `docs/grow-diary-architecture.md`).
- Normalized through `src/lib/diaryEntryRules.ts` →
  `src/lib/growDiaryTimelineRules.ts` before any UI render.

### 3b. Typed event path — `public.grow_events` (+ siblings)
- Hook: `src/hooks/useQuickLogV2Save.ts` → RPC `quicklog_save_manual`.
- Returns `{ ok, grow_event_id, environment_event_id }`.
- Read-back mapper: `src/lib/growEventToDiaryRawEntry.ts` re-flattens a
  grow event into the same loose shape so the existing diary timeline
  renders it without UI changes.
- This is the strategic destination per `docs/grow-diary-architecture.md`
  ("Future migration path").

### 3c. AI Doctor session table — `public.ai_doctor_sessions`
- Designed for **live AI Doctor session** records, not for cautious
  deterministic previews. Re-using it would conflate "the model spoke"
  with "the engine produced a deterministic preview". **Do not reuse.**

## 4. Event-type / category audit

`src/lib/diary.ts` `EVENT_TYPES` already includes:

- `observation` — generic observation note (fallback in `getEventType`).
- `diagnosis` — diagnostic note (rose tone, Stethoscope icon).
- `measurement` — manual snapshot / pH / EC.

`src/lib/timelineEntryClassification.ts` routes:

- `diagnosis` → `symptoms` bucket (via `SYMPTOM_EVENT_TYPES`).
- `observation` → `notes` bucket (default).

Neither vocabulary has a dedicated `ai_doctor_check_in` event_type. We have
two viable choices:

1. **Reuse `observation`** with a `details.kind = "ai_doctor_check_in"`
   discriminator. Safest. No vocabulary change. No timeline filter change.
2. **Add `ai_doctor_check_in`** to `EVENT_TYPES` + classify into `notes`.
   Slightly cleaner UI, but ripples into `EVENT_TYPES` wiring tests,
   `legacyQuickLogUnifiedSave` `SUPPORTED_LEGACY_EVENT_TYPES`, Fast Add
   actions audit, and the Plant timeline.

**Recommendation:** start with option 1 (`observation` + discriminator) for
V1. Promote to a first-class event type only after real usage data shows
the timeline needs its own filter chip.

## 5. Source / audit field availability

`diary_entries.details` jsonb can carry the labels we need without schema
changes:

```jsonc
{
  "kind": "ai_doctor_check_in",
  "engine_version": "phase1",
  "preview_only": true,            // record was a deterministic preview at save time
  "manual_save": true,             // grower-initiated, explicitly confirmed
  "deterministic_engine": true,    // produced by aiDoctorEngine, not a live model
  "no_live_ai_model": true,        // no model API was called to generate this
  "context_provenance": "live" | "manual" | "demo" | "mixed" | "unavailable",
  "limitations": ["stale_or_invalid", "demo_only", "no_sensors", ...]
}
```

`grow_events` already has a `source` column — for option 3b we would set
`source = "ai_doctor_check_in_manual_save"` and stash the rest in a notes/
details column compatible with the typed-event schema.

## 6. Idempotency / duplicate prevention

Risk: a grower clicks "Save" twice; or saves the same preview twice within
seconds; or re-opens the dialog and saves again from the same context hash.

Existing primitives:

- `public.quicklog_idempotency` table — already used by the RPC path.
- `useQuickLogV2Save` already threads an RPC that respects it.

**Required for V1:** derive an idempotency key from
`sha256(plant_id + engine_version + context_hash + receiptVersion)` and
include it in the save call. The engine output is deterministic, so the
same context → same key. Re-clicks within the same context are absorbed
server-side, not at the UI layer.

## 7. Recommended V1 save path

**Use the typed Quick Log v2 path (`useQuickLogV2Save` → `quicklog_save_manual`)
to write a single `grow_events` row** with:

- `event_type = "observation"`
- `source = "ai_doctor_check_in_manual_save"`
- `note` = the same plain-text receipt produced by
  `formatAiDoctorCheckInReceipt(...)`.
- structured details (Section 8) attached via the existing details jsonb
  channel that `growEventToDiaryRawEntry` already passes through.
- idempotency key per Section 6.

Why this path:

- Already RLS-safe and server-validated.
- Already renders in `/logs`, Plant Detail timeline, Tent Detail, Grow
  Detail via the existing normalization seam.
- Does not require a new table, new RLS, new Edge Function, or new
  migration.
- No vocabulary change in `EVENT_TYPES`, so the existing
  `diary-timeline-event-wiring.test.ts` regression stays green.

Rejected alternatives:

- **New `ai_doctor_check_ins` table** — overkill for V1, drags RLS + Edge
  Function work, and we already have a normalized diary seam.
- **Direct client insert into `diary_entries`** — bypasses the trusted
  RPC validation surface; reject.
- **Reusing `ai_doctor_sessions`** — see 3c; conflates deterministic
  preview with live-model session. Reject.

## 8. Data contract for a saved check-in

Required fields (must be saved):

| Field | Value |
| --- | --- |
| `plant_id` / `grow_id` / `tent_id` | resolved server-side from `plant_id` |
| `event_type` | `"observation"` |
| `occurred_at` | client-supplied ISO; server clamps to "now ± reasonable" |
| `source` | `"ai_doctor_check_in_manual_save"` |
| `note` | exact deterministic receipt string |
| `details.kind` | `"ai_doctor_check_in"` |
| `details.engine_version` | `"phase1"` |
| `details.preview_only` | `true` |
| `details.manual_save` | `true` |
| `details.deterministic_engine` | `true` |
| `details.no_live_ai_model` | `true` |
| `details.context_provenance` | one of `live` / `manual` / `demo` / `mixed` / `unavailable` |
| `details.limitations` | array of stable codes from the preview view model |
| `details.confidence_band` | `"low" \| "medium" \| "high"` from the engine |
| `details.risk_level` | engine-supplied risk band |
| `details.context_signal_count` | integer evidence-signal count |
| `details.idempotency_key` | sha256 per Section 6 |

Forbidden fields (must never be saved):

- Raw sensor payloads / `raw_payload` blobs.
- Bridge tokens, API keys, service-role keys, env values, webhook
  secrets, model API keys.
- Live model responses (there are none — but guard anyway).
- Any field derived from a non-deterministic source.
- Any device-control intent, automation flag, or executable command.
- Any alert id or Action Queue id (no auto-linking in V1).
- `user_id` from client — server uses `auth.uid()`.

## 9. Confirmation UX copy

Two-step confirmation inside the existing dialog. No new route, no toast-
based silent save.

Primary CTA:

> **Save this AI Doctor preview to diary**

Confirm dialog body (verbatim):

> This will save the current deterministic preview to this plant's diary as
> an **observation** labeled "AI Doctor check-in".
>
> - Preview only — no live AI model was called.
> - Manually saved by you.
> - No alerts will be created.
> - No Action Queue items will be created.
> - No device will be controlled.
>
> The saved entry will preserve any demo, stale, or invalid data labels
> from the source context.

Confirm button: **Save to diary**. Cancel button: **Keep as preview only**.

Post-save toast (success): "Saved to diary as AI Doctor check-in
(observation). No alerts or actions were created."

Post-save toast (idempotent replay): "Already saved — this preview is
unchanged since the last save."

## 10. Safety rules (must hold at implementation time)

1. Grower-initiated only. No background, scheduled, or hook-triggered save.
2. Explicit confirm dialog required before every write.
3. Save is gated behind the same readiness gate already used by the
   preview CTA — if context is insufficient the save button is disabled,
   not hidden silently.
4. No live model call is added in this slice or any save-side slice.
5. No alert insert, no `alerts` write, no `alert_events` write.
6. No `action_queue` insert, no Action Queue helper import in the save
   surface.
7. No device-control code path, no automation flag, no executable command.
8. No client-side `user_id`. Server resolves via `auth.uid()`.
9. No secrets / tokens / raw payloads serialized into `details`.
10. Demo / stale / invalid provenance from the context compiler MUST be
    copied into `details.context_provenance` and
    `details.limitations`. Saved record must never silently "upgrade"
    weak context to healthy.
11. Idempotent on `(user_id, plant_id, idempotency_key)`.
12. Static-import guard: the new save surface must not import
    `actionQueue*`, `alerts*` mutation helpers, model clients, or
    `functions.invoke` for any model endpoint.

## 11. Tests required before implementation ships

Pure logic / view-model:

- `ai-doctor-check-in-save-payload.test.ts`
  - Deterministic payload for identical context.
  - All required fields populated; all forbidden fields absent.
  - Demo / stale / invalid limitations flow through.
  - Idempotency key is stable across re-renders for same context and
    differs across plants / engine versions / receipts.
- `ai-doctor-check-in-save-confirmation-view-model.test.ts`
  - Confirm copy exactly matches Section 9.
  - Save disabled when readiness gate fails.

UI:

- `ai-doctor-check-in-save-panel.test.tsx`
  - Save button hidden/disabled without explicit confirm.
  - Confirm dialog renders the verbatim copy.
  - Cancel does not call the save hook.
  - On success: toast text matches Section 9.
  - On idempotent replay: toast text matches Section 9.

Safety / static guards (regex-based, like existing preview guards):

- New save file must not import `actionQueue*`, `createAlert`,
  `insertAlert`, `functions.invoke` for model endpoints, or any
  `openai|anthropic|gemini|model.invoke` symbol.
- Confirm copy is sourced from a constants module and asserted byte-for-
  byte by tests.

Runtime / integration:

- Reuse the existing Quick Log v2 RPC RLS harness to prove that
  unauthenticated and cross-tenant callers cannot insert an AI Doctor
  check-in observation against another grower's plant.
- Idempotency harness: two identical saves → single row.

Regression:

- `diary-timeline-event-wiring.test.ts` stays green (no
  `EVENT_TYPES` change).
- Existing AI Doctor preview + receipt tests stay green.
- Plant Detail mount tests stay green.

## 12. Out of scope (explicitly deferred)

- Auto-saving a preview.
- Editing or re-running a saved check-in.
- Creating an alert from a saved check-in.
- Creating an Action Queue row from a saved check-in.
- Linking a saved check-in to an `ai_doctor_sessions` row.
- Adding `ai_doctor_check_in` as a first-class `EVENT_TYPES` entry.
- Any device control, automation, scheduling, or live-model integration.
- Sharing / exporting saved check-ins beyond the existing
  copy-to-clipboard receipt.

## 13. Risk / rollback notes

- **Surface area:** small. One new save view-model, one new save panel,
  one constants module for confirm copy, one targeted RPC argument shape.
  No schema, no RLS, no Edge Function.
- **Rollback:** if a regression is found post-ship, hide the save CTA
  behind a feature flag (the preview + receipt continue to function).
  Already-saved rows are normal `observation` diary entries and remain
  readable through `diaryEntryRules` even with the feature disabled.
- **Data risk:** because we save into the existing diary path, any future
  schema/normalization change to `diary_entries.details` must continue to
  honor the `details.kind === "ai_doctor_check_in"` discriminator. Add
  this to `docs/grow-diary-architecture.md` "Safety rules" when the V1
  save lands.
- **Reputational risk:** mislabeling a deterministic preview as a "live
  AI diagnosis" would erode trust. The labels in Section 8 + the receipt
  body in Section 9 are the primary defense. Tests in Section 11 assert
  these byte-for-byte.

## 14. Open questions

1. Should the saved row include the exact engine output JSON under
   `details.engine_output` for later replay/diffing, or only the
   summarized fields? (Default proposal: include a stable, redacted
   subset; never include raw payloads.)
2. Do we want a per-grow rate limit (e.g. max N AI Doctor check-ins per
   24h) to discourage spammy saves, or rely solely on idempotency?
3. Should the timeline render a small "AI Doctor check-in" sub-badge on
   `observation` rows that carry `details.kind === "ai_doctor_check_in"`,
   or stay visually identical to a normal observation until the user
   opens the entry?
4. When the context compiler later gains a "context hash", should we
   promote it into a first-class indexed column on `grow_events` for
   faster idempotency, or keep it inside `details`?
5. Do we want a "Saved" indicator on the preview dialog itself, so a
   second open of the same context shows that this preview has already
   been saved?
