#!/usr/bin/env node
/** Isolated PostgreSQL 15 proof for the Quick Log manual replay fence. */
import { spawnSync } from "node:child_process";
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
const migration = "20260927002000_quicklog_manual_reuse_fence.sql";
const migrationSha256 = "fb6ec0572154984a7d921a085add70c9d876f5fd102d5d8d23272ffd4a5909b3";
const repair = "20260818010000_quicklog_manual_delegate_forward_repair.sql";
const databaseUrl =
  "postgresql://postgres:verdant-runtime-only@127.0.0.1:5432/verdant_quicklog_delegate_repair";
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const ownerPlant = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const otherPlant = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const keyed = "manual-replay-fence-0001";
const legacy = "manual-replay-legacy-0001";
const signature =
  "text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb, text, text";

function sqlFile(name) {
  const sql = readFileSync(resolve(root, "supabase", "migrations", name), "utf8").replace(
    /\r\n/g,
    "\n",
  );
  if (
    !/^\s*BEGIN;/.test(sql) ||
    !/COMMIT;\s*(?:NOTIFY pgrst, 'reload schema';\s*)?$/.test(sql) ||
    sql.includes("supabase.co")
  ) {
    throw new Error("migration_shape_rejected");
  }
  return sql;
}

function expectTrue(label, sql, env, spawnImpl) {
  if (executeSql(sql, env, { stage: label, spawnImpl }) !== "t") {
    throw new Error(`${label}:false`);
  }
}

function call(
  { userId = owner, plantId = ownerPlant, key = keyed, note = "first note" } = {},
  env,
  spawnImpl,
) {
  const raw = executeSql(
    `begin;
set local request.jwt.claim.sub = '${userId}';
set local role authenticated;
select public.quicklog_save_manual(
  'plant', '${plantId}'::uuid, 'note', null, '${note}',
  null, null, null, '2026-01-01T10:00:00Z'::timestamptz,
  '{"logged_at":"2026-01-01T09:59:00Z"}'::jsonb,
  '${key}', 'veg'
);
commit;`,
    env,
    { stage: "manual_call", spawnImpl },
  );
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("manual_call:invalid_receipt");
  }
}

function requireReceipt(label, receipt, { ok, reused, reason } = {}) {
  if (
    receipt.ok !== ok ||
    (reused !== undefined && receipt.reused !== reused) ||
    (reason !== undefined && receipt.reason !== reason)
  ) {
    throw new Error(`${label}:unexpected_receipt`);
  }
}

export function validateLocalTarget({ url, containerId, containerRuntime } = {}) {
  const connection = disposableConnection(url);
  if (
    !connection ||
    (containerId && !/^[0-9a-f]{12,64}$/i.test(containerId)) ||
    (containerRuntime && !new Set(["docker", "wsl-docker"]).has(containerRuntime))
  ) {
    return null;
  }
  return connection;
}

export async function runManualReuseHarness({
  url = process.env.QUICKLOG_MANUAL_REUSE_PG15_URL,
  containerId = process.env.QUICKLOG_MANUAL_REUSE_PG15_CONTAINER,
  containerRuntime = process.env.QUICKLOG_MANUAL_REUSE_PG15_CONTAINER_RUNTIME,
  spawnImpl = spawnSync,
} = {}) {
  const connection = validateLocalTarget({ url, containerId, containerRuntime });
  if (!connection) {
    process.stderr.write("Quick Log manual reuse PG15 harness failed: database_target_rejected\n");
    return 1;
  }
  const env = psqlEnvironment(connection, containerId, containerRuntime);
  try {
    // The attestation precedes the inherited scaffold's destructive reset.
    attestDisposableTarget(env, spawnImpl);
    resetScaffold(env, spawnImpl);
    executeSql(sqlFile(repair), env, { stage: "delegate_repair", spawnImpl });
    executeSql(
      "alter table public.grow_events add column is_deleted boolean not null default false;",
      env,
      { stage: "retraction_fixture", spawnImpl },
    );

    const legacyReceipt = call({ key: legacy }, env, spawnImpl);
    requireReceipt("legacy_initial", legacyReceipt, { ok: true, reused: false });
    expectTrue(
      "legacy_hash_null",
      `select request_hash is null from public.quicklog_idempotency
       where user_id='${owner}' and idempotency_key='${legacy}';`,
      env,
      spawnImpl,
    );

    const sourceBefore = executeSql(
      `select md5(replace(prosrc, E'\\r', '')) from pg_proc
       where oid='public.quicklog_save_manual(${signature})'::regprocedure;`,
      env,
      { stage: "wrapper_source", spawnImpl },
    );
    if (sourceBefore !== "0d3098b81787fa90898da921345c0dbc") {
      throw new Error("wrapper_source:unexpected_baseline");
    }
    const proposedSql = sqlFile(migration);
    const fingerprint = createHash("sha256").update(proposedSql).digest("hex");
    if (fingerprint !== migrationSha256) throw new Error("migration_fingerprint_mismatch");
    executeSql(proposedSql, env, { stage: "manual_reuse_migration", spawnImpl });

    requireReceipt("legacy_unverified", call({ key: legacy }, env, spawnImpl), {
      ok: false,
      reason: "idempotency_key_unverified",
    });
    expectTrue(
      "legacy_row_preserved",
      `select (select count(*)=1 from public.grow_events where id='${legacyReceipt.grow_event_id}'
        and not is_deleted)
       and (select request_hash is null from public.quicklog_idempotency
        where user_id='${owner}' and idempotency_key='${legacy}');`,
      env,
      spawnImpl,
    );

    const fresh = call({}, env, spawnImpl);
    requireReceipt("new_save", fresh, { ok: true, reused: false });
    expectTrue(
      "new_hash_persisted",
      `select request_hash like 'manual_v1:%' and length(request_hash)=42
       from public.quicklog_idempotency where user_id='${owner}' and idempotency_key='${keyed}';`,
      env,
      spawnImpl,
    );
    const exact = call({}, env, spawnImpl);
    requireReceipt("exact_retry", exact, { ok: true, reused: true });
    if (exact.grow_event_id !== fresh.grow_event_id) throw new Error("exact_retry:row_changed");
    requireReceipt("changed_payload", call({ note: "different note" }, env, spawnImpl), {
      ok: false,
      reason: "idempotency_key_conflict",
    });
    expectTrue(
      "single_winning_row",
      `select (select count(*)=1 from public.grow_events where user_id='${owner}'
        and id='${fresh.grow_event_id}')
        and (select count(*)=1 from public.quicklog_idempotency where user_id='${owner}'
        and idempotency_key='${keyed}')
        and (select count(*)=1 from public.diary_entries where user_id='${owner}'
        and details->>'linked_grow_event_id'='${fresh.grow_event_id}');`,
      env,
      spawnImpl,
    );

    // A different user's identical key must remain a separate namespace.
    const otherReceipt = call({ userId: other, plantId: otherPlant }, env, spawnImpl);
    requireReceipt("cross_user", otherReceipt, { ok: true, reused: false });
    if (otherReceipt.grow_event_id === fresh.grow_event_id)
      throw new Error("cross_user:receipt_leaked");

    // Retraction is simulated at the authoritative row. Both new and
    // historical receipts must fail after the row becomes deleted.
    executeSql(
      `update public.grow_events set is_deleted=true
      where id in ('${fresh.grow_event_id}','${legacyReceipt.grow_event_id}');`,
      env,
      { stage: "retract_rows", spawnImpl },
    );
    requireReceipt("new_retracted_retry", call({}, env, spawnImpl), {
      ok: false,
      reason: "idempotency_key_retracted",
    });
    requireReceipt("legacy_retracted_retry", call({ key: legacy }, env, spawnImpl), {
      ok: false,
      reason: "idempotency_key_retracted",
    });
    expectTrue(
      "acl_fence",
      `select not has_function_privilege('anon',
         'public.quicklog_save_manual(${signature})'::regprocedure, 'EXECUTE')
       and has_function_privilege('authenticated',
         'public.quicklog_save_manual(${signature})'::regprocedure, 'EXECUTE');`,
      env,
      spawnImpl,
    );
  } catch (error) {
    process.stderr.write(
      `Quick Log manual reuse PG15 harness failed: ${error instanceof Error ? error.message : "unknown"}\n`,
    );
    return 1;
  }
  process.stdout.write("Quick Log manual reuse PG15 harness PASS\n");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = await runManualReuseHarness();
}
