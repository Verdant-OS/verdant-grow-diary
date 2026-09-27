-- A Quick Log save has an event spine and a linked diary companion. A direct
-- client INSERT/UPDATE/DELETE of a companion bypasses the revision RPC and can
-- leave the two histories disagreeing. Keep ordinary owner diary writes;
-- linked companions must go through quicklog_correct_entry or
-- quicklog_retract_entry, whose SECURITY DEFINER writes bypass these client
-- policies and preserve the append-only revision ledger.
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

CREATE POLICY "Linked Quick Log diary requires revision for update"
  ON public.diary_entries AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (
    NOT COALESCE(details ? 'linked_grow_event_id', false)
    AND NOT COALESCE(details ? 'grow_event_id', false)
  )
  WITH CHECK (
    NOT COALESCE(details ? 'linked_grow_event_id', false)
    AND NOT COALESCE(details ? 'grow_event_id', false)
  );

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
         'Linked Quick Log diary requires revision for update',
         'Linked Quick Log diary requires revision for delete'
       )
       AND permissive = 'RESTRICTIVE'
       AND 'authenticated' = ANY(roles)
  ) <> 3 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'linked_quicklog_diary_postcondition_failed';
  END IF;
END;
$linked_quicklog_diary_postcondition$;

COMMIT;
