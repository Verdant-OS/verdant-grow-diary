-- Fresh-replay bridge for the immutable Quick Log stage import.
--
-- 20260722100000_quicklog_save_manual_stage.sql and the later immutable
-- 20260722165149 UUID import publish the same 12-argument RPC body. Both
-- published files remain untouched. On a fresh replay, remove only the
-- already-created overload immediately before the immutable import recreates
-- it. Environments that recorded that exact immutable import no-op.

DO $bridge$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE version = '20260722165149'
  ) THEN
    RAISE NOTICE
      'fresh replay bridge skipped: immutable Quick Log stage import is already recorded';
    RETURN;
  END IF;

  DROP FUNCTION IF EXISTS public.quicklog_save_manual(
    text,
    uuid,
    text,
    numeric,
    text,
    numeric,
    numeric,
    numeric,
    timestamptz,
    jsonb,
    text,
    text
  );
END
$bridge$;
