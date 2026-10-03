-- A Quick Log save has an event spine and a linked diary companion. A direct
-- client INSERT/UPDATE/DELETE of a companion bypasses the revision RPC and can
-- leave the two histories disagreeing. Keep ordinary owner diary writes;
-- linked companions must go through quicklog_correct_entry or
-- quicklog_retract_entry, whose SECURITY DEFINER writes preserve the
-- append-only revision ledger. The only direct client UPDATE allowed on a
-- linked companion fills its initially empty photo_url column from the
-- identical, already persisted details.photo_url value. Some photo readers
-- still use that column alone.
BEGIN;

DO $linked_quicklog_diary_preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_class AS c
     WHERE c.oid = 'public.diary_entries'::pg_catalog.regclass
       AND c.relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_attribute AS a
     WHERE a.attrelid = 'public.diary_entries'::pg_catalog.regclass
       AND a.attname = 'details'
       AND a.atttypid = 'jsonb'::pg_catalog.regtype
       AND NOT a.attisdropped
  ) OR NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_attribute AS a
     WHERE a.attrelid = 'public.diary_entries'::pg_catalog.regclass
       AND a.attname = 'photo_url'
       AND a.atttypid = 'text'::pg_catalog.regtype
       AND NOT a.attisdropped
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
     WHERE schemaname = 'public' AND tablename = 'diary_entries'
       AND policyname = 'Users insert own entries'
       AND cmd = 'INSERT'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
     WHERE schemaname = 'public' AND tablename = 'diary_entries'
       AND policyname = 'Users update own entries'
       AND cmd = 'UPDATE'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
     WHERE schemaname = 'public' AND tablename = 'diary_entries'
       AND policyname = 'Users delete own entries'
       AND cmd = 'DELETE'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'linked_quicklog_diary_preflight_unrecognized';
  END IF;
END;
$linked_quicklog_diary_preflight$;

CREATE POLICY "Linked Quick Log diary requires server insert"
  ON public.diary_entries AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    NOT COALESCE(details ? 'linked_grow_event_id', false)
    AND NOT COALESCE(details ? 'grow_event_id', false)
  );

CREATE FUNCTION public.guard_linked_quicklog_diary_client_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, pg_temp
AS $linked_quicklog_update$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NOT COALESCE(OLD.details ?| ARRAY['linked_grow_event_id', 'grow_event_id'], false)
     AND NOT COALESCE(NEW.details ?| ARRAY['linked_grow_event_id', 'grow_event_id'], false) THEN
    RETURN NEW;
  END IF;

  -- The canonical Quick Log save already wrote details.photo_url. Filling
  -- the old column must not edit any other persisted fact or replace a photo.
  IF OLD.photo_url IS NULL
     AND NEW.photo_url IS NOT NULL
     AND NEW.photo_url = (OLD.details ->> 'photo_url')
     AND NULLIF(btrim(NEW.photo_url), '') IS NOT NULL
     AND (to_jsonb(NEW) - 'photo_url') = (to_jsonb(OLD) - 'photo_url') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = '42501',
    MESSAGE = 'linked_quicklog_diary_requires_revision';
END;
$linked_quicklog_update$;

CREATE TRIGGER guard_linked_quicklog_diary_client_update_trg
  BEFORE UPDATE ON public.diary_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_linked_quicklog_diary_client_update();

CREATE POLICY "Linked Quick Log diary requires revision for delete"
  ON public.diary_entries AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (
    NOT COALESCE(details ? 'linked_grow_event_id', false)
    AND NOT COALESCE(details ? 'grow_event_id', false)
  );

DO $linked_quicklog_diary_postcondition$
BEGIN
  IF (
    SELECT count(*) FROM pg_catalog.pg_policies
     WHERE schemaname = 'public' AND tablename = 'diary_entries'
       AND policyname IN (
         'Linked Quick Log diary requires server insert',
         'Linked Quick Log diary requires revision for delete'
       )
       AND permissive = 'RESTRICTIVE'
       AND 'authenticated' = ANY(roles)
  ) <> 2 OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
     WHERE tgrelid = 'public.diary_entries'::pg_catalog.regclass
       AND tgname = 'guard_linked_quicklog_diary_client_update_trg'
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'linked_quicklog_diary_postcondition_failed';
  END IF;
END;
$linked_quicklog_diary_postcondition$;

COMMIT;
