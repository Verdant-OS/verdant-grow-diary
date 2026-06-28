# Evidence Linkage Row Adapter v1 — Audit (BLOCKED)

**Date:** 2026-06-28
**Slice:** Verdant Establishment Fix Train v1 — Slice C
**Verdict:** BLOCKED — safe originating timeline refs are not available in the
row shapes consumed by `AlertDetail` or `ActionDetail`. Per the slice contract
(`Do not fabricate refs.`), no runtime page wiring is implemented in this
slice.

## Scope reminder

The adapter would normalize structured timeline event refs from row data into
the `EvidenceLinkageBadges` presenter. It must never:

- match by timestamp, plant, tent, or metric alone
- infer refs from alert reason prose or AI Doctor summaries
- use the alert/action id itself as a timeline event id
- synthesize ids or treat provider/source-app strings as live
- expose raw payloads or internal unsafe fields

## What was audited

Row shape sources (read-only inspection only):

- `src/lib/alerts.ts` — `AlertRow` interface
- `src/integrations/supabase/types.ts` — `public.alerts.Row`
- `src/integrations/supabase/types.ts` — `public.action_queue.Row`
- `src/pages/AlertDetail.tsx` — current `EvidenceLinkageBadges` mount
- `src/pages/ActionDetail.tsx` — alert-derived and AI-Doctor-derived
  `EvidenceLinkageBadges` mounts
- `src/lib/alertActionQueueHandoffRules.ts` — in-memory handoff shape
- `src/lib/alertActionQueueEvidenceViewModel.ts` — handoff evidence VM
- `src/lib/originatingTimelineEventRules.ts` — normalization helpers
- `supabase/migrations/*` — searched for `originating_timeline`,
  `linked_timeline`, `timeline_event_ids`, `grow_event_ids`, `evidence_refs`

## Findings

### 1. No structured ref column on `alerts`

`public.alerts.Row` (Supabase types) carries only:

```
id, user_id, grow_id, tent_id, plant_id,
source, severity, metric, title, reason, status,
first_seen_at, last_seen_at,
acknowledged_at, resolved_at, created_at, updated_at
```

No `metadata`, `details`, `evidence_refs`, `originating_timeline_events`, or
JSON field that could carry safe timeline event ids exists. The `reason` field
is grower-facing prose plus a `[alert:<id>]` back-pointer token used only for
action-queue dedupe — it is not a timeline event id and must not be treated
as one.

### 2. No structured ref column on `action_queue`

`public.action_queue.Row` carries only:

```
id, user_id, grow_id, tent_id, plant_id,
action_type, target_metric, target_device,
suggested_change, reason, risk_level,
source, status,
approved_at, completed_at, rejected_at,
created_at, updated_at
```

Same gap: no structured timeline ref field. The `reason` may include a
`[alert:<id>]` back-pointer and an AI Doctor session token, but neither is a
timeline event id.

### 3. In-memory handoff has refs, but is not threaded to the detail pages

`alertActionQueueHandoffRules.ts` defines
`originatingTimelineEvents: OriginatingTimelineEventRef[]` on the suggestion
and queued-action shapes, and `alertActionQueueEvidenceViewModel.ts` consumes
it. That structure is constructed at suggestion build / approval time from
explicit caller input. It is **not** persisted, and `AlertDetail` /
`ActionDetail` load `AlertRow` / `action_queue.Row` directly from Supabase —
they never receive a handoff object. So there is no safe in-memory ref source
at the detail-page boundary either.

### 4. No safe inference path exists

Every fallback that could "fill in" refs from row data would violate the
disallowed list:

- `alert.last_seen_at` / `created_at` is timestamp-only matching.
- `alert.metric` is metric-only matching.
- `alert.plant_id` / `tent_id` is locality-only matching.
- `reason` prose parsing would invent refs from text.
- The `[alert:<id>]` token is the alert id, not a timeline event id.

## Decision

**BLOCKED.** No `src/lib/originatingTimelineEventAdapter.ts` is created in this
slice. The three `EvidenceLinkageBadges` mounts continue to pass `events={[]}`
and the provenance-aware fallback copy from
`originatingTimelineEventRules.ts`. Fallback copy is unchanged.

## Unblock path (future work — not this slice)

To safely wire real refs, a future slice must:

1. Add a structured, append-only ref column (e.g.
   `alerts.originating_timeline_event_ids uuid[]` and an equivalent on
   `action_queue`, or a join table) via migration, with RLS.
2. Backfill must be explicit and deterministic — no inference from prose,
   timestamps, or locality.
3. Write paths (alert creation, suggestion build, approval) must populate the
   column from already-typed `OriginatingTimelineEventRef[]` values produced
   by `alertActionQueueHandoffRules`.
4. Only then can a read-side adapter project those ids into
   `EvidenceLinkageBadges`.

Each of those steps is out of scope for Slice C (read-only adapter wiring).

## Risk / rollback

No runtime files changed. No schema, RLS, edge function, or policy changes.
Fallback copy on both pages is unaffected. Nothing to roll back.
