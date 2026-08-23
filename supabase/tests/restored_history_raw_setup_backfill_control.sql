\set ON_ERROR_STOP on

-- Adversarial control only. This proves why the restored duplicate must never
-- be applied raw to an existing target. The transaction is always rolled back.
BEGIN;

CREATE TEMP TABLE restored_history_raw_setup_fixture (
  hunt_id uuid PRIMARY KEY,
  expected_created_at timestamptz NOT NULL
);

DO $fixture$
DECLARE
  v_user uuid := gen_random_uuid();
  v_grow uuid;
  v_hunt uuid;
  v_created_at timestamptz := timestamptz '2026-07-01 12:00:00+00';
BEGIN
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
    'restored-history-raw-' || replace(v_user::text, '-', '') || '@verdant.test',
    crypt('local-harness-only', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    'authenticated',
    'authenticated'
  );

  INSERT INTO public.grows (user_id, name)
  VALUES (v_user, 'Restored history raw backfill control')
  RETURNING id INTO v_grow;

  INSERT INTO public.pheno_hunts (
    user_id,
    grow_id,
    name,
    created_at,
    setup_completed_at
  ) VALUES (
    v_user,
    v_grow,
    'Intentional incomplete legacy hunt',
    v_created_at,
    NULL
  )
  RETURNING id INTO v_hunt;

  INSERT INTO restored_history_raw_setup_fixture (hunt_id, expected_created_at)
  VALUES (v_hunt, v_created_at);
END;
$fixture$;

\ir ../migrations/20260710003638_pheno_hunt_setup_backfill.sql

DO $control$
DECLARE
  v_actual timestamptz;
  v_expected timestamptz;
BEGIN
  SELECT hunt.setup_completed_at, fixture.expected_created_at
    INTO STRICT v_actual, v_expected
    FROM restored_history_raw_setup_fixture fixture
    JOIN public.pheno_hunts hunt ON hunt.id = fixture.hunt_id;

  IF v_actual IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION
      'negative control failed: raw duplicate backfill did not overwrite intentional NULL';
  END IF;
END;
$control$;

SELECT 'PASS: raw duplicate setup backfill overwrites intentional NULL (rolled back)' AS result;

ROLLBACK;
