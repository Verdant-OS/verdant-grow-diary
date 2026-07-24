-- Real, indexed `logged_at` ("Captured" time) column on diary_entries and
-- grow_events.
--
-- Bug (Codex review, PR #442, 10 findings — all one root cause): `logged_at`
-- has only ever lived inside the `details` JSONB blob, applied as a display
-- overlay AFTER the authoritative fetch/pagination already ran against
-- `entry_at` (diary_entries) / `occurred_at` (grow_events). A row whose
-- Captured time falls inside a visible window but whose entry_at/occurred_at
-- falls outside it (or vice versa) is silently missed by Timeline, the
-- Range/Reports pages, and Recent Activity's Top-N cutoff.
--
-- This migration adds the real column both tables need so the client-side
-- rewrite (follow-up PR commits) can filter/order/paginate by Captured time
-- directly instead of resolving it after the fact. Additive only: nullable
-- ADD COLUMN, single unbatched UPDATE backfill, plain CREATE INDEX IF NOT
-- EXISTS (no CONCURRENTLY — never used anywhere in this repo's migration
-- history). No RLS/GRANT changes: access control on both tables is row-level
-- via user_id/has_role, never column-scoped (confirmed by grep, zero hits).
--
-- Precedent: 20260519183148_5b244bd6-...sql unstashed plant_id/tent_id from
-- this same diary_entries.details blob into real columns using the identical
-- shape (nullable ADD COLUMN -> single UPDATE backfill -> partial CREATE
-- INDEX IF NOT EXISTS WHERE col IS NOT NULL). This migration follows it.
--
-- Backfill correlation note (grow_events side): the diary_entries mirror row
-- for a given grow_events row is tagged in `details` under one of two key
-- names depending on when it was written — `linked_grow_event_id` (current)
-- or the older `grow_event_id` (pre-20260722100000). A documented window of
-- mirror rows between 20260722100000 and 20260723000000 carries neither key
-- (see 20260723000000_quicklog_manual_always_mirror_diary.sql's own header:
-- "bounded, display-only" duplication, already an accepted gap in this
-- codebase for the same reason). Rows that can't be correlated fall back to
-- occurred_at below -- no worse than today's behavior, never worse.

-- 1. Columns.
ALTER TABLE public.diary_entries
  ADD COLUMN IF NOT EXISTS logged_at timestamptz;
ALTER TABLE public.grow_events
  ADD COLUMN IF NOT EXISTS logged_at timestamptz;

COMMENT ON COLUMN public.diary_entries.logged_at IS
  'Captured time: the grower-perceived, editable/backdatable moment this entry represents. Distinct from entry_at, which is the row''s save-time timestamp used for cadence math. Prefer this column over details->>''logged_at'' -- it is backfilled from the same source and kept in sync by quicklog_save_event/quicklog_save_manual going forward.';
COMMENT ON COLUMN public.grow_events.logged_at IS
  'Captured time, mirrored from this event''s diary_entries companion row (or equal to occurred_at when no companion/tag exists). Distinct from occurred_at, which cadence math and true-occurrence ordering should keep using.';

-- 2. Backfill diary_entries: prefer details->>'logged_at' (regex-guarded
--    before casting, same style as the plant_id/tent_id UUID-regex guard in
--    the 20260519183148 precedent), else fall back to entry_at so every row
--    ends up populated -- this exactly reproduces what
--    resolveDiaryEntryObservationTime already computes client-side today, so
--    no row's effective Captured time changes as a result of this backfill.
UPDATE public.diary_entries
SET logged_at = COALESCE(
  CASE
    WHEN details ? 'logged_at'
     AND (details->>'logged_at') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'
    THEN (details->>'logged_at')::timestamptz
  END,
  entry_at
)
WHERE logged_at IS NULL;

-- 3. Backfill grow_events by joining back to its diary mirror via either
--    known correlation key; anything unmatched (untagged window, or a
--    grow_events row with no diary mirror at all) falls back to occurred_at.
UPDATE public.grow_events ge
SET logged_at = (de.details->>'logged_at')::timestamptz
FROM public.diary_entries de
WHERE de.details ? 'logged_at'
  AND (de.details->>'logged_at') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'
  AND (
    (de.details ? 'linked_grow_event_id' AND (de.details->>'linked_grow_event_id')::uuid = ge.id)
    OR (de.details ? 'grow_event_id' AND (de.details->>'grow_event_id')::uuid = ge.id)
  )
  AND ge.logged_at IS NULL;

UPDATE public.grow_events
SET logged_at = occurred_at
WHERE logged_at IS NULL;

-- 4. Indexes -- mirror the existing entry_at/occurred_at index set 1:1,
--    swapping in logged_at (partial WHERE logged_at IS NOT NULL throughout,
--    since the column itself is nullable at the type level even though the
--    backfill above leaves no actual NULLs today).
CREATE INDEX IF NOT EXISTS idx_diary_entries_grow_logged_at
  ON public.diary_entries (grow_id, logged_at DESC)
  WHERE logged_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_diary_entries_plant_logged_at
  ON public.diary_entries (plant_id, logged_at DESC)
  WHERE plant_id IS NOT NULL AND logged_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_diary_entries_tent_logged_at
  ON public.diary_entries (tent_id, logged_at DESC)
  WHERE tent_id IS NOT NULL AND logged_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_grow_events_user_logged_at
  ON public.grow_events (user_id, logged_at DESC)
  WHERE logged_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grow_events_grow_logged_at
  ON public.grow_events (grow_id, logged_at DESC)
  WHERE logged_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grow_events_tent_logged_at
  ON public.grow_events (tent_id, logged_at DESC)
  WHERE tent_id IS NOT NULL AND logged_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grow_events_plant_logged_at
  ON public.grow_events (plant_id, logged_at DESC)
  WHERE plant_id IS NOT NULL AND logged_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grow_events_type_logged_at
  ON public.grow_events (event_type, logged_at DESC)
  WHERE logged_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grow_events_active_logged_at
  ON public.grow_events (user_id, logged_at DESC)
  WHERE is_deleted = false AND logged_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
