#!/usr/bin/env node
/**
 * Disposable PG15 proof of manual replay versus the real revision-root resolver.
 * The revision's final retraction writes are simulated; this is not hosted proof
 * or acceptance of the complete retraction RPC.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  executeSql,
  psqlEnvironment,
} from "./run-quicklog-manual-delegate-forward-repair-pg15-harness.mjs";
import {
  runManualReuseHarness,
  validateLocalTarget,
} from "./run-quicklog-manual-reuse-fence-pg15-harness.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const MANUAL_MIGRATION = "20260927002000_quicklog_manual_reuse_fence.sql";
export const MANUAL_SHA256 = "5017b8f697f77a358df43d38fae486a21cabf92a65aa3af439bc750d221d6b1b";
export const FORWARD_MIGRATION = "20260928183000_quicklog_manual_replay_metadata_lock.sql";
export const FORWARD_SHA256 = "a5ddf7c836509db2e357dc787ed3c3b548d2b08412d3c89826928c9ac4cebfab";
const owner = "11111111-1111-4111-8111-111111111111";
const plant = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const beginSql = `begin; set local statement_timeout='10s'; set local deadlock_timeout='1s'; set local request.jwt.claim.sub='${owner}';`;
const callSql = (key) =>
  `public.quicklog_save_manual('plant', '${plant}', 'note', null, 'manual lock proof', null, null, null, '2026-01-01T10:00:00Z'::timestamptz, '{"logged_at":"2026-01-01T09:59:00Z"}'::jsonb, '${key}', 'veg')`;
const sqlFile = (name) =>
  readFileSync(resolve(root, "supabase/migrations", name), "utf8").replace(/\r\n/g, "\n");

export function pinnedManualSql(sql = sqlFile(MANUAL_MIGRATION)) {
  if (typeof sql !== "string" || createHash("sha256").update(sql).digest("hex") !== MANUAL_SHA256)
    throw new Error("manual_migration_fingerprint_mismatch");
  return sql;
}

export function pinnedForwardSql(sql = sqlFile(FORWARD_MIGRATION)) {
  if (typeof sql !== "string" || createHash("sha256").update(sql).digest("hex") !== FORWARD_SHA256)
    throw new Error("forward_migration_fingerprint_mismatch");
  return sql;
}

export function extractResolver(sql) {
  const marker = "CREATE OR REPLACE FUNCTION public.quicklog_revision_resolve_root(";
  const start = typeof sql === "string" ? sql.indexOf(marker) : -1;
  const end = typeof sql === "string" ? sql.indexOf("\n$$;", start) : -1;
  if (start < 0 || end < 0 || sql.indexOf(marker, start + marker.length) !== -1)
    throw new Error("resolver_source_shape_rejected");
  return sql.slice(start, end + 4);
}

function session(env, application, spawnAsyncImpl) {
  const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"];
  const sessionEnv = { ...env, PGAPPNAME: application };
  const containerArgs = [
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
  const invocation = !env.VERDANT_QUICKLOG_PG15_CONTAINER
    ? { command: "psql", args }
    : env.VERDANT_QUICKLOG_PG15_CONTAINER_RUNTIME === "wsl-docker"
      ? { command: "wsl.exe", args: ["-d", "Ubuntu", "--", "docker", ...containerArgs] }
      : { command: "docker", args: containerArgs };
  const child = spawnAsyncImpl(invocation.command, invocation.args, {
    env: sessionEnv,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let ended = false;
  child.stdin.on("error", () => {});
  const append = (chunk, kind) => {
    if (kind === "stdout") stdout += String(chunk);
    else stderr += String(chunk);
    if (stdout.length + stderr.length > 64 * 1024) child.kill();
  };
  child.stdout.on("data", (chunk) => append(chunk, "stdout"));
  child.stderr.on("data", (chunk) => append(chunk, "stderr"));
  const watchdog = setTimeout(() => child.kill(), 15_000);
  const done = new Promise((resolveDone) => {
    const finish = (code) => {
      ended = true;
      clearTimeout(watchdog);
      resolveDone({ code, stdout, stderr });
    };
    child.once("error", () => finish(null));
    child.once("close", finish);
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

function deadlocks(env, spawnImpl) {
  const value = executeSql(
    "select deadlocks from pg_stat_database where datname=current_database();",
    env,
    { stage: "manual_deadlock_counter", spawnImpl },
  );
  if (!/^\d+$/.test(value)) throw new Error("deadlock_counter_unavailable");
  return Number(value);
}

async function assertRace(env, { stamp, expectedDeadlock, index }, spawnImpl, spawnAsyncImpl) {
  const key = `manual-lock-proof-${index}`;
  const fresh = JSON.parse(
    executeSql(`${beginSql} set local role authenticated; select ${callSql(key)}; commit;`, env, {
      stage: "manual_race_fixture",
      spawnImpl,
    }),
  );
  const event = fresh.grow_event_id;
  if (fresh.ok !== true || fresh.reused !== false || !UUID.test(event))
    throw new Error("manual_fixture_receipt_rejected");
  const diary = executeSql(
    `select id from public.diary_entries where user_id='${owner}' and details->>'linked_grow_event_id'='${event}';`,
    env,
    { stage: "manual_fixture_diary", spawnImpl },
  );
  if (!UUID.test(diary)) throw new Error("manual_fixture_diary_rejected");
  if (stamp !== "complete") {
    executeSql(
      `update public.diary_entries set logged_at=null, details=(details-'logged_at')${stamp === "invalid" ? "||jsonb_build_object('logged_at','invalid')" : ""} where id='${diary}';`,
      env,
      { stage: "manual_fixture_legacy_metadata", spawnImpl },
    );
  }
  const before = deadlocks(env, spawnImpl);
  const replay = session(env, "verdant-manual-replay-lock-proof", spawnAsyncImpl);
  const revision = session(env, "verdant-manual-revision-lock-proof", spawnAsyncImpl);
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
          stage: "manual_revision_lock_barrier",
          spawnImpl,
        }) === "t";
      if (!blocked) await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
    if (!blocked) throw new Error("revision_did_not_wait_for_manual_replay");
    replay.write(
      `set local role authenticated; select 'REPLAY_RECEIPT:'||${callSql(key)}::text; commit; select 'REPLAY_DONE';\n\\q`,
    );
    const [replayResult, revisionResult] = await Promise.all([replay.done, revision.done]);
    let after = deadlocks(env, spawnImpl);
    if (expectedDeadlock) {
      const counterDeadline = Date.now() + 5_000;
      while (after === before && Date.now() < counterDeadline) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 20));
        after = deadlocks(env, spawnImpl);
      }
      if (after !== before + 1) throw new Error("manual_deadlock_control_not_detected");
      return;
    }
    if (after !== before || replayResult.code !== 0 || revisionResult.code !== 0)
      throw new Error("manual_serialized_race_failed");
    const line = replayResult.stdout
      .split(/\r?\n/)
      .find((value) => value.startsWith("REPLAY_RECEIPT:"));
    const receipt = JSON.parse(line?.slice("REPLAY_RECEIPT:".length) ?? "null");
    if (
      receipt?.ok !== true ||
      receipt.reused !== true ||
      receipt.grow_event_id !== event ||
      !revisionResult.stdout.includes(`REVISION_ROOT:${event}`)
    )
      throw new Error("manual_serialized_receipt_rejected");
    const final = executeSql(
      `select
(select count(*)=1 and bool_and(is_deleted) from public.grow_events where id='${event}')
and (select count(*)=1 and bool_and(retracted_at is not null) from public.diary_entries where id='${diary}')
and (select count(*)=1 from public.quicklog_idempotency where user_id='${owner}' and idempotency_key='${key}');`,
      env,
      { stage: "manual_final_rows", spawnImpl },
    );
    if (final !== "t") throw new Error("manual_final_rows_rejected");
    const afterRetraction = JSON.parse(
      executeSql(`${beginSql} set local role authenticated; select ${callSql(key)}; commit;`, env, {
        stage: "manual_after_retraction",
        spawnImpl,
      }),
    );
    if (afterRetraction.ok !== false || afterRetraction.reason !== "idempotency_key_retracted")
      throw new Error("manual_retraction_fence_rejected");
  } finally {
    replay.kill();
    revision.kill();
    await Promise.all([replay.done, revision.done]);
  }
}

function manualReceipt(env, key, spawnImpl, changed = false) {
  const sql = changed
    ? callSql(key).replace("'manual lock proof'", "'changed request'")
    : callSql(key);
  return JSON.parse(
    executeSql(`${beginSql} set local role authenticated; select ${sql}; commit;`, env, {
      stage: "manual_contract_receipt",
      spawnImpl,
    }),
  );
}

function freshEvent(env, key, spawnImpl) {
  const receipt = manualReceipt(env, key, spawnImpl);
  if (receipt.ok !== true || receipt.reused !== false || !UUID.test(receipt.grow_event_id))
    throw new Error("manual_contract_fixture_rejected");
  return receipt.grow_event_id;
}

function assertLegacyBackfill(env, stamp, spawnImpl) {
  const key = `manual-backfill-${stamp}`;
  const event = freshEvent(env, key, spawnImpl);
  executeSql(
    `update public.diary_entries set logged_at=null, details=(details-'logged_at')${stamp === "invalid" ? "||jsonb_build_object('logged_at','invalid')" : ""} where user_id='${owner}' and details->>'linked_grow_event_id'='${event}';`,
    env,
    { stage: "manual_sequential_legacy_metadata", spawnImpl },
  );
  const receipt = manualReceipt(env, key, spawnImpl);
  if (receipt.ok !== true || receipt.reused !== true || receipt.grow_event_id !== event)
    throw new Error("manual_backfill_receipt_rejected");
  const restored = executeSql(
    `select count(*)=1 and bool_and(logged_at='2026-01-01T09:59:00Z'::timestamptz and public.quicklog_try_parse_logged_at(details->>'logged_at')=logged_at) from public.diary_entries where user_id='${owner}' and details->>'linked_grow_event_id'='${event}';`,
    env,
    { stage: "manual_legacy_metadata_restored", spawnImpl },
  );
  if (restored !== "t") throw new Error("manual_legacy_backfill_rejected");
}

function assertRetractedSibling(env, spawnImpl) {
  const key = "manual-retracted-sibling";
  const event = freshEvent(env, key, spawnImpl);
  const diary = executeSql(
    `insert into public.diary_entries(user_id,grow_id,note,details,retracted_at) select user_id,grow_id,'retracted sibling',jsonb_build_object('linked_grow_event_id',id,'preserve','original'),now() from public.grow_events where id='${event}' returning id;`,
    env,
    { stage: "manual_retracted_sibling_fixture", spawnImpl },
  );
  if (!UUID.test(diary)) throw new Error("manual_retracted_sibling_fixture_rejected");
  executeSql(
    `update public.diary_entries set logged_at=null, details=details-'logged_at' where id='${diary}';`,
    env,
    { stage: "manual_retracted_sibling_legacy_metadata", spawnImpl },
  );
  const snapshotSql = `select jsonb_build_object('logged_at',logged_at,'details',details,'retracted_at',retracted_at)::text from public.diary_entries where id='${diary}';`;
  const before = executeSql(snapshotSql, env, {
    stage: "manual_retracted_sibling_before",
    spawnImpl,
  });
  const receipt = manualReceipt(env, key, spawnImpl);
  if (
    receipt.ok !== true ||
    receipt.reused !== true ||
    receipt.grow_event_id !== event ||
    executeSql(snapshotSql, env, { stage: "manual_retracted_sibling_after", spawnImpl }) !== before
  )
    throw new Error("manual_retracted_sibling_changed");
}

function assertRefusalFences(env, spawnImpl) {
  const reasons = [
    "idempotency_key_conflict",
    "idempotency_key_unverified",
    "idempotency_key_retracted",
    "idempotency_receipt_missing",
  ];
  for (const [index, reason] of reasons.entries()) {
    const key = `manual-forward-fence-${index}`;
    const event = freshEvent(env, key, spawnImpl);
    if (reason === "idempotency_key_unverified")
      executeSql(
        `update public.quicklog_idempotency set request_hash=null where user_id='${owner}' and idempotency_key='${key}';`,
        env,
        { stage: "manual_hashless_fence_fixture", spawnImpl },
      );
    if (reason === "idempotency_key_retracted")
      executeSql(`update public.grow_events set is_deleted=true where id='${event}';`, env, {
        stage: "manual_retracted_fence_fixture",
        spawnImpl,
      });
    if (reason === "idempotency_receipt_missing")
      executeSql(
        `update public.diary_entries set retracted_at=now() where user_id='${owner}' and details->>'linked_grow_event_id'='${event}';`,
        env,
        { stage: "manual_missing_fence_fixture", spawnImpl },
      );
    const receipt = manualReceipt(env, key, spawnImpl, reason === "idempotency_key_conflict");
    if (receipt.ok !== false || receipt.reason !== reason)
      throw new Error("manual_forward_refusal_fence_rejected");
    const single = executeSql(
      `select (select count(*)=1 from public.grow_events where id='${event}') and (select count(*)=1 from public.quicklog_idempotency where user_id='${owner}' and idempotency_key='${key}');`,
      env,
      { stage: "manual_refusal_rows_preserved", spawnImpl },
    );
    if (single !== "t") throw new Error("manual_refusal_rows_changed");
  }
}

export async function runManualReuseLockHarness({
  url = process.env.QUICKLOG_MANUAL_REUSE_PG15_URL,
  containerId = process.env.QUICKLOG_MANUAL_REUSE_PG15_CONTAINER,
  containerRuntime = process.env.QUICKLOG_MANUAL_REUSE_PG15_CONTAINER_RUNTIME,
  spawnImpl = spawnSync,
  spawnAsyncImpl = spawn,
} = {}) {
  const connection = validateLocalTarget({ url, containerId, containerRuntime });
  if (!connection) {
    process.stderr.write("Manual replay lock PG15: database_target_rejected\n");
    return 1;
  }
  let stage = "pinned_source";
  try {
    pinnedManualSql();
    const forward = pinnedForwardSql();
    const resolver = extractResolver(
      sqlFile("20260811090000_quicklog_corrections_retractions.sql"),
    );
    stage = "sequential_manual_contract";
    if ((await runManualReuseHarness({ url, containerId, containerRuntime, spawnImpl })) !== 0)
      throw new Error("manual_baseline_contract_rejected");
    const env = psqlEnvironment(connection, containerId, containerRuntime);
    executeSql(resolver, env, { stage: "actual_revision_resolver", spawnImpl });
    stage = "complete_metadata_race";
    await assertRace(
      env,
      { stamp: "complete", expectedDeadlock: false, index: 1 },
      spawnImpl,
      spawnAsyncImpl,
    );
    stage = "missing_metadata_deadlock_control";
    await assertRace(
      env,
      { stamp: "missing", expectedDeadlock: true, index: 2 },
      spawnImpl,
      spawnAsyncImpl,
    );
    stage = "invalid_metadata_deadlock_control";
    await assertRace(
      env,
      { stamp: "invalid", expectedDeadlock: true, index: 3 },
      spawnImpl,
      spawnAsyncImpl,
    );
    stage = "forward_migration";
    const identitySql =
      "select jsonb_build_object('owner',proowner,'acl',proacl::text,'config',proconfig,'security_definer',prosecdef)::text from pg_proc where oid='public.quicklog_save_manual(text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb, text, text)'::regprocedure;";
    const identity = executeSql(identitySql, env, {
      stage: "manual_wrapper_identity_before",
      spawnImpl,
    });
    executeSql(forward, env, { stage: "manual_forward_migration", spawnImpl });
    if (
      executeSql(identitySql, env, { stage: "manual_wrapper_identity_after", spawnImpl }) !==
      identity
    )
      throw new Error("manual_wrapper_privileges_changed");
    stage = "corrected_races";
    for (const [index, stamp] of ["complete", "missing", "invalid"].entries())
      await assertRace(
        env,
        { stamp, expectedDeadlock: false, index: index + 4 },
        spawnImpl,
        spawnAsyncImpl,
      );
    stage = "sequential_legacy_backfill";
    for (const stamp of ["missing", "invalid"]) assertLegacyBackfill(env, stamp, spawnImpl);
    stage = "retracted_sibling_unchanged";
    assertRetractedSibling(env, spawnImpl);
    stage = "refusal_fences";
    assertRefusalFences(env, spawnImpl);
    stage = "preflight_drift_rejection";
    const sourceSql =
      "select md5(replace(prosrc, E'\\r', '')) from pg_proc where oid='public.quicklog_save_manual(text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb, text, text)'::regprocedure;";
    const repairedSource = executeSql(sourceSql, env, {
      stage: "manual_repaired_source_before_rejection",
      spawnImpl,
    });
    let rejected = false;
    try {
      executeSql(`\\set VERBOSITY sqlstate\n${forward}`, env, {
        stage: "manual_reapply_control",
        spawnImpl,
      });
    } catch (error) {
      rejected = error instanceof Error && error.message.endsWith(":P0001");
    }
    if (
      !rejected ||
      executeSql(sourceSql, env, { stage: "manual_repaired_source_after_rejection", spawnImpl }) !==
        repairedSource ||
      executeSql(identitySql, env, {
        stage: "manual_wrapper_identity_after_rejection",
        spawnImpl,
      }) !== identity
    )
      throw new Error("manual_unrecognized_source_not_rejected");
    process.stdout.write(
      "Manual replay lock PG15: 11 passed, 0 failed (3 baseline races; 3 corrected races; 2 legacy backfills; retracted sibling unchanged; 4 refusal fences; preflight drift rejected)\n",
    );
    return 0;
  } catch {
    // Never print raw psql output, connection strings, or exception messages.
    process.stderr.write(`Manual replay lock PG15: ${stage}:proof_failed\n`);
    return 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exit(await runManualReuseLockHarness());
