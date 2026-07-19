-- Keep private AI Doctor history aligned with Verdant's account-deletion contract.
-- Existing orphaned rows require an explicit operator retention decision; this
-- migration intentionally fails instead of silently deleting diagnosis history.

DO $$
DECLARE
  orphan_count bigint;
BEGIN
  SELECT count(*)
  INTO orphan_count
  FROM public.ai_doctor_sessions AS session_row
  WHERE NOT EXISTS (
    SELECT 1
    FROM auth.users AS auth_user
    WHERE auth_user.id = session_row.user_id
  );

  IF orphan_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'ai_doctor_sessions contains orphaned user rows',
      DETAIL = format('orphan_count=%s', orphan_count),
      HINT = 'Resolve retention with an explicit operator decision before retrying this migration.';
  END IF;
END
$$;

ALTER TABLE public.ai_doctor_sessions
  ADD CONSTRAINT ai_doctor_sessions_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.ai_doctor_sessions
  VALIDATE CONSTRAINT ai_doctor_sessions_user_id_fkey;
