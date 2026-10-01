#!/usr/bin/env node
/**
 * Disposable PG15 locking proof: the actual event wrapper and revision root
 * resolver, with synthetic receipts and the revision's final update simulated.
 * This is not production inspection or a full retraction-RPC acceptance test.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  attestDisposableTarget,
  disposableConnection,
  executeSql,
  psqlEnvironment,
  resetScaffold,
} from "./run-quicklog-manual-delegate-forward-repair-pg15-harness.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const MIGRATION_FILE = "20260927012000_quicklog_event_replay_active_receipt.sql";
export const MIGRATION_SHA256 = "5896372e29155c5b13353a8a11ef33526338b81290a24aff802df43cc13357fd";
const foundation = "20260725024026_quicklog_dual_timestamp_foundation.sql";
const eventSignature =
  "text, uuid, text, uuid, uuid, text, text, jsonb, timestamptz, jsonb, jsonb, jsonb";
const owner = "11111111-1111-4111-8111-111111111111";
const grow = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const event = "33333333-3333-4333-8333-333333333333";
const diary = "44444444-4444-4444-8444-444444444444";
const key = "event-lock-proof-0001";
const occurred = "2026-01-01T10:00:00Z";
const logged = "2026-01-01T10:01:00Z";
const MAX_BYTES = 64 * 1024;

const sqlFile = (name) =>
  readFileSync(resolve(root, "supabase/migrations", name), "utf8").replace(/\r/g, "");
export function extractDefinition(sql, marker, terminator = "$function$;") {
  if (typeof sql !== "string" || typeof marker !== "string" || !marker)
    throw new Error("source_shape_rejected");
  const start = sql.indexOf(marker);
  const end = sql.indexOf(`\n${terminator}`, start);
  if (start < 0 || end < 0 || sql.indexOf(marker, start + marker.length) !== -1)
    throw new Error("source_shape_rejected");
  return sql.slice(start, end + terminator.length + 1);
}
export function mutateLockWait(definition, kind) {
  const marker = kind === "receipt" ? "     LIMIT 1;" : "FOR UPDATE OF de SKIP LOCKED";
  const replacement =
    kind === "receipt" ? "     LIMIT 1\n     FOR UPDATE OF de;" : "FOR UPDATE OF de";
  if (
    !new Set(["receipt", "metadata"]).has(kind) ||
    typeof definition !== "string" ||
    definition.split(marker).length !== 2
  )
    throw new Error("mutation_shape_rejected");
  return definition.replace(marker, replacement);
}
export function validateLocalTarget(options) {
  const { url, containerId, containerRuntime } = options ?? {};
  const connection = disposableConnection(url);
  if (
    !connection ||
    (containerId && !/^[0-9a-f]{12,64}$/i.test(containerId)) ||
    (containerRuntime && !new Set(["docker", "wsl-docker"]).has(containerRuntime))
  )
    return null;
  return connection;
}
function psqlInvocation(env, application) {
  const sessionEnv = { ...env, PGAPPNAME: application };
  const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"];
  if (!env.VERDANT_QUICKLOG_PG15_CONTAINER) return { command: "psql", args, env: sessionEnv };
  const dockerArgs = [
    "exec",
    "-i",
    ...["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE", "PGAPPNAME"].flatMap((name) => [
      "-e",
      name,
    ]),
    env.VERDANT_QUICKLOG_PG15_CONTAINER,
    "psql",
    ...args,
  ];
  return env.VERDANT_QUICKLOG_PG15_CONTAINER_RUNTIME === "wsl-docker"
    ? { command: "wsl.exe", args: ["-d", "Ubuntu", "--", "docker", ...dockerArgs], env: sessionEnv }
    : { command: "docker", args: dockerArgs, env: sessionEnv };
}
function session(env, application, spawnImpl) {
  const invocation = psqlInvocation(env, application);
  const child = spawnImpl(invocation.command, invocation.args, {
    env: invocation.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let ended = false;
  child.stdin.on("error", () => {});
  const append = (chunk, kind) => {
    if (kind === "stdout") stdout += String(chunk);
    else stderr += String(chunk);
    if (stdout.length + stderr.length > MAX_BYTES) child.kill();
  };
  child.stdout.on("data", (chunk) => append(chunk, "stdout"));
  child.stderr.on("data", (chunk) => append(chunk, "stderr"));
  const watchdog = setTimeout(() => child.kill(), 15_000);
  const done = new Promise((resolveDone) => {
    child.once("error", () => {
      ended = true;
      clearTimeout(watchdog);
      resolveDone({ code: null, stdout, stderr });
    });
    child.once("close", (code) => {
      ended = true;
      clearTimeout(watchdog);
      resolveDone({ code, stdout, stderr });
    });
  });
  return {
    write: (sql) => child.stdin.write(`${sql}\n`),
    kill: () => child.kill(),
    done,
    async marker(prefix) {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const line = stdout.split(/\r?\n/).find((value) => value.startsWith(prefix));
        if (line) return line.slice(prefix.length);
        if (ended) break;
        await new Promise((resolveWait) => setTimeout(resolveWait, 10));
      }
      throw new Error("session_barrier_unavailable");
    },
  };
}
const callSql = `public.quicklog_save_event('${key}', '${grow}', 'note', null, null, 'lock proof', null, null, '${occurred}'::timestamptz, '{}'::jsonb, null, null)`;
const beginSql = `begin; set local statement_timeout='10s'; set local deadlock_timeout='1s'; set local request.jwt.claim.sub='${owner}';`;
function resetReceipt(env, spawnImpl, missingStamp) {
  executeSql(
    `update public.grow_events set is_deleted=false where id='${event}';
update public.diary_entries set retracted_at=null, logged_at=${missingStamp ? "null" : `'${logged}'::timestamptz`},
details=jsonb_build_object('linked_grow_event_id','${event}') ${missingStamp ? "" : `|| jsonb_build_object('logged_at','${logged}'::timestamptz)`} where id='${diary}';`,
    env,
    { stage: "reset_receipt", spawnImpl },
  );
}
function deadlocks(env, spawnImpl) {
  const value = executeSql(
    "select deadlocks from pg_stat_database where datname=current_database();",
    env,
    { stage: "deadlock_counter", spawnImpl },
  );
  if (!/^\d+$/.test(value)) throw new Error("deadlock_counter_unavailable");
  return Number(value);
}
async function assertRace(
  env,
  definition,
  { missingStamp, expectedDeadlock },
  spawnImpl,
  spawnAsyncImpl,
) {
  executeSql(definition, env, { stage: "race_definition", spawnImpl });
  resetReceipt(env, spawnImpl, missingStamp);
  const before = deadlocks(env, spawnImpl);
  const replay = session(env, "verdant-replay-lock-proof", spawnAsyncImpl);
  const revision = session(env, "verdant-revision-lock-proof", spawnAsyncImpl);
  try {
    replay.write(
      `${beginSql} select 'REPLAY_PID:'||pg_backend_pid(); select id from public.grow_events where id='${event}' for update; select 'REPLAY_HOLDS_EVENT';`,
    );
    const replayPid = await replay.marker("REPLAY_PID:");
    await replay.marker("REPLAY_HOLDS_EVENT");
    revision.write(`${beginSql} select 'REVISION_PID:'||pg_backend_pid(); select id from public.diary_entries where id='${diary}' for update; select 'REVISION_HOLDS_DIARY';
select 'REVISION_ROOT:'||out_grow_event_id::text from public.quicklog_revision_resolve_root('${owner}', null, '${diary}');
update public.grow_events set is_deleted=true where id='${event}'; update public.diary_entries set retracted_at=now() where id='${diary}'; commit; select 'REVISION_DONE';\n\\q`);
    const revisionPid = await revision.marker("REVISION_PID:");
    await revision.marker("REVISION_HOLDS_DIARY");
    if (!/^\d+$/.test(replayPid) || !/^\d+$/.test(revisionPid))
      throw new Error("session_identity_rejected");
    let blocked = false;
    const deadline = Date.now() + 5_000;
    while (!blocked && Date.now() < deadline) {
      blocked =
        executeSql(`select ${replayPid} = any(pg_blocking_pids(${revisionPid}));`, env, {
          stage: "revision_lock_barrier",
          spawnImpl,
        }) === "t";
      if (!blocked) await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
    if (!blocked) throw new Error("revision_did_not_wait_for_replay");
    replay.write(
      `set local role authenticated; select 'REPLAY_RECEIPT:'||${callSql}::text; commit; select 'REPLAY_DONE';\n\\q`,
    );
    const [replayResult, revisionResult] = await Promise.all([replay.done, revision.done]);
    let after = deadlocks(env, spawnImpl);
    if (expectedDeadlock) {
      const counterDeadline = Date.now() + 5_000;
      while (after === before && Date.now() < counterDeadline) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 20));
        after = deadlocks(env, spawnImpl);
      }
      if (after !== before + 1) throw new Error("deadlock_control_not_detected");
      return;
    }
    if (after !== before || replayResult.code !== 0 || revisionResult.code !== 0)
      throw new Error("corrected_race_failed");
    const receiptLine = replayResult.stdout
      .split(/\r?\n/)
      .find((line) => line.startsWith("REPLAY_RECEIPT:"));
    const receipt = JSON.parse(receiptLine?.slice("REPLAY_RECEIPT:".length) ?? "null");
    if (
      !receipt?.ok ||
      receipt.reused !== true ||
      receipt.grow_event_id !== event ||
      !revisionResult.stdout.includes(`REVISION_ROOT:${event}`)
    )
      throw new Error("serialized_receipt_rejected");
    const final = executeSql(
      `select
(select count(*)=1 and bool_and(is_deleted) from public.grow_events where id='${event}')
and (select count(*)=1 and bool_and(retracted_at is not null) from public.diary_entries where id='${diary}')
and (select count(*)=1 from public.quicklog_idempotency where user_id='${owner}' and idempotency_key='${key}')
and (select count(*)=1 from public.grow_events)
and (select count(*)=1 from public.diary_entries);`,
      env,
      { stage: "serialized_final_rows", spawnImpl },
    );
    if (final !== "t") throw new Error("serialized_final_rows_rejected");
  } finally {
    replay.kill();
    revision.kill();
    await Promise.all([replay.done, revision.done]);
  }
}
export async function runEventReplayLockHarness({
  url = process.env.QUICKLOG_EVENT_REPLAY_LOCK_PG15_URL,
  containerId = process.env.QUICKLOG_EVENT_REPLAY_LOCK_PG15_CONTAINER,
  containerRuntime = process.env.QUICKLOG_EVENT_REPLAY_LOCK_PG15_CONTAINER_RUNTIME,
  spawnImpl = spawnSync,
  spawnAsyncImpl = spawn,
} = {}) {
  const connection = validateLocalTarget({ url, containerId, containerRuntime });
  if (!connection) {
    process.stderr.write("Event replay lock PG15: database_target_rejected\n");
    return 1;
  }
  const env = psqlEnvironment(connection, containerId, containerRuntime);
  let stage = "target_attestation";
  try {
    attestDisposableTarget(env, spawnImpl);
    stage = "source_pin";
    const migration = sqlFile(MIGRATION_FILE);
    if (createHash("sha256").update(migration).digest("hex") !== MIGRATION_SHA256)
      throw new Error("migration_byte_pin_mismatch");
    const corrected = extractDefinition(
      migration,
      "CREATE OR REPLACE FUNCTION public.quicklog_save_event(",
    );
    const originalWrapper = extractDefinition(
      sqlFile(foundation),
      "CREATE FUNCTION public.quicklog_save_event(",
    );
    const delegate = extractDefinition(
      sqlFile("20260725023000_core_schema_forward_repair.sql"),
      "CREATE OR REPLACE FUNCTION public.quicklog_save_event(",
    );
    const hash = extractDefinition(
      sqlFile(foundation),
      "CREATE FUNCTION public.quicklog_event_request_hash_pre_logged_at(",
    );
    const resolver = extractDefinition(
      sqlFile("20260811090000_quicklog_corrections_retractions.sql"),
      "CREATE OR REPLACE FUNCTION public.quicklog_revision_resolve_root(",
      "$$;",
    );
    stage = "scaffold";
    resetScaffold(env, spawnImpl);
    executeSql(
      `begin;
alter table public.grow_events add column is_deleted boolean not null default false;
alter table public.diary_entries add column retracted_at timestamptz;
${delegate}
alter function public.quicklog_save_event(${eventSignature}) rename to quicklog_save_event_pre_logged_at;
revoke all on function public.quicklog_save_event_pre_logged_at(${eventSignature}) from public,anon,authenticated,service_role;
${originalWrapper}
revoke all on function public.quicklog_save_event(${eventSignature}) from public,anon;
grant execute on function public.quicklog_save_event(${eventSignature}) to authenticated,service_role;
${hash}
${resolver}
-- The real INSERT triggers stamp logged_at from this transaction context.
set local verdant.quicklog_logged_at = '${logged}';
insert into public.grow_events(id,user_id,grow_id,event_type,occurred_at,logged_at,note) values ('${event}','${owner}','${grow}','note','${occurred}','${logged}','lock proof');
insert into public.diary_entries(id,user_id,grow_id,note,details,logged_at) values ('${diary}','${owner}','${grow}','lock proof',jsonb_build_object('linked_grow_event_id','${event}'),'${logged}');
insert into public.quicklog_idempotency(user_id,idempotency_key,grow_event_id,request_hash) values ('${owner}','${key}','${event}',public.quicklog_event_request_hash_pre_logged_at('${grow}','note',null,null,'lock proof',null,'${occurred}'::timestamptz,null,'{}'::jsonb,null,null));
commit;`,
      env,
      { stage: "real_function_fixture", spawnImpl },
    );
    if (
      executeSql(
        `select (select logged_at='${logged}'::timestamptz from public.grow_events where id='${event}')
and (select logged_at='${logged}'::timestamptz from public.diary_entries where id='${diary}');`,
        env,
        { stage: "fixture_timestamp", spawnImpl },
      ) !== "t"
    )
      throw new Error("fixture_timestamp_rejected");
    stage = "migration";
    executeSql(migration, env, { stage: "pinned_event_replay_migration", spawnImpl });
    stage = "sequential_backfill";
    resetReceipt(env, spawnImpl, true);
    const receipt = JSON.parse(
      executeSql(`${beginSql} set local role authenticated; select ${callSql}; commit;`, env, {
        stage: "sequential_legacy_replay",
        spawnImpl,
      }),
    );
    if (
      !receipt.ok ||
      receipt.reused !== true ||
      executeSql(
        `select logged_at='${logged}'::timestamptz and public.quicklog_try_parse_logged_at(details->>'logged_at')='${logged}'::timestamptz from public.diary_entries where id='${diary}';`,
        env,
        { stage: "sequential_backfill", spawnImpl },
      ) !== "t"
    )
      throw new Error("sequential_backfill_rejected");
    stage = "receipt_deadlock_control";
    await assertRace(
      env,
      mutateLockWait(corrected, "receipt"),
      { missingStamp: false, expectedDeadlock: true },
      spawnImpl,
      spawnAsyncImpl,
    );
    stage = "metadata_deadlock_control";
    await assertRace(
      env,
      mutateLockWait(corrected, "metadata"),
      { missingStamp: true, expectedDeadlock: true },
      spawnImpl,
      spawnAsyncImpl,
    );
    stage = "corrected_receipt_race";
    await assertRace(
      env,
      corrected,
      { missingStamp: false, expectedDeadlock: false },
      spawnImpl,
      spawnAsyncImpl,
    );
    stage = "corrected_metadata_race";
    await assertRace(
      env,
      corrected,
      { missingStamp: true, expectedDeadlock: false },
      spawnImpl,
      spawnAsyncImpl,
    );
    process.stdout.write(
      "Event replay lock PG15: 5 passed, 0 failed (2 deadlock controls detected; 2 serialized races; sequential legacy backfill)\n",
    );
    return 0;
  } catch (error) {
    // Fixed stage and SQLSTATE only: no raw psql output or exception message.
    const sqlState = error instanceof Error && /:([0-9A-Z]{5}|unknown)$/.exec(error.message)?.[1];
    process.stderr.write(
      `Event replay lock PG15: ${stage}:proof_failed${sqlState ? ` sqlstate=${sqlState}` : ""}\n`,
    );
    return 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exit(await runEventReplayLockHarness());
