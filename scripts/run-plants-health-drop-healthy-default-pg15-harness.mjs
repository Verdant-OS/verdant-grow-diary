#!/usr/bin/env node
/**
 * Disposable PostgreSQL 15 regression for
 * 20261015161000_plants_health_drop_healthy_default.sql.
 *
 * The baseline is the post-20260924120000 shape: plants.health is NOT NULL
 * with default 'unknown', and validate_plant_row() is that migration's
 * function. This harness applies 20261015161000, inserts a plant that omits
 * health, and requires the stored value to be NULL.
 *
 * Loopback disposable database only. It never reads a production URL.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_PSQL_OUTPUT_BYTES = 1_048_576;
const DISPOSABLE_DATABASE = "verdant_plants_health_null";
const DISPOSABLE_DATABASE_USER = "postgres";
const DISPOSABLE_DATABASE_PORT = "5432";
const DISPOSABLE_SCHEMA = "verdant_plants_health_null_harness";
export const DISPOSABLE_SENTINEL = "verdant_plants_health_null_pg15_disposable_v1";
const EARLIER_MIGRATION = "20260924120000_plants_health_unassessed_default.sql";
const MIGRATION_FILE = "20261015161000_plants_health_drop_healthy_default.sql";
const OWNER_ID = "11111111-1111-4111-8111-111111111111";
export const OMIT_PLANT_ID = "b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fail(code) {
  process.stderr.write(`Plants health null PG15 harness failed: ${code}\n`);
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
    PGAPPNAME: "verdant-plants-health-null-pg15-harness",
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

function readMigration(fileName) {
  const sql = readFileSync(resolve(repoRoot, "supabase", "migrations", fileName), "utf8");
  if (sql.includes("supabase.co")) throw new Error("migration_remote_target_forbidden");
  return sql;
}

export function validatePlantRowSql() {
  const sql = readMigration(EARLIER_MIGRATION);
  const match = /CREATE OR REPLACE FUNCTION public\.validate_plant_row\(\)[\s\S]*?\nEND \$\$;/.exec(
    sql,
  );
  if (!match) throw new Error("validate_plant_row_missing");
  if (!match[0].includes("IF NEW.health NOT IN ('healthy','watch','issue','unknown') THEN")) {
    throw new Error("validate_plant_row_health_check_drift");
  }
  return match[0];
}

export function attestationSql() {
  return `begin;
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
}

/** Post-20260924120000 plants.health: NOT NULL, default unknown, real trigger. */
export function baselineSql() {
  return `begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
drop schema if exists public cascade;
create schema public authorization postgres;
create table public.plants (
  id uuid primary key,
  user_id uuid not null,
  name text not null,
  stage text not null default 'seedling',
  health text not null default 'unknown'
);
${validatePlantRowSql()}
create trigger trg_plants_validate
  before insert or update on public.plants
  for each row execute function public.validate_plant_row();
commit;
`;
}

/** Insert that leaves health out of the column list. */
export function omittedHealthInsertSql() {
  return `\\set VERBOSITY sqlstate
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';
insert into public.plants(id, user_id, name)
values ('${OMIT_PLANT_ID}', '${OWNER_ID}', 'omit-column');
commit;
`;
}

export function storedNullProbeSql() {
  return `begin;
set transaction read only;
set local lock_timeout = '5s';
set local statement_timeout = '15s';
select case when health is null then 'null' else 'stored:' || health end
from public.plants
where id = '${OMIT_PLANT_ID}';
commit;
`;
}

export function migrationSql() {
  return readMigration(MIGRATION_FILE);
}

function attestDisposableTarget(env, spawnImpl) {
  const observed = executeSql(attestationSql(), env, {
    stage: "target_attestation",
    spawnImpl,
  });
  if (observed !== DISPOSABLE_SENTINEL) throw new Error("database_target_attestation_rejected");
}

export async function runPg15Harness({
  databaseUrl = process.env.PLANTS_HEALTH_NULL_PG15_URL,
  spawnImpl = spawnSync,
} = {}) {
  const connection = disposableConnection(databaseUrl);
  if (!connection) return fail("database_target_rejected");
  const env = psqlEnvironment(connection);
  try {
    attestDisposableTarget(env, spawnImpl);
    executeSql(baselineSql(), env, { stage: "baseline", spawnImpl });
    executeSql(migrationSql(), env, { stage: "apply_migration", spawnImpl });
    executeSql(omittedHealthInsertSql(), env, { stage: "omit_health_insert", spawnImpl });
    const stored = executeSql(storedNullProbeSql(), env, { stage: "stored_null_probe", spawnImpl });
    if (stored !== "null") throw new Error("omit_health_insert:not_null");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "unknown");
  }
  process.stdout.write("Plants health null PG15 harness PASS\n");
  return 0;
}

const isDirectInvocation =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectInvocation) process.exitCode = await runPg15Harness();
