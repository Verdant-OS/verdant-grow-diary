\set ON_ERROR_STOP on

-- Adversarial control only. This proves why the restored staff backfill must
-- never be applied raw to an existing target. The transaction is rolled back.
BEGIN;

CREATE TEMP TABLE restored_history_raw_staff_fixture (
  user_id uuid PRIMARY KEY
);

DO $fixture$
DECLARE
  v_user uuid;
BEGIN
  SELECT id
    INTO v_user
    FROM auth.users
   WHERE lower(email) = 'matt@verdantgrowdiary.com'
   ORDER BY id
   LIMIT 1;

  IF v_user IS NULL THEN
    v_user := gen_random_uuid();
    INSERT INTO auth.users (
      id,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      aud,
      role
    ) VALUES (
      v_user,
      'matt@verdantgrowdiary.com',
      crypt('local-harness-only', gen_salt('bf')),
      now(),
      now(),
      now(),
      '{}'::jsonb,
      '{}'::jsonb,
      'authenticated',
      'authenticated'
    );
  END IF;

  UPDATE auth.users
     SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
         updated_at = now()
   WHERE id = v_user;

  DELETE FROM public.user_roles
   WHERE user_id = v_user
     AND role = 'staff'::public.app_role;

  IF EXISTS (
    SELECT 1
      FROM public.user_roles
     WHERE user_id = v_user
       AND role = 'staff'::public.app_role
  ) THEN
    RAISE EXCEPTION 'fixture failed: staff role remains after explicit revocation';
  END IF;

  INSERT INTO restored_history_raw_staff_fixture (user_id) VALUES (v_user);
END;
$fixture$;

\ir ../migrations/20260710013255_staff_role_grant_trigger_and_backfill.sql

DO $control$
DECLARE
  v_user uuid;
BEGIN
  SELECT user_id INTO STRICT v_user FROM restored_history_raw_staff_fixture;

  IF NOT EXISTS (
    SELECT 1
      FROM public.user_roles
     WHERE user_id = v_user
       AND role = 'staff'::public.app_role
  ) THEN
    RAISE EXCEPTION
      'negative control failed: raw duplicate backfill did not recreate revoked staff';
  END IF;
END;
$control$;

SELECT 'PASS: raw duplicate staff backfill recreates revoked staff (rolled back)' AS result;

ROLLBACK;
