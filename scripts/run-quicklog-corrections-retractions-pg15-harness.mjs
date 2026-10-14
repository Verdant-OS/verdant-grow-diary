#!/usr/bin/env node
/** Local-only PostgreSQL 15 contract harness for the dedicated delivery path. */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildApplySql,
  classifyPreflight,
  EXPECTED_FUNCTION_DEFINITION_FINGERPRINTS,
  parsePreflightStdout,
  PINNED_MIGRATION,
  PREFLIGHT_SQL,
  schemaEffectLive,
  validatePinnedMigrationFile,
} from "./apply-quicklog-corrections-retractions.mjs";
import {
  EDITABLE_VALUES_CORRECT_ENTRY_FINGERPRINT,
  parseQuickLogCatalogContract,
  QUICKLOG_CORRECTIONS_CATALOG_SQL,
} from "./assert-required-core-migrations-applied.mjs";
import { validatePinnedMigrationFile as validateKeyedOverloadMigrationFile } from "./apply-quicklog-revision-idempotent-replay.mjs";
import { MIGRATION_LEDGER_CREATE_TABLE_SQL } from "./lib/supabaseMigrationLedgerShape.mjs";

export { validatePinnedMigrationFile };

const MAX_PSQL_OUTPUT_BYTES = 1_048_576;
const DISPOSABLE_DATABASE = "verdant_quicklog_delivery";
const DISPOSABLE_DATABASE_USER = "postgres";
const DISPOSABLE_DATABASE_PORT = "5432";
const DISPOSABLE_SENTINEL = "verdant_quicklog_pg15_disposable_v1";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fail(code) {
  process.stderr.write(`Quick Log PG15 harness failed: ${code}\n`);
  return 1;
}

export function formatPsqlFailureCode(stage, stderr) {
  const match = /(?:SQL state|SQLSTATE)[: ]+([0-9A-Z]{5})/i.exec(String(stderr ?? ""));
  return `${stage}:${match?.[1]?.toUpperCase() ?? "unknown"}`;
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

function psqlEnvironment(connection, source = process.env) {
  return {
    PATH: source.PATH ?? "",
    SYSTEMROOT: source.SYSTEMROOT ?? source.SystemRoot ?? "",
    PGHOST: connection.hostname,
    PGPORT: DISPOSABLE_DATABASE_PORT,
    PGUSER: DISPOSABLE_DATABASE_USER,
    PGPASSWORD: connection.password,
    PGDATABASE: DISPOSABLE_DATABASE,
    PGCONNECT_TIMEOUT: "5",
    PGAPPNAME: "verdant-quicklog-pg15-harness",
  };
}

function spawnPsql({ env, input, file, spawnImpl = spawnSync }) {
  const args = buildPsqlArgs({ quiet: true });
  if (file) args.push("--single-transaction", "--file", file);
  const result = spawnImpl("psql", args, {
    encoding: "utf8",
    env,
    input,
    maxBuffer: MAX_PSQL_OUTPUT_BYTES,
  });
  return result;
}

function executeSql(sql, env, { stage = "sql", spawnImpl = spawnSync } = {}) {
  const result = spawnPsql({ env, input: sql, spawnImpl });
  if (result?.error || result?.status !== 0) {
    throw new Error(formatPsqlFailureCode(stage, result?.stderr));
  }
  return String(result.stdout ?? "").trim();
}

function executeSqlExpectFailure(sql, env, stage, spawnImpl = spawnSync) {
  const result = spawnPsql({ env, input: sql, spawnImpl });
  if (!result?.error && result?.status === 0) throw new Error(`${stage}:unexpected_success`);
  return formatPsqlFailureCode(stage, result?.stderr);
}

export function extractFunctionDefinitionFromSource(sourceText, functionPrefix, terminator) {
  // Windows can check out the same immutable migration blob with CRLF. Work
  // from its committed LF shape so the harness's exact source edits remain
  // deterministic without changing any published migration file.
  const source = sourceText.replace(/\r\n?/g, "\n");
  const start = source.indexOf(functionPrefix);
  if (start < 0) throw new Error("dependency_source_missing");
  const end = source.indexOf(`\n${terminator}`, start);
  if (end < 0) throw new Error("dependency_source_malformed");
  return source.slice(start, end + terminator.length + 1);
}

function extractFunctionDefinition(relativePath, functionPrefix, terminator) {
  return extractFunctionDefinitionFromSource(
    readFileSync(resolve(repoRoot, relativePath), "utf8"),
    functionPrefix,
    terminator,
  );
}

const hasRoleDefinition = extractFunctionDefinition(
  "supabase/migrations/20260517010926_65004f70-4e2c-48b3-bfcb-37bb8d2f0040.sql",
  "CREATE OR REPLACE FUNCTION public.has_role(",
  "$$;",
);

const quicklogTryParseUuidSource = extractFunctionDefinition(
  "supabase/migrations/20260725024026_quicklog_dual_timestamp_foundation.sql",
  "CREATE FUNCTION public.quicklog_try_parse_uuid(",
  "$function$;",
);
const quicklogTryParseUuidDefinition = quicklogTryParseUuidSource.replace(
  "  END IF;\n\n  BEGIN",
  "  END IF;\n  BEGIN",
);
if (quicklogTryParseUuidDefinition === quicklogTryParseUuidSource) {
  throw new Error("dependency_source_shape_drift");
}

const BASE_SCAFFOLD_SQL = `
drop schema if exists public cascade;
drop schema if exists auth cascade;
drop schema if exists supabase_migrations cascade;
do $roles$
begin
  if not exists(select 1 from pg_roles where rolname='anon') then
    execute 'create role anon nologin nosuperuser nocreatedb nocreaterole inherit noreplication nobypassrls';
  elsif not exists(
    select 1 from pg_roles where rolname='anon'
      and not rolsuper and rolinherit and not rolcreaterole and not rolcreatedb
      and not rolcanlogin and not rolreplication and not rolbypassrls
  ) then
    raise exception 'existing harness role anon has unsafe attributes' using errcode = '55000';
  end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then
    execute 'create role authenticated nologin nosuperuser nocreatedb nocreaterole inherit noreplication nobypassrls';
  elsif not exists(
    select 1 from pg_roles where rolname='authenticated'
      and not rolsuper and rolinherit and not rolcreaterole and not rolcreatedb
      and not rolcanlogin and not rolreplication and not rolbypassrls
  ) then
    raise exception 'existing harness role authenticated has unsafe attributes' using errcode = '55000';
  end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then
    execute 'create role service_role nologin nosuperuser nocreatedb nocreaterole inherit noreplication bypassrls';
  elsif not exists(
    select 1 from pg_roles where rolname='service_role'
      and not rolsuper and rolinherit and not rolcreaterole and not rolcreatedb
      and not rolcanlogin and not rolreplication and rolbypassrls
  ) then
    raise exception 'existing harness role service_role has unsafe attributes' using errcode = '55000';
  end if;
end
$roles$;
create schema public authorization postgres;
create schema auth authorization postgres;
create schema supabase_migrations authorization postgres;
grant usage on schema public, auth to anon, authenticated, service_role;
create type public.app_role as enum ('operator','customer');
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create table public.user_roles(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null, created_at timestamptz not null default now(),
  unique(user_id,role)
);
alter table public.user_roles enable row level security;
${hasRoleDefinition}
alter function public.has_role(uuid, public.app_role) set search_path = public, pg_temp;
revoke all on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
create policy "Users view own roles" on public.user_roles
  for select to authenticated
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'operator'));
create policy "Operators manage roles" on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'operator'))
  with check (public.has_role(auth.uid(), 'operator'));
revoke all on public.user_roles from public, anon;
revoke all on public.user_roles from authenticated, service_role;
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
${quicklogTryParseUuidDefinition}
revoke all on function public.quicklog_try_parse_uuid(text) from public, anon, authenticated, service_role;
create table public.grows(id uuid primary key, user_id uuid not null);
create table public.tents(id uuid primary key, user_id uuid not null, grow_id uuid);
create table public.plants(id uuid primary key, user_id uuid not null, grow_id uuid, tent_id uuid);
create table public.grow_events(
  id uuid primary key, user_id uuid not null, grow_id uuid, tent_id uuid, plant_id uuid,
  event_type text not null, occurred_at timestamptz not null default now(), note text,
  source text not null default 'manual', is_deleted boolean not null default false,
  deleted_at timestamptz, created_at timestamptz not null default now()
);
create table public.diary_entries(
  id uuid primary key, user_id uuid not null, grow_id uuid, tent_id uuid, plant_id uuid,
  note text, details jsonb not null default '{}'::jsonb,
  entry_at timestamptz not null default now()
);
${MIGRATION_LEDGER_CREATE_TABLE_SQL}
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
     where n.nspname = 'verdant_quicklog_harness'
       and c.relname = 'runtime_sentinel'
   ), false)
   and coalesce((
     select count(*) = 1 and bool_and(sentinel = '${DISPOSABLE_SENTINEL}')
     from verdant_quicklog_harness.runtime_sentinel
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
  if (observed !== DISPOSABLE_SENTINEL) {
    throw new Error("database_target_attestation_rejected");
  }
}

function resetScaffold(env, spawnImpl) {
  executeSql(`begin;\n${BASE_SCAFFOLD_SQL}\ncommit;`, env, {
    stage: "scaffold",
    spawnImpl,
  });
}

function readPreflight(env, spawnImpl) {
  const stdout = executeSql(`begin;\n${PREFLIGHT_SQL}\ncommit;`, env, {
    stage: "preflight",
    spawnImpl,
  });
  return parsePreflightStdout(`${stdout}\n`);
}

function readRequiredCoreCatalog(env, spawnImpl) {
  const stdout = executeSql(`begin;\n${QUICKLOG_CORRECTIONS_CATALOG_SQL}\ncommit;`, env, {
    stage: "required_core_catalog",
    spawnImpl,
  });
  return parseQuickLogCatalogContract(`${stdout}\n`);
}

function injectBeforeUniqueMarker(sql, marker, injectedSql) {
  if (!injectedSql) return sql;
  const markerIndex = sql.indexOf(marker);
  if (markerIndex < 0 || sql.indexOf(marker, markerIndex + marker.length) >= 0) {
    throw new Error("apply_sql_guard_shape_drift");
  }
  return `${sql.slice(0, markerIndex)}${injectedSql}\n${sql.slice(markerIndex)}`;
}

export function buildHarnessApplySql(
  migration,
  { beforePrerequisiteGuardSql = "", beforePostflightGuardSql = "", trailingSql = "" } = {},
) {
  let sql = buildApplySql(migration);
  sql = injectBeforeUniqueMarker(
    sql,
    "do $quicklog_delivery_prerequisite_guard$",
    beforePrerequisiteGuardSql,
  );
  sql = injectBeforeUniqueMarker(
    sql,
    "do $quicklog_delivery_catalog_guard$",
    beforePostflightGuardSql,
  );
  return `${sql}\n${trailingSql}`;
}

function applyPinnedMigration(env, spawnImpl, mutations = {}) {
  const migration = validatePinnedMigrationFile({
    root: resolve(repoRoot, "supabase", "migrations"),
  });
  const sql = buildHarnessApplySql(migration, mutations);
  const result = spawnImpl("psql", [...buildPsqlArgs({ quiet: true }), "--single-transaction"], {
    encoding: "utf8",
    env,
    input: sql,
    maxBuffer: MAX_PSQL_OUTPUT_BYTES,
  });
  return result;
}

/**
 * The required-core gate (#1756) pins the seven-function set: the five the pinned
 * delivery ships plus the keyed overloads that 20260916111000 adds. The delivery
 * preflight pins exactly those five (target_object_count 13), so this runs only
 * after the last five-function verify_only read that shares the scaffold.
 */
function applyKeyedOverloadMigration(env, spawnImpl) {
  const migration = validateKeyedOverloadMigrationFile({
    root: resolve(repoRoot, "supabase", "migrations"),
  });
  // The reviewed file owns its exact BEGIN/COMMIT; psql runs it verbatim.
  executeSql(migration.text, env, { stage: "keyed_overload_apply", spawnImpl });
}

function applyEditableValuesMigration(env, spawnImpl) {
  const text = readFileSync(
    resolve(repoRoot, "supabase/migrations/20261014210000_quicklog_correction_editable_values.sql"),
    "utf8",
  );
  executeSql(text, env, { stage: "editable_values_apply", spawnImpl });
}

function proveEditableCorrectEntryFingerprint(env, spawnImpl) {
  const pin = EDITABLE_VALUES_CORRECT_ENTRY_FINGERPRINT;
  const row = executeSql(
    `select md5(pg_get_functiondef(p.oid))||'|'||octet_length(pg_get_functiondef(p.oid))||'|'||md5(p.prosrc)||'|'||octet_length(p.prosrc)
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where p.oid = to_regprocedure('public.quicklog_correct_entry(text,jsonb,uuid,uuid,text)');`,
    env,
    { stage: "editable_values_fingerprint", spawnImpl },
  );
  const expected = `${pin.md5}|${pin.bytes}|${pin.prosrcMd5}|${pin.prosrcBytes}`;
  if (row !== expected) throw new Error("editable_values_fingerprint:mismatch");
}

const MEASURED_CORRECTION_PROOF_SQL = `
begin;
create or replace function auth.uid() returns uuid language sql stable as $$
  select '11111111-1111-4111-8111-111111111111'::uuid
$$;
create table if not exists public.watering_events (
  event_id uuid primary key, user_id uuid not null, volume_ml numeric
);
create table if not exists public.feeding_events (
  event_id uuid primary key, user_id uuid not null, volume_ml numeric, products jsonb not null
);
create table if not exists public.environment_events (
  event_id uuid primary key, user_id uuid not null,
  temperature_c numeric, humidity_pct numeric, vpd_kpa numeric
);
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111') on conflict do nothing;
insert into public.grow_events(id, user_id, event_type, source, note)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'watering', 'manual', 'water'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '11111111-1111-4111-8111-111111111111', 'feeding', 'manual', 'feed'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '11111111-1111-4111-8111-111111111111', 'environment', 'manual', 'sensor');
insert into public.diary_entries(id, user_id, note, details)
values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', '11111111-1111-4111-8111-111111111111', 'water',
    '{"event_type":"watering","linked_grow_event_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1","watering":{"volume_ml":500}}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '11111111-1111-4111-8111-111111111111', 'feed',
    '{"event_type":"feeding","linked_grow_event_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2","feeding":{"volume_ml":200,"products":[{"name":"Grow","amount":2,"unit":"ml"}]}}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', '11111111-1111-4111-8111-111111111111', 'sensor',
    '{"event_type":"environment","linked_grow_event_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3","sensor_snapshot":{"metrics":{"temperature_c":24,"humidity_pct":55,"vpd_kpa":1.2}}}');
insert into public.watering_events(event_id, user_id, volume_ml)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 500);
insert into public.feeding_events(event_id, user_id, volume_ml, products)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '11111111-1111-4111-8111-111111111111', 200, '[{"name":"Grow","amount":2,"unit":"ml"}]');
insert into public.environment_events(event_id, user_id, temperature_c, humidity_pct, vpd_kpa)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '11111111-1111-4111-8111-111111111111', 24, 55, 1.2);

do $proof$
declare
  v_water jsonb;
  v_feed jsonb;
  v_sensor jsonb;
  v_prev jsonb;
  v_feed_details jsonb;
begin
  v_water := public.quicklog_correct_entry(
    'wrong_value', '{"volume_ml":750}'::jsonb,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', null, null);
  if coalesce(v_water ->> 'ok', '') <> 'true' then
    raise exception 'watering correction failed: %', v_water;
  end if;
  if (select volume_ml from public.watering_events where event_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1') <> 750 then
    raise exception 'watering volume was not updated';
  end if;
  select previous_state into v_prev from public.quicklog_entry_revisions
   where grow_event_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  if (v_prev ->> 'volume_ml')::numeric <> 500 then
    raise exception 'watering history lost the original volume: %', v_prev;
  end if;

  v_feed := public.quicklog_correct_entry(
    'wrong_value', '{"volume_ml":300,"dose_amount":4}'::jsonb,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', null, null);
  if coalesce(v_feed ->> 'ok', '') <> 'true' then
    raise exception 'feeding correction failed: %', v_feed;
  end if;
  select details into v_feed_details from public.diary_entries where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  if (v_feed_details #>> '{feeding,volume_ml}')::numeric <> 300 then
    raise exception 'feeding volume missing from feeding details: %', v_feed_details;
  end if;
  if v_feed_details #> '{watering,volume_ml}' is not null then
    raise exception 'feeding volume wrote watering details: %', v_feed_details;
  end if;
  if (v_feed_details #>> '{feeding,products,0,amount}')::numeric <> 4 then
    raise exception 'feeding dose was not updated: %', v_feed_details;
  end if;
  select previous_state into v_prev from public.quicklog_entry_revisions
   where grow_event_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  if (v_prev ->> 'volume_ml')::numeric <> 200 or (v_prev ->> 'dose_amount')::numeric <> 2 then
    raise exception 'feeding history lost the original values: %', v_prev;
  end if;

  v_sensor := public.quicklog_correct_entry(
    'wrong_value', '{"sensor_values":{"temperature_c":26,"humidity_pct":60,"vpd_kpa":1.4}}'::jsonb,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', null, null);
  if coalesce(v_sensor ->> 'ok', '') <> 'true' then
    raise exception 'sensor correction failed: %', v_sensor;
  end if;
  if (select temperature_c from public.environment_events where event_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3') <> 26 then
    raise exception 'sensor temperature was not updated';
  end if;
  select previous_state into v_prev from public.quicklog_entry_revisions
   where grow_event_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
  if (v_prev #>> '{environment_events,0,temperature_c}')::numeric <> 24 then
    raise exception 'sensor history lost the original temperature: %', v_prev;
  end if;
end
$proof$;
rollback;
`;

function proveMeasuredValueCorrections(env, spawnImpl) {
  executeSql(MEASURED_CORRECTION_PROOF_SQL, env, {
    stage: "measured_correction_proof",
    spawnImpl,
  });
}

function requireGuardedRollback(label, env, spawnImpl, mutations, expectedMessage) {
  resetScaffold(env, spawnImpl);
  const result = applyPinnedMigration(env, spawnImpl, {
    ...mutations,
    // Even a future false-green guard cannot commit a hostile harness mutation.
    trailingSql: "select 1/0;",
  });
  if (!result?.error && result?.status === 0) throw new Error(`${label}:unexpected_success`);
  if (!String(result?.stderr ?? "").includes(expectedMessage)) {
    throw new Error(`${label}:guard_not_rejected`);
  }
  requireStatus(`${label}_rollback`, readPreflight(env, spawnImpl), "apply");
}

function requireStatus(label, state, expected) {
  const observed = classifyPreflight(state);
  if (observed.status !== expected) throw new Error(`${label}:${observed.status}`);
}

function proveBaselineAndApply(env, spawnImpl) {
  const absent = readPreflight(env, spawnImpl);
  requireStatus("baseline", absent, "apply");
  const result = applyPinnedMigration(env, spawnImpl);
  if (result?.error || result?.status !== 0) {
    throw new Error(formatPsqlFailureCode("apply", result?.stderr));
  }
  const live = readPreflight(env, spawnImpl);
  requireStatus("postflight", live, "verify_only");
  if (!schemaEffectLive(live)) throw new Error("postflight:schema_effect");
}

function proveFiveFunctionFingerprints(env, spawnImpl) {
  const rows = executeSql(
    `select p.proname||'|'||md5(pg_get_functiondef(p.oid))||'|'||octet_length(pg_get_functiondef(p.oid))
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname like 'quicklog%entry%' or
            (n.nspname='public' and p.proname in ('quicklog_revision_resolve_root','quicklog_revision_sibling_env_ids','quicklog_revision_rebase_captured_at'))
      order by p.proname;`,
    env,
    { stage: "fingerprints", spawnImpl },
  )
    .split("\n")
    .filter(Boolean);
  const expected = Object.entries(EXPECTED_FUNCTION_DEFINITION_FINGERPRINTS)
    .map(([name, value]) => `${name}|${value.md5}|${value.bytes}`)
    .sort();
  if (JSON.stringify(rows.sort()) !== JSON.stringify(expected))
    throw new Error("fingerprints:mismatch");
}

function proveClientAccessFences(env, spawnImpl) {
  const result = executeSql(
    `select
      not has_table_privilege('anon','public.quicklog_entry_revisions','select,insert,update,delete')
      and has_table_privilege('authenticated','public.quicklog_entry_revisions','select')
      and not has_table_privilege('authenticated','public.quicklog_entry_revisions','insert,update,delete')
      and not has_function_privilege('anon','public.quicklog_retract_entry(text,uuid,uuid,text)','execute')
      and has_function_privilege('authenticated','public.quicklog_retract_entry(text,uuid,uuid,text)','execute')
      and not has_function_privilege('anon','public.quicklog_correct_entry(text,jsonb,uuid,uuid,text)','execute')
      and has_function_privilege('authenticated','public.quicklog_correct_entry(text,jsonb,uuid,uuid,text)','execute');`,
    env,
    { stage: "client_access", spawnImpl },
  );
  if (result !== "t") throw new Error("client_access:mismatch");
}

const HOSTILE_OVERLOAD_SQL =
  "create function public.quicklog_correct_entry(integer) returns integer language sql as $$ select $1 $$;";
const HOSTILE_OVERLOAD_RESTORE_SQL = "drop function public.quicklog_correct_entry(integer);";

function proveCatalogDrift(env, spawnImpl) {
  executeSql(HOSTILE_OVERLOAD_SQL, env, { stage: "catalog_mutation", spawnImpl });
  requireStatus("catalog_drift", readPreflight(env, spawnImpl), "schema_drift");
  executeSql(HOSTILE_OVERLOAD_RESTORE_SQL, env, { stage: "catalog_restore", spawnImpl });
  requireStatus("catalog_restored", readPreflight(env, spawnImpl), "verify_only");

  // The required-core gate is measured on the seven-function catalog it requires,
  // after the editable-values migration replaces quicklog_correct_entry.
  applyKeyedOverloadMigration(env, spawnImpl);
  applyEditableValuesMigration(env, spawnImpl);
  proveEditableCorrectEntryFingerprint(env, spawnImpl);
  proveMeasuredValueCorrections(env, spawnImpl);
  if (readRequiredCoreCatalog(env, spawnImpl).target_functions_contract !== true) {
    throw new Error("catalog_drift:editable_values_fingerprint");
  }
  if (readRequiredCoreCatalog(env, spawnImpl).target_function_overloads_contract !== true) {
    throw new Error("catalog_drift:required_core_baseline");
  }
  executeSql(HOSTILE_OVERLOAD_SQL, env, { stage: "required_core_catalog_mutation", spawnImpl });
  if (readRequiredCoreCatalog(env, spawnImpl).target_function_overloads_contract !== false) {
    throw new Error("catalog_drift:required_core_false_green");
  }
  executeSql(HOSTILE_OVERLOAD_RESTORE_SQL, env, {
    stage: "required_core_catalog_restore",
    spawnImpl,
  });
  if (readRequiredCoreCatalog(env, spawnImpl).target_function_overloads_contract !== true) {
    throw new Error("catalog_drift:required_core_restore_failed");
  }
}

function proveHostilePolicyDrift(env, spawnImpl) {
  executeSql(
    `create policy "Hostile broad quicklog access" on public.quicklog_entry_revisions
       for all to authenticated using (true) with check (true);`,
    env,
    { stage: "hostile_policy", spawnImpl },
  );
  requireStatus("hostile_policy", readPreflight(env, spawnImpl), "schema_drift");
  if (readRequiredCoreCatalog(env, spawnImpl).target_policies_contract !== false) {
    throw new Error("hostile_policy:required_core_false_green");
  }
  executeSql(
    'drop policy "Hostile broad quicklog access" on public.quicklog_entry_revisions;',
    env,
    { stage: "hostile_policy_restore", spawnImpl },
  );
  requireStatus("hostile_policy_restored", readPreflight(env, spawnImpl), "verify_only");
  if (readRequiredCoreCatalog(env, spawnImpl).target_policies_contract !== true) {
    throw new Error("hostile_policy:required_core_restore_failed");
  }
}

function proveDependencyDrift(env, spawnImpl) {
  executeSql(
    `create or replace function public.has_role(_user_id uuid, _role public.app_role)
       returns boolean language sql stable security definer
       set search_path = public, pg_temp as $$ select true $$;`,
    env,
    { stage: "has_role_drift", spawnImpl },
  );
  const hasRoleState = classifyPreflight(readPreflight(env, spawnImpl));
  if (hasRoleState.status !== "prerequisite_drift" || hasRoleState.reason !== "has_role_contract") {
    throw new Error("has_role_drift:not_rejected");
  }
  if (readRequiredCoreCatalog(env, spawnImpl).has_role_contract !== false) {
    throw new Error("has_role_drift:required_core_false_green");
  }

  resetScaffold(env, spawnImpl);
  const reapplied = applyPinnedMigration(env, spawnImpl);
  if (reapplied?.error || reapplied?.status !== 0) {
    throw new Error(formatPsqlFailureCode("dependency_reapply", reapplied?.stderr));
  }
  executeSql(
    `create or replace function public.quicklog_try_parse_uuid(p_value text)
       returns uuid language sql immutable strict
       set search_path to 'pg_catalog', 'pg_temp' as $$ select null::uuid $$;`,
    env,
    { stage: "uuid_parser_drift", spawnImpl },
  );
  const uuidParserState = classifyPreflight(readPreflight(env, spawnImpl));
  if (
    uuidParserState.status !== "prerequisite_drift" ||
    uuidParserState.reason !== "quicklog_try_parse_uuid_contract"
  ) {
    throw new Error("uuid_parser_drift:not_rejected");
  }
  if (readRequiredCoreCatalog(env, spawnImpl).quicklog_try_parse_uuid_contract !== false) {
    throw new Error("uuid_parser_drift:required_core_false_green");
  }
}

function proveHostileOwnerRollback(env, spawnImpl) {
  requireGuardedRollback(
    "hostile_owner",
    env,
    spawnImpl,
    {
      beforePostflightGuardSql: `grant create on schema public to anon;
alter function public.quicklog_correct_entry(text,jsonb,uuid,uuid,text) owner to anon;`,
    },
    "quicklog delivery refused noncanonical target catalog",
  );
}

function proveHostileFunctionAclRollback(env, spawnImpl) {
  requireGuardedRollback(
    "hostile_function_acl",
    env,
    spawnImpl,
    {
      beforePostflightGuardSql:
        "grant execute on function public.quicklog_revision_resolve_root(uuid,uuid,uuid) to authenticated;",
    },
    "quicklog delivery refused noncanonical target catalog",
  );
}

function proveAuthenticatedBypassRlsRollback(env, spawnImpl) {
  requireGuardedRollback(
    "authenticated_bypassrls",
    env,
    spawnImpl,
    { beforePostflightGuardSql: "alter role authenticated bypassrls;" },
    "quicklog delivery refused prerequisite drift under lock",
  );
  if (readRequiredCoreCatalog(env, spawnImpl).authenticated_role_contract !== true) {
    throw new Error("authenticated_bypassrls:rollback_not_restored");
  }
}

function proveInvalidIndexRollback(env, spawnImpl) {
  requireGuardedRollback(
    "invalid_index",
    env,
    spawnImpl,
    {
      beforePostflightGuardSql: `update pg_catalog.pg_index
set indisvalid=false, indisready=false, indislive=false
where indexrelid='public.quicklog_entry_revisions_user'::regclass;`,
    },
    "quicklog delivery refused noncanonical target catalog",
  );
}

function provePrerequisiteRaceRollback(env, spawnImpl) {
  requireGuardedRollback(
    "prerequisite_race",
    env,
    spawnImpl,
    { beforePostflightGuardSql: "alter table public.user_roles disable row level security;" },
    "quicklog delivery refused prerequisite drift under lock",
  );
  if (readRequiredCoreCatalog(env, spawnImpl).user_roles_contract !== true) {
    throw new Error("prerequisite_race:rollback_not_restored");
  }
}

function proveUserRolesInheritanceDrift(env, spawnImpl) {
  resetScaffold(env, spawnImpl);
  executeSql(
    `create table public.hostile_user_roles_child () inherits (public.user_roles);
grant select, insert on public.hostile_user_roles_child to authenticated;`,
    env,
    { stage: "user_roles_inheritance_drift", spawnImpl },
  );
  const state = classifyPreflight(readPreflight(env, spawnImpl));
  if (state.status !== "prerequisite_drift" || state.reason !== "user_roles_contract") {
    throw new Error("user_roles_inheritance_drift:not_rejected");
  }
  if (readRequiredCoreCatalog(env, spawnImpl).user_roles_contract !== false) {
    throw new Error("user_roles_inheritance_drift:required_core_false_green");
  }
}

function proveUserRolesInheritanceRollback(env, spawnImpl) {
  requireGuardedRollback(
    "user_roles_inheritance",
    env,
    spawnImpl,
    {
      beforePrerequisiteGuardSql: `create table public.hostile_user_roles_child () inherits (public.user_roles);
grant select, insert on public.hostile_user_roles_child to authenticated;`,
    },
    "quicklog delivery refused prerequisite drift under lock",
  );
  if (readRequiredCoreCatalog(env, spawnImpl).user_roles_contract !== true) {
    throw new Error("user_roles_inheritance:rollback_not_restored");
  }
}

function proveRevisionInheritanceDrift(env, spawnImpl) {
  resetScaffold(env, spawnImpl);
  const result = applyPinnedMigration(env, spawnImpl);
  if (result?.error || result?.status !== 0) {
    throw new Error(formatPsqlFailureCode("revision_inheritance_apply", result?.stderr));
  }
  executeSql(
    `create table public.hostile_quicklog_revisions_child () inherits (public.quicklog_entry_revisions);
grant select, insert on public.hostile_quicklog_revisions_child to authenticated;`,
    env,
    { stage: "revision_inheritance_drift", spawnImpl },
  );
  requireStatus("revision_inheritance_drift", readPreflight(env, spawnImpl), "schema_drift");
  if (readRequiredCoreCatalog(env, spawnImpl).target_table_contract !== false) {
    throw new Error("revision_inheritance_drift:required_core_false_green");
  }
}

function proveRevisionInheritanceRollback(env, spawnImpl) {
  requireGuardedRollback(
    "revision_inheritance",
    env,
    spawnImpl,
    {
      beforePostflightGuardSql: `create table public.hostile_quicklog_revisions_child () inherits (public.quicklog_entry_revisions);
grant select, insert on public.hostile_quicklog_revisions_child to authenticated;`,
    },
    "quicklog delivery refused noncanonical target catalog",
  );
}

function provePartialTargetDrift(env, spawnImpl) {
  resetScaffold(env, spawnImpl);
  executeSql("alter table public.diary_entries add column retracted_at timestamptz;", env, {
    stage: "partial",
    spawnImpl,
  });
  requireStatus("partial_target", readPreflight(env, spawnImpl), "partial_target_drift");
}

function proveLedgerCollision(env, spawnImpl) {
  resetScaffold(env, spawnImpl);
  executeSql(
    `insert into supabase_migrations.schema_migrations(version,name,statements)
     values('${PINNED_MIGRATION.version}','wrong_name',array[]::text[]);`,
    env,
    { stage: "collision", spawnImpl },
  );
  requireStatus("ledger_collision", readPreflight(env, spawnImpl), "ledger_drift");
}

function proveLateTransactionRollback(env, spawnImpl) {
  resetScaffold(env, spawnImpl);
  const result = applyPinnedMigration(env, spawnImpl, { trailingSql: "select 1/0;" });
  if (!result?.error && result?.status === 0) throw new Error("rollback:unexpected_success");
  requireStatus("rollback", readPreflight(env, spawnImpl), "apply");
}

export async function runPg15Harness({
  databaseUrl = process.env.QUICKLOG_CORRECTIONS_PG15_URL,
  spawnImpl = spawnSync,
} = {}) {
  const connection = disposableConnection(databaseUrl);
  if (!connection) return fail("database_target_rejected");
  const env = psqlEnvironment(connection);
  try {
    attestDisposableTarget(env, spawnImpl);
    resetScaffold(env, spawnImpl);
    proveBaselineAndApply(env, spawnImpl);
    proveFiveFunctionFingerprints(env, spawnImpl);
    proveClientAccessFences(env, spawnImpl);
    proveHostilePolicyDrift(env, spawnImpl);
    proveCatalogDrift(env, spawnImpl);
    proveDependencyDrift(env, spawnImpl);
    proveHostileOwnerRollback(env, spawnImpl);
    proveHostileFunctionAclRollback(env, spawnImpl);
    proveAuthenticatedBypassRlsRollback(env, spawnImpl);
    proveInvalidIndexRollback(env, spawnImpl);
    provePrerequisiteRaceRollback(env, spawnImpl);
    proveUserRolesInheritanceDrift(env, spawnImpl);
    proveUserRolesInheritanceRollback(env, spawnImpl);
    proveRevisionInheritanceDrift(env, spawnImpl);
    proveRevisionInheritanceRollback(env, spawnImpl);
    provePartialTargetDrift(env, spawnImpl);
    proveLedgerCollision(env, spawnImpl);
    proveLateTransactionRollback(env, spawnImpl);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "unknown");
  }
  process.stdout.write("Quick Log PG15 harness PASS\n");
  return 0;
}

const isDirectInvocation =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectInvocation) process.exitCode = await runPg15Harness();
