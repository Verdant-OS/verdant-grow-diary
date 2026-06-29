# Evidence Linkage Persistence v1 — Design Note

**Date:** 2026-06-29
**Status:** SHIPPED (supersedes the v1 BLOCKED audit)
**Predecessor:** [evidence-linkage-row-adapter-v1-audit.md](./evidence-linkage-row-adapter-v1-audit.md)

## Goal

Persist safe `OriginatingTimelineEventRef[]` on `public.alerts` and
`public.action_queue` so `EvidenceLinkageBadges` can render real linked
evidence on `AlertDetail` and `ActionDetail` instead of fallback copy.

## Persistence design — Option A (JSONB columns)

Chosen because:

- The repo already persists structured JSON evidence elsewhere
  (`diary_entries.details`, `sensor_readings.raw_payload`), so adding a typed
  `jsonb` column matches existing style and tooling.
- Owner-scoped RLS on `alerts` and `action_queue` automatically covers the new
  column — no policy or grant change is required.
- Defaulting to `'[]'::jsonb` keeps every existing row valid with zero
  backfill, and a `CHECK (jsonb_typeof(...) = 'array')` guarantees the
  read-side adapter always sees an array.
- Option B (junction table) would require new GRANTs, new RLS, and a foreign
  key into a non-existent `timeline_events` table — heavier and not how the
  repo models evidence today.

### Schema delta

```sql
ALTER TABLE public.alerts
  ADD COLUMN originating_timeline_events jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.alerts
  ADD CONSTRAINT alerts_originating_timeline_events_is_array
  CHECK (jsonb_typeof(originating_timeline_events) = 'array');

ALTER TABLE public.action_queue
  ADD COLUMN originating_timeline_events jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.action_queue
  ADD CONSTRAINT action_queue_originating_timeline_events_is_array
  CHECK (jsonb_typeof(originating_timeline_events) = 'array');
```

No RLS changes. No new grants. Existing per-owner policies cover the column.

### Persisted ref shape

```
{ id, kind, source, occurred_at?, label? }
```

Only IDs + safe metadata. Never raw payloads, tokens, prompts, completions,
or provider data. Unknown / unrecognized `source` collapses to `"unknown"`.
`demo | manual | csv | stale | invalid | unknown` are never trusted; they
are never described as healthy.

## Read path

- `src/lib/originatingTimelineEventAdapter.ts`
  - `adaptOriginatingTimelineEventsColumn(unknown)` and
    `adaptOriginatingTimelineEventsFromRow(row)`.
  - Drops any entry containing a forbidden field
    (`raw_payload`, `service_role`, `bridge_token`, `api_token`, etc.).
  - Maps unrecognized `source` to `"unknown"`, dedupes by id, sorts by
    `occurred_at` then `id`.
  - Returns `[]` for null/undefined/non-array inputs.

## UI wiring

- `src/pages/AlertDetail.tsx` — passes `adaptOriginatingTimelineEventsFromRow(alert)`
  into `EvidenceLinkageBadges` (still falls back to
  `ALERT_REVIEW_EVIDENCE_NOT_LINKED_COPY` when empty).
- `src/pages/ActionDetail.tsx` — both alert-derived and AI-Doctor-derived
  mounts use the same adapter against the loaded `action_queue` row, with
  their existing provenance-specific fallback copy.

## Write paths

- `src/lib/alerts.ts::saveAlert` accepts an optional
  `originating_timeline_events` list and normalizes it before insert. Default
  is `[]`.
- `src/pages/AlertDetail.tsx::addAlertToActionQueue` and
  `src/hooks/useAddAiDoctorSessionSuggestionToActionQueue.ts` insert with
  `originating_timeline_events: []` because no typed refs are available at
  those boundaries today. Empty is correct; inference is forbidden.

## Safety guarantees

- No fabrication: writers never derive refs from timestamps, prose, alert
  ids, plant/tent ids, metric, or model output.
- No raw payload leakage: adapter rejects entries that carry forbidden keys.
- Owner-scoped RLS unchanged; no anon access.
- No automation / device control language anywhere on the path.

## Rollback

Drop the two columns:

```sql
ALTER TABLE public.alerts        DROP COLUMN originating_timeline_events;
ALTER TABLE public.action_queue  DROP COLUMN originating_timeline_events;
```

UI gracefully falls back to empty refs (badges render fallback copy).
