DO $$
DECLARE
  orphan_count bigint;
  constraint_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'ai_doctor_sessions'
      AND c.conname = 'ai_doctor_sessions_user_id_fkey'
  )
  INTO constraint_exists;

  IF constraint_exists THEN
    RETURN;
  END IF;

  SELECT count(*)
  INTO orphan_count
  FROM public.ai_doctor_sessions AS session_row
  WHERE NOT EXISTS (
    SELECT 1 FROM auth.users AS auth_user WHERE auth_user.id = session_row.user_id
  );

  IF orphan_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'ai_doctor_sessions contains orphaned user rows',
      DETAIL = format('orphan_count=%s', orphan_count),
      HINT = 'Resolve retention with an explicit operator decision before retrying this migration.';
  END IF;

  ALTER TABLE public.ai_doctor_sessions
    ADD CONSTRAINT ai_doctor_sessions_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE
    NOT VALID;

  ALTER TABLE public.ai_doctor_sessions
    VALIDATE CONSTRAINT ai_doctor_sessions_user_id_fkey;
END
$$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260719035000', 'add_ai_doctor_sessions_user_delete_cascade', ARRAY['-- applied via lovable per-file chain'])
ON CONFLICT (version) DO NOTHING;
