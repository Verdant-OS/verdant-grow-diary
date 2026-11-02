-- Disposable-local proof for EcoWitt claim hardening.
-- Do not run this against a hosted database.
--
--   createdb ecowitt_claims_pgtap
--   psql -d ecowitt_claims_pgtap -v ON_ERROR_STOP=1 -f supabase/tests/ecowitt_custom_upload_claims_pgtap.sql
--   psql -d ecowitt_claims_pgtap -v ON_ERROR_STOP=1 -f supabase/tests/ecowitt_custom_upload_claim_hardening_pgtap.sql
--
-- This file applies the same migrations itself so it can also run on an empty database.

\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgtap;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN current_setting('request.jwt.claims', true) IS NULL
      OR btrim(current_setting('request.jwt.claims', true)) = ''
    THEN NULL::jsonb
    ELSE current_setting('request.jwt.claims', true)::jsonb
  END
$$;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.jwt() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.tents (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL
);

INSERT INTO public.tents (id, user_id) VALUES
  ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111'),
  ('33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444')
ON CONFLICT (id) DO NOTHING;

\ir ../migrations/20261102150000_ecowitt_custom_upload_claims.sql
\ir ../migrations/20261102233000_ecowitt_custom_upload_claim_hardening.sql

CREATE TABLE IF NOT EXISTS public.pgtap_ecowitt_hardening_scratch (
  k text PRIMARY KEY,
  claim_id uuid,
  token text
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pgtap_ecowitt_hardening_scratch
  TO authenticated, service_role;

SELECT plan(18);

SELECT ok(
  NOT has_column_privilege(
    'authenticated',
    'public.ecowitt_custom_upload_claims',
    'token_sha256',
    'SELECT'
  ),
  'authenticated cannot select token_sha256'
);

SELECT ok(
  NOT has_column_privilege(
    'authenticated',
    'public.ecowitt_custom_upload_claims',
    'passkey_sha256',
    'SELECT'
  ),
  'authenticated cannot select passkey_sha256'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ecowitt_custom_upload_claims_owner'
      AND column_name IN ('token_sha256', 'passkey_sha256')
  ),
  'owner view has no hash columns'
);

SELECT throws_ok(
  $$DO $body$
    BEGIN
      PERFORM set_config(
        'request.jwt.claims',
        '{"sub":"44444444-4444-4444-8444-444444444444","is_anonymous":false}',
        true
      );
      EXECUTE 'SET LOCAL ROLE authenticated';
      PERFORM token_sha256 FROM public.ecowitt_custom_upload_claims;
    END
  $body$
$$,
  '42501',
  NULL,
  'another user cannot select the token hash'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.bind_ecowitt_custom_upload_claim(uuid,text,text)',
    'EXECUTE'
  ),
  'authenticated cannot execute bind'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.bind_ecowitt_custom_upload_claim(uuid,text,text)',
    'EXECUTE'
  ),
  'service role can execute bind'
);

SELECT lives_ok(
  $$DO $body$
    DECLARE
      rec record;
      claim uuid;
      rotated text;
      bound boolean;
    BEGIN
      PERFORM set_config(
        'request.jwt.claims',
        '{"sub":"11111111-1111-4111-8111-111111111111","is_anonymous":false}',
        true
      );
      EXECUTE 'SET LOCAL ROLE authenticated';
      SELECT claim_id, upload_token INTO rec
      FROM public.create_ecowitt_custom_upload_claim(
        '22222222-2222-4222-8222-222222222222'::uuid
      );
      claim := rec.claim_id;
      EXECUTE 'RESET ROLE';
      EXECUTE 'SET LOCAL ROLE service_role';
      SELECT public.bind_ecowitt_custom_upload_claim(
        claim,
        repeat('ab', 32),
        'GW1200-old'
      ) INTO bound;
      IF bound IS NOT TRUE THEN
        RAISE EXCEPTION 'first bind failed';
      END IF;
      EXECUTE 'RESET ROLE';
      EXECUTE 'SET LOCAL ROLE authenticated';
      SELECT public.rotate_ecowitt_custom_upload_claim(claim) INTO rotated;
      INSERT INTO public.pgtap_ecowitt_hardening_scratch (k, claim_id, token)
      VALUES ('rotated', claim, rotated);
    END
  $body$
$$,
  'bind then rotate runs'
);

SELECT is(
  (
    SELECT claims.passkey_sha256 IS NULL
       AND claims.bound_at IS NULL
       AND claims.stationtype IS NULL
    FROM public.ecowitt_custom_upload_claims AS claims
    JOIN public.pgtap_ecowitt_hardening_scratch AS scratch
      ON scratch.claim_id = claims.id
     AND scratch.k = 'rotated'
  ),
  true,
  'rotate drops the old passkey binding'
);

SELECT lives_ok(
  $$DO $body$
    DECLARE
      claim uuid;
      bound boolean;
    BEGIN
      SELECT claim_id INTO claim
      FROM public.pgtap_ecowitt_hardening_scratch
      WHERE k = 'rotated';
      EXECUTE 'SET LOCAL ROLE service_role';
      SELECT public.bind_ecowitt_custom_upload_claim(
        claim,
        repeat('ab', 32),
        'GW1200-fresh'
      ) INTO bound;
      INSERT INTO public.pgtap_ecowitt_hardening_scratch (k, token)
      VALUES ('rebound', bound::text);
    END
  $body$
$$,
  'old passkey binds again after rotate'
);

SELECT is(
  (SELECT token FROM public.pgtap_ecowitt_hardening_scratch WHERE k = 'rebound'),
  'true',
  'rotate followed by the old passkey creates a fresh bind'
);

SELECT is(
  (
    SELECT claims.stationtype
    FROM public.ecowitt_custom_upload_claims AS claims
    JOIN public.pgtap_ecowitt_hardening_scratch AS scratch
      ON scratch.claim_id = claims.id
     AND scratch.k = 'rotated'
  ),
  'GW1200-fresh',
  'fresh bind keeps nothing from the old station type'
);

SELECT lives_ok(
  $$DO $body$
    DECLARE
      claim uuid;
      did boolean;
    BEGIN
      SELECT claim_id INTO claim
      FROM public.pgtap_ecowitt_hardening_scratch
      WHERE k = 'rotated';
      PERFORM set_config(
        'request.jwt.claims',
        '{"sub":"11111111-1111-4111-8111-111111111111","is_anonymous":false}',
        true
      );
      EXECUTE 'SET LOCAL ROLE authenticated';
      SELECT public.revoke_ecowitt_custom_upload_claim(claim) INTO did;
      IF did IS NOT TRUE THEN
        RAISE EXCEPTION 'revoke failed';
      END IF;
    END
  $body$
$$,
  'owner revoke after rotate runs'
);

SELECT is(
  (
    SELECT claims.token_sha256 IS NULL AND claims.passkey_sha256 IS NULL
    FROM public.ecowitt_custom_upload_claims AS claims
    JOIN public.pgtap_ecowitt_hardening_scratch AS scratch
      ON scratch.claim_id = claims.id
     AND scratch.k = 'rotated'
  ),
  true,
  'revoke clears the token hash'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.ecowitt_custom_upload_claims
    WHERE token_sha256 = encode(
      extensions.digest(
        convert_to(
          (SELECT token FROM public.pgtap_ecowitt_hardening_scratch WHERE k = 'rotated'),
          'utf8'
        ),
        'sha256'
      ),
      'hex'
    )
  ),
  0,
  'revoke leaves no claim a later POST can match, so that POST inserts no rows'
);

SELECT lives_ok(
  $$DO $body$
    DECLARE
      claim uuid;
    BEGIN
      PERFORM set_config(
        'request.jwt.claims',
        '{"sub":"44444444-4444-4444-8444-444444444444","is_anonymous":false}',
        true
      );
      EXECUTE 'SET LOCAL ROLE authenticated';
      SELECT claim_id INTO claim
      FROM public.create_ecowitt_custom_upload_claim(
        '33333333-3333-4333-8333-333333333333'::uuid
      );
      INSERT INTO public.pgtap_ecowitt_hardening_scratch (k, claim_id)
      VALUES ('concurrent', claim);
    END
  $body$
$$,
  'owner B creates the claim the race binds'
);

SELECT lives_ok(
  $$DO $body$
    DECLARE
      conn text;
      claim uuid;
      hash_a text := repeat('cd', 32);
      hash_b text := repeat('ef', 32);
    BEGIN
      SELECT claim_id INTO claim
      FROM public.pgtap_ecowitt_hardening_scratch
      WHERE k = 'concurrent';
      conn := format(
        'host=127.0.0.1 port=%s dbname=%s user=postgres',
        current_setting('port'),
        current_database()
      );
      PERFORM dblink_connect('bind_a', conn);
      PERFORM dblink_connect('bind_b', conn);
      PERFORM dblink_exec('bind_a', 'SET ROLE service_role');
      PERFORM dblink_exec('bind_b', 'SET ROLE service_role');
      PERFORM dblink_send_query(
        'bind_a',
        format(
          'SELECT public.bind_ecowitt_custom_upload_claim(%L::uuid, %L, %L)',
          claim,
          hash_a,
          'GW1200A'
        )
      );
      PERFORM dblink_send_query(
        'bind_b',
        format(
          'SELECT public.bind_ecowitt_custom_upload_claim(%L::uuid, %L, %L)',
          claim,
          hash_b,
          'GW1200B'
        )
      );
      PERFORM 1 FROM dblink_get_result('bind_a') AS t(ok boolean);
      PERFORM 1 FROM dblink_get_result('bind_a') AS t(ok boolean);
      PERFORM 1 FROM dblink_get_result('bind_b') AS t(ok boolean);
      PERFORM 1 FROM dblink_get_result('bind_b') AS t(ok boolean);
      PERFORM dblink_disconnect('bind_a');
      PERFORM dblink_disconnect('bind_b');
      UPDATE public.pgtap_ecowitt_hardening_scratch
      SET token = hash_a || ',' || hash_b
      WHERE k = 'concurrent';
    END
  $body$
$$,
  'two passkeys race to bind one claim'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.ecowitt_custom_upload_claims AS claims
    JOIN public.pgtap_ecowitt_hardening_scratch AS scratch
      ON scratch.claim_id = claims.id
     AND scratch.k = 'concurrent'
    WHERE claims.passkey_sha256 IS NOT NULL
  ),
  1,
  'concurrent bind leaves exactly one passkey'
);

SELECT ok(
  (
    SELECT claims.passkey_sha256 = ANY (string_to_array(scratch.token, ','))
       AND claims.stationtype IN ('GW1200A', 'GW1200B')
    FROM public.ecowitt_custom_upload_claims AS claims
    JOIN public.pgtap_ecowitt_hardening_scratch AS scratch
      ON scratch.claim_id = claims.id
     AND scratch.k = 'concurrent'
  ),
  'the winning bind is one of the two passkeys'
);

SELECT * FROM finish(true);
