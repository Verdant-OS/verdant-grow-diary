#!/usr/bin/env node
/**
 * Local-only PostgreSQL 15 runtime harness for the plants health unassessed
 * default delivery (20260924120000, BUG-009).
 *
 * Builds the production baseline — the reviewed 20260516204601 plants
 * migration on a minimal scaffold with Supabase-style default grants — then
 * proves, against a disposable database only:
 *   - the delivery preflight classifies baseline / canonical+ledger-absent /
 *     canonical+ledger exactly as the production runner will;
 *   - before delivery a grower's new plant is 'healthy' and "not assessed" is
 *     rejected; after it, a new plant is 'unknown', "not assessed" saves,
 *     invalid values are still rejected and existing rows are untouched;
 *   - CREATE OR REPLACE keeps validate_plant_row()'s oid, grants and trigger;
 *   - the guarded ledger insert records the migration once, and re-applying
 *     the migration changes nothing;
 *   - every drifted prerequisite, target object, health guard or ledger row
 *     blocks.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATALOG_STATE_QUERY_SQL,
  EXPECTED_FUNCTION_FINGERPRINTS,
  PINNED_MIGRATION,
  aclUnchanged,
  buildLedgerInsertSql,
  classifyPreflight,
  parsePreflightStdout,
} from "./apply-plants-health-unassessed-default.mjs";
import { MIGRATION_LEDGER_CREATE_TABLE_SQL } from "./lib/supabaseMigrationLedgerShape.mjs";

const MAX_PSQL_OUTPUT_BYTES = 1_048_576;
const DISPOSABLE_DATABASE = "verdant_plants_health_default";
const DISPOSABLE_DATABASE_USER = "postgres";
const DISPOSABLE_DATABASE_PORT = "5432";
const DISPOSABLE_SCHEMA = "verdant_plants_health_default_harness";
const DISPOSABLE_SENTINEL = "verdant_plants_health_default_pg15_disposable_v1";
const PREREQUISITE_MIGRATION_FILE = "20260516204601_eb069c76-870d-4f19-8d23-800be7bbfe01.sql";
const EXPECTED_PREREQUISITE_SHA256 =
  "305fdb3169b9dc53a9529d7959ccd3980452cb97ecf22d896f8171c9292a3aad";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const ASSESSED_PLANT_ID = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const WATCH_PLANT_ID = "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2";

function fail(code) {
  process.stderr.write(`Plants health default PG15 harness failed: ${code}\n`);
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

export function disposableConnection(value) {
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
    PGAPPNAME: "verdant-plants-health-default-pg15-harness",
  };
}

function spawnPsql({ env, input, spawnImpl = spawnSync }) {
  return spawnImpl("psql", buildPsqlArgs({ quiet: true }), {
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

function requireSqlFailure(label, sql, expectedCode, env, spawnImpl = spawnSync) {
  const result = spawnPsql({ env, input: `\\set VERBOSITY sqlstate\n${sql}`, spawnImpl });
  if (!result?.error && result?.status === 0) throw new Error(`${label}:unexpected_success`);
  const observed = formatPsqlFailureCode(label, result?.stderr);
  if (observed !== `${label}:${expectedCode}`) throw new Error(`${label}:wrong_failure`);
}

function requireSqlTrue(label, sql, env, spawnImpl = spawnSync) {
  if (executeSql(sql, env, { stage: label, spawnImpl }) !== "t") {
    throw new Error(`${label}:false`);
  }
}

function readPrerequisiteMigration() {
  const sql = readFileSync(
    resolve(repoRoot, "supabase", "migrations", PREREQUISITE_MIGRATION_FILE),
    "utf8",
  );
  if (createHash("sha256").update(sql).digest("hex") !== EXPECTED_PREREQUISITE_SHA256) {
    throw new Error("prerequisite_migration_fingerprint_mismatch");
  }
  // The prerequisite is not self-transactional; the harness wraps it.
  if (/^\s*BEGIN;/im.test(sql)) throw new Error("prerequisite_migration_shape_drift");
  return sql;
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
-- Supabase-style creation defaults, so the prerequisite's objects get the
-- client grants production objects get.
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to anon, authenticated, service_role;
-- The production (knk) ledger shape, measured 2026-09-25.
${MIGRATION_LEDGER_CREATE_TABLE_SQL}
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
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end
$$;
`;

const SEED_SQL = `
insert into public.plants(id, user_id, name, health) values
  ('${ASSESSED_PLANT_ID}', '${OWNER_ID}', 'assessed healthy', 'healthy'),
  ('${WATCH_PLANT_ID}', '${OWNER_ID}', 'on watch', 'watch');
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
     where n.nspname = '${DISPOSABLE_SCHEMA}'
       and c.relname = 'runtime_sentinel'
   ), false)
   and coalesce((
     select count(*) = 1 and bool_and(sentinel = '${DISPOSABLE_SENTINEL}')
     from ${DISPOSABLE_SCHEMA}.runtime_sentinel
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

/** Production baseline: scaffold + the reviewed plants migration + seed rows. */
function resetBaseline(env, spawnImpl) {
  executeSql(
    `begin;\n${BASE_SCAFFOLD_SQL}\n${readPrerequisiteMigration()}\n${SEED_SQL}\ncommit;`,
    env,
    { stage: "baseline", spawnImpl },
  );
}

export function validatePinnedMigrationFile({
  root = resolve(repoRoot, "supabase", "migrations"),
} = {}) {
  const path = resolve(root, PINNED_MIGRATION.file);
  const sql = readFileSync(path, "utf8");
  const sha256 = createHash("sha256").update(sql).digest("hex").toUpperCase();
  if (sha256 !== PINNED_MIGRATION.sha256) throw new Error("migration_fingerprint_mismatch");
  if (!/\nBEGIN;\n/.test(sql) || !/\nCOMMIT;\n$/.test(sql)) {
    throw new Error("migration_transaction_shape_mismatch");
  }
  if (sql.includes("supabase.co")) throw new Error("migration_remote_target_forbidden");
  return Object.freeze({ path, sha256, sql });
}

function applyPinnedMigration(env, spawnImpl = spawnSync) {
  return spawnPsql({ env, input: validatePinnedMigrationFile().sql, spawnImpl });
}

function requireMigrationSuccess(label, env, spawnImpl) {
  const result = applyPinnedMigration(env, spawnImpl);
  if (result?.error || result?.status !== 0) {
    throw new Error(formatPsqlFailureCode(label, result?.stderr));
  }
}

function deliveryState(env, spawnImpl = spawnSync) {
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
  return parsePreflightStdout(`${raw}\n`);
}

function requireDeliveryPreflightStatus(label, expectedStatus, env, spawnImpl = spawnSync) {
  const state = deliveryState(env, spawnImpl);
  const classification = classifyPreflight(state);
  if (classification.status !== expectedStatus) {
    throw new Error(`${label}:unexpected_delivery_preflight_${classification.status}`);
  }
  return state;
}

function catalogDigest(env, spawnImpl = spawnSync) {
  return executeSql(
    `select md5(jsonb_build_object(
      'function', (select jsonb_build_object('oid', p.oid, 'source', p.prosrc, 'acl', p.proacl,
          'owner', p.proowner, 'config', p.proconfig, 'secdef', p.prosecdef)
        from pg_proc p where p.oid = to_regprocedure('public.validate_plant_row()')),
      'triggers', (select jsonb_agg(jsonb_build_object('name', tgname, 'fn', tgfoid, 'type', tgtype,
          'enabled', tgenabled) order by tgname)
        from pg_trigger where tgrelid = 'public.plants'::regclass and not tgisinternal),
      'default', (select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d
        join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
        where a.attrelid = 'public.plants'::regclass and a.attname = 'health'),
      'comment', (select col_description('public.plants'::regclass, a.attnum)
        from pg_attribute a where a.attrelid = 'public.plants'::regclass and a.attname = 'health'),
      'rows', (select jsonb_agg(jsonb_build_object('id', id, 'health', health) order by id)
        from public.plants),
      'ledger', (select jsonb_agg(jsonb_build_object('version',version,'name',name,'statements',statements) order by version)
                 from supabase_migrations.schema_migrations)
    )::text);`,
    env,
    { stage: "catalog_digest", spawnImpl },
  );
}

/** Insert one plant as the signed-in grower (RLS + grants), returning its health. */
function growerInsertHealth(label, name, env, spawnImpl) {
  return executeSql(
    `begin;
set local request.jwt.claim.sub = '${OWNER_ID}';
set local role authenticated;
insert into public.plants(user_id, name) values ('${OWNER_ID}', '${name}') returning health;
commit;`,
    env,
    { stage: label, spawnImpl },
  );
}

function growerSetHealthSql(plantId, health) {
  return `begin;
set local request.jwt.claim.sub = '${OWNER_ID}';
set local role authenticated;
update public.plants set health = '${health}' where id = '${plantId}';
commit;`;
}

function proveBaselineApplyAndLedger(env, spawnImpl) {
  resetBaseline(env, spawnImpl);
  const baseline = requireDeliveryPreflightStatus("baseline", "apply", env, spawnImpl);

  // Before delivery: the legacy behaviour BUG-009 describes.
  if (growerInsertHealth("legacy_insert", "legacy default", env, spawnImpl) !== "healthy") {
    throw new Error("legacy_insert:not_healthy");
  }
  requireSqlFailure(
    "legacy_rejects_unknown",
    growerSetHealthSql(ASSESSED_PLANT_ID, "unknown"),
    "P0001",
    env,
    spawnImpl,
  );

  requireMigrationSuccess("apply", env, spawnImpl);
  const delivered = requireDeliveryPreflightStatus(
    "canonical_ledger_absent",
    "schema_live_ledger_absent",
    env,
    spawnImpl,
  );
  if (!aclUnchanged(baseline, delivered)) throw new Error("apply:function_acl_changed");
  if (delivered.validate_function_oid !== baseline.validate_function_oid) {
    throw new Error("apply:function_replaced_not_updated");
  }
  requireSqlTrue(
    "delivered_fingerprint",
    `select md5(prosrc) = '${EXPECTED_FUNCTION_FINGERPRINTS.delivered.md5}'
       and octet_length(prosrc) = ${EXPECTED_FUNCTION_FINGERPRINTS.delivered.bytes}
     from pg_proc where oid = to_regprocedure('public.validate_plant_row()');`,
    env,
    spawnImpl,
  );

  // After delivery: new plants are not assessed; explicit values still work.
  if (growerInsertHealth("delivered_insert", "new plant", env, spawnImpl) !== "unknown") {
    throw new Error("delivered_insert:not_unknown");
  }
  executeSql(growerSetHealthSql(WATCH_PLANT_ID, "unknown"), env, {
    stage: "grower_clears_assessment",
    spawnImpl,
  });
  executeSql(growerSetHealthSql(WATCH_PLANT_ID, "watch"), env, {
    stage: "grower_reassesses",
    spawnImpl,
  });
  requireSqlFailure(
    "delivered_rejects_invalid",
    growerSetHealthSql(WATCH_PLANT_ID, "sick"),
    "P0001",
    env,
    spawnImpl,
  );
  requireSqlTrue(
    "existing_rows_not_rewritten",
    `select (select health from public.plants where id = '${ASSESSED_PLANT_ID}') = 'healthy'
        and (select health from public.plants where id = '${WATCH_PLANT_ID}') = 'watch'
        and (select count(*) from public.plants where name = 'legacy default' and health = 'healthy') = 1;`,
    env,
    spawnImpl,
  );

  executeSql(buildLedgerInsertSql(), env, { stage: "ledger_insert", spawnImpl });
  requireSqlTrue(
    "ledger_exact_marker_row",
    `select count(*) = 1 and bool_and(
       version = '${PINNED_MIGRATION.version}'
       and name = '${PINNED_MIGRATION.name}'
       and statements = array[
         '-- applied verbatim by protected GitHub workflow; sha256=${PINNED_MIGRATION.sha256}',
         '-- protected wrapper; self-transactional-migration=true;ledger-recovery=v1'
       ]::text[])
     from supabase_migrations.schema_migrations;`,
    env,
    spawnImpl,
  );
  const recorded = requireDeliveryPreflightStatus("ledger_recorded", "verify_only", env, spawnImpl);
  if (!aclUnchanged(baseline, recorded)) throw new Error("ledger_recorded:function_acl_changed");

  const before = catalogDigest(env, spawnImpl);
  requireSqlFailure("ledger_collision", buildLedgerInsertSql(), "55000", env, spawnImpl);
  if (catalogDigest(env, spawnImpl) !== before) throw new Error("ledger_collision:state_changed");

  // Every statement in the migration is idempotent, so a replay is a no-op.
  requireMigrationSuccess("migration_reapply", env, spawnImpl);
  if (catalogDigest(env, spawnImpl) !== before) throw new Error("migration_reapply:state_changed");
  requireDeliveryPreflightStatus("reapply_unchanged", "verify_only", env, spawnImpl);
}

function proveAclChangeIsDetected(env, spawnImpl) {
  resetBaseline(env, spawnImpl);
  const baseline = requireDeliveryPreflightStatus("acl_baseline", "apply", env, spawnImpl);
  requireMigrationSuccess("acl_apply", env, spawnImpl);
  executeSql("revoke execute on function public.validate_plant_row() from anon;", env, {
    stage: "acl_drift_setup",
    spawnImpl,
  });
  const drifted = requireDeliveryPreflightStatus(
    "acl_drifted",
    "schema_live_ledger_absent",
    env,
    spawnImpl,
  );
  if (aclUnchanged(baseline, drifted)) throw new Error("acl_drift:not_detected");
}

function proveLedgerGuardRejectsNonCanonical(env, spawnImpl) {
  resetBaseline(env, spawnImpl);
  requireSqlFailure("ledger_guard_on_baseline", buildLedgerInsertSql(), "55000", env, spawnImpl);
  requireSqlTrue(
    "ledger_guard_on_baseline_absent",
    `select count(*) = 0 from supabase_migrations.schema_migrations;`,
    env,
    spawnImpl,
  );
}

/** Each mutation runs on a fresh baseline or delivered+recorded database. */
export const DRIFT_CASES = Object.freeze([
  {
    label: "health_check_constraint",
    stage: "baseline",
    expected: "prerequisite_drift",
    sql: "alter table public.plants add constraint plants_health_values check (health in ('healthy','watch','issue'));",
  },
  {
    label: "other_health_trigger",
    stage: "baseline",
    expected: "prerequisite_drift",
    sql: `create function public.plants_health_guard() returns trigger language plpgsql as $$
            begin if new.health = 'unknown' then raise exception 'no'; end if; return new; end $$;
          create trigger trg_plants_health_guard before insert on public.plants
            for each row execute function public.plants_health_guard();`,
  },
  {
    label: "health_policy",
    stage: "baseline",
    expected: "prerequisite_drift",
    sql: `create policy "Assessed plants only" on public.plants as restrictive for insert
            to authenticated with check (health <> 'unknown');`,
  },
  {
    label: "validate_trigger_dropped",
    stage: "baseline",
    expected: "prerequisite_drift",
    sql: "drop trigger trg_plants_validate on public.plants;",
  },
  {
    label: "validate_trigger_disabled",
    stage: "baseline",
    expected: "prerequisite_drift",
    sql: "alter table public.plants disable trigger trg_plants_validate;",
  },
  {
    label: "validate_function_security_definer",
    stage: "baseline",
    expected: "prerequisite_drift",
    sql: "alter function public.validate_plant_row() security definer;",
  },
  {
    label: "validate_function_search_path",
    stage: "baseline",
    expected: "prerequisite_drift",
    sql: "alter function public.validate_plant_row() set search_path = public, pg_temp;",
  },
  {
    label: "validate_function_overload",
    stage: "baseline",
    expected: "prerequisite_drift",
    sql: "create function public.validate_plant_row(p_health text) returns boolean language sql as $$ select true $$;",
  },
  {
    label: "health_column_nullable",
    stage: "baseline",
    expected: "prerequisite_drift",
    sql: "alter table public.plants alter column health drop not null;",
  },
  {
    label: "plants_rls_disabled",
    stage: "baseline",
    expected: "prerequisite_drift",
    sql: "alter table public.plants disable row level security;",
  },
  {
    label: "legacy_body_drift",
    stage: "baseline",
    expected: "schema_drift",
    sql: `create or replace function public.validate_plant_row()
          returns trigger language plpgsql set search_path = public as $$
          begin return new; end $$;`,
  },
  {
    label: "health_default_drift",
    stage: "baseline",
    expected: "schema_drift",
    sql: "alter table public.plants alter column health set default 'watch';",
  },
  {
    label: "partial_default_only",
    stage: "baseline",
    expected: "schema_drift",
    sql: "alter table public.plants alter column health set default 'unknown';",
  },
  {
    label: "delivered_comment_drift",
    stage: "recorded",
    expected: "schema_drift",
    sql: "comment on column public.plants.health is 'something else';",
  },
  {
    label: "delivered_body_drift",
    stage: "recorded",
    expected: "schema_drift",
    sql: `create or replace function public.validate_plant_row()
          returns trigger language plpgsql set search_path = public as $$
          begin return new; end $$;`,
  },
  {
    label: "health_check_constraint_after_delivery",
    stage: "recorded",
    expected: "prerequisite_drift",
    sql: "alter table public.plants add constraint plants_health_values check (health in ('healthy','watch','issue','unknown'));",
  },
  {
    label: "ledger_statements_drift",
    stage: "recorded",
    expected: "schema_drift",
    sql: `update supabase_migrations.schema_migrations set statements = array['-- other']::text[]
          where version = '${PINNED_MIGRATION.version}';`,
  },
  {
    label: "ledger_name_default",
    stage: "baseline",
    expected: "prerequisite_drift",
    sql: "alter table supabase_migrations.schema_migrations alter column name set default 'unexpected';",
  },
  {
    label: "ledger_extra_column",
    stage: "baseline",
    expected: "prerequisite_drift",
    sql: "alter table supabase_migrations.schema_migrations add column extra text;",
  },
  {
    label: "ledger_idempotency_key_unique_dropped",
    stage: "baseline",
    expected: "prerequisite_drift",
    sql: "alter table supabase_migrations.schema_migrations drop constraint schema_migrations_idempotency_key_key;",
  },
  {
    label: "ledger_name_collision",
    stage: "baseline",
    expected: "ledger_drift",
    sql: `insert into supabase_migrations.schema_migrations(version,name,statements)
          values ('${PINNED_MIGRATION.version}','some_other_name',null);`,
  },
  {
    label: "ledger_recorded_but_objects_absent",
    stage: "baseline",
    expected: "schema_drift",
    sql: `insert into supabase_migrations.schema_migrations(version,name,statements)
          values ('${PINNED_MIGRATION.version}','${PINNED_MIGRATION.name}',null);`,
  },
]);

function prepareStage(stage, env, spawnImpl) {
  resetBaseline(env, spawnImpl);
  if (stage === "recorded") {
    requireMigrationSuccess("drift_setup_apply", env, spawnImpl);
    executeSql(buildLedgerInsertSql(), env, { stage: "drift_setup_ledger", spawnImpl });
    requireDeliveryPreflightStatus("drift_setup", "verify_only", env, spawnImpl);
  }
}

function proveDriftBlocks(env, spawnImpl) {
  for (const drift of DRIFT_CASES) {
    prepareStage(drift.stage, env, spawnImpl);
    executeSql(`begin;\n${drift.sql}\ncommit;`, env, { stage: `${drift.label}_setup`, spawnImpl });
    requireDeliveryPreflightStatus(drift.label, drift.expected, env, spawnImpl);
  }
}

function proveServiceRoleAttributeDrift(env, spawnImpl) {
  prepareStage("recorded", env, spawnImpl);
  executeSql("alter role service_role nobypassrls;", env, { stage: "role_drift_setup", spawnImpl });
  try {
    requireDeliveryPreflightStatus(
      "service_role_nobypassrls",
      "prerequisite_drift",
      env,
      spawnImpl,
    );
  } finally {
    executeSql("alter role service_role bypassrls;", env, {
      stage: "role_drift_restore",
      spawnImpl,
    });
  }
  requireDeliveryPreflightStatus("service_role_restored", "verify_only", env, spawnImpl);
}

export async function runPg15Harness({
  databaseUrl = process.env.PLANTS_HEALTH_DEFAULT_PG15_URL,
  spawnImpl = spawnSync,
} = {}) {
  const connection = disposableConnection(databaseUrl);
  if (!connection) return fail("database_target_rejected");
  const env = psqlEnvironment(connection);
  try {
    attestDisposableTarget(env, spawnImpl);
    proveBaselineApplyAndLedger(env, spawnImpl);
    proveAclChangeIsDetected(env, spawnImpl);
    proveLedgerGuardRejectsNonCanonical(env, spawnImpl);
    proveDriftBlocks(env, spawnImpl);
    proveServiceRoleAttributeDrift(env, spawnImpl);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "unknown");
  }
  process.stdout.write("Plants health default PG15 harness PASS\n");
  return 0;
}

const isDirectInvocation =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectInvocation) process.exitCode = await runPg15Harness();
