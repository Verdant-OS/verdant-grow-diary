#!/usr/bin/env node
/** Local-only PostgreSQL 15 runtime harness for the Quick Log manual delegate repair. */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATALOG_STATE_QUERY_SQL,
  buildLedgerInsertSql,
  classifyPreflight,
  parsePreflightStdout,
} from "./apply-quicklog-manual-delegate-forward-repair.mjs";

const MAX_PSQL_OUTPUT_BYTES = 1_048_576;
const DISPOSABLE_DATABASE = "verdant_quicklog_delegate_repair";
const DISPOSABLE_DATABASE_USER = "postgres";
const DISPOSABLE_DATABASE_PORT = "5432";
const DISPOSABLE_SENTINEL = "verdant_quicklog_delegate_repair_pg15_disposable_v1";
const PINNED_MIGRATION_VERSION = "20260818010000";
const PINNED_MIGRATION_FILE = "20260818010000_quicklog_manual_delegate_forward_repair.sql";
const EXPECTED_MIGRATION_SHA256 =
  "641c033a6453b180505cfb4eead8c97ec0c89c7ec0a501a64d4d5b1b71897b1c";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_GROW_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER_TENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER_PLANT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_GROW_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OTHER_TENT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const OTHER_PLANT_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const SUCCESS_KEY = "delegate-repair-success-0001";
const CONCURRENT_KEY = "delegate-repair-concurrent-0001";

const MANUAL_SIGNATURE = `
  text, uuid, text, numeric, text, numeric, numeric, numeric,
  timestamptz, jsonb, text, text
`;

function fail(code) {
  process.stderr.write(`Quick Log manual delegate PG15 harness failed: ${code}\n`);
  return 1;
}

export function formatPsqlFailureCode(stage, stderr) {
  const match = /(?:SQL state|SQLSTATE)[: ]+([0-9A-Z]{5})|^ERROR:\s*([0-9A-Z]{5})\s*$/im.exec(
    String(stderr ?? ""),
  );
  return `${stage}:${(match?.[1] ?? match?.[2])?.toUpperCase() ?? "unknown"}`;
}

export function buildPsqlArgs({ quiet }) {
  return ["-X", ...(quiet ? ["-q"] : []), "-A", "-t", "-v", "ON_ERROR_STOP=1"];
}

function disposableConnection(value) {
  try {
    const url = new URL(value);
    if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) return null;
    if (!new Set(["127.0.0.1", "localhost", "::1", "[::1]"]).has(url.hostname)) return null;
    if (
      url.username !== DISPOSABLE_DATABASE_USER ||
      url.port !== DISPOSABLE_DATABASE_PORT ||
      url.pathname !== `/${DISPOSABLE_DATABASE}` ||
      !url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    const password = decodeURIComponent(url.password);
    if (!password || /[\u0000\r\n]/.test(password)) return null;
    return Object.freeze({
      hostname: url.hostname.replace(/^\[(.*)\]$/, "$1"),
      password,
    });
  } catch {
    return null;
  }
}

function psqlEnvironment(connection, containerId, containerRuntime, source = process.env) {
  return {
    PATH: source.PATH ?? "",
    SYSTEMROOT: source.SYSTEMROOT ?? source.SystemRoot ?? "",
    PGHOST: connection.hostname,
    PGPORT: DISPOSABLE_DATABASE_PORT,
    PGUSER: DISPOSABLE_DATABASE_USER,
    PGPASSWORD: connection.password,
    PGDATABASE: DISPOSABLE_DATABASE,
    PGCONNECT_TIMEOUT: "5",
    PGAPPNAME: "verdant-quicklog-manual-delegate-pg15-harness",
    VERDANT_QUICKLOG_PG15_CONTAINER: containerId ?? "",
    VERDANT_QUICKLOG_PG15_CONTAINER_RUNTIME: containerRuntime ?? "docker",
  };
}

function psqlCommand(env, psqlArgs) {
  const containerId = env.VERDANT_QUICKLOG_PG15_CONTAINER;
  if (!containerId) return { command: "psql", args: psqlArgs };
  const dockerArgs = [
    "exec",
    "-i",
    "-e",
    `PGHOST=${env.PGHOST}`,
    "-e",
    `PGPORT=${env.PGPORT}`,
    "-e",
    `PGUSER=${env.PGUSER}`,
    "-e",
    `PGPASSWORD=${env.PGPASSWORD}`,
    "-e",
    `PGDATABASE=${env.PGDATABASE}`,
    "-e",
    `PGAPPNAME=${env.PGAPPNAME}`,
    containerId,
    "psql",
    ...psqlArgs,
  ];
  if (env.VERDANT_QUICKLOG_PG15_CONTAINER_RUNTIME === "wsl-docker") {
    return {
      command: "wsl.exe",
      args: ["-d", "Ubuntu", "--", "docker", ...dockerArgs],
    };
  }
  return { command: "docker", args: dockerArgs };
}

function spawnPsql({ env, input, file, spawnImpl = spawnSync }) {
  const args = buildPsqlArgs({ quiet: true });
  if (file) args.push("--file", file);
  const invocation = psqlCommand(env, args);
  return spawnImpl(invocation.command, invocation.args, {
    encoding: "utf8",
    env,
    input,
    maxBuffer: MAX_PSQL_OUTPUT_BYTES,
  });
}

function executeSql(sql, env, { stage = "sql", spawnImpl = spawnSync } = {}) {
  const result = spawnPsql({ env, input: sql, spawnImpl });
  if (result?.error || result?.status !== 0) {
    throw new Error(formatPsqlFailureCode(stage, result?.stderr));
  }
  return String(result.stdout ?? "").trim();
}

function extractFunctionDefinition(relativePath, functionPrefix) {
  const source = readFileSync(resolve(repoRoot, relativePath), "utf8");
  const start = source.indexOf(functionPrefix);
  if (start < 0 || source.indexOf(functionPrefix, start + functionPrefix.length) >= 0) {
    throw new Error("dependency_source_missing_or_ambiguous");
  }
  const terminator = "\n$function$;";
  const end = source.indexOf(terminator, start);
  if (end < 0) throw new Error("dependency_source_malformed");
  return source.slice(start, end + terminator.length);
}

const defectiveDelegateDefinition = extractFunctionDefinition(
  "supabase/migrations/20260722165149_922e7389-1a95-4bc4-8efb-12f3a98e33f7.sql",
  "CREATE FUNCTION public.quicklog_save_manual(\n",
);
const tryParseLoggedAtDefinition = extractFunctionDefinition(
  "supabase/migrations/20260725024026_quicklog_dual_timestamp_foundation.sql",
  "CREATE FUNCTION public.quicklog_try_parse_logged_at(p_value text)\n",
);
const tryParseUuidSource = extractFunctionDefinition(
  "supabase/migrations/20260725024026_quicklog_dual_timestamp_foundation.sql",
  "CREATE FUNCTION public.quicklog_try_parse_uuid(p_value text)\n",
);
const tryParseUuidDefinition = tryParseUuidSource.replace(
  "  END IF;\n\n  BEGIN",
  "  END IF;\n  BEGIN",
);
if (tryParseUuidDefinition === tryParseUuidSource) {
  throw new Error("dependency_source_shape_drift");
}
const tryParseUuidFreshReplayDefinition = tryParseUuidSource.replace(
  "CREATE FUNCTION public.quicklog_try_parse_uuid",
  "CREATE OR REPLACE FUNCTION public.quicklog_try_parse_uuid",
);
if (tryParseUuidFreshReplayDefinition === tryParseUuidSource) {
  throw new Error("dependency_source_shape_drift");
}
const stampDiaryDefinition = extractFunctionDefinition(
  "supabase/migrations/20260725024026_quicklog_dual_timestamp_foundation.sql",
  "CREATE FUNCTION public.quicklog_stamp_diary_logged_at()\n",
);
const stampGrowEventDefinition = extractFunctionDefinition(
  "supabase/migrations/20260725024026_quicklog_dual_timestamp_foundation.sql",
  "CREATE FUNCTION public.quicklog_stamp_grow_event_logged_at()\n",
);
const publicManualWrapperDefinition = extractFunctionDefinition(
  "supabase/migrations/20260725024026_quicklog_dual_timestamp_foundation.sql",
  "CREATE FUNCTION public.quicklog_save_manual(\n",
);

const BASE_SCAFFOLD_SQL = `
drop schema if exists public cascade;
drop schema if exists auth cascade;
drop schema if exists supabase_migrations cascade;
do $roles$
begin
  if not exists(select 1 from pg_roles where rolname='anon') then
    execute 'create role anon nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls';
  elsif not exists(
    select 1 from pg_roles where rolname='anon'
      and not rolsuper and not rolinherit and not rolcreaterole and not rolcreatedb
      and not rolcanlogin and not rolreplication and not rolbypassrls
  ) then
    raise exception 'existing harness role anon has unsafe attributes' using errcode = '55000';
  end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then
    execute 'create role authenticated nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls';
  elsif not exists(
    select 1 from pg_roles where rolname='authenticated'
      and not rolsuper and not rolinherit and not rolcreaterole and not rolcreatedb
      and not rolcanlogin and not rolreplication and not rolbypassrls
  ) then
    raise exception 'existing harness role authenticated has unsafe attributes' using errcode = '55000';
  end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then
    execute 'create role service_role nologin nosuperuser nocreatedb nocreaterole noinherit noreplication bypassrls';
  elsif not exists(
    select 1 from pg_roles where rolname='service_role'
      and not rolsuper and not rolinherit and not rolcreaterole and not rolcreatedb
      and not rolcanlogin and not rolreplication and rolbypassrls
  ) then
    raise exception 'existing harness role service_role has unsafe attributes' using errcode = '55000';
  end if;
  if not exists(select 1 from pg_roles where rolname='quicklog_delegate_probe') then
    execute 'create role quicklog_delegate_probe nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls';
  elsif not exists(
    select 1 from pg_roles where rolname='quicklog_delegate_probe'
      and not rolsuper and not rolinherit and not rolcreaterole and not rolcreatedb
      and not rolcanlogin and not rolreplication and not rolbypassrls
  ) then
    raise exception 'existing harness role quicklog_delegate_probe has unsafe attributes' using errcode = '55000';
  end if;
end
$roles$;

create schema public authorization postgres;
create schema auth authorization postgres;
create schema supabase_migrations authorization postgres;
grant usage on schema public, auth to anon, authenticated, service_role;

create table supabase_migrations.schema_migrations(
  version text primary key,
  name text,
  statements text[]
);

create function auth.uid()
returns uuid
language sql
stable
set search_path to 'pg_catalog', 'pg_temp'
as $$
  select nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
revoke all on function auth.uid() from public;
grant execute on function auth.uid() to anon, authenticated, service_role;

create table auth.users(id uuid primary key);
create table public.grows(
  id uuid primary key,
  user_id uuid not null references auth.users(id)
);
create table public.tents(
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  grow_id uuid not null references public.grows(id)
);
create table public.plants(
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  grow_id uuid not null references public.grows(id),
  tent_id uuid references public.tents(id)
);
create table public.grow_events(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  grow_id uuid not null references public.grows(id),
  tent_id uuid references public.tents(id),
  plant_id uuid references public.plants(id),
  event_type text not null,
  source text not null default 'manual',
  occurred_at timestamptz not null default now(),
  note text,
  logged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.diary_entries(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  grow_id uuid not null references public.grows(id),
  tent_id uuid references public.tents(id),
  plant_id uuid references public.plants(id),
  note text,
  details jsonb not null default '{}'::jsonb,
  entry_at timestamptz not null default now(),
  stage text,
  logged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.watering_events(
  event_id uuid primary key references public.grow_events(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  volume_ml numeric not null
);
create table public.environment_events(
  event_id uuid primary key references public.grow_events(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  temperature_c numeric,
  humidity_pct numeric,
  vpd_kpa numeric
);
create table public.quicklog_idempotency(
  user_id uuid not null references auth.users(id),
  idempotency_key text not null,
  grow_event_id uuid not null references public.grow_events(id) on delete cascade,
  request_hash text,
  created_at timestamptz not null default now(),
  primary key(user_id, idempotency_key)
);
create table public.quicklog_audit_events(
  id bigint generated always as identity primary key,
  user_id uuid,
  idempotency_key text,
  grow_event_id uuid,
  status text not null,
  reason text,
  created_at timestamptz not null default now()
);

${defectiveDelegateDefinition}
alter function public.quicklog_save_manual(${MANUAL_SIGNATURE})
  rename to quicklog_save_manual_pre_logged_at;
revoke all on function public.quicklog_save_manual_pre_logged_at(${MANUAL_SIGNATURE})
  from public, anon, authenticated, service_role;

${tryParseLoggedAtDefinition}
${tryParseUuidDefinition}
${stampDiaryDefinition}
${stampGrowEventDefinition}
revoke all on function public.quicklog_try_parse_logged_at(text)
  from public, anon, authenticated, service_role;
revoke all on function public.quicklog_try_parse_uuid(text)
  from public, anon, authenticated, service_role;
revoke all on function public.quicklog_stamp_diary_logged_at()
  from public, anon, authenticated, service_role;
revoke all on function public.quicklog_stamp_grow_event_logged_at()
  from public, anon, authenticated, service_role;
create trigger trg_quicklog_stamp_diary_logged_at
before insert on public.diary_entries
for each row execute function public.quicklog_stamp_diary_logged_at();
create trigger trg_quicklog_stamp_grow_event_logged_at
before insert on public.grow_events
for each row execute function public.quicklog_stamp_grow_event_logged_at();

${publicManualWrapperDefinition}
revoke all on function public.quicklog_save_manual(${MANUAL_SIGNATURE})
  from public, anon, service_role;
grant execute on function public.quicklog_save_manual(${MANUAL_SIGNATURE})
  to authenticated, service_role;

insert into auth.users(id) values ('${OWNER_ID}'), ('${OTHER_ID}');
insert into public.grows(id,user_id) values
  ('${OWNER_GROW_ID}','${OWNER_ID}'),
  ('${OTHER_GROW_ID}','${OTHER_ID}');
insert into public.tents(id,user_id,grow_id) values
  ('${OWNER_TENT_ID}','${OWNER_ID}','${OWNER_GROW_ID}'),
  ('${OTHER_TENT_ID}','${OTHER_ID}','${OTHER_GROW_ID}');
insert into public.plants(id,user_id,grow_id,tent_id) values
  ('${OWNER_PLANT_ID}','${OWNER_ID}','${OWNER_GROW_ID}','${OWNER_TENT_ID}'),
  ('${OTHER_PLANT_ID}','${OTHER_ID}','${OTHER_GROW_ID}','${OTHER_TENT_ID}');
`;

const TARGET_ATTESTATION_SQL = `
begin;
set transaction read only;
set local lock_timeout = '5s';
set local statement_timeout = '10s';
set local search_path = pg_catalog, pg_temp;
select case
  when current_database() = '${DISPOSABLE_DATABASE}'
   and current_user = '${DISPOSABLE_DATABASE_USER}'
   and current_setting('server_version_num')::integer >= 150000
   and current_setting('server_version_num')::integer < 160000
   and coalesce((
     select n.nspowner = current_user::regrole
        and c.relowner = current_user::regrole
        and c.relkind = 'r'
        and c.relpersistence = 'p'
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'verdant_quicklog_delegate_repair_harness'
       and c.relname = 'runtime_sentinel'
   ), false)
   and coalesce((
     select count(*) = 1
        and bool_and(sentinel = '${DISPOSABLE_SENTINEL}')
     from verdant_quicklog_delegate_repair_harness.runtime_sentinel
   ), false)
  then '${DISPOSABLE_SENTINEL}'
  else 'rejected'
end;
commit;
`;

function attestDisposableTarget(env, spawnImpl) {
  const observed = executeSql(TARGET_ATTESTATION_SQL, env, {
    stage: "target_attestation",
    spawnImpl,
  });
  if (observed !== DISPOSABLE_SENTINEL) throw new Error("database_target_attestation_rejected");
}

function resetScaffold(env, spawnImpl) {
  executeSql(`begin;\n${BASE_SCAFFOLD_SQL}\ncommit;`, env, {
    stage: "scaffold",
    spawnImpl,
  });
}

export function validatePinnedMigrationFile({
  root = resolve(repoRoot, "supabase", "migrations"),
} = {}) {
  const path = resolve(root, PINNED_MIGRATION_FILE);
  const sql = readFileSync(path, "utf8");
  const sha256 = createHash("sha256").update(sql).digest("hex");
  if (sha256 !== EXPECTED_MIGRATION_SHA256) throw new Error("migration_fingerprint_mismatch");
  if (!/(?:^|\r?\n)BEGIN;\r?\n/i.test(sql) || !/\r?\nCOMMIT;\r?\n/i.test(sql)) {
    throw new Error("migration_transaction_shape_mismatch");
  }
  if (sql.includes("supabase.co")) {
    throw new Error("migration_remote_target_forbidden");
  }
  return Object.freeze({
    version: PINNED_MIGRATION_VERSION,
    fileName: PINNED_MIGRATION_FILE,
    path,
    sha256,
    sql,
  });
}

function applyPinnedMigration(env, spawnImpl = spawnSync) {
  const migration = validatePinnedMigrationFile();
  return spawnPsql({ env, input: migration.sql, spawnImpl });
}

function requireMigrationSuccess(label, env, spawnImpl) {
  const result = applyPinnedMigration(env, spawnImpl);
  if (result?.error || result?.status !== 0) {
    throw new Error(formatPsqlFailureCode(label, result?.stderr));
  }
}

function requireMigrationFailure(label, expectedMessage, env, spawnImpl) {
  const result = applyPinnedMigration(env, spawnImpl);
  if (!result?.error && result?.status === 0) throw new Error(`${label}:unexpected_success`);
  if (!String(result?.stderr ?? "").includes(expectedMessage)) {
    throw new Error(`${label}:wrong_failure`);
  }
}

function authenticatedCallSql({ userId, targetId, key, action = "note", volume = "null" }) {
  return `begin;
set local request.jwt.claim.sub = '${userId}';
set local role authenticated;
select public.quicklog_save_manual(
  'plant', '${targetId}'::uuid, '${action}', ${volume}, 'harness note',
  null, null, null, '2026-01-01T10:00:00Z'::timestamptz,
  pg_catalog.jsonb_build_object(
    'logged_at', pg_catalog.clock_timestamp() - interval '1 minute'
  ),
  '${key}', 'veg'
);
commit;`;
}

function parseJsonResult(label, stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`${label}:invalid_json`);
  }
}

function requireSqlTrue(label, sql, env, spawnImpl = spawnSync) {
  if (executeSql(sql, env, { stage: label, spawnImpl }) !== "t") {
    throw new Error(`${label}:false`);
  }
}

function functionIdentity(functionName, env, spawnImpl = spawnSync) {
  return executeSql(
    `select jsonb_build_object(
       'oid', p.oid,
       'source_md5', md5(p.prosrc),
       'source_bytes', octet_length(p.prosrc),
       'acl', coalesce(p.proacl::text, ''),
       'owner', p.proowner,
       'security_definer', p.prosecdef,
       'config', coalesce(p.proconfig::text, '')
     )::text
     from pg_proc p
     where p.oid = '${functionName}(${MANUAL_SIGNATURE})'::regprocedure;`,
    env,
    { stage: "function_identity", spawnImpl },
  );
}

function catalogDigest(env, spawnImpl = spawnSync) {
  return executeSql(
    `select md5(jsonb_build_object(
      'wrapper', pg_get_functiondef('public.quicklog_save_manual(${MANUAL_SIGNATURE})'::regprocedure),
      'wrapper_acl', (select proacl from pg_proc where oid='public.quicklog_save_manual(${MANUAL_SIGNATURE})'::regprocedure),
      'delegate', pg_get_functiondef('public.quicklog_save_manual_pre_logged_at(${MANUAL_SIGNATURE})'::regprocedure),
      'delegate_acl', (select proacl from pg_proc where oid='public.quicklog_save_manual_pre_logged_at(${MANUAL_SIGNATURE})'::regprocedure),
      'helpers', (select jsonb_agg(jsonb_build_object(
        'oid', p.oid,
        'name', p.proname,
        'argument_types', p.proargtypes::text,
        'source', p.prosrc,
        'acl', p.proacl,
        'owner', p.proowner,
        'kind', p.prokind,
        'return_type', p.prorettype,
        'return_set', p.proretset,
        'security_definer', p.prosecdef,
        'strict', p.proisstrict,
        'leakproof', p.proleakproof,
        'volatility', p.provolatile,
        'parallel', p.proparallel,
        'pronargs', p.pronargs,
        'pronargdefaults', p.pronargdefaults,
        'argument_defaults', p.proargdefaults,
        'argument_modes', p.proargmodes,
        'all_argument_types', p.proallargtypes,
        'argument_names', p.proargnames,
        'config', p.proconfig
      ) order by p.oid)
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in (
        'quicklog_try_parse_logged_at','quicklog_try_parse_uuid',
        'quicklog_stamp_diary_logged_at','quicklog_stamp_grow_event_logged_at'
      )),
      'columns', (select jsonb_agg(jsonb_build_object(
        'relation', a.attrelid::regclass::text,
        'name', a.attname,
        'type', format_type(a.atttypid,a.atttypmod),
        'typmod', a.atttypmod,
        'not_null', a.attnotnull,
        'generated', a.attgenerated,
        'identity', a.attidentity,
        'default', pg_get_expr(d.adbin,d.adrelid)
      ) order by a.attrelid::regclass::text,a.attname)
      from pg_attribute a
      left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where (a.attrelid,a.attname) in (
        (to_regclass('public.quicklog_idempotency'),'request_hash'),
        (to_regclass('public.diary_entries'),'logged_at'),
        (to_regclass('public.grow_events'),'logged_at')
      ) and a.attnum>0 and not a.attisdropped),
      'triggers', (select jsonb_agg(jsonb_build_object(
        'relation', tg.tgrelid::regclass::text,
        'name', tg.tgname,
        'function', tg.tgfoid::regprocedure::text,
        'type', tg.tgtype,
        'enabled', tg.tgenabled,
        'nargs', tg.tgnargs,
        'args', encode(tg.tgargs,'hex'),
        'qual', pg_get_expr(tg.tgqual,tg.tgrelid),
        'parent', tg.tgparentid
      ) order by tg.tgrelid::regclass::text,tg.tgname)
      from pg_trigger tg where (tg.tgrelid,tg.tgname) in (
        (to_regclass('public.diary_entries'),'trg_quicklog_stamp_diary_logged_at'),
        (to_regclass('public.grow_events'),'trg_quicklog_stamp_grow_event_logged_at')
      )),
      'event_count', (select count(*) from public.grow_events),
      'diary_count', (select count(*) from public.diary_entries),
      'idempotency_count', (select count(*) from public.quicklog_idempotency)
    )::text);`,
    env,
    { stage: "catalog_digest", spawnImpl },
  );
}

function deliveryPreflightClassification(env, spawnImpl = spawnSync) {
  const raw = executeSql(
    `begin;
set transaction read only;
set local lock_timeout = '5s';
set local statement_timeout = '15s';
set local search_path = pg_catalog, public, pg_temp;
${CATALOG_STATE_QUERY_SQL};
commit;`,
    env,
    { stage: "delivery_preflight", spawnImpl },
  );
  return classifyPreflight(parsePreflightStdout(`${raw}\n`));
}

function requireDeliveryPreflightStatus(label, expectedStatus, env, spawnImpl = spawnSync) {
  const classification = deliveryPreflightClassification(env, spawnImpl);
  if (classification.status !== expectedStatus) {
    throw new Error(`${label}:unexpected_delivery_preflight_${classification.status}`);
  }
}

function requireDeliveryPreflightBlocked(label, env, spawnImpl = spawnSync) {
  const classification = deliveryPreflightClassification(env, spawnImpl);
  if (
    classification.status === "apply" ||
    classification.status === "schema_live_ledger_absent" ||
    classification.status === "verify_only"
  ) {
    throw new Error(`${label}:delivery_preflight_not_blocked`);
  }
}

function proveDefectiveDelegateRollback(env, spawnImpl) {
  const result = parseJsonResult(
    "defective_delegate",
    executeSql(
      authenticatedCallSql({
        userId: OWNER_ID,
        targetId: OWNER_PLANT_ID,
        key: "delegate-baseline-failure-0001",
      }),
      env,
      { stage: "defective_delegate", spawnImpl },
    ),
  );
  if (result.ok !== false || result.reason !== "save_failed") {
    throw new Error("defective_delegate:unexpected_result");
  }
  requireSqlTrue(
    "defective_delegate_rollback",
    `select
       (select count(*)=0 from public.grow_events)
       and (select count(*)=0 from public.diary_entries)
       and (select count(*)=0 from public.quicklog_idempotency)
       and (select count(*)=1 from public.quicklog_audit_events
            where user_id='${OWNER_ID}' and idempotency_key='delegate-baseline-failure-0001'
              and status='save_failed' and reason='dual_timestamp_persist_failed');`,
    env,
    spawnImpl,
  );
}

function provePublicWrapperIdentityPreserved(before, after) {
  if (before !== after) throw new Error("public_wrapper_identity_changed");
}

function proveRepairSuccess(env, spawnImpl) {
  const result = parseJsonResult(
    "repair_success",
    executeSql(
      authenticatedCallSql({
        userId: OWNER_ID,
        targetId: OWNER_PLANT_ID,
        key: SUCCESS_KEY,
      }),
      env,
      { stage: "repair_success", spawnImpl },
    ),
  );
  if (result.ok !== true || result.reused !== false || typeof result.grow_event_id !== "string") {
    throw new Error("repair_success:unexpected_result");
  }
  requireSqlTrue(
    "repair_success_rows",
    `select
      (select count(*)=1 from public.grow_events ge
       join public.quicklog_idempotency qi on qi.grow_event_id=ge.id
       where qi.user_id='${OWNER_ID}' and qi.idempotency_key='${SUCCESS_KEY}')
      and (select count(*)=1 from public.diary_entries de
       join public.quicklog_idempotency qi
         on public.quicklog_try_parse_uuid(de.details->>'linked_grow_event_id')=qi.grow_event_id
       where qi.user_id='${OWNER_ID}' and qi.idempotency_key='${SUCCESS_KEY}'
         and de.user_id='${OWNER_ID}' and de.grow_id='${OWNER_GROW_ID}')
      and exists(
        select 1 from public.grow_events ge
        join public.quicklog_idempotency qi on qi.grow_event_id=ge.id
        join public.diary_entries de
          on public.quicklog_try_parse_uuid(de.details->>'linked_grow_event_id')=ge.id
        where qi.user_id='${OWNER_ID}' and qi.idempotency_key='${SUCCESS_KEY}'
          and ge.logged_at is not distinct from de.logged_at
          and public.quicklog_try_parse_logged_at(de.details->>'logged_at') is not distinct from ge.logged_at
          and ge.occurred_at='2026-01-01T10:00:00Z'::timestamptz
          and de.entry_at=ge.occurred_at
          and ge.logged_at is distinct from ge.occurred_at
      );`,
    env,
    spawnImpl,
  );
}

function proveIdempotentRetry(env, spawnImpl) {
  const before = executeSql(
    `select grow_event_id::text from public.quicklog_idempotency
      where user_id='${OWNER_ID}' and idempotency_key='${SUCCESS_KEY}';`,
    env,
    { stage: "retry_before", spawnImpl },
  );
  const result = parseJsonResult(
    "idempotent_retry",
    executeSql(
      authenticatedCallSql({
        userId: OWNER_ID,
        targetId: OTHER_PLANT_ID,
        key: SUCCESS_KEY,
        action: "water",
        volume: "null",
      }),
      env,
      { stage: "idempotent_retry", spawnImpl },
    ),
  );
  if (result.ok !== true || result.reused !== true || result.grow_event_id !== before) {
    throw new Error("idempotent_retry:unexpected_result");
  }
  requireSqlTrue(
    "idempotent_retry_rows",
    `select
      (select count(*)=1 from public.quicklog_idempotency
       where user_id='${OWNER_ID}' and idempotency_key='${SUCCESS_KEY}')
      and (select count(*)=1 from public.grow_events where user_id='${OWNER_ID}')
      and (select count(*)=1 from public.diary_entries where user_id='${OWNER_ID}')
      and (select count(*)=1 from public.quicklog_audit_events
           where user_id='${OWNER_ID}' and idempotency_key='${SUCCESS_KEY}'
             and status='duplicate_reused');`,
    env,
    spawnImpl,
  );
}

function spawnPsqlAsync(sql, env) {
  return new Promise((resolvePromise, rejectPromise) => {
    const invocation = psqlCommand(env, buildPsqlArgs({ quiet: true }));
    const child = spawn(invocation.command, invocation.args, {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    const capture = (target, chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_PSQL_OUTPUT_BYTES) {
        child.kill();
        rejectPromise(new Error("concurrent_psql:output_limit"));
        return target;
      }
      return target + chunk.toString("utf8");
    };
    child.stdout.on("data", (chunk) => {
      stdout = capture(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = capture(stderr, chunk);
    });
    child.on("error", () => rejectPromise(new Error("concurrent_psql:spawn")));
    child.on("close", (code) => {
      if (code !== 0) {
        rejectPromise(new Error(formatPsqlFailureCode("concurrent_psql", stderr)));
      } else {
        resolvePromise(stdout.trim());
      }
    });
    child.stdin.end(sql);
  });
}

async function proveConcurrentSameKeyReuse(env, spawnImpl) {
  executeSql(
    `create function public.quicklog_harness_delay_event_insert()
     returns trigger language plpgsql set search_path to 'pg_catalog', 'pg_temp'
     as $$ begin perform pg_catalog.pg_sleep(0.4); return new; end $$;
     create trigger quicklog_harness_delay_event_insert
     before insert on public.grow_events for each row
     execute function public.quicklog_harness_delay_event_insert();`,
    env,
    { stage: "concurrent_setup", spawnImpl },
  );
  let outputs;
  try {
    outputs = await Promise.all([
      spawnPsqlAsync(
        authenticatedCallSql({
          userId: OWNER_ID,
          targetId: OWNER_PLANT_ID,
          key: CONCURRENT_KEY,
        }),
        env,
      ),
      spawnPsqlAsync(
        authenticatedCallSql({
          userId: OWNER_ID,
          targetId: OWNER_PLANT_ID,
          key: CONCURRENT_KEY,
        }),
        env,
      ),
    ]);
  } finally {
    executeSql(
      `drop trigger if exists quicklog_harness_delay_event_insert on public.grow_events;
       drop function if exists public.quicklog_harness_delay_event_insert();`,
      env,
      { stage: "concurrent_cleanup", spawnImpl },
    );
  }
  const results = outputs.map((value) => parseJsonResult("concurrent_result", value));
  const reused = results.map((value) => value.reused).sort();
  if (
    results.some((value) => value.ok !== true) ||
    JSON.stringify(reused) !== JSON.stringify([false, true]) ||
    results[0].grow_event_id !== results[1].grow_event_id
  ) {
    throw new Error("concurrent_reuse:unexpected_results");
  }
  requireSqlTrue(
    "concurrent_reuse_rows",
    `select
      (select count(*)=1 from public.quicklog_idempotency
       where user_id='${OWNER_ID}' and idempotency_key='${CONCURRENT_KEY}')
      and (select count(*)=1 from public.grow_events ge
           join public.quicklog_idempotency qi on qi.grow_event_id=ge.id
           where qi.user_id='${OWNER_ID}' and qi.idempotency_key='${CONCURRENT_KEY}')
      and (select count(*)=1 from public.diary_entries de
           join public.quicklog_idempotency qi
             on public.quicklog_try_parse_uuid(de.details->>'linked_grow_event_id')=qi.grow_event_id
           where qi.user_id='${OWNER_ID}' and qi.idempotency_key='${CONCURRENT_KEY}')
      and (select count(*)=1 from public.quicklog_audit_events
           where user_id='${OWNER_ID}' and idempotency_key='${CONCURRENT_KEY}'
             and status='duplicate_reused');`,
    env,
    spawnImpl,
  );
}

function proveCrossUserFence(env, spawnImpl) {
  const result = parseJsonResult(
    "cross_user",
    executeSql(
      authenticatedCallSql({
        userId: OTHER_ID,
        targetId: OWNER_PLANT_ID,
        key: "delegate-repair-cross-user-0001",
      }),
      env,
      { stage: "cross_user", spawnImpl },
    ),
  );
  if (result.ok !== false || result.reason !== "target_not_owned") {
    throw new Error("cross_user:unexpected_result");
  }
  requireSqlTrue(
    "cross_user_rows",
    `select
      (select count(*)=0 from public.grow_events where user_id='${OTHER_ID}')
      and (select count(*)=0 from public.diary_entries where user_id='${OTHER_ID}')
      and (select count(*)=0 from public.quicklog_idempotency where user_id='${OTHER_ID}');`,
    env,
    spawnImpl,
  );
}

function proveFunctionAclFences(env, spawnImpl) {
  requireSqlTrue(
    "function_acl",
    `select
      not has_function_privilege('anon','public.quicklog_save_manual(${MANUAL_SIGNATURE})','execute')
      and has_function_privilege('authenticated','public.quicklog_save_manual(${MANUAL_SIGNATURE})','execute')
      and not has_function_privilege('anon','public.quicklog_save_manual_pre_logged_at(${MANUAL_SIGNATURE})','execute')
      and not has_function_privilege('authenticated','public.quicklog_save_manual_pre_logged_at(${MANUAL_SIGNATURE})','execute')
      and not has_function_privilege('service_role','public.quicklog_save_manual_pre_logged_at(${MANUAL_SIGNATURE})','execute');`,
    env,
    spawnImpl,
  );
  const denied = spawnPsql({
    env,
    input: `begin; set local role anon;
      select public.quicklog_save_manual(
        'plant','${OWNER_PLANT_ID}'::uuid,'note',null,null,null,null,null,null,null,null,null
      ); commit;`,
    spawnImpl,
  });
  if (!denied?.error && denied?.status === 0) throw new Error("anon_public_rpc:unexpected_success");
  if (
    !String(denied?.stderr ?? "")
      .toLowerCase()
      .includes("permission denied")
  ) {
    throw new Error("anon_public_rpc:wrong_failure");
  }
}

function proveMigrationReapply(env, spawnImpl) {
  const before = catalogDigest(env, spawnImpl);
  requireMigrationSuccess("reapply", env, spawnImpl);
  const after = catalogDigest(env, spawnImpl);
  if (before !== after) throw new Error("reapply:catalog_or_data_changed");
}

function proveFreshReplayUuidHelperLineage(env, spawnImpl) {
  resetScaffold(env, spawnImpl);
  executeSql(tryParseUuidFreshReplayDefinition, env, {
    stage: "fresh_replay_uuid_helper_install",
    spawnImpl,
  });
  requireSqlTrue(
    "fresh_replay_uuid_helper_fingerprint",
    `select octet_length(p.prosrc) = 290
      and md5(p.prosrc) = '4b132ee2034f8e2887da1af582295ad8'
     from pg_proc p
     where p.oid = to_regprocedure('public.quicklog_try_parse_uuid(text)');`,
    env,
    spawnImpl,
  );
  requireDeliveryPreflightStatus("fresh_replay_uuid_helper", "apply", env, spawnImpl);
  const wrapperBefore = functionIdentity("public.quicklog_save_manual", env, spawnImpl);
  requireMigrationSuccess("fresh_replay_uuid_helper_apply", env, spawnImpl);
  provePublicWrapperIdentityPreserved(
    wrapperBefore,
    functionIdentity("public.quicklog_save_manual", env, spawnImpl),
  );
  requireDeliveryPreflightStatus(
    "fresh_replay_uuid_helper_postflight",
    "schema_live_ledger_absent",
    env,
    spawnImpl,
  );
  requireSqlTrue(
    "fresh_replay_uuid_helper_preserved",
    `select octet_length(p.prosrc) = 290
      and md5(p.prosrc) = '4b132ee2034f8e2887da1af582295ad8'
     from pg_proc p
     where p.oid = to_regprocedure('public.quicklog_try_parse_uuid(text)');`,
    env,
    spawnImpl,
  );
}

function requireFailedApplyPreservesState(label, expectedMessage, env, spawnImpl) {
  const before = catalogDigest(env, spawnImpl);
  requireMigrationFailure(label, expectedMessage, env, spawnImpl);
  const after = catalogDigest(env, spawnImpl);
  if (before !== after) throw new Error(`${label}:mutation_committed`);
}

function proveUnknownDelegateRejected(env, spawnImpl) {
  resetScaffold(env, spawnImpl);
  executeSql(
    `create or replace function public.quicklog_save_manual_pre_logged_at(
      p_target_type text,
      p_target_id uuid,
      p_action text,
      p_volume_ml numeric default null::numeric,
      p_note text default null::text,
      p_temperature_c numeric default null::numeric,
      p_humidity_pct numeric default null::numeric,
      p_vpd_kpa numeric default null::numeric,
      p_occurred_at timestamptz default null::timestamptz,
      p_details jsonb default null::jsonb,
      p_idempotency_key text default null::text,
      p_stage text default null::text
    ) returns jsonb language plpgsql security definer
      set search_path to 'public','pg_temp'
    as $$ begin return '{"ok":false,"reason":"unknown"}'::jsonb; end $$;`,
    env,
    { stage: "unknown_delegate_setup", spawnImpl },
  );
  requireFailedApplyPreservesState(
    "unknown_delegate",
    "quicklog_manual_delegate_unrecognized",
    env,
    spawnImpl,
  );
}

function proveWrongWrapperRejected(env, spawnImpl) {
  resetScaffold(env, spawnImpl);
  executeSql(
    `create or replace function public.quicklog_save_manual(
      p_target_type text,
      p_target_id uuid,
      p_action text,
      p_volume_ml numeric default null,
      p_note text default null,
      p_temperature_c numeric default null,
      p_humidity_pct numeric default null,
      p_vpd_kpa numeric default null,
      p_occurred_at timestamptz default null,
      p_details jsonb default null,
      p_idempotency_key text default null,
      p_stage text default null
    ) returns jsonb language plpgsql security definer
      set search_path to 'public','pg_temp'
    as $$ begin return '{"ok":false,"reason":"wrong_wrapper"}'::jsonb; end $$;`,
    env,
    { stage: "wrong_wrapper_setup", spawnImpl },
  );
  requireFailedApplyPreservesState(
    "wrong_wrapper",
    "quicklog_manual_wrapper_unrecognized",
    env,
    spawnImpl,
  );
}

function proveMissingContractRejected(env, spawnImpl) {
  resetScaffold(env, spawnImpl);
  executeSql("alter table public.quicklog_idempotency drop column request_hash;", env, {
    stage: "missing_contract_setup",
    spawnImpl,
  });
  requireFailedApplyPreservesState(
    "missing_contract",
    "quicklog_manual_delegate_unrecognized",
    env,
    spawnImpl,
  );
}

function requireAdversarialPrerequisiteRejected({
  label,
  setupSql,
  expectedMessage = "quicklog_manual_delegate_unrecognized",
  env,
  spawnImpl,
}) {
  resetScaffold(env, spawnImpl);
  executeSql(setupSql, env, { stage: `${label}_setup`, spawnImpl });
  requireDeliveryPreflightBlocked(label, env, spawnImpl);
  requireFailedApplyPreservesState(label, expectedMessage, env, spawnImpl);
}

function proveStrictFunctionsRejected(env, spawnImpl) {
  requireAdversarialPrerequisiteRejected({
    label: "strict_wrapper",
    setupSql: `alter function public.quicklog_save_manual(${MANUAL_SIGNATURE}) strict;`,
    expectedMessage: "quicklog_manual_wrapper_unrecognized",
    env,
    spawnImpl,
  });
  requireAdversarialPrerequisiteRejected({
    label: "strict_delegate",
    setupSql: `alter function public.quicklog_save_manual_pre_logged_at(${MANUAL_SIGNATURE}) strict;`,
    env,
    spawnImpl,
  });
}

function proveFunctionParallelAdversariesRejected(env, spawnImpl) {
  requireAdversarialPrerequisiteRejected({
    label: "wrapper_parallel_safe",
    setupSql: `alter function public.quicklog_save_manual(${MANUAL_SIGNATURE}) parallel safe;`,
    expectedMessage: "quicklog_manual_wrapper_unrecognized",
    env,
    spawnImpl,
  });
  requireAdversarialPrerequisiteRejected({
    label: "delegate_parallel_safe",
    setupSql: `alter function public.quicklog_save_manual_pre_logged_at(${MANUAL_SIGNATURE}) parallel safe;`,
    env,
    spawnImpl,
  });
  requireAdversarialPrerequisiteRejected({
    label: "helper_parallel_safe",
    setupSql: "alter function public.quicklog_try_parse_logged_at(text) parallel safe;",
    env,
    spawnImpl,
  });
}

function proveHelperArgumentShapeAdversariesRejected(env, spawnImpl) {
  const helperOid = "to_regprocedure('public.quicklog_try_parse_logged_at(text)')";
  const helperPredicate = `from pg_catalog.pg_namespace n
where n.oid=p.pronamespace
  and n.nspname='public'
  and p.proname='quicklog_try_parse_logged_at'`;
  const mutations = [
    [
      "helper_pronargs_drift",
      `update pg_catalog.pg_proc set pronargs=2 where oid=${helperOid};`,
      `update pg_catalog.pg_proc p set pronargs=1 ${helperPredicate};`,
      "helper_pronargs_restore",
    ],
    [
      "helper_pronargdefaults_drift",
      `update pg_catalog.pg_proc set pronargdefaults=1 where oid=${helperOid};`,
      `update pg_catalog.pg_proc p set pronargdefaults=0 ${helperPredicate};`,
      "helper_pronargdefaults_restore",
    ],
    [
      "helper_proargmodes_drift",
      `update pg_catalog.pg_proc set proargmodes=array['i']::\"char\"[] where oid=${helperOid};`,
      `update pg_catalog.pg_proc p set proargmodes=null ${helperPredicate};`,
      "helper_proargmodes_restore",
    ],
    [
      "helper_proallargtypes_drift",
      `update pg_catalog.pg_proc set proallargtypes=array['text'::regtype::oid]::oid[] where oid=${helperOid};`,
      `update pg_catalog.pg_proc p set proallargtypes=null ${helperPredicate};`,
      "helper_proallargtypes_restore",
    ],
    [
      "helper_proargnames_drift",
      `update pg_catalog.pg_proc set proargnames=array['unexpected']::text[] where oid=${helperOid};`,
      `update pg_catalog.pg_proc p set proargnames=array['p_value']::text[] ${helperPredicate};`,
      "helper_proargnames_restore",
    ],
  ];
  for (const [label, setupSql, restoreSql, restoreStage] of mutations) {
    resetScaffold(env, spawnImpl);
    try {
      executeSql(setupSql, env, { stage: `${label}_setup`, spawnImpl });
      requireDeliveryPreflightBlocked(label, env, spawnImpl);
      requireFailedApplyPreservesState(
        label,
        "quicklog_manual_delegate_unrecognized",
        env,
        spawnImpl,
      );
    } finally {
      executeSql(restoreSql, env, { stage: restoreStage, spawnImpl });
    }
  }
}

function proveHelperSourceRejected(env, spawnImpl) {
  requireAdversarialPrerequisiteRejected({
    label: "helper_source_noop",
    setupSql: `create or replace function public.quicklog_try_parse_logged_at(p_value text)
returns timestamptz language plpgsql immutable strict
set search_path to 'pg_catalog','pg_temp'
as $$ begin return null; end $$;`,
    env,
    spawnImpl,
  });
}

function addHelperCarriageReturn(signature, label, env, spawnImpl) {
  executeSql(
    `update pg_catalog.pg_proc
     set prosrc=E'\\r' || prosrc
     where oid=to_regprocedure('${signature}');`,
    env,
    { stage: `${label}_setup`, spawnImpl },
  );
}

function proveHelperCarriageReturnFingerprintRules(env, spawnImpl) {
  resetScaffold(env, spawnImpl);
  addHelperCarriageReturn(
    "public.quicklog_try_parse_uuid(text)",
    "helper_uuid_cr_drift",
    env,
    spawnImpl,
  );
  requireDeliveryPreflightBlocked("helper_uuid_cr_drift", env, spawnImpl);
  requireFailedApplyPreservesState(
    "helper_uuid_cr_drift",
    "quicklog_manual_delegate_unrecognized",
    env,
    spawnImpl,
  );

  for (const [label, signature] of [
    ["helper_logged_at_cr_normalized", "public.quicklog_try_parse_logged_at(text)"],
    ["helper_diary_stamp_cr_normalized", "public.quicklog_stamp_diary_logged_at()"],
    ["helper_event_stamp_cr_normalized", "public.quicklog_stamp_grow_event_logged_at()"],
  ]) {
    resetScaffold(env, spawnImpl);
    addHelperCarriageReturn(signature, label, env, spawnImpl);
    requireDeliveryPreflightStatus(label, "apply", env, spawnImpl);
    requireMigrationSuccess(`${label}_migration`, env, spawnImpl);
    requireDeliveryPreflightStatus(
      `${label}_canonical`,
      "schema_live_ledger_absent",
      env,
      spawnImpl,
    );
  }
}

function proveTriggerShapeRejected(env, spawnImpl) {
  requireAdversarialPrerequisiteRejected({
    label: "trigger_when_false",
    setupSql: `drop trigger trg_quicklog_stamp_diary_logged_at on public.diary_entries;
create trigger trg_quicklog_stamp_diary_logged_at
before insert on public.diary_entries for each row when (false)
execute function public.quicklog_stamp_diary_logged_at();`,
    env,
    spawnImpl,
  });
  requireAdversarialPrerequisiteRejected({
    label: "trigger_args",
    setupSql: `drop trigger trg_quicklog_stamp_grow_event_logged_at on public.grow_events;
create trigger trg_quicklog_stamp_grow_event_logged_at
before insert on public.grow_events for each row
execute function public.quicklog_stamp_grow_event_logged_at('unexpected');`,
    env,
    spawnImpl,
  });
}

function proveFunctionAclAdversariesRejected(env, spawnImpl) {
  requireAdversarialPrerequisiteRejected({
    label: "delegate_extra_role_execute",
    setupSql: `grant execute on function public.quicklog_save_manual_pre_logged_at(${MANUAL_SIGNATURE})
to quicklog_delegate_probe;`,
    env,
    spawnImpl,
  });
  requireAdversarialPrerequisiteRejected({
    label: "wrapper_service_execute_revoked",
    setupSql: `revoke execute on function public.quicklog_save_manual(${MANUAL_SIGNATURE})
from service_role;`,
    expectedMessage: "quicklog_manual_wrapper_unrecognized",
    env,
    spawnImpl,
  });
}

function proveFunctionOverloadsRejected(env, spawnImpl) {
  requireAdversarialPrerequisiteRejected({
    label: "wrapper_extra_overload",
    setupSql: `create function public.quicklog_save_manual(text,uuid,text)
returns jsonb language sql as $$ select '{}'::jsonb $$;`,
    expectedMessage: "quicklog_manual_wrapper_unrecognized",
    env,
    spawnImpl,
  });
  requireAdversarialPrerequisiteRejected({
    label: "helper_extra_overload",
    setupSql: `create function public.quicklog_try_parse_uuid(text,text)
returns uuid language sql immutable strict
set search_path to 'pg_catalog','pg_temp'
as $$ select null::uuid $$;`,
    env,
    spawnImpl,
  });
}

function proveRequiredRoleAttributesRejected(env, spawnImpl) {
  const mutations = [
    [
      "service_role_bypassrls_revoked",
      "alter role service_role nobypassrls;",
      "alter role service_role bypassrls;",
    ],
    ["anon_bypassrls_granted", "alter role anon bypassrls;", "alter role anon nobypassrls;"],
    [
      "authenticated_bypassrls_granted",
      "alter role authenticated bypassrls;",
      "alter role authenticated nobypassrls;",
    ],
  ];
  for (const [label, setupSql, restoreSql] of mutations) {
    resetScaffold(env, spawnImpl);
    try {
      executeSql(setupSql, env, { stage: `${label}_setup`, spawnImpl });
      requireDeliveryPreflightBlocked(label, env, spawnImpl);
    } finally {
      executeSql(restoreSql, env, { stage: `${label}_restore`, spawnImpl });
    }
  }
}

function exactLedgerRow(env, spawnImpl) {
  return executeSql(
    `select jsonb_build_object(
       'version',version,'name',name,'statements',statements
     )::text
     from supabase_migrations.schema_migrations
     where version='20260818010000';`,
    env,
    { stage: "ledger_row", spawnImpl },
  );
}

function proveGuardedLedgerInsertAndCollision(env, spawnImpl) {
  resetScaffold(env, spawnImpl);
  requireMigrationSuccess("ledger_insert_canonical_setup", env, spawnImpl);
  requireDeliveryPreflightStatus(
    "ledger_insert_ready",
    "schema_live_ledger_absent",
    env,
    spawnImpl,
  );
  executeSql(buildLedgerInsertSql(), env, { stage: "ledger_insert_success", spawnImpl });
  requireSqlTrue(
    "ledger_insert_exact_marker_row",
    `select count(*)=1 and bool_and(
       version='20260818010000'
       and name='quicklog_manual_delegate_forward_repair'
       and statements=array[
         '-- applied verbatim by protected GitHub workflow; sha256=641C033A6453B180505CFB4EEAD8C97EC0C89C7EC0A501A64D4D5B1B71897B1C',
         '-- protected wrapper; self-transactional-migration=true;ledger-recovery=v1'
       ]::text[]
     ) from supabase_migrations.schema_migrations
     where version='20260818010000'
        or name in (
          'quicklog_manual_delegate_forward_repair',
          '20260818010000_quicklog_manual_delegate_forward_repair'
        );`,
    env,
    spawnImpl,
  );
  requireDeliveryPreflightStatus("ledger_insert_success", "verify_only", env, spawnImpl);

  const before = `${catalogDigest(env, spawnImpl)}|${exactLedgerRow(env, spawnImpl)}`;
  let rejected = false;
  try {
    executeSql(`\\set VERBOSITY sqlstate\n${buildLedgerInsertSql()}`, env, {
      stage: "ledger_insert_collision",
      spawnImpl,
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "ledger_insert_collision:55000") {
      throw error;
    }
    rejected = true;
  }
  if (!rejected) throw new Error("ledger_insert_collision:unexpected_success");
  const after = `${catalogDigest(env, spawnImpl)}|${exactLedgerRow(env, spawnImpl)}`;
  if (before !== after) throw new Error("ledger_collision_unchanged:false");
  requireDeliveryPreflightStatus("ledger_collision_unchanged", "verify_only", env, spawnImpl);
}

function requireGuardedLedgerInsertBlocked(label, env, spawnImpl) {
  let rejected = false;
  try {
    executeSql(`\\set VERBOSITY sqlstate\n${buildLedgerInsertSql()}`, env, {
      stage: "ledger_insert_mutated",
      spawnImpl,
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "ledger_insert_mutated:55000") {
      throw error;
    }
    rejected = true;
  }
  if (!rejected) throw new Error(`${label}:ledger_insert_unexpected_success`);
  requireSqlTrue(
    `${label}_ledger_absent`,
    `select count(*)=0 from supabase_migrations.schema_migrations
     where version='20260818010000' or name in (
       'quicklog_manual_delegate_forward_repair',
       '20260818010000_quicklog_manual_delegate_forward_repair'
     );`,
    env,
    spawnImpl,
  );
}

function proveMigrationLedgerColumnShapesRejected(env, spawnImpl) {
  const mutations = [
    [
      "ledger_name_default",
      "alter table supabase_migrations.schema_migrations alter column name set default 'unexpected'::text;",
    ],
    [
      "ledger_name_generated",
      "alter table supabase_migrations.schema_migrations drop column name; alter table supabase_migrations.schema_migrations add column name text generated always as ('unexpected'::text) stored;",
    ],
    [
      "ledger_version_identity",
      "alter table supabase_migrations.schema_migrations drop constraint schema_migrations_pkey; alter table supabase_migrations.schema_migrations drop column version; alter table supabase_migrations.schema_migrations add column version bigint generated always as identity; alter table supabase_migrations.schema_migrations add constraint schema_migrations_pkey primary key(version);",
    ],
  ];
  for (const [label, setupSql] of mutations) {
    resetScaffold(env, spawnImpl);
    requireMigrationSuccess(`${label}_canonical_setup`, env, spawnImpl);
    executeSql(setupSql, env, { stage: `${label}_setup`, spawnImpl });
    requireDeliveryPreflightBlocked(label, env, spawnImpl);
    requireGuardedLedgerInsertBlocked(label, env, spawnImpl);
  }
}

function proveRequestHashShapesRejected(env, spawnImpl) {
  const mutations = [
    [
      "request_hash_not_null",
      "alter table public.quicklog_idempotency alter column request_hash set not null;",
    ],
    [
      "request_hash_default",
      "alter table public.quicklog_idempotency alter column request_hash set default ''::text;",
    ],
    [
      "request_hash_typmod",
      "alter table public.quicklog_idempotency alter column request_hash type varchar(32);",
    ],
    [
      "request_hash_generated",
      "alter table public.quicklog_idempotency drop column request_hash; alter table public.quicklog_idempotency add column request_hash text generated always as ('fixed'::text) stored;",
    ],
    [
      "request_hash_identity",
      "alter table public.quicklog_idempotency drop column request_hash; alter table public.quicklog_idempotency add column request_hash bigint generated always as identity;",
    ],
  ];
  for (const [label, setupSql] of mutations) {
    requireAdversarialPrerequisiteRejected({ label, setupSql, env, spawnImpl });
  }
}

function proveLoggedAtShapesRejected(env, spawnImpl) {
  for (const relation of ["diary_entries", "grow_events"]) {
    const prefix = relation === "diary_entries" ? "diary" : "event";
    const mutations = [
      [
        `${prefix}_logged_at_not_null`,
        `alter table public.${relation} alter column logged_at set not null;`,
      ],
      [
        `${prefix}_logged_at_default`,
        `alter table public.${relation} alter column logged_at set default pg_catalog.now();`,
      ],
      [
        `${prefix}_logged_at_typmod`,
        `alter table public.${relation} alter column logged_at type timestamptz(3);`,
      ],
      [
        `${prefix}_logged_at_generated`,
        `alter table public.${relation} drop column logged_at; alter table public.${relation} add column logged_at timestamptz generated always as (timestamptz '2026-01-01 00:00:00+00') stored;`,
      ],
      [
        `${prefix}_logged_at_identity`,
        `alter table public.${relation} drop column logged_at; alter table public.${relation} add column logged_at bigint generated always as identity;`,
      ],
    ];
    for (const [label, setupSql] of mutations) {
      requireAdversarialPrerequisiteRejected({ label, setupSql, env, spawnImpl });
    }
  }
}

function stripMigrationTransaction(source) {
  const withoutBegin = source.replace(/^\uFEFF?\s*BEGIN;\s*/i, "");
  const withoutTail = withoutBegin.replace(/\s*COMMIT;\s*NOTIFY pgrst, 'reload schema';\s*$/i, "");
  if (withoutTail === source || /\bBEGIN;\s*$/i.test(withoutTail)) {
    throw new Error("historical_migration_shape_drift");
  }
  return withoutTail;
}

function proveHistoricalOutOfOrderUnsafe(env, spawnImpl) {
  resetScaffold(env, spawnImpl);
  const before = functionIdentity("public.quicklog_save_manual", env, spawnImpl);
  const historical = readFileSync(
    resolve(repoRoot, "supabase/migrations/20260723000000_quicklog_manual_always_mirror_diary.sql"),
    "utf8",
  );
  executeSql(`begin;\n${stripMigrationTransaction(historical)}\ncommit;`, env, {
    stage: "historical_out_of_order",
    spawnImpl,
  });
  const after = functionIdentity("public.quicklog_save_manual", env, spawnImpl);
  if (before === after) throw new Error("historical_out_of_order:wrapper_not_replaced");
  requireSqlTrue(
    "historical_out_of_order_shape",
    `select
      to_regprocedure('public.quicklog_save_manual(${MANUAL_SIGNATURE})') is not null
      and to_regprocedure('public.quicklog_save_manual_pre_logged_at(${MANUAL_SIGNATURE})') is not null;`,
    env,
    spawnImpl,
  );
  requireMigrationFailure(
    "historical_out_of_order_repair",
    "quicklog_manual_wrapper_unrecognized",
    env,
    spawnImpl,
  );
}

export async function runPg15Harness({
  databaseUrl = process.env.QUICKLOG_MANUAL_DELEGATE_REPAIR_PG15_URL,
  containerId = process.env.QUICKLOG_MANUAL_DELEGATE_REPAIR_PG15_CONTAINER,
  containerRuntime = process.env.QUICKLOG_MANUAL_DELEGATE_REPAIR_PG15_CONTAINER_RUNTIME,
  spawnImpl = spawnSync,
} = {}) {
  const connection = disposableConnection(databaseUrl);
  if (
    !connection ||
    (containerId && !/^[0-9a-f]{12,64}$/i.test(containerId)) ||
    (containerRuntime && !new Set(["docker", "wsl-docker"]).has(containerRuntime))
  ) {
    return fail("database_target_rejected");
  }
  const env = psqlEnvironment(connection, containerId, containerRuntime);
  try {
    attestDisposableTarget(env, spawnImpl);
    resetScaffold(env, spawnImpl);
    requireDeliveryPreflightStatus("defective_baseline", "apply", env, spawnImpl);
    proveDefectiveDelegateRollback(env, spawnImpl);
    const wrapperBefore = functionIdentity("public.quicklog_save_manual", env, spawnImpl);
    requireMigrationSuccess("repair_apply", env, spawnImpl);
    requireDeliveryPreflightStatus(
      "canonical_ledger_absent",
      "schema_live_ledger_absent",
      env,
      spawnImpl,
    );
    provePublicWrapperIdentityPreserved(
      wrapperBefore,
      functionIdentity("public.quicklog_save_manual", env, spawnImpl),
    );
    proveGuardedLedgerInsertAndCollision(env, spawnImpl);
    proveRepairSuccess(env, spawnImpl);
    proveIdempotentRetry(env, spawnImpl);
    await proveConcurrentSameKeyReuse(env, spawnImpl);
    proveCrossUserFence(env, spawnImpl);
    proveFunctionAclFences(env, spawnImpl);
    proveMigrationReapply(env, spawnImpl);
    proveFreshReplayUuidHelperLineage(env, spawnImpl);
    proveUnknownDelegateRejected(env, spawnImpl);
    proveWrongWrapperRejected(env, spawnImpl);
    proveMissingContractRejected(env, spawnImpl);
    proveStrictFunctionsRejected(env, spawnImpl);
    proveFunctionParallelAdversariesRejected(env, spawnImpl);
    proveHelperSourceRejected(env, spawnImpl);
    proveHelperArgumentShapeAdversariesRejected(env, spawnImpl);
    proveHelperCarriageReturnFingerprintRules(env, spawnImpl);
    proveTriggerShapeRejected(env, spawnImpl);
    proveFunctionAclAdversariesRejected(env, spawnImpl);
    proveFunctionOverloadsRejected(env, spawnImpl);
    proveRequiredRoleAttributesRejected(env, spawnImpl);
    proveMigrationLedgerColumnShapesRejected(env, spawnImpl);
    proveRequestHashShapesRejected(env, spawnImpl);
    proveLoggedAtShapesRejected(env, spawnImpl);
    proveHistoricalOutOfOrderUnsafe(env, spawnImpl);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "unknown");
  }
  process.stdout.write("Quick Log manual delegate PG15 harness PASS\n");
  return 0;
}

const isDirectInvocation =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectInvocation) process.exitCode = await runPg15Harness();
