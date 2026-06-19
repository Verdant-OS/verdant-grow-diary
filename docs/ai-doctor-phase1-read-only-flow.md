# AI Doctor Phase 1 — Read-Only Flow

Route: `/operator/ai-doctor-phase1`

## A. Purpose

AI Doctor Phase 1 is a protected, read-only Operator Mode surface for reviewing
cautious plant context and a locally derived Phase 1 result. It supports the
Verdant V0 loop:

Grow → Tent → Plant → Quick Log → Timeline → Sensor Snapshot → AI Doctor → Alert
→ Approval-Required Action Queue

This Phase 1 surface intentionally stops **before** any persistence or Action
Queue creation. It is a review surface only.

## B. Current capabilities

- Protected Operator Mode route inside `AppShell`.
- Real plant/tent reads through existing read-only hooks.
- Selected plant URL sync via `plantId`, `growId`, `tentId` query params.
- Plant picker.
- Unknown `plantId` blocks result rendering.
- No-result and missing-context states.
- Internal deep-link copy with "Copied!" confirmation.
- Premium selected-plant header.
- "Back to plant" and "View plant context" navigation CTAs.
- Local read-only Phase 1 result derivation from available rows.
- Loading skeleton with shimmer and reduced-motion fallback.
- Evidence shortcuts:
  - Recent photo (only when actual photo activity exists in recent rows).
  - Recent diary entries.
  - Sensor summary anchor.
- Missing-context checklist with local-facts-only helper text.
- Mobile sticky shortcut bar (`sm:hidden`, `aria-hidden`).
- Skip link to evidence shortcuts.
- Shared focus-visible / touch-target accessibility utility
  (`src/lib/aiDoctorPhase1A11yClassNames.ts`).

## C. Data inputs

Safe sources currently consumed:

- Selected plant (read-only hook).
- Tent (read-only hook).
- Grow / tent IDs when available.
- Recent diary / activity rows.
- Sensor readings for the selected tent.
- Local Phase 1 compiler.
- Local stubbed `executeAiDoctorEngine` (no network).

Current limitation: no dedicated photo hook exists. Photo evidence appears only
when recent activity rows clearly mark photo activity (`event_type` matching
`/photo/i`).

## D. Safety boundaries

This page must **not**:

- Persist AI Doctor results.
- Create diary entries.
- Create timeline entries.
- Create Action Queue items. (No Action Queue writes.)
- Create alerts.
- Mutate Supabase.
- Call live AI / model APIs. (No live AI/model calls.)
- Call Edge Functions.
- Execute device commands. (No device control.)
- Imply automation.
- Invent missing photos, readings, or diagnosis content.

Also: No diary/timeline writes.

## E. Source-truth rules

- URL query params are the selection source of truth.
- Unknown plantId blocks result rendering.
- Missing context produces guidance, not a fake diagnosis.
- Stale/invalid/degraded telemetry must not be treated as healthy.
- The local stubbed result is acceptable only as local Phase 1 review — never a
  saved diagnosis.

## F. Accessibility behavior

- Skip link ("Skip to evidence shortcuts") becomes visible on focus.
- Evidence shortcuts section exposes an anchor ID
  (`AI_DOCTOR_PHASE1_EVIDENCE_SHORTCUTS_ANCHOR_ID`) with `tabIndex={-1}`.
- Shared focus-visible / touch-target classes via
  `AI_DOCTOR_PHASE1_FOCUS_VISIBLE_LINK_CLASSES` and
  `AI_DOCTOR_PHASE1_TOUCH_TARGET_CLASSES`.
- Mobile sticky bar uses `aria-hidden="true"` and `tabIndex={-1}` to avoid
  duplicate screen-reader announcements.
- Canonical in-page shortcuts remain fully accessible.
- Loading state uses `role="status"` and `aria-busy="true"`.
- Shimmer respects `motion-reduce:animate-none`; skeleton stays visible.

## G. Not yet supported

- Saving AI Doctor result to timeline.
- Attaching diagnosis to a diary entry.
- Creating Action Queue items.
- Approving / rejecting actions.
- Live model diagnosis.
- Photo-specific hook / source.
- AI Doctor session history.
- Export / share outside protected Operator Mode.

## H. Save to timeline (grower-initiated evidence)

Added in the save-evidence slice.

- Control: `AiDoctorPhase1SaveEvidenceButton` (`src/components/`).
- Pure draft builder: `src/lib/aiDoctorPhase1TimelineDraft.ts` —
  `buildAiDoctorPhase1TimelineDraft(input)` shapes a `quicklog_save_manual`
  RPC payload (existing safe write path).
- Hook: `src/hooks/useSaveAiDoctorPhase1TimelineEvidence.ts` — wraps the RPC
  call and tracks idempotency keys seen this session for duplicate protection.
- Saved as a `note`-action grow event with `details.kind = "ai_doctor_phase1_evidence"`.
- Idempotency key: `ai_doctor_phase1_evidence:<plantId>:phase1:v1:<contextHash>`.
- Button is gated to render only when:
  - selected plant is valid
  - a derived result exists
  - not loading / unknown / no-result
- States: `idle → saving → saved | duplicate | error`.
- Disclaimer: "Saved as evidence only. This is not an approved action and
  does not control equipment."
- No Action Queue write. No alert write. No device control. No Edge Function.
  No live model call. No auto-save.

### Audit (existing write path used)

- Table/path: `public.grow_events` via `quicklog_save_manual` RPC + `diary_entries`
  side-effect (handled by the RPC itself). No new table, no schema change.
- `user_id` is resolved server-side via `auth.uid()` inside the RPC.
- Plant / grow / tent ownership is re-validated server-side by the RPC.
- AI Doctor metadata is stored in `p_details` (the RPC strips user/grow/tent
  ID fields if present).
- Duplicate protection: in-session `Set<idempotency_key>` in the hook. Pure
  client-side dedupe; cross-session DB dedupe is out of scope (would need a
  schema/RLS change).
- Rollback: removing the button + hook + draft + wiring is sufficient; no
  schema, RLS, or policy needs to be reverted.
