#!/usr/bin/env node
/**
 * Local-only PostgreSQL 15 runtime proof for the exact production
 * PREFLIGHT_SQL/buildApplySql restored-history reconciliation path.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildApplySql,
  buildPostflightSql,
  CATALOG_STATE_QUERY_SQL,
  classifyPreflight,
  loadReconciliationManifest,
  parsePreflightStdout,
  PREFLIGHT_SQL,
  RECONCILIATION_TARGETS,
} from "./reconcile-restored-history-ledger.mjs";

const MAX_PSQL_OUTPUT_BYTES = 1_048_576;
const LOCK_POLL_ATTEMPTS = 200;
const LOCK_POLL_DELAY_MS = 50;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const STAFF_SOURCE_PATH = resolve(
  repoRoot,
  "supabase/migrations/20260709015758_d49efeac-492c-4f7b-9746-3638f44fa287.sql",
);
const STAFF_SOURCE_SHA256 = "e6e43a24415c340c0f9f024ef73bd6b96f7c8bc7638c172c2dc79f9a56c202b5";
const QUICKLOG_SOURCE_PATH = resolve(
  repoRoot,
  "supabase/migrations/20260725024026_quicklog_dual_timestamp_foundation.sql",
);
const QUICKLOG_SOURCE_SHA256 = "ecd29034e963d9dfbffe54796c37bede6c63588f9888ffa09afb042776ecbba1";
const STAFF_PLACEHOLDER = "-- __EXACT_STAFF_ALLOWLIST_FUNCTION__";
const QUICKLOG_PLACEHOLDER = "-- __EXACT_QUICKLOG_SAVE_EVENT_FUNCTION__";

export const DISPOSABLE_DATABASE = "postgres";
export const DISPOSABLE_DATABASE_USER = "postgres";
export const DISPOSABLE_DATABASE_PORT = "5432";
export const DISPOSABLE_SENTINEL =
  "verdant_restored_history_ledger_reconciliation_pg15_disposable_v2";
export const HARNESS_SCHEMA = "verdant_restored_history_ledger_reconciliation_harness";
export const SQL_PROOF_PATH = resolve(
  repoRoot,
  "supabase/tests/restored_history_ledger_reconciliation.sql",
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function fail(code) {
  process.stderr.write(`Restored-history ledger PG15 harness failed: ${code}\n`);
  return 1;
}

function assertSingleOccurrence(source, token, code) {
  const first = source.indexOf(token);
  if (first < 0 || source.indexOf(token, first + token.length) >= 0) throw new Error(code);
  return first;
}

function extractFunctionDefinition({ source, startToken, endToken, code }) {
  const start = assertSingleOccurrence(source, startToken, `${code}_start`);
  const end = source.indexOf(endToken, start + startToken.length);
  if (end < 0) throw new Error(`${code}_end`);
  return source.slice(start, end + endToken.length);
}

function readPinnedSource(path, expectedSha256, code) {
  const source = readFileSync(path, "utf8").replaceAll("\r\n", "\n");
  if (sha256(source) !== expectedSha256) throw new Error(`${code}_digest`);
  return source;
}

export function buildCatalogFixtureSql() {
  const template = readFileSync(SQL_PROOF_PATH, "utf8");
  assertSingleOccurrence(template, STAFF_PLACEHOLDER, "staff_placeholder");
  assertSingleOccurrence(template, QUICKLOG_PLACEHOLDER, "quicklog_placeholder");
  const staffDefinition = extractFunctionDefinition({
    source: readPinnedSource(STAFF_SOURCE_PATH, STAFF_SOURCE_SHA256, "staff_source"),
    startToken: "CREATE OR REPLACE FUNCTION public.grant_staff_role_for_verified_allowlist()",
    endToken: "\n$$;",
    code: "staff_definition",
  });
  const quicklogDefinition = extractFunctionDefinition({
    source: readPinnedSource(QUICKLOG_SOURCE_PATH, QUICKLOG_SOURCE_SHA256, "quicklog_source"),
    startToken: "CREATE FUNCTION public.quicklog_save_event(\n",
    endToken: "\n$function$;",
    code: "quicklog_definition",
  });
  const fixture = template
    .replace(STAFF_PLACEHOLDER, () => staffDefinition)
    .replace(QUICKLOG_PLACEHOLDER, () => quicklogDefinition);
  if (fixture.includes(STAFF_PLACEHOLDER) || fixture.includes(QUICKLOG_PLACEHOLDER)) {
    throw new Error("catalog_fixture_placeholder_remaining");
  }
  return fixture;
}

export function attestProductionSqlComposition() {
  if (!PREFLIGHT_SQL.includes(CATALOG_STATE_QUERY_SQL)) {
    throw new Error("production_preflight_catalog_query_unlinked");
  }
}

export function buildPsqlArgs() {
  return [
    "-X",
    "-q",
    "-A",
    "-t",
    "-v",
    "ON_ERROR_STOP=1",
    "-v",
    "VERBOSITY=verbose",
    "-v",
    `harness_confirmation=${DISPOSABLE_SENTINEL}`,
  ];
}

export function validateDisposableDatabaseUrl(value) {
  try {
    const url = new URL(value);
    if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) return null;
    if (!new Set(["127.0.0.1", "localhost", "::1", "[::1]"]).has(url.hostname)) {
      return null;
    }
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

export function formatPsqlFailureCode(stage, stderr) {
  const value = String(stderr ?? "");
  const sqlState =
    /(?:SQL state|SQLSTATE)[: ]+([0-9A-Z]{5})/i.exec(value)?.[1] ??
    /^ERROR:\s+([0-9A-Z]{5})(?::|\s|$)/m.exec(value)?.[1];
  return `${stage}:${sqlState?.toUpperCase() ?? "unknown"}`;
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
    PGAPPNAME: "verdant-restored-history-ledger-reconciliation-pg15-harness",
    RESTORED_HISTORY_LEDGER_RECONCILIATION_PG15_CONTAINER: containerId ?? "",
    RESTORED_HISTORY_LEDGER_RECONCILIATION_PG15_CONTAINER_RUNTIME: containerRuntime ?? "docker",
  };
}

function psqlCommand(env, { singleTransaction = false } = {}) {
  const args = [...buildPsqlArgs(), ...(singleTransaction ? ["--single-transaction"] : [])];
  const containerId = env.RESTORED_HISTORY_LEDGER_RECONCILIATION_PG15_CONTAINER;
  if (!containerId) return { command: "psql", args };
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
    ...args,
  ];
  if (env.RESTORED_HISTORY_LEDGER_RECONCILIATION_PG15_CONTAINER_RUNTIME === "wsl-docker") {
    return {
      command: "wsl.exe",
      args: ["-d", "Ubuntu", "--", "docker", ...dockerArgs],
    };
  }
  return { command: "docker", args: dockerArgs };
}

function spawnPsqlSync({ env, input, singleTransaction = false, spawnImpl = spawnSync }) {
  const invocation = psqlCommand(env, { singleTransaction });
  return spawnImpl(invocation.command, invocation.args, {
    encoding: "utf8",
    env,
    input,
    maxBuffer: MAX_PSQL_OUTPUT_BYTES,
  });
}

function executeSql(
  sql,
  env,
  { stage = "sql", singleTransaction = false, spawnImpl = spawnSync } = {},
) {
  const result = spawnPsqlSync({ env, input: sql, singleTransaction, spawnImpl });
  if (result?.error || result?.status !== 0) {
    throw new Error(formatPsqlFailureCode(stage, result?.stderr));
  }
  return String(result.stdout ?? "").trim();
}

function requireSqlFailure(stage, sql, expectedSqlState, env, { spawnImpl = spawnSync } = {}) {
  const result = spawnPsqlSync({ env, input: sql, spawnImpl });
  if (!result?.error && result?.status === 0) throw new Error(`${stage}:unexpected_success`);
  const code = formatPsqlFailureCode(stage, result?.stderr);
  if (code !== `${stage}:${expectedSqlState}`) throw new Error(code);
  return String(result.stderr ?? "");
}

function startPsqlProcess({ env, spawnImpl = spawn }) {
  const invocation = psqlCommand(env);
  let child;
  try {
    child = spawnImpl(invocation.command, invocation.args, {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    return Object.freeze({
      child: null,
      result: Promise.resolve({ error, status: null, stdout: "", stderr: "" }),
    });
  }
  const result = new Promise((resolveResult) => {
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    let settled = false;
    const finish = (result) => {
      if (!settled) {
        settled = true;
        resolveResult(result);
      }
    };
    const collect = (target) => (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_PSQL_OUTPUT_BYTES) {
        child.kill();
        finish({
          error: new Error("psql_output_limit"),
          status: null,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
        });
      } else {
        target.push(chunk);
      }
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.stdin.once("error", (error) =>
      finish({
        error,
        status: null,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      }),
    );
    child.once("error", (error) => finish({ error, status: null, stdout: "", stderr: "" }));
    child.once("close", (status) =>
      finish({
        error: null,
        status,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      }),
    );
  });
  return Object.freeze({ child, result });
}

function spawnPsqlAsync({ env, input, spawnImpl = spawn }) {
  const process = startPsqlProcess({ env, spawnImpl });
  process.child?.stdin.end(input);
  return process.result;
}

function openPsqlSession({ env, initialInput, spawnImpl = spawn }) {
  const process = startPsqlProcess({ env, spawnImpl });
  let ended = false;
  process.child?.stdin.write(initialInput);
  return Object.freeze({
    result: process.result,
    end(input) {
      if (ended) return;
      ended = true;
      if (process.child && !process.child.stdin.destroyed) process.child.stdin.end(input);
    },
  });
}

const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

function readReconciliationLockState(env, spawnSyncImpl) {
  const result = executeSql(
    `select pg_catalog.json_build_object(
      'granted',count(*) filter (where granted),
      'waiting',count(*) filter (where not granted)
    )
    from pg_catalog.pg_locks
    where locktype='advisory'
      and classid=20260825::oid
      and objid=1113::oid
      and objsubid=2;`,
    env,
    { stage: "lock_probe", spawnImpl: spawnSyncImpl },
  );
  const state = JSON.parse(result);
  if (
    !Number.isSafeInteger(state?.granted) ||
    state.granted < 0 ||
    !Number.isSafeInteger(state?.waiting) ||
    state.waiting < 0
  ) {
    throw new Error("concurrency_lock_state_rejected");
  }
  return state;
}

async function waitForReconciliationLockState(env, spawnSyncImpl, predicate, code) {
  for (let attempt = 0; attempt < LOCK_POLL_ATTEMPTS; attempt += 1) {
    const state = readReconciliationLockState(env, spawnSyncImpl);
    if (predicate(state)) return state;
    await delay(LOCK_POLL_DELAY_MS);
  }
  throw new Error(code);
}

function attestDisposableTarget(env, spawnImpl) {
  const result = executeSql(
    `select case
      when current_database() = '${DISPOSABLE_DATABASE}'
       and current_user = '${DISPOSABLE_DATABASE_USER}'
       and current_setting('server_version_num')::integer >= 150000
       and current_setting('server_version_num')::integer < 160000
       and exists (
         select 1 from ${HARNESS_SCHEMA}.runtime_sentinel
         where sentinel = '${DISPOSABLE_SENTINEL}'
       )
      then '${DISPOSABLE_SENTINEL}'
      else 'rejected'
    end;`,
    env,
    { stage: "target_attestation", spawnImpl },
  );
  if (result !== DISPOSABLE_SENTINEL) throw new Error("target_attestation:rejected");
}

function resetCatalogFixture(env, spawnImpl) {
  const receipt = executeSql(buildCatalogFixtureSql(), env, {
    stage: "catalog_fixture",
    singleTransaction: true,
    spawnImpl,
  });
  if (receipt !== "catalog_fixture_ready") throw new Error("catalog_fixture:receipt_rejected");
}

function readProductionState(env, spawnImpl) {
  return parsePreflightStdout(
    executeSql(PREFLIGHT_SQL, env, {
      stage: "exact_production_preflight",
      singleTransaction: true,
      spawnImpl,
    }),
  );
}

function applicationDigest(env, spawnImpl) {
  return executeSql(`select ${HARNESS_SCHEMA}.application_digest();`, env, {
    stage: "application_digest",
    spawnImpl,
  });
}

function ledgerDigest(env, spawnImpl) {
  return executeSql(
    `select pg_catalog.md5(
      coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(sm) order by sm.version),
        '[]'::jsonb
      )::text
    ) from supabase_migrations.schema_migrations sm;`,
    env,
    { stage: "ledger_digest", spawnImpl },
  );
}

function assertClassification(state, status, reason) {
  const classification = classifyPreflight(state);
  if (classification.status !== status || (reason && classification.reason !== reason)) {
    throw new Error(
      `classification:${status}:${reason ?? "none"}:actual:${classification.status}:${classification.reason ?? "none"}`,
    );
  }
  return classification;
}

function reconciliationMarker(target) {
  return `-- restored-history-ledger-reconciliation:v1; source_sha256=${target.source_sha256}; application_row_access=forbidden`;
}

function reconciliationKey(target) {
  return `restored-history-ledger-reconciliation:${target.version}:${target.source_sha256}`;
}

function insertTargetSql(target) {
  return `insert into supabase_migrations.schema_migrations
    (version,statements,name,created_by,idempotency_key,rollback)
  values (
    ${sqlLiteral(target.version)},array[${sqlLiteral(reconciliationMarker(target))}]::text[],
    ${sqlLiteral(target.name)},
    'codex-protected-runner',${sqlLiteral(reconciliationKey(target))},'{}'::text[]
  );`;
}

function insertTargetCollisionSql(target, variant) {
  const expectedKey = reconciliationKey(target);
  const unrelatedVersion = `${target.version}_collision`;
  const unrelatedName = `${target.name}_collision`;
  const unrelatedKey = `${expectedKey}:collision`;
  const rows = {
    key_only: {
      version: unrelatedVersion,
      name: unrelatedName,
      key: expectedKey,
      marker: "disposable key-only collision",
      createdBy: "pg15-runtime-harness",
    },
    version_only: {
      version: target.version,
      name: unrelatedName,
      key: unrelatedKey,
      marker: "disposable version-only collision",
      createdBy: "pg15-runtime-harness",
    },
    name_only: {
      version: unrelatedVersion,
      name: target.name,
      key: unrelatedKey,
      marker: "disposable name-only collision",
      createdBy: "pg15-runtime-harness",
    },
    version_name_wrong_key: {
      version: target.version,
      name: target.name,
      key: unrelatedKey,
      marker: reconciliationMarker(target),
      createdBy: "codex-protected-runner",
    },
    exact_identity_wrong_metadata: {
      version: target.version,
      name: target.name,
      key: expectedKey,
      marker: reconciliationMarker(target),
      createdBy: "unexpected-ledger-writer",
    },
  };
  const row = rows[variant];
  if (!row) throw new Error(`collision_variant_rejected:${variant}`);
  return `insert into supabase_migrations.schema_migrations
    (version,statements,name,created_by,idempotency_key,rollback)
  values (
    ${sqlLiteral(row.version)},array[${sqlLiteral(row.marker)}]::text[],
    ${sqlLiteral(row.name)},${sqlLiteral(row.createdBy)},
    ${sqlLiteral(row.key)},'{}'::text[]
  );`;
}

function proveExactApplyAndVerifyOnly(env, manifest, spawnImpl) {
  resetCatalogFixture(env, spawnImpl);
  const before = applicationDigest(env, spawnImpl);
  const initial = readProductionState(env, spawnImpl);
  assertClassification(initial, "apply");
  const applySql = buildApplySql({ manifest, state: initial });
  executeSql(applySql, env, { stage: "exact_production_apply", spawnImpl });
  const postflight = parsePreflightStdout(
    executeSql(buildPostflightSql(), env, {
      stage: "exact_production_postflight",
      singleTransaction: true,
      spawnImpl,
    }),
  );
  assertClassification(postflight, "verify_only");
  if (postflight.ledger_total_count !== initial.ledger_total_count + 3) {
    throw new Error("exact_production_apply:not_exactly_three");
  }
  try {
    buildApplySql({ manifest, state: postflight });
    throw new Error("verify_only_builder:unexpected_success");
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "apply_state_rejected") throw error;
  }
  if (applicationDigest(env, spawnImpl) !== before) {
    throw new Error("exact_production_apply:application_sentinel_changed");
  }
}

function proveExactPostPreflightCollisionRollback(env, manifest, spawnImpl) {
  resetCatalogFixture(env, spawnImpl);
  const beforeApplication = applicationDigest(env, spawnImpl);
  const initial = readProductionState(env, spawnImpl);
  assertClassification(initial, "apply");
  const exactApplySql = buildApplySql({ manifest, state: initial });

  // Commit a collision only after the receipt-bound production preflight and
  // exact APPLY construction. The unchanged production guard must reject the
  // stale receipt before any target row is inserted.
  executeSql(insertTargetCollisionSql(RECONCILIATION_TARGETS[1], "key_only"), env, {
    stage: "seed_post_preflight_collision",
    spawnImpl,
  });
  const beforeLedger = ledgerDigest(env, spawnImpl);
  const collisionState = readProductionState(env, spawnImpl);
  assertClassification(collisionState, "ledger_drift", "target_collision");
  const stderr = requireSqlFailure("exact_locked_collision_rollback", exactApplySql, "55000", env, {
    spawnImpl,
  });
  if (!stderr.includes("restored-history ledger reconciliation state changed under lock")) {
    throw new Error("exact_locked_collision_rollback:message_rejected");
  }
  const after = readProductionState(env, spawnImpl);
  assertClassification(after, "ledger_drift", "target_collision");
  if (
    after.ledger_total_count !== collisionState.ledger_total_count ||
    after.target_states.some((target) => target.exact_count !== 0) ||
    ledgerDigest(env, spawnImpl) !== beforeLedger ||
    applicationDigest(env, spawnImpl) !== beforeApplication
  ) {
    throw new Error("exact_locked_collision_rollback:state_changed");
  }
}

function provePartialAndCollisionRefusal(env, manifest, spawnImpl) {
  const cases = [
    Object.freeze({
      name: "partial",
      sql: insertTargetSql(RECONCILIATION_TARGETS[0]),
      reason: "partial_or_untrusted_reconciliation",
      collisionCount: 0,
    }),
    Object.freeze({
      name: "key_only_collision",
      sql: insertTargetCollisionSql(RECONCILIATION_TARGETS[0], "key_only"),
      reason: "target_collision",
      collisionCount: 1,
    }),
    Object.freeze({
      name: "version_only_collision",
      sql: insertTargetCollisionSql(RECONCILIATION_TARGETS[0], "version_only"),
      reason: "target_collision",
      collisionCount: 1,
    }),
    Object.freeze({
      name: "name_only_collision",
      sql: insertTargetCollisionSql(RECONCILIATION_TARGETS[0], "name_only"),
      reason: "target_collision",
      collisionCount: 1,
    }),
    Object.freeze({
      name: "version_name_wrong_key_collision",
      sql: insertTargetCollisionSql(RECONCILIATION_TARGETS[0], "version_name_wrong_key"),
      reason: "target_collision",
      collisionCount: 1,
    }),
    Object.freeze({
      name: "exact_identity_wrong_metadata",
      sql: insertTargetCollisionSql(RECONCILIATION_TARGETS[0], "exact_identity_wrong_metadata"),
      reason: "partial_or_untrusted_reconciliation",
      collisionCount: 0,
    }),
  ];
  for (const testCase of cases) {
    resetCatalogFixture(env, spawnImpl);
    const before = applicationDigest(env, spawnImpl);
    executeSql(testCase.sql, env, {
      stage: `seed_${testCase.name}`,
      spawnImpl,
    });
    const state = readProductionState(env, spawnImpl);
    assertClassification(state, "ledger_drift", testCase.reason);
    if (
      testCase.collisionCount !== undefined &&
      state.target_collision_count !== testCase.collisionCount
    ) {
      throw new Error(`${testCase.name}_refusal:collision_count_rejected`);
    }
    try {
      buildApplySql({ manifest, state });
      throw new Error("drift_builder:unexpected_success");
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "apply_state_rejected") throw error;
    }
    if (state.ledger_total_count !== 2 || applicationDigest(env, spawnImpl) !== before) {
      throw new Error(`${testCase.name}_refusal:state_changed`);
    }
  }
}

const ADVERSARIAL_CATALOG_CASES = Object.freeze([
  Object.freeze({
    name: "rewrite",
    sql: `create rule unexpected_ledger_rewrite as
      on insert to supabase_migrations.schema_migrations do instead nothing;`,
    status: "prerequisite_drift",
    reason: "ledger_contract",
  }),
  Object.freeze({
    name: "partition",
    sql: `create temporary table schema_migrations_copy on commit drop as
        select * from supabase_migrations.schema_migrations;
      drop table supabase_migrations.schema_migrations;
      create table supabase_migrations.schema_migrations (
        version text not null, statements text[], name text, created_by text,
        idempotency_key text, rollback text[]
      ) partition by range(version);
      create table supabase_migrations.schema_migrations_default
        partition of supabase_migrations.schema_migrations default;
      insert into supabase_migrations.schema_migrations
        select * from schema_migrations_copy;`,
    status: "prerequisite_drift",
    reason: "ledger_contract",
  }),
  Object.freeze({
    name: "inheritance_child",
    sql: `create table public.ledger_inheritance_parent();
      alter table supabase_migrations.schema_migrations
        inherit public.ledger_inheritance_parent;`,
    status: "prerequisite_drift",
    reason: "ledger_contract",
  }),
  Object.freeze({
    name: "inheritance_parent",
    sql: `create table public.ledger_inheritance_child()
      inherits (supabase_migrations.schema_migrations);`,
    status: "prerequisite_drift",
    reason: "ledger_contract",
  }),
  Object.freeze({
    name: "index_extra",
    sql: `create index unexpected_ledger_name_idx
      on supabase_migrations.schema_migrations(name);`,
    status: "prerequisite_drift",
    reason: "ledger_contract",
  }),
  Object.freeze({
    name: "index_standalone_unique",
    sql: `alter table supabase_migrations.schema_migrations
        drop constraint schema_migrations_idempotency_key_key;
      create unique index schema_migrations_idempotency_key_key
        on supabase_migrations.schema_migrations(idempotency_key);`,
    status: "prerequisite_drift",
    reason: "ledger_contract",
  }),
  Object.freeze({
    name: "index_partial_unique",
    sql: `alter table supabase_migrations.schema_migrations
        drop constraint schema_migrations_idempotency_key_key;
      create unique index schema_migrations_idempotency_key_key
        on supabase_migrations.schema_migrations(idempotency_key)
        where idempotency_key is not null;`,
    status: "prerequisite_drift",
    reason: "ledger_contract",
  }),
  Object.freeze({
    name: "index_expression_unique",
    sql: `alter table supabase_migrations.schema_migrations
        drop constraint schema_migrations_idempotency_key_key;
      create unique index schema_migrations_idempotency_key_key
        on supabase_migrations.schema_migrations
        ((coalesce(idempotency_key, '')));`,
    status: "prerequisite_drift",
    reason: "ledger_contract",
  }),
  Object.freeze({
    name: "index_included_column",
    sql: `alter table supabase_migrations.schema_migrations
        drop constraint schema_migrations_idempotency_key_key;
      create unique index schema_migrations_idempotency_key_key
        on supabase_migrations.schema_migrations(idempotency_key)
        include (name);`,
    status: "prerequisite_drift",
    reason: "ledger_contract",
  }),
  Object.freeze({
    name: "constraint_deferrable_unique",
    sql: `alter table supabase_migrations.schema_migrations
        drop constraint schema_migrations_idempotency_key_key;
      alter table supabase_migrations.schema_migrations
        add constraint schema_migrations_idempotency_key_key
        unique (idempotency_key) deferrable initially immediate;`,
    status: "prerequisite_drift",
    reason: "ledger_contract",
  }),
  Object.freeze({
    name: "constraint_nulls_not_distinct",
    sql: `alter table supabase_migrations.schema_migrations
        drop constraint schema_migrations_idempotency_key_key;
      alter table supabase_migrations.schema_migrations
        add constraint schema_migrations_idempotency_key_key
        unique nulls not distinct (idempotency_key);`,
    status: "prerequisite_drift",
    reason: "ledger_contract",
  }),
  Object.freeze({
    name: "column_extra",
    sql: `alter table supabase_migrations.schema_migrations
      add column unexpected_ledger_column text;`,
    status: "prerequisite_drift",
    reason: "ledger_contract",
  }),
  Object.freeze({
    name: "column_default",
    sql: `alter table supabase_migrations.schema_migrations
      alter column created_by set default 'unexpected';`,
    status: "prerequisite_drift",
    reason: "ledger_contract",
  }),
  Object.freeze({
    name: "column_nondeterministic_collation",
    sql: `create collation public.unexpected_case_insensitive (
        provider=icu, locale='und-u-ks-level2', deterministic=false
      );
      alter table supabase_migrations.schema_migrations
        alter column idempotency_key type text
        collate public.unexpected_case_insensitive;`,
    status: "prerequisite_drift",
    reason: "ledger_contract",
  }),
  Object.freeze({
    name: "relation_unlogged",
    sql: `alter table supabase_migrations.schema_migrations set unlogged;`,
    status: "prerequisite_drift",
    reason: "ledger_contract",
  }),
  Object.freeze({
    name: "relation_rls",
    sql: `alter table supabase_migrations.schema_migrations enable row level security;`,
    status: "prerequisite_drift",
    reason: "ledger_contract",
  }),
  Object.freeze({
    name: "relation_acl",
    sql: `grant select on supabase_migrations.schema_migrations to authenticated;`,
    status: "prerequisite_drift",
    reason: "ledger_contract",
  }),
  Object.freeze({
    name: "column_acl",
    sql: `grant insert(version) on supabase_migrations.schema_migrations to authenticated;`,
    status: "prerequisite_drift",
    reason: "ledger_contract",
  }),
  Object.freeze({
    name: "effective_role_membership_acl",
    sql: `grant pg_write_all_data to authenticated;`,
    cleanupSql: `revoke pg_write_all_data from authenticated;`,
    status: "prerequisite_drift",
    reason: "ledger_contract",
  }),
  Object.freeze({
    name: "publication_direct_insert",
    sql: `create publication unexpected_direct_insert_publication
      for table supabase_migrations.schema_migrations;`,
    cleanupSql: `drop publication unexpected_direct_insert_publication;`,
    status: "prerequisite_drift",
    reason: "ledger_contract",
  }),
  Object.freeze({
    name: "publication_schema_insert",
    sql: `create publication unexpected_schema_insert_publication
      for tables in schema supabase_migrations;`,
    cleanupSql: `drop publication unexpected_schema_insert_publication;`,
    status: "prerequisite_drift",
    reason: "ledger_contract",
  }),
  Object.freeze({
    name: "publication_all_tables_insert",
    sql: `create publication unexpected_all_tables_insert_publication for all tables;`,
    cleanupSql: `drop publication unexpected_all_tables_insert_publication;`,
    status: "prerequisite_drift",
    reason: "ledger_contract",
  }),
  Object.freeze({
    name: "publication_update_delete_only",
    sql: `create publication allowed_noninsert_publication
      for table supabase_migrations.schema_migrations
      with (publish='update, delete');`,
    cleanupSql: `drop publication allowed_noninsert_publication;`,
    status: "apply",
  }),
  Object.freeze({
    name: "incoming_foreign_key_noninsert_triggers",
    sql: `create table public.incoming_ledger_reference (
        id bigint primary key,
        migration_version text references supabase_migrations.schema_migrations(version)
      );`,
    status: "apply",
  }),
  Object.freeze({
    name: "relation_trigger",
    sql: `create function public.unexpected_ledger_trigger()
        returns trigger language plpgsql as $body$ begin return new; end $body$;
      create trigger unexpected_ledger_trigger before insert
        on supabase_migrations.schema_migrations for each row
        execute function public.unexpected_ledger_trigger();`,
    status: "prerequisite_drift",
    reason: "ledger_contract",
  }),
  Object.freeze({
    name: "shifted_witness_duplicate",
    sql: `insert into supabase_migrations.schema_migrations(version,name)
      values ('20260709015801','20260709015758_d49efeac-492c-4f7b-9746-3638f44fa287');`,
    status: "catalog_drift",
    reason: "staff_shifted_witness_contract",
  }),
  Object.freeze({
    name: "quicklog_request_hash_missing",
    sql: `alter table public.quicklog_idempotency drop column request_hash;`,
    status: "catalog_drift",
    reason: "quicklog_request_hash_column_contract",
  }),
  Object.freeze({
    name: "quicklog_request_hash_default",
    sql: `alter table public.quicklog_idempotency
      alter column request_hash set default 'unexpected';`,
    status: "catalog_drift",
    reason: "quicklog_request_hash_column_contract",
  }),
  Object.freeze({
    name: "quicklog_request_hash_type",
    sql: `alter table public.quicklog_idempotency
      alter column request_hash type varchar(64);`,
    status: "catalog_drift",
    reason: "quicklog_request_hash_column_contract",
  }),
  Object.freeze({
    name: "quicklog_request_hash_not_null",
    sql: `alter table public.quicklog_idempotency
      alter column request_hash set not null;`,
    status: "catalog_drift",
    reason: "quicklog_request_hash_column_contract",
  }),
  Object.freeze({
    name: "plant_type_nullable",
    sql: `alter table public.plants alter column plant_type drop not null;`,
    status: "catalog_drift",
    reason: "plant_type_column_contract",
  }),
  Object.freeze({
    name: "plant_type_missing",
    sql: `alter table public.plants drop column plant_type cascade;`,
    status: "catalog_drift",
    reason: "plant_type_column_contract",
  }),
  Object.freeze({
    name: "plant_type_default_drift",
    sql: `alter table public.plants alter column plant_type set default 'photoperiod';`,
    status: "catalog_drift",
    reason: "plant_type_column_contract",
  }),
  Object.freeze({
    name: "plant_type_constraint_missing",
    sql: `alter table public.plants drop constraint plants_plant_type_check;`,
    status: "catalog_drift",
    reason: "plant_type_constraint_contract",
  }),
  Object.freeze({
    name: "plant_type_constraint_not_valid",
    sql: `alter table public.plants drop constraint plants_plant_type_check;
      alter table public.plants add constraint plants_plant_type_check
        check (plant_type in ('autoflower', 'photoperiod', 'unknown')) not valid;`,
    status: "catalog_drift",
    reason: "plant_type_constraint_contract",
  }),
  Object.freeze({
    name: "plant_type_constraint_widened",
    sql: `alter table public.plants drop constraint plants_plant_type_check;
      alter table public.plants add constraint plants_plant_type_check
        check (plant_type in ('autoflower', 'photoperiod', 'unknown', 'hybrid'));`,
    status: "catalog_drift",
    reason: "plant_type_constraint_contract",
  }),
  Object.freeze({
    name: "plant_type_comment_drift",
    sql: `comment on column public.plants.plant_type is 'unexpected';`,
    status: "catalog_drift",
    reason: "plant_type_comment_contract",
  }),
  Object.freeze({
    name: "plant_type_comment_missing",
    sql: `comment on column public.plants.plant_type is null;`,
    status: "catalog_drift",
    reason: "plant_type_comment_contract",
  }),
  Object.freeze({
    name: "staff_update_trigger_condition_one_sided",
    sql: `drop trigger on_auth_user_confirmed_grant_staff on auth.users;
      create trigger on_auth_user_confirmed_grant_staff
        after update of email_confirmed_at on auth.users for each row
        when (old.email_confirmed_at is null)
        execute function public.grant_staff_role_for_verified_allowlist();`,
    status: "catalog_drift",
    reason: "staff_trigger_contract",
  }),
  Object.freeze({
    name: "staff_update_trigger_condition_inverted",
    sql: `drop trigger on_auth_user_confirmed_grant_staff on auth.users;
      create trigger on_auth_user_confirmed_grant_staff
        after update of email_confirmed_at on auth.users for each row
        when (old.email_confirmed_at is not null and new.email_confirmed_at is null)
        execute function public.grant_staff_role_for_verified_allowlist();`,
    status: "catalog_drift",
    reason: "staff_trigger_contract",
  }),
  Object.freeze({
    name: "staff_execute_grant_option",
    sql: `grant execute on function public.grant_staff_role_for_verified_allowlist()
      to service_role with grant option;`,
    status: "catalog_drift",
    reason: "staff_acl_contract",
  }),
  Object.freeze({
    name: "quicklog_execute_grant_option",
    sql: `grant execute on function public.quicklog_save_event(
        text, uuid, text, uuid, uuid, text, text, jsonb,
        timestamptz, jsonb, jsonb, jsonb
      ) to authenticated with grant option;`,
    status: "catalog_drift",
    reason: "quicklog_acl_contract",
  }),
  Object.freeze({
    name: "legacy_helper_acl",
    sql: `grant execute on function public.grant_staff_role_for_verified_email()
      to authenticated;`,
    status: "catalog_drift",
    reason: "staff_legacy_acl_contract",
  }),
  Object.freeze({
    name: "extra_legacy_trigger",
    sql: `create trigger unexpected_legacy_staff_trigger
      after insert on auth.users for each row
      execute function public.grant_staff_role_for_verified_email();`,
    status: "catalog_drift",
    reason: "staff_no_legacy_trigger_contract",
  }),
  Object.freeze({
    name: "canonical_helper_external_trigger",
    sql: `create table public.unexpected_staff_trigger_source (
        id uuid primary key,
        email text,
        email_confirmed_at timestamptz
      );
      create trigger unexpected_external_staff_trigger
        after insert on public.unexpected_staff_trigger_source for each row
        execute function public.grant_staff_role_for_verified_allowlist();`,
    status: "catalog_drift",
    reason: "staff_trigger_contract",
  }),
]);

function proveAdversarialCatalogRefusals(env, spawnImpl) {
  for (const testCase of ADVERSARIAL_CATALOG_CASES) {
    resetCatalogFixture(env, spawnImpl);
    const before = applicationDigest(env, spawnImpl);
    try {
      executeSql(testCase.sql, env, {
        stage: `${testCase.name}_mutation`,
        singleTransaction: true,
        spawnImpl,
      });
      assertClassification(readProductionState(env, spawnImpl), testCase.status, testCase.reason);
      if (applicationDigest(env, spawnImpl) !== before) {
        throw new Error(`${testCase.name}:application_sentinel_changed`);
      }
    } finally {
      if (testCase.cleanupSql) {
        executeSql(testCase.cleanupSql, env, {
          stage: `${testCase.name}_cleanup`,
          spawnImpl,
        });
      }
    }
  }
}

async function proveExactConcurrentRecheck(env, manifest, spawnSyncImpl, spawnImpl) {
  resetCatalogFixture(env, spawnSyncImpl);
  const before = applicationDigest(env, spawnSyncImpl);
  const initial = readProductionState(env, spawnSyncImpl);
  assertClassification(initial, "apply");
  const exactApplySql = buildApplySql({ manifest, state: initial });
  const blocker = openPsqlSession({
    env,
    initialInput: `\\set ON_ERROR_STOP on
begin;
select pg_catalog.pg_advisory_xact_lock(20260825,1113);
`,
    spawnImpl,
  });
  let blockerEnded = false;
  let firstApply;
  let secondApply;
  try {
    await waitForReconciliationLockState(
      env,
      spawnSyncImpl,
      (state) => state.granted === 1 && state.waiting === 0,
      "concurrency_blocker_lock_not_observed",
    );
    firstApply = spawnPsqlAsync({
      env,
      input: exactApplySql,
      spawnImpl,
    });
    secondApply = spawnPsqlAsync({
      env,
      input: exactApplySql,
      spawnImpl,
    });
    const observedWaiters = await waitForReconciliationLockState(
      env,
      spawnSyncImpl,
      (state) => state.granted === 1 && state.waiting === 2,
      "concurrency_two_waiters_not_observed",
    );
    if (observedWaiters.granted !== 1 || observedWaiters.waiting !== 2) {
      throw new Error("concurrency_waiter_receipt_rejected");
    }

    blocker.end("commit;\n");
    blockerEnded = true;
    const [blockerResult, first, second] = await Promise.all([
      blocker.result,
      firstApply,
      secondApply,
    ]);
    if (blockerResult.error || blockerResult.status !== 0) {
      throw new Error(formatPsqlFailureCode("concurrency_blocker", blockerResult.stderr));
    }
    const applyResults = [first, second];
    const successes = applyResults.filter((result) => !result.error && result.status === 0);
    const failures = applyResults.filter((result) => result.error || result.status !== 0);
    if (successes.length !== 1 || failures.length !== 1) {
      throw new Error("concurrent_apply:outcome_count_rejected");
    }
    const stale = failures[0];
    if (
      stale.error ||
      formatPsqlFailureCode("concurrent_stale_apply", stale.stderr) !==
        "concurrent_stale_apply:55000" ||
      !stale.stderr.includes("restored-history ledger reconciliation state changed under lock")
    ) {
      throw new Error("concurrent_stale_apply:fail_closed_contract");
    }
  } catch (error) {
    if (!blockerEnded) {
      blocker.end("rollback;\n");
      blockerEnded = true;
    }
    await Promise.allSettled(
      [blocker.result, firstApply, secondApply].filter((result) => result !== undefined),
    );
    throw error;
  }
  const finalState = readProductionState(env, spawnSyncImpl);
  assertClassification(finalState, "verify_only");
  if (
    finalState.ledger_total_count !== initial.ledger_total_count + 3 ||
    applicationDigest(env, spawnSyncImpl) !== before
  ) {
    throw new Error("concurrency_postflight:contract_rejected");
  }
}

export async function runPg15Harness({
  databaseUrl = process.env.RESTORED_HISTORY_LEDGER_RECONCILIATION_PG15_URL,
  containerId = process.env.RESTORED_HISTORY_LEDGER_RECONCILIATION_PG15_CONTAINER,
  containerRuntime = process.env.RESTORED_HISTORY_LEDGER_RECONCILIATION_PG15_CONTAINER_RUNTIME,
  spawnSyncImpl = spawnSync,
  spawnImpl = spawn,
} = {}) {
  const connection = validateDisposableDatabaseUrl(databaseUrl);
  if (
    !connection ||
    (containerId && !/^[0-9a-f]{12,64}$/i.test(containerId)) ||
    (containerRuntime && !new Set(["docker", "wsl-docker"]).has(containerRuntime))
  ) {
    return fail("database_target_rejected");
  }
  const env = psqlEnvironment(connection, containerId, containerRuntime);
  try {
    const { manifest } = loadReconciliationManifest();
    attestProductionSqlComposition();
    buildCatalogFixtureSql();
    attestDisposableTarget(env, spawnSyncImpl);
    proveExactApplyAndVerifyOnly(env, manifest, spawnSyncImpl);
    proveExactPostPreflightCollisionRollback(env, manifest, spawnSyncImpl);
    provePartialAndCollisionRefusal(env, manifest, spawnSyncImpl);
    proveAdversarialCatalogRefusals(env, spawnSyncImpl);
    await proveExactConcurrentRecheck(env, manifest, spawnSyncImpl, spawnImpl);
    attestDisposableTarget(env, spawnSyncImpl);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "unknown");
  }
  process.stdout.write("Restored-history ledger reconciliation PG15 harness PASS\n");
  return 0;
}

const isDirectInvocation =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectInvocation) process.exitCode = await runPg15Harness();
