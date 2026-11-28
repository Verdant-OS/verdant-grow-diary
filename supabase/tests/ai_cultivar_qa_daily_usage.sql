-- Disposable-local proof for the Cultivar Q&A daily cap (security review E1).
-- Do not run this against a hosted database. Nothing here is applied or deployed.
-- finish(true) raises when an assert fails. The workflow passes ON_ERROR_STOP=1
-- so that raise becomes a non-zero job exit.
--
--   createdb cultivar_qa_cap_pgtap
--   psql -d cultivar_qa_cap_pgtap -v ON_ERROR_STOP=1 -f supabase/tests/ai_cultivar_qa_daily_usage.sql
--   dropdb cultivar_qa_cap_pgtap

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

-- Stub of the one auth object the migration references.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- Supabase grants new public tables and functions to these roles by default, so
-- the migration's REVOKEs are what keep them out. Reproduce those defaults here.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

\ir ../migrations/20261128070000_ai_cultivar_qa_daily_usage.sql

INSERT INTO auth.users (id) VALUES
  ('00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000b2');

BEGIN;
SELECT plan(17);

-- Privileges: browsers cannot reach the table or the function.
SELECT ok(
  NOT has_table_privilege('anon', 'public.ai_cultivar_qa_daily_usage', 'SELECT'),
  'anon cannot read the usage table'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.ai_cultivar_qa_daily_usage', 'SELECT'),
  'authenticated cannot read the usage table'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.ai_cultivar_qa_daily_usage', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.ai_cultivar_qa_daily_usage', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.ai_cultivar_qa_daily_usage', 'DELETE'),
  'authenticated cannot write the usage table'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.ai_cultivar_qa_consume(uuid, integer)', 'EXECUTE'),
  'anon cannot execute the consume function'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.ai_cultivar_qa_consume(uuid, integer)', 'EXECUTE'),
  'authenticated cannot execute the consume function'
);
SELECT ok(
  has_function_privilege('service_role', 'public.ai_cultivar_qa_consume(uuid, integer)', 'EXECUTE'),
  'service_role can execute the consume function'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.ai_cultivar_qa_daily_usage'::regclass),
  'row level security is on for the usage table'
);
SELECT ok(
  (SELECT prosecdef FROM pg_proc WHERE oid = 'public.ai_cultivar_qa_consume(uuid, integer)'::regprocedure)
  AND (SELECT proconfig FROM pg_proc WHERE oid = 'public.ai_cultivar_qa_consume(uuid, integer)'::regprocedure)
    @> ARRAY['search_path=""'],
  'consume is SECURITY DEFINER with an empty search_path'
);

-- Behaviour, as the service role the Edge function uses.
SET LOCAL ROLE service_role;

SELECT is(
  public.ai_cultivar_qa_consume('00000000-0000-4000-8000-0000000000a1', 2),
  '{"allowed": true, "used": 1, "limit": 2}'::jsonb,
  'first call of the day is allowed and counted'
);
SELECT is(
  public.ai_cultivar_qa_consume('00000000-0000-4000-8000-0000000000a1', 2),
  '{"allowed": true, "used": 2, "limit": 2}'::jsonb,
  'second call reaches the limit and is allowed'
);
SELECT is(
  public.ai_cultivar_qa_consume('00000000-0000-4000-8000-0000000000a1', 2),
  '{"allowed": false, "used": 2, "limit": 2}'::jsonb,
  'third call is denied and not counted'
);
SELECT is(
  public.ai_cultivar_qa_consume('00000000-0000-4000-8000-0000000000b2', 2),
  '{"allowed": true, "used": 1, "limit": 2}'::jsonb,
  'another user has their own count'
);
SELECT is(
  public.ai_cultivar_qa_consume(NULL, 2),
  '{"allowed": false, "used": 0, "limit": 2}'::jsonb,
  'a null user is denied'
);
SELECT is(
  public.ai_cultivar_qa_consume('00000000-0000-4000-8000-0000000000b2', 0),
  '{"allowed": false, "used": 0, "limit": 0}'::jsonb,
  'a zero limit is denied'
);

RESET ROLE;

SELECT is(
  (SELECT call_count FROM public.ai_cultivar_qa_daily_usage
    WHERE user_id = '00000000-0000-4000-8000-0000000000a1'),
  2,
  'the denied call left the stored count at the limit'
);

-- A row from an earlier UTC day does not count against today.
UPDATE public.ai_cultivar_qa_daily_usage
  SET usage_day = usage_day - 1
  WHERE user_id = '00000000-0000-4000-8000-0000000000a1';
SET LOCAL ROLE service_role;
SELECT is(
  public.ai_cultivar_qa_consume('00000000-0000-4000-8000-0000000000a1', 2),
  '{"allowed": true, "used": 1, "limit": 2}'::jsonb,
  'a new UTC day starts a new count'
);
RESET ROLE;

SELECT throws_ok(
  $$ SET LOCAL ROLE authenticated;
     SELECT public.ai_cultivar_qa_consume('00000000-0000-4000-8000-0000000000a1', 1000) $$,
  '42501',
  NULL,
  'an authenticated caller is refused by Postgres'
);
RESET ROLE;

SELECT * FROM finish(true);
ROLLBACK;
