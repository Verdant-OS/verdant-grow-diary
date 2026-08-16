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
  parseQuickLogCatalogContract,
  QUICKLOG_CORRECTIONS_CATALOG_SQL,
} from "./assert-required-core-migrations-applied.mjs";

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

function extractFunctionDefinition(relativePath, functionPrefix, terminator) {
  const source = readFileSync(resolve(repoRoot, relativePath), "utf8");
  const start = source.indexOf(functionPrefix);
  if (start < 0) throw new Error("dependency_source_missing");
  const end = source.indexOf(`\n${terminator}`, start);
  if (end < 0) throw new Error("dependency_source_malformed");
  return source.slice(start, end + terminator.length + 1);
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
    execute 'create role service_role nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls';
  elsif not exists(
    select 1 from pg_roles where rolname='service_role'
      and not rolsuper and not rolinherit and not rolcreaterole and not rolcreatedb
      and not rolcanlogin and not rolreplication and not rolbypassrls
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
create table supabase_migrations.schema_migrations(
  version text primary key, name text, statements text[]
);
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

function proveCatalogDrift(env, spawnImpl) {
  executeSql(
    "create function public.quicklog_correct_entry(integer) returns integer language sql as $$ select $1 $$;",
    env,
    { stage: "catalog_mutation", spawnImpl },
  );
  requireStatus("catalog_drift", readPreflight(env, spawnImpl), "schema_drift");
  executeSql("drop function public.quicklog_correct_entry(integer);", env, {
    stage: "catalog_restore",
    spawnImpl,
  });
  requireStatus("catalog_restored", readPreflight(env, spawnImpl), "verify_only");
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
