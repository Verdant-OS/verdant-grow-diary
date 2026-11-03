-- Disposable-local proof for EcoWitt custom-upload claims.
-- Do not run this against a hosted database. Nothing here is applied or deployed.
-- finish(true) raises when an assert fails. The workflow passes ON_ERROR_STOP=1
-- so that raise becomes a non-zero job exit.
--
--   createdb ecowitt_claims_pgtap
--   psql -d ecowitt_claims_pgtap -v ON_ERROR_STOP=1 -f supabase/tests/ecowitt_custom_upload_claims_pgtap.sql
--   dropdb ecowitt_claims_pgtap

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

CREATE TABLE public.tents (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL
);

INSERT INTO public.tents (id, user_id) VALUES
  ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111'),
  ('33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444');

\ir ../migrations/20261102150000_ecowitt_custom_upload_claims.sql

CREATE TABLE public.sensor_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tent_id uuid NOT NULL,
  metric text NOT NULL,
  value numeric NOT NULL,
  quality text NOT NULL,
  source text NOT NULL,
  captured_at timestamptz NOT NULL,
  ts timestamptz NOT NULL DEFAULT now(),
  raw_payload jsonb
);

CREATE UNIQUE INDEX sensor_readings_dedupe_uidx
  ON public.sensor_readings (user_id, tent_id, source, metric, captured_at);

CREATE TABLE public.pgtap_ecowitt_scratch (
  k text PRIMARY KEY,
  claim_id uuid,
  token text
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pgtap_ecowitt_scratch
  TO authenticated, service_role;

SELECT plan(68);

SELECT has_table(
  'public'::name,
  'ecowitt_custom_upload_claims'::name,
  'claims table exists'
);

SELECT is(
  (
    SELECT c.relrowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'ecowitt_custom_upload_claims'
  ),
  true,
  'row level security is enabled'
);

SELECT has_index(
  'public'::name,
  'ecowitt_custom_upload_claims'::name,
  'ecowitt_custom_upload_claims_one_open_tent'::name,
  'one open claim per tent is indexed'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ecowitt_custom_upload_claims'
      AND policyname = 'ecowitt_custom_upload_claims_owner_select'
      AND cmd = 'SELECT'
      AND 'authenticated' = ANY (roles)
  ),
  'authenticated owners have a select policy'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.ecowitt_custom_upload_claims', 'SELECT'),
  'anon has no select grant'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.create_ecowitt_custom_upload_claim(uuid)',
    'EXECUTE'
  ),
  'anon cannot execute create'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.ecowitt_custom_upload_claims', 'SELECT'),
  'authenticated can select'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.ecowitt_custom_upload_claims', 'INSERT'),
  'authenticated cannot insert directly'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.reserve_ecowitt_custom_upload_receipt(uuid,timestamptz,timestamptz)',
    'EXECUTE'
  ),
  'service role can execute reserve'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.reserve_ecowitt_custom_upload_receipt(uuid,timestamptz,timestamptz)',
    'EXECUTE'
  ),
  'authenticated cannot execute reserve'
);

SELECT throws_ok(
  $$DO $body$
    BEGIN
      PERFORM set_config(
        'request.jwt.claims',
        '{"sub":"11111111-1111-4111-8111-111111111111","is_anonymous":true}',
        true
      );
      EXECUTE 'SET LOCAL ROLE authenticated';
      PERFORM public.create_ecowitt_custom_upload_claim(
        '22222222-2222-4222-8222-222222222222'::uuid
      );
    END
  $body$
$$,
  'P0001',
  'not allowed',
  'an anonymous session cannot create a claim'
);

SELECT throws_ok(
  $$DO $body$
    BEGIN
      EXECUTE 'SET LOCAL ROLE anon';
      PERFORM public.create_ecowitt_custom_upload_claim(
        '22222222-2222-4222-8222-222222222222'::uuid
      );
    END
  $body$
$$,
  '42501',
  NULL,
  'anon cannot create a claim'
);

SELECT throws_ok(
  $$DO $body$
    BEGIN
      EXECUTE 'SET LOCAL ROLE anon';
      PERFORM 1 FROM public.ecowitt_custom_upload_claims;
    END
  $body$
$$,
  '42501',
  NULL,
  'anon cannot read claims'
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
      PERFORM public.create_ecowitt_custom_upload_claim(
        '22222222-2222-4222-8222-222222222222'::uuid
      );
    END
  $body$
$$,
  'P0001',
  'tent not found',
  'owner B cannot create a claim for owner A tent'
);

SELECT lives_ok(
  $$DO $body$
    DECLARE
      rec record;
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
      INSERT INTO public.pgtap_ecowitt_scratch (k, claim_id, token)
      VALUES ('created', rec.claim_id, rec.upload_token);
    END
  $body$
$$,
  'owner A creates one claim'
);

SELECT ok(
  (SELECT token FROM public.pgtap_ecowitt_scratch WHERE k = 'created') ~ '^[0-9a-f]{48}$',
  'owner create returns a 48 hex token'
);

SELECT is(
  (
    SELECT claims.token_sha256
    FROM public.ecowitt_custom_upload_claims AS claims
    JOIN public.pgtap_ecowitt_scratch AS scratch
      ON scratch.claim_id = claims.id
     AND scratch.k = 'created'
  ),
  encode(
    extensions.digest(
      convert_to((SELECT token FROM public.pgtap_ecowitt_scratch WHERE k = 'created'), 'utf8'),
      'sha256'
    ),
    'hex'
  ),
  'stored hash is extensions.digest of the raw token'
);

SELECT throws_ok(
  $$DO $body$
    BEGIN
      PERFORM set_config(
        'request.jwt.claims',
        '{"sub":"11111111-1111-4111-8111-111111111111","is_anonymous":false}',
        true
      );
      EXECUTE 'SET LOCAL ROLE authenticated';
      PERFORM public.create_ecowitt_custom_upload_claim(
        '22222222-2222-4222-8222-222222222222'::uuid
      );
    END
  $body$
$$,
  'P0001',
  'active claim exists',
  'owner A cannot open a second claim'
);

SELECT throws_ok(
  $$INSERT INTO public.ecowitt_custom_upload_claims (user_id, tent_id, token_sha256)
    VALUES (
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      repeat('ab', 32)
    )$$,
  '23505',
  NULL,
  'the one-open index rejects a second open row'
);

SELECT lives_ok(
  $$DO $body$
    DECLARE
      seen integer;
    BEGIN
      PERFORM set_config(
        'request.jwt.claims',
        '{"sub":"11111111-1111-4111-8111-111111111111","is_anonymous":false}',
        true
      );
      EXECUTE 'SET LOCAL ROLE authenticated';
      SELECT count(*)::integer INTO seen FROM public.ecowitt_custom_upload_claims;
      INSERT INTO public.pgtap_ecowitt_scratch (k, token) VALUES ('count_a', seen::text);
    END
  $body$
$$,
  'owner A count runs under RLS'
);

SELECT is(
  (SELECT token::integer FROM public.pgtap_ecowitt_scratch WHERE k = 'count_a'),
  1,
  'owner A sees the open claim'
);

SELECT lives_ok(
  $$DO $body$
    DECLARE
      seen integer;
    BEGIN
      PERFORM set_config(
        'request.jwt.claims',
        '{"sub":"44444444-4444-4444-8444-444444444444","is_anonymous":false}',
        true
      );
      EXECUTE 'SET LOCAL ROLE authenticated';
      SELECT count(*)::integer INTO seen FROM public.ecowitt_custom_upload_claims;
      INSERT INTO public.pgtap_ecowitt_scratch (k, token) VALUES ('count_b', seen::text);
    END
  $body$
$$,
  'owner B count runs under RLS'
);

SELECT is(
  (SELECT token::integer FROM public.pgtap_ecowitt_scratch WHERE k = 'count_b'),
  0,
  'owner B sees no claim'
);

SELECT lives_ok(
  $$DO $body$
    DECLARE
      result text;
      claim uuid;
    BEGIN
      SELECT claim_id INTO claim FROM public.pgtap_ecowitt_scratch WHERE k = 'created';
      EXECUTE 'SET LOCAL ROLE service_role';
      SELECT public.reserve_ecowitt_custom_upload_receipt(
        claim,
        '2026-11-02 18:00:00+00',
        '2026-11-02 18:00:00+00'
      ) INTO result;
      INSERT INTO public.pgtap_ecowitt_scratch (k, token) VALUES ('reserve_1', result);
    END
  $body$
$$,
  'service role reserves the first receipt'
);

SELECT is(
  (SELECT token FROM public.pgtap_ecowitt_scratch WHERE k = 'reserve_1'),
  'ok',
  'first reserve is accepted'
);

SELECT is(
  (
    SELECT claims.last_received_at = '2026-11-02 18:00:00+00'::timestamptz
    FROM public.ecowitt_custom_upload_claims AS claims
    JOIN public.pgtap_ecowitt_scratch AS scratch
      ON scratch.claim_id = claims.id
     AND scratch.k = 'created'
  ),
  true,
  'first reserve stores last_received_at'
);

SELECT lives_ok(
  $$DO $body$
    DECLARE
      result text;
      claim uuid;
    BEGIN
      SELECT claim_id INTO claim FROM public.pgtap_ecowitt_scratch WHERE k = 'created';
      EXECUTE 'SET LOCAL ROLE service_role';
      SELECT public.reserve_ecowitt_custom_upload_receipt(
        claim,
        '2026-11-02 18:00:07+00',
        '2026-11-02 18:00:00+00'
      ) INTO result;
      INSERT INTO public.pgtap_ecowitt_scratch (k, token) VALUES ('reserve_7', result);
    END
  $body$
$$,
  'a receipt inside the gap is attempted'
);

SELECT is(
  (SELECT token FROM public.pgtap_ecowitt_scratch WHERE k = 'reserve_7'),
  'rate_limited',
  'seven seconds later is rate limited'
);

SELECT is(
  (
    SELECT claims.last_received_at = '2026-11-02 18:00:00+00'::timestamptz
    FROM public.ecowitt_custom_upload_claims AS claims
    JOIN public.pgtap_ecowitt_scratch AS scratch
      ON scratch.claim_id = claims.id
     AND scratch.k = 'created'
  ),
  true,
  'rate limit does not move the receipt clock'
);

SELECT lives_ok(
  $$DO $body$
    DECLARE
      result text;
      claim uuid;
    BEGIN
      SELECT claim_id INTO claim FROM public.pgtap_ecowitt_scratch WHERE k = 'created';
      EXECUTE 'SET LOCAL ROLE service_role';
      SELECT public.reserve_ecowitt_custom_upload_receipt(
        claim,
        '2026-11-02 18:00:09+00',
        '2026-11-02 18:00:00+00'
      ) INTO result;
      INSERT INTO public.pgtap_ecowitt_scratch (k, token) VALUES ('reserve_9', result);
    END
  $body$
$$,
  'the same captured time after the gap is attempted'
);

SELECT is(
  (SELECT token FROM public.pgtap_ecowitt_scratch WHERE k = 'reserve_9'),
  'duplicate_captured_at',
  'nine seconds later with the same captured time is a duplicate'
);

SELECT is(
  (
    SELECT claims.last_captured_at = '2026-11-02 18:00:00+00'::timestamptz
    FROM public.ecowitt_custom_upload_claims AS claims
    JOIN public.pgtap_ecowitt_scratch AS scratch
      ON scratch.claim_id = claims.id
     AND scratch.k = 'created'
  ),
  true,
  'a duplicate does not replace last_captured_at'
);

SELECT lives_ok(
  $$DO $body$
    DECLARE
      result text;
      claim uuid;
    BEGIN
      SELECT claim_id INTO claim FROM public.pgtap_ecowitt_scratch WHERE k = 'created';
      EXECUTE 'SET LOCAL ROLE service_role';
      SELECT public.reserve_ecowitt_custom_upload_receipt(
        claim,
        '2026-11-02 18:00:18+00',
        '2026-11-02 18:00:18+00'
      ) INTO result;
      INSERT INTO public.pgtap_ecowitt_scratch (k, token) VALUES ('reserve_18', result);
    END
  $body$
$$,
  'a later distinct receipt is attempted'
);

SELECT is(
  (SELECT token FROM public.pgtap_ecowitt_scratch WHERE k = 'reserve_18'),
  'ok',
  'eighteen seconds later with a new captured time is accepted'
);

SELECT is(
  (
    SELECT claims.last_captured_at = '2026-11-02 18:00:18+00'::timestamptz
    FROM public.ecowitt_custom_upload_claims AS claims
    JOIN public.pgtap_ecowitt_scratch AS scratch
      ON scratch.claim_id = claims.id
     AND scratch.k = 'created'
  ),
  true,
  'the accepted reserve stores the new captured time'
);

SELECT lives_ok(
  $$DO $body$
    DECLARE
      claim uuid;
      did boolean;
    BEGIN
      SELECT claim_id INTO claim FROM public.pgtap_ecowitt_scratch WHERE k = 'created';
      PERFORM set_config(
        'request.jwt.claims',
        '{"sub":"44444444-4444-4444-8444-444444444444","is_anonymous":false}',
        true
      );
      EXECUTE 'SET LOCAL ROLE authenticated';
      SELECT public.revoke_ecowitt_custom_upload_claim(claim) INTO did;
      INSERT INTO public.pgtap_ecowitt_scratch (k, token) VALUES ('revoke_b', did::text);
    END
  $body$
$$,
  'owner B revoke runs'
);

SELECT is(
  (SELECT token FROM public.pgtap_ecowitt_scratch WHERE k = 'revoke_b'),
  'false',
  'owner B cannot revoke owner A claim'
);

SELECT ok(
  (
    SELECT claims.revoked_at IS NULL
    FROM public.ecowitt_custom_upload_claims AS claims
    JOIN public.pgtap_ecowitt_scratch AS scratch
      ON scratch.claim_id = claims.id
     AND scratch.k = 'created'
  ),
  'owner B revoke leaves the claim open'
);

SELECT throws_ok(
  $$DO $body$
    DECLARE
      claim uuid;
    BEGIN
      SELECT claim_id INTO claim FROM public.pgtap_ecowitt_scratch WHERE k = 'created';
      PERFORM set_config(
        'request.jwt.claims',
        '{"sub":"44444444-4444-4444-8444-444444444444","is_anonymous":false}',
        true
      );
      EXECUTE 'SET LOCAL ROLE authenticated';
      PERFORM public.rotate_ecowitt_custom_upload_claim(claim);
    END
  $body$
$$,
  'P0001',
  'claim not found',
  'owner B cannot rotate owner A claim'
);

INSERT INTO public.pgtap_ecowitt_scratch (k, token)
SELECT 'old_hash', claims.token_sha256
FROM public.ecowitt_custom_upload_claims AS claims
JOIN public.pgtap_ecowitt_scratch AS scratch
  ON scratch.claim_id = claims.id
 AND scratch.k = 'created';

SELECT lives_ok(
  $$DO $body$
    DECLARE
      claim uuid;
      rotated text;
    BEGIN
      SELECT claim_id INTO claim FROM public.pgtap_ecowitt_scratch WHERE k = 'created';
      PERFORM set_config(
        'request.jwt.claims',
        '{"sub":"11111111-1111-4111-8111-111111111111","is_anonymous":false}',
        true
      );
      EXECUTE 'SET LOCAL ROLE authenticated';
      SELECT public.rotate_ecowitt_custom_upload_claim(claim) INTO rotated;
      INSERT INTO public.pgtap_ecowitt_scratch (k, claim_id, token)
      VALUES ('rotated', claim, rotated);
    END
  $body$
$$,
  'owner A rotates the claim'
);

SELECT ok(
  (SELECT token FROM public.pgtap_ecowitt_scratch WHERE k = 'rotated') ~ '^[0-9a-f]{48}$'
  AND (SELECT token FROM public.pgtap_ecowitt_scratch WHERE k = 'rotated')
    IS DISTINCT FROM (SELECT token FROM public.pgtap_ecowitt_scratch WHERE k = 'created'),
  'rotate returns a new 48 hex token'
);

SELECT is(
  (
    SELECT claims.token_sha256
    FROM public.ecowitt_custom_upload_claims AS claims
    JOIN public.pgtap_ecowitt_scratch AS scratch
      ON scratch.claim_id = claims.id
     AND scratch.k = 'created'
  ),
  encode(
    extensions.digest(
      convert_to((SELECT token FROM public.pgtap_ecowitt_scratch WHERE k = 'rotated'), 'utf8'),
      'sha256'
    ),
    'hex'
  ),
  'rotated hash is extensions.digest of the new token'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.ecowitt_custom_upload_claims
    WHERE token_sha256 = (SELECT token FROM public.pgtap_ecowitt_scratch WHERE k = 'old_hash')
  ),
  0,
  'rotate drops the previous token hash'
);

SELECT lives_ok(
  $$DO $body$
    DECLARE
      claim uuid;
      did boolean;
    BEGIN
      SELECT claim_id INTO claim FROM public.pgtap_ecowitt_scratch WHERE k = 'created';
      PERFORM set_config(
        'request.jwt.claims',
        '{"sub":"11111111-1111-4111-8111-111111111111","is_anonymous":false}',
        true
      );
      EXECUTE 'SET LOCAL ROLE authenticated';
      SELECT public.revoke_ecowitt_custom_upload_claim(claim) INTO did;
      INSERT INTO public.pgtap_ecowitt_scratch (k, token) VALUES ('revoke_a', did::text);
    END
  $body$
$$,
  'owner A revoke runs'
);

SELECT is(
  (SELECT token FROM public.pgtap_ecowitt_scratch WHERE k = 'revoke_a'),
  'true',
  'owner A revoke returns true'
);

SELECT lives_ok(
  $$DO $body$
    DECLARE
      result text;
      claim uuid;
    BEGIN
      SELECT claim_id INTO claim FROM public.pgtap_ecowitt_scratch WHERE k = 'created';
      EXECUTE 'SET LOCAL ROLE service_role';
      SELECT public.reserve_ecowitt_custom_upload_receipt(
        claim,
        '2026-11-02 18:01:00+00',
        '2026-11-02 18:01:00+00'
      ) INTO result;
      INSERT INTO public.pgtap_ecowitt_scratch (k, token) VALUES ('reserve_revoked', result);
    END
  $body$
$$,
  'reserve after revoke runs'
);

SELECT is(
  (SELECT token FROM public.pgtap_ecowitt_scratch WHERE k = 'reserve_revoked'),
  'claim_not_found',
  'a revoked claim cannot reserve a receipt'
);

SELECT throws_ok(
  $$DO $body$
    BEGIN
      EXECUTE 'SET LOCAL ROLE authenticated';
      PERFORM public.reserve_ecowitt_custom_upload_receipt(
        '11111111-1111-4111-8111-111111111111'::uuid,
        '2026-11-02 18:00:00+00'::timestamptz,
        '2026-11-02 18:00:00+00'::timestamptz
      );
    END
  $body$
$$,
  '42501',
  NULL,
  'authenticated cannot call reserve'
);

SELECT lives_ok(
  $$DO $body$
    DECLARE
      rec record;
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
      INSERT INTO public.pgtap_ecowitt_scratch (k, claim_id, token)
      VALUES ('created_again', rec.claim_id, rec.upload_token);
    END
  $body$
$$,
  'owner A can create again after revoke'
);

SELECT ok(
  (SELECT token FROM public.pgtap_ecowitt_scratch WHERE k = 'created_again') ~ '^[0-9a-f]{48}$',
  'the claim created after revoke is a 48 hex token'
);

SELECT lives_ok(
  $$DO $body$
    DECLARE
      cid uuid := (SELECT claim_id FROM public.pgtap_ecowitt_scratch WHERE k = 'created_again');
      first_bind boolean;
      second_bind boolean;
    BEGIN
      first_bind := public.bind_ecowitt_custom_upload_claim(
        cid,
        repeat('ab', 32),
        'GW1200',
        '2026-11-02 18:00:00+00'
      );
      second_bind := public.bind_ecowitt_custom_upload_claim(
        cid,
        repeat('cd', 32),
        'GW1200B',
        '2026-11-02 18:01:00+00'
      );
      IF first_bind IS NOT TRUE OR second_bind IS NOT FALSE THEN
        RAISE EXCEPTION 'bind results % %', first_bind, second_bind;
      END IF;
      IF (
        SELECT passkey_sha256
        FROM public.ecowitt_custom_upload_claims
        WHERE id = cid
      ) IS DISTINCT FROM repeat('ab', 32) THEN
        RAISE EXCEPTION 'second bind replaced the passkey';
      END IF;
    END
  $body$
$$,
  'bind updates only while passkey_sha256 is null'
);

SELECT has_function(
  'public'::name,
  'commit_ecowitt_custom_upload_ingest'::name,
  ARRAY['uuid', 'timestamptz', 'timestamptz', 'text', 'text', 'jsonb']::name[],
  'commit ingest is one function'
);

SELECT throws_ok(
  $$DO $body$
    BEGIN
      EXECUTE 'SET LOCAL ROLE authenticated';
      PERFORM public.commit_ecowitt_custom_upload_ingest(
        '11111111-1111-4111-8111-111111111111'::uuid,
        '2026-11-02 18:00:00+00'::timestamptz,
        '2026-11-02 18:00:00+00'::timestamptz,
        repeat('ab', 32),
        'GW1200',
        '[{"metric":"humidity_pct","value":55,"quality":"ok"}]'::jsonb
      );
    END
  $body$
$$,
  '42501',
  NULL,
  'authenticated cannot call commit'
);

SELECT lives_ok(
  $$DO $body$
    DECLARE
      cid uuid := (SELECT claim_id FROM public.pgtap_ecowitt_scratch WHERE k = 'created_again');
      result text;
    BEGIN
      result := public.commit_ecowitt_custom_upload_ingest(
        cid,
        '2026-11-02 19:00:00+00',
        '2026-11-02 19:00:00+00',
        repeat('ab', 32),
        'GW1200',
        '[{"metric":"humidity_pct","value":55,"quality":"ok","raw_payload":{"vendor":"ecowitt"}}]'::jsonb
      );
      IF result IS DISTINCT FROM 'ok' THEN
        RAISE EXCEPTION 'commit result %', result;
      END IF;
    END
  $body$
$$,
  'service commit stores the reading and binds the first sender'
);

SELECT is(
  (SELECT count(*)::integer FROM public.sensor_readings),
  1,
  'the first commit stored one row'
);

SELECT is(
  (SELECT passkey_sha256 FROM public.ecowitt_custom_upload_claims
    WHERE id = (SELECT claim_id FROM public.pgtap_ecowitt_scratch WHERE k = 'created_again')),
  repeat('ab', 32),
  'the first sender is bound'
);

SELECT is(
  public.commit_ecowitt_custom_upload_ingest(
    (SELECT claim_id FROM public.pgtap_ecowitt_scratch WHERE k = 'created_again'),
    '2026-11-02 19:00:01+00',
    '2026-11-02 19:00:10+00',
    repeat('cd', 32),
    'GW1200B',
    '[{"metric":"humidity_pct","value":40,"quality":"ok"}]'::jsonb
  ),
  'rate_limited',
  'a second packet inside the gap is rate limited'
);

SELECT is(
  (SELECT count(*)::integer FROM public.sensor_readings),
  1,
  'a rate-limited commit stores zero rows'
);

SELECT is(
  public.commit_ecowitt_custom_upload_ingest(
    (SELECT claim_id FROM public.pgtap_ecowitt_scratch WHERE k = 'created_again'),
    '2026-11-02 20:00:00+00',
    '2026-11-02 18:00:00+00',
    repeat('ab', 32),
    'GW1200',
    '[{"metric":"humidity_pct","value":40,"quality":"ok"}]'::jsonb
  ),
  'duplicate_captured_at',
  'an older captured_at is a replay'
);

SELECT is(
  public.commit_ecowitt_custom_upload_ingest(
    (SELECT claim_id FROM public.pgtap_ecowitt_scratch WHERE k = 'created_again'),
    '2026-11-02 20:00:00+00',
    '2026-11-02 20:00:00+00',
    repeat('cd', 32),
    'GW1200B',
    '[{"metric":"humidity_pct","value":40,"quality":"ok"}]'::jsonb
  ),
  'passkey_mismatch',
  'a second passkey stores nothing'
);

SELECT is(
  (SELECT count(*)::integer FROM public.sensor_readings),
  1,
  'the mismatched passkey stored zero rows'
);

SELECT lives_ok(
  $$DO $body$
    DECLARE
      cid uuid := (SELECT claim_id FROM public.pgtap_ecowitt_scratch WHERE k = 'created_again');
    BEGIN
      PERFORM set_config(
        'request.jwt.claims',
        '{"sub":"11111111-1111-4111-8111-111111111111","is_anonymous":false}',
        true
      );
      UPDATE public.ecowitt_custom_upload_claims
      SET revoked_at = clock_timestamp()
      WHERE id = cid;
      IF public.commit_ecowitt_custom_upload_ingest(
        cid,
        '2026-11-02 21:00:00+00',
        '2026-11-02 21:00:00+00',
        repeat('ab', 32),
        'GW1200',
        '[{"metric":"humidity_pct","value":40,"quality":"ok"}]'::jsonb
      ) IS DISTINCT FROM 'claim_not_found' THEN
        RAISE EXCEPTION 'revoked claim stored';
      END IF;
      UPDATE public.ecowitt_custom_upload_claims
      SET revoked_at = NULL
      WHERE id = cid;
    END
  $body$
$$,
  'a revoked claim stores zero rows'
);

SELECT lives_ok(
  $$DO $body$
    DECLARE
      cid uuid := (SELECT claim_id FROM public.pgtap_ecowitt_scratch WHERE k = 'created_again');
      rotated text;
    BEGIN
      PERFORM set_config(
        'request.jwt.claims',
        '{"sub":"11111111-1111-4111-8111-111111111111","is_anonymous":false}',
        true
      );
      EXECUTE 'SET LOCAL ROLE authenticated';
      rotated := public.rotate_ecowitt_custom_upload_claim(cid);
      IF rotated !~ '^[0-9a-f]{48}$' THEN
        RAISE EXCEPTION 'rotate token %', rotated;
      END IF;
      IF (
        SELECT passkey_sha256 IS NULL AND bound_at IS NULL AND stationtype IS NULL
        FROM public.ecowitt_custom_upload_claims
        WHERE id = cid
      ) IS NOT TRUE THEN
        RAISE EXCEPTION 'rotate kept the passkey binding';
      END IF;
    END
  $body$
$$,
  'rotate clears the passkey binding'
);

SELECT throws_ok(
  $$DO $body$
    DECLARE
      cid uuid := (SELECT claim_id FROM public.pgtap_ecowitt_scratch WHERE k = 'created_again');
    BEGIN
      CREATE OR REPLACE FUNCTION public.ecowitt_pgtap_fail_reading()
      RETURNS trigger LANGUAGE plpgsql AS $fn$
      BEGIN
        RAISE EXCEPTION 'forced reading failure';
      END
      $fn$;
      CREATE TRIGGER ecowitt_pgtap_fail_reading
        BEFORE INSERT ON public.sensor_readings
        FOR EACH ROW EXECUTE FUNCTION public.ecowitt_pgtap_fail_reading();
      PERFORM public.commit_ecowitt_custom_upload_ingest(
        cid,
        '2026-11-02 22:00:00+00',
        '2026-11-02 22:00:00+00',
        repeat('ab', 32),
        'GW1200',
        '[{"metric":"temperature_c","value":22,"quality":"ok"}]'::jsonb
      );
    END
  $body$
$$,
  'P0001',
  'forced reading failure',
  'a failed insert raises'
);

SELECT is(
  (SELECT count(*)::integer FROM public.sensor_readings),
  1,
  'the failed insert left the earlier row and stored nothing new'
);

SELECT is(
  (
    SELECT last_received_at = '2026-11-02 19:00:00+00'::timestamptz
    FROM public.ecowitt_custom_upload_claims
    WHERE id = (SELECT claim_id FROM public.pgtap_ecowitt_scratch WHERE k = 'created_again')
  ),
  true,
  'the failed insert rolled the reserve back'
);

SELECT lives_ok(
  $$DO $body$
    DECLARE
      cid uuid := (SELECT claim_id FROM public.pgtap_ecowitt_scratch WHERE k = 'created_again');
      result text;
    BEGIN
      DROP TRIGGER IF EXISTS ecowitt_pgtap_fail_reading ON public.sensor_readings;
      result := public.commit_ecowitt_custom_upload_ingest(
        cid,
        '2026-11-02 22:00:00+00',
        '2026-11-02 22:00:00+00',
        repeat('ab', 32),
        'GW1200',
        '[{"metric":"temperature_c","value":22,"quality":"ok"}]'::jsonb
      );
      IF result IS DISTINCT FROM 'ok' THEN
        RAISE EXCEPTION 'retry result %', result;
      END IF;
    END
  $body$
$$,
  'a retry after the failed insert stores the reading'
);

SELECT is(
  (SELECT count(*)::integer FROM public.sensor_readings),
  2,
  'the retry stored the reading'
);

SELECT * FROM finish(true);
