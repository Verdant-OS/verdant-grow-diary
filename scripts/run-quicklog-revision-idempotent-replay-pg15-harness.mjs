#!/usr/bin/env node
/**
 * Local-only PostgreSQL 15 runtime harness for the Quick Log revision
 * idempotent replay delivery (20260916111000).
 *
 * Builds the production baseline — the reviewed 20260811090000 corrections
 * migration on a minimal scaffold — then proves, against a disposable
 * database only:
 *   - the delivery preflight classifies baseline / canonical+ledger-absent /
 *     canonical+ledger exactly as the production runner will;
 *   - the pinned migration applies byte-for-byte and the guarded ledger insert
 *     records it once, rejecting a second insert without changing anything;
 *   - the keyed overloads really are idempotent per owner and key, keep
 *     rejected requests unstored, and leave the legacy unkeyed RPCs working;
 *   - client roles cannot reach the internal helper or receipt table;
 *   - every drifted prerequisite, target object, ACL or ledger row blocks.
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
  buildLedgerInsertSql,
  classifyPreflight,
  parsePreflightStdout,
} from "./apply-quicklog-revision-idempotent-replay.mjs";

const MAX_PSQL_OUTPUT_BYTES = 1_048_576;
const DISPOSABLE_DATABASE = "verdant_quicklog_revision_replay";
const DISPOSABLE_DATABASE_USER = "postgres";
const DISPOSABLE_DATABASE_PORT = "5432";
const DISPOSABLE_SCHEMA = "verdant_quicklog_revision_replay_harness";
const DISPOSABLE_SENTINEL = "verdant_quicklog_revision_replay_pg15_disposable_v1";
const PREREQUISITE_MIGRATION_FILE = "20260811090000_quicklog_corrections_retractions.sql";
const EXPECTED_PREREQUISITE_SHA256 =
  "9531cdccb095f871fbf75145b828a73224210e31cc638a24b4019b20a8763105";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_GROW_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_GROW_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OWNER_EVENT_ID = "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1";
const OWNER_SECOND_EVENT_ID = "e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2";
const OWNER_LEGACY_EVENT_ID = "e4e4e4e4-e4e4-4e4e-8e4e-e4e4e4e4e4e4";
const OTHER_EVENT_ID = "e3e3e3e3-e3e3-4e3e-8e3e-e3e3e3e3e3e3";
const SHARED_KEY = "revision-replay-shared-0001";
const REJECTED_KEY = "revision-replay-rejected-0001";

function fail(code) {
  process.stderr.write(`Quick Log revision replay PG15 harness failed: ${code}\n`);
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
    PGAPPNAME: "verdant-quicklog-revision-replay-pg15-harness",
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

function extractFunctionDefinition(relativePath, functionPrefix, terminator) {
  const source = readFileSync(resolve(repoRoot, relativePath), "utf8");
  const start = source.indexOf(functionPrefix);
  if (start < 0 || source.indexOf(functionPrefix, start + functionPrefix.length) >= 0) {
    throw new Error("dependency_source_missing_or_ambiguous");
  }
  const end = source.indexOf(`\n${terminator}`, start);
  if (end < 0) throw new Error("dependency_source_malformed");
  return source.slice(start, end + terminator.length + 1);
}

const hasRoleDefinition = extractFunctionDefinition(
  "supabase/migrations/20260517010926_65004f70-4e2c-48b3-bfcb-37bb8d2f0040.sql",
  "CREATE OR REPLACE FUNCTION public.has_role(",
  "$$;",
);
const quicklogTryParseUuidDefinition = extractFunctionDefinition(
  "supabase/migrations/20260725024026_quicklog_dual_timestamp_foundation.sql",
  "CREATE FUNCTION public.quicklog_try_parse_uuid(",
  "$function$;",
);

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
-- The production (knk) ledger shape, measured 2026-09-25.
create table supabase_migrations.schema_migrations(
  version text primary key, statements text[], name text, created_by text,
  idempotency_key text unique, rollback text[]
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
create type public.app_role as enum ('operator','customer');
create table auth.users(id uuid primary key);
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
`;

const SEED_SQL = `
insert into auth.users(id) values ('${OWNER_ID}'), ('${OTHER_ID}');
insert into public.grows(id,user_id) values
  ('${OWNER_GROW_ID}','${OWNER_ID}'), ('${OTHER_GROW_ID}','${OTHER_ID}');
insert into public.grow_events(id,user_id,grow_id,event_type,note,created_at) values
  ('${OWNER_EVENT_ID}','${OWNER_ID}','${OWNER_GROW_ID}','note','first','2026-01-01T10:00:00Z'),
  ('${OWNER_SECOND_EVENT_ID}','${OWNER_ID}','${OWNER_GROW_ID}','note','second','2026-01-01T10:01:00Z'),
  ('${OWNER_LEGACY_EVENT_ID}','${OWNER_ID}','${OWNER_GROW_ID}','note','legacy','2026-01-01T10:02:00Z'),
  ('${OTHER_EVENT_ID}','${OTHER_ID}','${OTHER_GROW_ID}','note','other','2026-01-01T10:03:00Z');
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

/** Production baseline: scaffold + the reviewed corrections migration + seed rows. */
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
  return classification;
}

function requireDeliveryPreflightBlocked(label, expectedStatus, env, spawnImpl = spawnSync) {
  const classification = deliveryPreflightClassification(env, spawnImpl);
  if (classification.status !== expectedStatus) {
    throw new Error(`${label}:unexpected_delivery_preflight_${classification.status}`);
  }
}

function catalogDigest(env, spawnImpl = spawnSync) {
  return executeSql(
    `select md5(jsonb_build_object(
      'functions', (select jsonb_agg(jsonb_build_object(
        'signature', p.oid::regprocedure::text, 'source', p.prosrc, 'acl', p.proacl,
        'owner', p.proowner, 'config', p.proconfig
      ) order by p.oid::regprocedure::text)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in (
        'quicklog_correct_entry','quicklog_retract_entry','quicklog_revision_apply_once'
      )),
      'receipt_acl', (select relacl from pg_class where oid = to_regclass('public.quicklog_revision_idempotency')),
      'receipts', (select count(*) from public.quicklog_revision_idempotency),
      'ledger', (select jsonb_agg(jsonb_build_object('version',version,'name',name,'statements',statements) order by version)
                 from supabase_migrations.schema_migrations)
    )::text);`,
    env,
    { stage: "catalog_digest", spawnImpl },
  );
}

function authenticatedCall(userId, rpcSql) {
  return `begin;
set local request.jwt.claim.sub = '${userId}';
set local role authenticated;
select (${rpcSql})::text;
commit;`;
}

function parseJson(label, stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`${label}:invalid_json`);
  }
}

function callJson(label, sql, env, spawnImpl) {
  return parseJson(label, executeSql(sql, env, { stage: label, spawnImpl }));
}

function keyedRetractSql({ key, reason = "typo", eventId }) {
  return `public.quicklog_retract_entry(
    p_idempotency_key => '${key}', p_reason_code => '${reason}',
    p_grow_event_id => '${eventId}'::uuid)`;
}

function receiptCount(userId, key, env, spawnImpl) {
  return executeSql(
    `select count(*) from public.quicklog_revision_idempotency
     where user_id = '${userId}' and idempotency_key = '${key}';`,
    env,
    { stage: "receipt_count", spawnImpl },
  );
}

function proveBaselineApplyAndLedger(env, spawnImpl) {
  resetBaseline(env, spawnImpl);
  requireDeliveryPreflightStatus("baseline", "apply", env, spawnImpl);
  requireMigrationSuccess("apply", env, spawnImpl);
  requireDeliveryPreflightStatus(
    "canonical_ledger_absent",
    "schema_live_ledger_absent",
    env,
    spawnImpl,
  );
  requireSqlTrue(
    "delivered_fingerprints",
    `select
       md5(prosrc) = '${EXPECTED_FUNCTION_FINGERPRINTS.applyOnce.md5}'
       and octet_length(prosrc) = ${EXPECTED_FUNCTION_FINGERPRINTS.applyOnce.bytes}
     from pg_proc where oid = to_regprocedure('public.quicklog_revision_apply_once(text,text,text,jsonb,uuid,uuid,text)');`,
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
  requireDeliveryPreflightStatus("ledger_recorded", "verify_only", env, spawnImpl);

  const before = catalogDigest(env, spawnImpl);
  requireSqlFailure("ledger_collision", buildLedgerInsertSql(), "55000", env, spawnImpl);
  if (catalogDigest(env, spawnImpl) !== before) throw new Error("ledger_collision:state_changed");

  requireSqlFailure(
    "migration_reapply",
    validatePinnedMigrationFile().sql,
    "42P07",
    env,
    spawnImpl,
  );
  if (catalogDigest(env, spawnImpl) !== before) throw new Error("migration_reapply:state_changed");
  requireDeliveryPreflightStatus("reapply_unchanged", "verify_only", env, spawnImpl);
}

function proveKeyedRuntime(env, spawnImpl) {
  const first = callJson(
    "keyed_retract",
    authenticatedCall(OWNER_ID, keyedRetractSql({ key: SHARED_KEY, eventId: OWNER_EVENT_ID })),
    env,
    spawnImpl,
  );
  if (first.ok !== true || typeof first.revision_id !== "string") {
    throw new Error("keyed_retract:not_ok");
  }
  if (receiptCount(OWNER_ID, SHARED_KEY, env, spawnImpl) !== "1") {
    throw new Error("keyed_retract:receipt_not_stored");
  }

  const replay = callJson(
    "keyed_replay",
    authenticatedCall(OWNER_ID, keyedRetractSql({ key: SHARED_KEY, eventId: OWNER_EVENT_ID })),
    env,
    spawnImpl,
  );
  if (replay.reused !== true || replay.revision_id !== first.revision_id) {
    throw new Error("keyed_replay:not_reused");
  }
  requireSqlTrue(
    "keyed_replay_single_revision",
    `select count(*) = 1 from public.quicklog_entry_revisions where root_id = '${OWNER_EVENT_ID}';`,
    env,
    spawnImpl,
  );

  const conflict = callJson(
    "keyed_conflict",
    authenticatedCall(
      OWNER_ID,
      keyedRetractSql({ key: SHARED_KEY, eventId: OWNER_SECOND_EVENT_ID }),
    ),
    env,
    spawnImpl,
  );
  if (conflict.ok !== false || conflict.reason !== "idempotency_conflict") {
    throw new Error("keyed_conflict:not_rejected");
  }
  requireSqlTrue(
    "keyed_conflict_untouched",
    `select not is_deleted from public.grow_events where id = '${OWNER_SECOND_EVENT_ID}';`,
    env,
    spawnImpl,
  );

  const shortKey = callJson(
    "keyed_short_key",
    authenticatedCall(OWNER_ID, keyedRetractSql({ key: "short", eventId: OWNER_SECOND_EVENT_ID })),
    env,
    spawnImpl,
  );
  if (shortKey.reason !== "invalid_idempotency_key") throw new Error("keyed_short_key:accepted");

  const rejected = callJson(
    "keyed_rejected_request",
    authenticatedCall(
      OWNER_ID,
      `public.quicklog_correct_entry(
        p_idempotency_key => '${REJECTED_KEY}', p_reason_code => 'not-a-reason',
        p_changes => '{"note":"x"}'::jsonb, p_grow_event_id => '${OWNER_SECOND_EVENT_ID}'::uuid)`,
    ),
    env,
    spawnImpl,
  );
  if (rejected.ok !== false || rejected.reason !== "invalid_reason") {
    throw new Error("keyed_rejected_request:unexpected_result");
  }
  if (receiptCount(OWNER_ID, REJECTED_KEY, env, spawnImpl) !== "0") {
    throw new Error("keyed_rejected_request:receipt_stored");
  }

  const otherOwner = callJson(
    "keyed_other_owner",
    authenticatedCall(OTHER_ID, keyedRetractSql({ key: SHARED_KEY, eventId: OTHER_EVENT_ID })),
    env,
    spawnImpl,
  );
  if (otherOwner.ok !== true || otherOwner.reused === true) {
    throw new Error("keyed_other_owner:key_not_owner_scoped");
  }

  const crossOwner = callJson(
    "keyed_cross_owner",
    authenticatedCall(
      OTHER_ID,
      keyedRetractSql({ key: "revision-replay-cross-0001", eventId: OWNER_SECOND_EVENT_ID }),
    ),
    env,
    spawnImpl,
  );
  if (crossOwner.ok !== false || crossOwner.reason !== "not_found_or_not_owned") {
    throw new Error("keyed_cross_owner:not_fenced");
  }
  if (receiptCount(OTHER_ID, "revision-replay-cross-0001", env, spawnImpl) !== "0") {
    throw new Error("keyed_cross_owner:receipt_stored");
  }

  const anonymous = callJson(
    "keyed_unauthenticated",
    `begin; set local role authenticated;
     select (${keyedRetractSql({ key: "revision-replay-anon-0001", eventId: OWNER_SECOND_EVENT_ID })})::text;
     commit;`,
    env,
    spawnImpl,
  );
  if (anonymous.reason !== "not_authenticated") throw new Error("keyed_unauthenticated:accepted");

  const legacy = callJson(
    "legacy_unkeyed",
    authenticatedCall(
      OWNER_ID,
      `public.quicklog_retract_entry(
        p_reason_code => 'typo', p_grow_event_id => '${OWNER_LEGACY_EVENT_ID}'::uuid)`,
    ),
    env,
    spawnImpl,
  );
  if (legacy.ok !== true) throw new Error("legacy_unkeyed:broken");
}

function proveClientAccessFences(env, spawnImpl) {
  requireSqlFailure(
    "anon_keyed_execute",
    `begin; set local role anon;
     select ${keyedRetractSql({ key: "revision-replay-anon-0002", eventId: OWNER_SECOND_EVENT_ID })};
     commit;`,
    "42501",
    env,
    spawnImpl,
  );
  requireSqlFailure(
    "authenticated_helper_execute",
    `begin; set local request.jwt.claim.sub = '${OWNER_ID}'; set local role authenticated;
     select public.quicklog_revision_apply_once('revision-replay-helper-0001','retraction','typo',
       null, '${OWNER_SECOND_EVENT_ID}'::uuid, null, null);
     commit;`,
    "42501",
    env,
    spawnImpl,
  );
  requireSqlFailure(
    "authenticated_receipt_read",
    `begin; set local role authenticated;
     select count(*) from public.quicklog_revision_idempotency;
     commit;`,
    "42501",
    env,
    spawnImpl,
  );
  requireSqlFailure(
    "authenticated_receipt_insert",
    `begin; set local role authenticated;
     insert into public.quicklog_revision_idempotency(user_id,idempotency_key,request,receipt)
     values ('${OWNER_ID}','revision-replay-forged-0001','{}','{"ok":true}');
     commit;`,
    "42501",
    env,
    spawnImpl,
  );
  requireSqlTrue(
    "service_role_receipt_read",
    `begin; set local role service_role;
     select count(*) >= 2 from public.quicklog_revision_idempotency;
     commit;`,
    env,
    spawnImpl,
  );
}

/** Each mutation runs on a fresh canonical+recorded or baseline database. */
export const DRIFT_CASES = Object.freeze([
  {
    label: "legacy_retract_body_drift",
    stage: "baseline",
    expected: "prerequisite_drift",
    sql: `alter function public.quicklog_retract_entry(text,uuid,uuid,text) rename to quicklog_retract_entry_saved;
          create function public.quicklog_retract_entry(p_reason_code text, p_grow_event_id uuid default null,
            p_diary_entry_id uuid default null, p_reason_note text default null)
          returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
          as $$ begin return jsonb_build_object('ok', false); end $$;
          revoke all on function public.quicklog_retract_entry(text,uuid,uuid,text) from public, anon;
          grant execute on function public.quicklog_retract_entry(text,uuid,uuid,text) to authenticated, service_role;`,
  },
  {
    label: "legacy_correct_anon_grant",
    stage: "baseline",
    expected: "prerequisite_drift",
    sql: "grant execute on function public.quicklog_correct_entry(text,jsonb,uuid,uuid,text) to anon;",
  },
  {
    label: "partial_receipt_table_only",
    stage: "baseline",
    expected: "schema_drift",
    sql: `create table public.quicklog_revision_idempotency(user_id uuid not null, idempotency_key text not null,
            request jsonb not null, receipt jsonb not null, created_at timestamptz not null default now(),
            primary key (user_id, idempotency_key));`,
  },
  {
    label: "apply_once_body_drift",
    stage: "recorded",
    expected: "schema_drift",
    sql: `create or replace function public.quicklog_revision_apply_once(
            p_idempotency_key text, p_kind text, p_reason_code text, p_changes jsonb,
            p_grow_event_id uuid, p_diary_entry_id uuid, p_reason_note text)
          returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
          as $$ begin return jsonb_build_object('ok', true); end $$;`,
  },
  {
    label: "keyed_correct_anon_grant",
    stage: "recorded",
    expected: "schema_drift",
    sql: "grant execute on function public.quicklog_correct_entry(text,text,jsonb,uuid,uuid,text) to anon;",
  },
  {
    label: "apply_once_client_grant",
    stage: "recorded",
    expected: "schema_drift",
    sql: "grant execute on function public.quicklog_revision_apply_once(text,text,text,jsonb,uuid,uuid,text) to authenticated;",
  },
  {
    label: "keyed_retract_dropped",
    stage: "recorded",
    expected: "schema_drift",
    sql: "drop function public.quicklog_retract_entry(text,text,uuid,uuid,text);",
  },
  {
    label: "receipt_table_client_read",
    stage: "recorded",
    expected: "schema_drift",
    sql: "grant select on public.quicklog_revision_idempotency to authenticated;",
  },
  {
    label: "receipt_table_policy",
    stage: "recorded",
    expected: "schema_drift",
    sql: `create policy receipt_owner_read on public.quicklog_revision_idempotency
            for select to authenticated using (user_id = auth.uid());`,
  },
  {
    label: "receipt_table_rls_disabled",
    stage: "recorded",
    expected: "schema_drift",
    sql: "alter table public.quicklog_revision_idempotency disable row level security;",
  },
  {
    label: "receipt_table_key_check_dropped",
    stage: "recorded",
    expected: "schema_drift",
    sql: "alter table public.quicklog_revision_idempotency drop constraint quicklog_revision_idempotency_idempotency_key_check;",
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
    requireDeliveryPreflightBlocked(drift.label, drift.expected, env, spawnImpl);
  }
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

function proveServiceRoleAttributeDrift(env, spawnImpl) {
  prepareStage("recorded", env, spawnImpl);
  executeSql("alter role service_role nobypassrls;", env, { stage: "role_drift_setup", spawnImpl });
  try {
    requireDeliveryPreflightBlocked(
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
  databaseUrl = process.env.QUICKLOG_REVISION_REPLAY_PG15_URL,
  spawnImpl = spawnSync,
} = {}) {
  const connection = disposableConnection(databaseUrl);
  if (!connection) return fail("database_target_rejected");
  const env = psqlEnvironment(connection);
  try {
    attestDisposableTarget(env, spawnImpl);
    proveBaselineApplyAndLedger(env, spawnImpl);
    proveKeyedRuntime(env, spawnImpl);
    proveClientAccessFences(env, spawnImpl);
    proveLedgerGuardRejectsNonCanonical(env, spawnImpl);
    proveDriftBlocks(env, spawnImpl);
    proveServiceRoleAttributeDrift(env, spawnImpl);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "unknown");
  }
  process.stdout.write("Quick Log revision replay PG15 harness PASS\n");
  return 0;
}

const isDirectInvocation =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectInvocation) process.exitCode = await runPg15Harness();
