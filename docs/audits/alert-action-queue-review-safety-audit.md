# Alert → Action Queue Review Path — Safety Audit

Scope: presenter/data-flow audit of the Alert → Approval-Required Action
Queue path. Read-only review. No schema, RLS, Edge Function, AI/model,
automation, or device-control changes proposed.

Date: 2026-06-15

---

## 1. Current path summary

```
Alert (environment_alert)
  └─ Alerts list / AlertDetail
      ├─ severity / status / metric / source badges
      ├─ SensorSourceProvenanceBadge (manual / live / csv / demo / stale / invalid)
      ├─ AlertWhyContext (evidence + reason narrative)
      ├─ LinkedActionCountBadge (reverse provenance to Action Queue rows)
      └─ "Add to Action Queue" (grower-initiated, dedupe-guarded)
            └─ INSERT public.action_queue
                  source            = "environment_alert"
                  status            = "pending_approval"
                  reason            = "<grower text> [alert:<id>]"
                  user_id           = (DB default auth.uid())
                └─ INSERT public.action_queue_events {event_type:"created"}

Action Queue (pages/ActionQueue.tsx + pages/ActionDetail.tsx)
  ├─ Suggestion-origin panel (Source, "Grower review required")
  ├─ Approve / Simulate / Reject / Complete / Cancel
  │     (transitions guarded by src/lib/actionQueueTransitions.ts)
  └─ Reverse links: Alert ←→ AI Doctor session, via stripped tokens
```

All status mutations write to `action_queue_events` (audit-only). No
outbound device command, MQTT publish, webhook POST, or relay call exists
on this path.

---

## 2. Files / components inspected

Pages
- `src/pages/Alerts.tsx`
- `src/pages/AlertDetail.tsx` (insert flow lines 333–411; badges 478–518)
- `src/pages/ActionQueue.tsx` (header copy 485–486; mutation comments 297, 351, 360; simulation toast 361)
- `src/pages/ActionDetail.tsx` (origin panel 656–690; outcome dialog 894–897)

Lib (pure rules)
- `src/lib/actionQueueTransitions.ts` (terminal-state gates, suggest-only header)
- `src/lib/actionQueueProvenanceRules.ts` (`extractSourceAlertId`, `extractSourceAiDoctorSessionId`, `stripBackPointerTokens`)
- `src/lib/actionQueueAlertContextFilter.ts`
- `src/lib/actionQueueGrowContextHintRules.ts`
- `src/lib/actionQueueRowView.ts`
- `src/lib/alertEvidenceViewModel.ts` (via tests)

Components
- `src/components/AlertsAutoPersistForGrow.tsx`
- `src/components/LinkedActionCountBadge.tsx`
- `src/components/AlertWhyContext.tsx`
- `src/components/SensorSourceProvenanceBadge.tsx`

Tests (representative)
- `action-queue-safety.test.ts`, `action-queue-provenance.test.ts`
- `action-queue-raw-token-leak-guard.test.ts`, `action-queue-transitions.test.ts`
- `alert-action-queue-dedupe-rules.test.ts`, `alert-action-queue-evidence-view-model.test.ts`
- `alert-detail-add-to-action-queue.test.tsx`, `alert-detail-double-click-protection.test.tsx`
- `alerts-list-sensor-provenance-badge.test.tsx`

---

## 3. Existing safety protections (verified)

Approval-required by construction
- `action_queue.status` insert is hard-coded to `pending_approval` at the
  alert-derived insert site (`AlertDetail.tsx:393`).
- `actionQueueTransitions.ts` documents "Suggest-only workflow. Equipment
  / device execution surfaces of any kind are intentionally OUT OF SCOPE".
- Terminal-status gates prevent re-transition; UI button render is driven
  by `allowedTransitions(status)`.

Honest copy / no automation language
- ActionQueue.tsx:485–486 — "Suggestions are approval-gated. Verdant
  never sends commands to equipment."
- ActionDetail.tsx:672 — "Status: Grower review required".
- ActionDetail.tsx:894–897 — "grower observation only — no automation is
  triggered."
- Simulate toast: "Simulated (no device command sent)" (lines 361, 465).

Provenance + reverse linkage
- Alert ID is embedded in `reason` as `[alert:<id>]` and round-tripped via
  `extractSourceAlertId` / `stripBackPointerTokens` so growers see clean
  text but the audit relationship is preserved.
- AI Doctor session ID uses the same `[session:<id>]` mechanism.
- `LinkedActionCountBadge` surfaces reverse provenance (alert → queued
  actions) so growers see "why this action exists".

Data hygiene
- No `raw_payload` rendered in `Alerts.tsx`, `AlertDetail.tsx`,
  `ActionQueue.tsx`, `ActionDetail.tsx` (grep clean).
- `stripBackPointerTokens` removes `[alert:…]` / `[session:…]` tokens from
  grower-visible reason copy.
- Client never sends `user_id` on inserts — DB default `auth.uid()` is the
  single source of truth (`AlertDetail.tsx:350-351`).
- Sensor source badge respects `manual / live / csv / demo / stale /
  invalid` honestly.

Insert hardening
- `decideAddButtonState` + `shouldBlockInsert` dedupe pure helpers prevent
  double-add and fast double-click insertions
  (`alert-action-queue-dedupe-rules.test.ts`).
- RLS 42501 path is caught and surfaced as a grower-friendly lineage
  repair hint, not as a raw permission error.

---

## 4. Gaps / risks found

G1 — Stale snapshot quality not propagated into the Action Queue row.
The recently-added `ManualSensorSnapshotQuality` classifier (usable /
needs_review / invalid / missing, with historical mode) is shown on the
manual-entry card, AI Doctor readiness, and timeline cards — but the
Action Queue row and Action Detail page do not display a snapshot-quality
chip for the originating alert's evidence. A grower approving an action
cannot see at a glance whether the alert was driven by a usable current
reading or by stale/invalid telemetry. Presenter-only gap.

G2 — `target_device` column is rendered as a fallback display label.
`ActionQueue.tsx:802` and `ActionDetail.tsx` read `row.target_device` and
display it when `target_metric` is null. The field is presentation-only
(no command is dispatched), but the label name itself can be misread as
"a device that will be controlled". Wording risk only; no behavior risk.

G3 — Pre-existing static-safety scoping miss in
`action-queue-safety.test.ts` test #2. The scanner's allow-list excludes
`src/lib/aiDoctorSafetyRules.ts` so its DENYLIST tokens (`device_command`)
do not match the banned regex. The token now also appears in
`src/lib/aiDoctorActionSuggestionPreviewRules.ts` as a status enum
(`blocked_device_command_risk`) used to BLOCK suggestions, not enable
them. The scanner needs the same allow-list entry. Not a runtime safety
gap — the file does not introduce any execution surface — but the test
fails until the allow-list is widened. Out of scope to fix in this audit
(touches a test scanner, not presenter code).

G4 — No explicit grower-visible "no device command will run" reassurance
on the **Approve** confirmation dialog itself. The reassurance lives in
the page header and in the outcome dialog, but the approve dialog body
relies on `ActionQueue.tsx:386` toast copy ("Approved actions are
recorded for future manual or controlled execution. No equipment command
is sent.") which fires *after* confirm. A pre-confirm line would
reinforce intent.

G5 — Alert source label on `AlertDetail.tsx:511` renders the raw
`alert.source` enum (e.g. `environment_alert`) verbatim. Honest, but not
grower-friendly. Cosmetic.

No leakage of `raw_payload`, `service_role`, API tokens, or private IDs
found in any inspected file. No auto-write path from alert to action
queue exists — every insert is grower-initiated.

---

## 5. Recommended smallest next build

**Build slice: "Snapshot-quality chip on Action Queue row + Action
Detail origin panel" (presenter-only).**

Why it's the smallest safe slice:
- Closes G1, which is the most grower-meaningful gap.
- Reuses the already-shipped `evaluateManualSensorSnapshotQuality`
  (historical mode) + `ManualSensorSnapshotQualityBadge` — no new logic.
- Uses sensor evidence already loaded for `AlertWhyContext` /
  `LinkedActionCountBadge`; no new query path.
- Adds zero writes, zero Edge Function calls, zero RPCs.
- Targets two presenters: the Action Queue row and the Action Detail
  origin panel.
- Pairs with three tests: presence of chip for usable/historical-usable,
  presence of "needs review" for stale/csv-sourced evidence, and a
  static-safety assertion that no raw payload renders inside the chip
  container.

Constraint: chip must use historical mode for past evidence and must
NEVER claim current-room support — `canSupportAiDoctorCurrentContext`
must remain `false` on Action Queue surfaces.

Optional micro-polish to bundle (only if cheap):
- G4: prepend one line to the Approve confirmation dialog body —
  "Approving records grower intent only. No equipment command is sent."
- G5: replace raw `environment_alert` badge text with the existing
  `getActionQueueSourceLabel`-style friendly label.

---

## 6. Explicit no-go items (do not build in next slice)

- No outbound device commands, MQTT publish, HTTP relay, or webhook POST.
- No auto-approval or auto-execute timer.
- No schema column additions to `action_queue` or `alerts`.
- No RLS policy changes.
- No Edge Function additions or modifications.
- No AI/model calls from the Action Queue surface.
- No new write paths from alerts → action_queue (current grower-initiated
  insert is the only allowed path).
- No exposure of `raw_payload`, `service_role`, tokens, private IDs in
  grower-visible copy.
- No relabeling of `pending_approval` rows as "approved" or "queued for
  execution".
- No removal of the dedupe guard or the audit-event insert.

---

## 7. Validation performed for this audit

Commands run
- `bun run typecheck` → OK
- `bunx vitest run` on Action Queue + Alert safety/provenance band
  (9 files, 118 tests) → **117 passed / 1 failed**

The single failure is pre-existing (G3) and unrelated to any audit
change: `action-queue-safety.test.ts` "no AI / coach code reaches MQTT,
Home Assistant, Pi bridge, webhooks, or device endpoints" matches the
`device_command` substring inside the BLOCKING status enum
`blocked_device_command_risk` in
`src/lib/aiDoctorActionSuggestionPreviewRules.ts`. The scanner's
allow-list currently covers only `aiDoctorSafetyRules.ts`. Fix is a
one-line allow-list addition in the test; intentionally NOT performed in
this audit (test scanner change, would need its own scoped review).

All other suites pass:
- action-queue-provenance, action-queue-raw-token-leak-guard,
  action-queue-transitions
- alert-action-queue-dedupe-rules,
  alert-action-queue-evidence-view-model
- alert-detail-add-to-action-queue,
  alert-detail-double-click-protection
- alerts-list-sensor-provenance-badge

---

## 8. Safety verdict

**SAFE — audit only.** The Alert → Action Queue path is approval-required
by construction, has honest copy, preserves provenance with reversible
tokens, dedupes inserts, and writes audit events for every state change.
No `raw_payload` / token / private-ID leaks were found in the inspected
files. The recommended next slice (snapshot-quality chip on the queue
row + detail origin panel) is presenter-only and reuses existing safe
helpers; it does not introduce any write, RPC, or device-control
surface.
