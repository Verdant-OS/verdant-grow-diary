-- Backstop so `logged_at` (Captured time) can never go NULL on a new row,
-- regardless of which write path inserts it.
--
-- Context: 20260724120000_diary_grow_events_logged_at.sql added the real
-- `logged_at` column and backfilled existing rows, and the
-- quicklog_save_event / quicklog_save_manual RPCs stamp it explicitly on
-- insert. But several other write paths (Action Queue, plant-memory
-- episodes, AI Doctor review saves, and any future insert site) do not
-- know about `logged_at` at all and would otherwise insert it as NULL.
-- Every windowed/paginated query rewritten in this PR to filter/order by
-- `logged_at` silently excludes NULL, so an untouched write path makes
-- that row invisible in Timeline, the Range report, and Reports Hub from
-- the moment it's written — worse than the bug this PR set out to fix.
--
-- Fallback mirrors the RPCs' own COALESCE convention: when the caller
-- doesn't supply a Captured time, Captured just mirrors the row's own
-- occurrence time for that write (entry_at / occurred_at), which is
-- exactly today's pre-PR behavior for any path that hasn't been updated
-- to think about Captured time — no behavior change for those paths, just
-- no more silent NULLs. Both entry_at and occurred_at are NOT NULL DEFAULT
-- now(), so the COALESCE result is guaranteed non-null.
--
-- BEFORE INSERT only (not UPDATE): this is a new-row safety net, not a
-- general-purpose backfill; it must never overwrite an explicit UPDATE
-- that intentionally sets logged_at, including an explicit NULL.
--
-- Plain trigger function — no SECURITY DEFINER, no RLS/GRANT change:
-- it only rewrites NEW before the row is written under the caller's own
-- already-granted INSERT privilege, same pattern as trg_validate_grow_event
-- (20260518152526_4236167d-2942-4166-91f3-09be993ca92d.sql).

CREATE OR REPLACE FUNCTION public.stamp_diary_entry_logged_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.logged_at := COALESCE(NEW.logged_at, NEW.entry_at);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stamp_diary_entry_logged_at ON public.diary_entries;
CREATE TRIGGER trg_stamp_diary_entry_logged_at
BEFORE INSERT ON public.diary_entries
FOR EACH ROW EXECUTE FUNCTION public.stamp_diary_entry_logged_at();

CREATE OR REPLACE FUNCTION public.stamp_grow_event_logged_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.logged_at := COALESCE(NEW.logged_at, NEW.occurred_at);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stamp_grow_event_logged_at ON public.grow_events;
CREATE TRIGGER trg_stamp_grow_event_logged_at
BEFORE INSERT ON public.grow_events
FOR EACH ROW EXECUTE FUNCTION public.stamp_grow_event_logged_at();
