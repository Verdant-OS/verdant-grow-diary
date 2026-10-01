#!/usr/bin/env node
/**
 * Disposable PG15 proof that the manual replay hash binds p_occurred_at's instant,
 * not the session TimeZone's rendering of it. Runs the accepted manual contract,
 * applies 20260928183000, records legacy hashes under several session zones, then
 * applies the UTC-hash repair and retries them. Not hosted proof.
 */
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
import {
  pinnedForwardSql,
  pinnedManualSql,
} from "./run-quicklog-manual-reuse-lock-pg15-harness.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const UTC_HASH_MIGRATION = "20261001180000_quicklog_manual_occurred_at_utc_hash.sql";
export const UTC_HASH_SHA256 = "1fcb23dd5c1285c036e8a498ab4539d5a37a706a614dca26643f036973ba2f5a";
export const UTC_HASH_WRAPPER_MD5 = "f587dc4669f65580eed2d5097caac806";
const owner = "11111111-1111-4111-8111-111111111111";
const plant = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const INSTANT = "'2026-01-01T10:00:00Z'::timestamptz";
const ZONES = new Set(["UTC", "America/New_York", "Asia/Kolkata", "Pacific/Chatham"]);
// Edge instants the wrapper accepts: fractional seconds, an infinite value and a BC date.
const EDGE_INSTANTS = [
  "'2026-06-30T23:59:59.123456-07:00'::timestamptz",
  "'infinity'::timestamptz",
  "'0044-03-15T12:00:00Z BC'::timestamptz",
];
const signature =
  "text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb, text, text";
const sourceSql = `select md5(replace(prosrc, E'\\r', '')) from pg_proc where oid='public.quicklog_save_manual(${signature})'::regprocedure;`;
const identitySql = `select jsonb_build_object('owner',proowner,'acl',proacl::text,'config',proconfig,'security_definer',prosecdef)::text from pg_proc where oid='public.quicklog_save_manual(${signature})'::regprocedure;`;

export function pinnedUtcHashSql(
  sql = readFileSync(resolve(root, "supabase/migrations", UTC_HASH_MIGRATION), "utf8").replace(
    /\r\n/g,
    "\n",
  ),
) {
  if (typeof sql !== "string" || createHash("sha256").update(sql).digest("hex") !== UTC_HASH_SHA256)
    throw new Error("utc_hash_migration_fingerprint_mismatch");
  return sql;
}

function zone(name) {
  if (!ZONES.has(name)) throw new Error("zone_rejected");
  return name;
}

function save(env, spawnImpl, { key, tz, occurred = INSTANT, note = "utc hash proof" }) {
  const raw = executeSql(
    `begin; set local statement_timeout='10s'; set local timezone='${zone(tz)}';
set local request.jwt.claim.sub='${owner}'; set local role authenticated;
select public.quicklog_save_manual('plant', '${plant}'::uuid, 'note', null, '${note}',
  null, null, null, ${occurred}, '{"logged_at":"2026-01-01T09:59:00Z"}'::jsonb, '${key}', 'veg');
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

/** The accepted manual_v1 formula, evaluated by a UTC session. */
function utcSessionHash(env, spawnImpl, { occurred = INSTANT, note = "utc hash proof" } = {}) {
  return executeSql(
    `begin; set local timezone='UTC';
select 'manual_v1:' || md5(jsonb_build_object(
  'target_type', 'plant', 'target_id', '${plant}'::uuid, 'action', 'note',
  'volume_ml', null::numeric, 'note', '${note}', 'temperature_c', null::numeric,
  'humidity_pct', null::numeric, 'vpd_kpa', null::numeric, 'occurred_at', ${occurred},
  'details', '{"logged_at":"2026-01-01T09:59:00Z"}'::jsonb, 'stage', 'veg')::text);
commit;`,
    env,
    { stage: "utc_session_hash", spawnImpl },
  );
}

function storedHash(env, spawnImpl, key) {
  return executeSql(
    `select request_hash from public.quicklog_idempotency where user_id='${owner}' and idempotency_key='${key}';`,
    env,
    { stage: "stored_hash", spawnImpl },
  );
}

function expectReceipt(label, receipt, { ok, reused, reason, event }) {
  if (
    receipt?.ok !== ok ||
    (reused !== undefined && receipt.reused !== reused) ||
    (reason !== undefined && receipt.reason !== reason) ||
    (event !== undefined && receipt.grow_event_id !== event)
  )
    throw new Error(`${label}:unexpected_receipt`);
}

function freshSave(env, spawnImpl, label, input) {
  const receipt = save(env, spawnImpl, input);
  expectReceipt(label, receipt, { ok: true, reused: false });
  if (!UUID.test(receipt.grow_event_id)) throw new Error(`${label}:event_rejected`);
  return receipt.grow_event_id;
}

function singleRow(env, spawnImpl, key) {
  return (
    executeSql(
      `select (select count(*)=1 from public.quicklog_idempotency where user_id='${owner}' and idempotency_key='${key}')
and (select count(*)=1 from public.grow_events ge join public.quicklog_idempotency qi on qi.grow_event_id=ge.id
     where qi.user_id='${owner}' and qi.idempotency_key='${key}');`,
      env,
      { stage: "single_row", spawnImpl },
    ) === "t"
  );
}

export async function runManualOccurredAtUtcHarness({
  url = process.env.QUICKLOG_MANUAL_REUSE_PG15_URL,
  containerId = process.env.QUICKLOG_MANUAL_REUSE_PG15_CONTAINER,
  containerRuntime = process.env.QUICKLOG_MANUAL_REUSE_PG15_CONTAINER_RUNTIME,
  spawnImpl,
  repairSql,
} = {}) {
  const connection = validateLocalTarget({ url, containerId, containerRuntime });
  if (!connection) {
    process.stderr.write("Manual occurred_at UTC hash PG15: database_target_rejected\n");
    return 1;
  }
  let stage = "pinned_source";
  let passed = 0;
  const pass = () => {
    passed += 1;
  };
  try {
    pinnedManualSql();
    const forward = pinnedForwardSql();
    const repair = repairSql ?? pinnedUtcHashSql();
    stage = "sequential_manual_contract";
    if ((await runManualReuseHarness({ url, containerId, containerRuntime, spawnImpl })) !== 0)
      throw new Error("manual_baseline_contract_rejected");
    const env = psqlEnvironment(connection, containerId, containerRuntime);
    executeSql(forward, env, { stage: "manual_forward_migration", spawnImpl });

    stage = "legacy_session_dependence";
    const expectedUtc = utcSessionHash(env, spawnImpl);
    const utcOrigin = freshSave(env, spawnImpl, "utc_origin", {
      key: "utc-hash-utc-origin",
      tz: "UTC",
    });
    if (storedHash(env, spawnImpl, "utc-hash-utc-origin") !== expectedUtc)
      throw new Error("utc_origin:hash_not_utc_session_form");
    // Defect witness on the accepted wrapper: same instant, new session zone, refused.
    expectReceipt(
      "legacy_cross_zone_retry",
      save(env, spawnImpl, { key: "utc-hash-utc-origin", tz: "America/New_York" }),
      {
        ok: false,
        reason: "idempotency_key_conflict",
      },
    );
    pass();
    const nyOrigin = freshSave(env, spawnImpl, "ny_origin", {
      key: "utc-hash-ny-origin",
      tz: "America/New_York",
    });
    const nyHash = storedHash(env, spawnImpl, "utc-hash-ny-origin");
    if (nyHash === expectedUtc || !/^manual_v1:[0-9a-f]{32}$/.test(nyHash))
      throw new Error("ny_origin:hash_not_session_specific");
    pass();
    const nullOrigin = freshSave(env, spawnImpl, "null_origin", {
      key: "utc-hash-null-origin",
      tz: "UTC",
      occurred: "null::timestamptz",
    });
    const nullHash = storedHash(env, spawnImpl, "utc-hash-null-origin");

    stage = "repair_migration";
    const identity = executeSql(identitySql, env, { stage: "identity_before", spawnImpl });
    executeSql(repair, env, { stage: "utc_hash_migration", spawnImpl });
    if (executeSql(identitySql, env, { stage: "identity_after", spawnImpl }) !== identity)
      throw new Error("manual_wrapper_privileges_changed");
    pass();

    stage = "utc_stored_hash_retries";
    for (const tz of ["America/New_York", "Asia/Kolkata", "Pacific/Chatham", "UTC"])
      expectReceipt(`utc_origin_${tz}`, save(env, spawnImpl, { key: "utc-hash-utc-origin", tz }), {
        ok: true,
        reused: true,
        event: utcOrigin,
      });
    pass();
    expectReceipt(
      "same_instant_offset_literal",
      save(env, spawnImpl, {
        key: "utc-hash-utc-origin",
        tz: "Asia/Kolkata",
        occurred: "'2026-01-01T05:00:00-05:00'::timestamptz",
      }),
      { ok: true, reused: true, event: utcOrigin },
    );
    pass();

    stage = "session_stored_hash_retries";
    expectReceipt(
      "ny_origin_same_zone",
      save(env, spawnImpl, { key: "utc-hash-ny-origin", tz: "America/New_York" }),
      {
        ok: true,
        reused: true,
        event: nyOrigin,
      },
    );
    pass();
    // Documented residual: a pre-repair non-UTC hash verifies only from its own offset.
    expectReceipt(
      "ny_origin_other_zone",
      save(env, spawnImpl, { key: "utc-hash-ny-origin", tz: "UTC" }),
      {
        ok: false,
        reason: "idempotency_key_conflict",
      },
    );
    pass();

    stage = "null_preserved";
    expectReceipt(
      "null_origin_other_zone",
      save(env, spawnImpl, {
        key: "utc-hash-null-origin",
        tz: "Pacific/Chatham",
        occurred: "null::timestamptz",
      }),
      { ok: true, reused: true, event: nullOrigin },
    );
    if (storedHash(env, spawnImpl, "utc-hash-null-origin") !== nullHash)
      throw new Error("null_origin:hash_changed");
    pass();

    stage = "new_rows_store_utc_form";
    freshSave(env, spawnImpl, "kolkata_new", { key: "utc-hash-kolkata-new", tz: "Asia/Kolkata" });
    if (storedHash(env, spawnImpl, "utc-hash-kolkata-new") !== expectedUtc)
      throw new Error("kolkata_new:hash_not_utc_session_form");
    expectReceipt(
      "kolkata_new_retry",
      save(env, spawnImpl, { key: "utc-hash-kolkata-new", tz: "America/New_York" }),
      {
        ok: true,
        reused: true,
      },
    );
    pass();
    for (const [index, occurred] of EDGE_INSTANTS.entries()) {
      const key = `utc-hash-edge-${index}`;
      const event = freshSave(env, spawnImpl, `edge_${index}`, {
        key,
        tz: "Pacific/Chatham",
        occurred,
      });
      if (storedHash(env, spawnImpl, key) !== utcSessionHash(env, spawnImpl, { occurred }))
        throw new Error(`edge_${index}:hash_not_utc_session_form`);
      expectReceipt(`edge_${index}_retry`, save(env, spawnImpl, { key, tz: "UTC", occurred }), {
        ok: true,
        reused: true,
        event,
      });
    }
    pass();

    stage = "changed_requests_refused";
    expectReceipt(
      "changed_instant",
      save(env, spawnImpl, {
        key: "utc-hash-utc-origin",
        tz: "UTC",
        occurred: "'2026-01-01T10:00:01Z'::timestamptz",
      }),
      { ok: false, reason: "idempotency_key_conflict" },
    );
    expectReceipt(
      "changed_note",
      save(env, spawnImpl, {
        key: "utc-hash-utc-origin",
        tz: "America/New_York",
        note: "changed note",
      }),
      { ok: false, reason: "idempotency_key_conflict" },
    );
    for (const key of ["utc-hash-utc-origin", "utc-hash-ny-origin", "utc-hash-null-origin"])
      if (!singleRow(env, spawnImpl, key)) throw new Error("changed_requests:row_count_changed");
    pass();

    stage = "pinned_source_and_acl";
    if (executeSql(sourceSql, env, { stage: "wrapper_source", spawnImpl }) !== UTC_HASH_WRAPPER_MD5)
      throw new Error("wrapper_source_unexpected");
    if (
      executeSql(
        `select not has_function_privilege('anon','public.quicklog_save_manual(${signature})'::regprocedure,'EXECUTE')
and has_function_privilege('authenticated','public.quicklog_save_manual(${signature})'::regprocedure,'EXECUTE');`,
        env,
        { stage: "acl_fence", spawnImpl },
      ) !== "t"
    )
      throw new Error("acl_fence_rejected");
    pass();

    stage = "preflight_drift_rejection";
    let rejected = false;
    try {
      executeSql(`\\set VERBOSITY sqlstate\n${repair}`, env, {
        stage: "reapply_control",
        spawnImpl,
      });
    } catch (error) {
      rejected = error instanceof Error && error.message.endsWith(":P0001");
    }
    if (
      !rejected ||
      executeSql(sourceSql, env, { stage: "wrapper_source_after_rejection", spawnImpl }) !==
        UTC_HASH_WRAPPER_MD5
    )
      throw new Error("reapply_not_rejected");
    pass();

    process.stdout.write(
      `Manual occurred_at UTC hash PG15: ${passed} passed, 0 failed (legacy zone conflict witnessed; UTC-stored, same-zone legacy, NULL and edge retries accepted; cross-zone legacy residual and changed requests refused; ACL and preflight drift fenced)\n`,
    );
    return 0;
  } catch {
    // Never print raw psql output, connection strings, or exception messages.
    process.stderr.write(`Manual occurred_at UTC hash PG15: ${stage}:proof_failed\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exit(await runManualOccurredAtUtcHarness());
