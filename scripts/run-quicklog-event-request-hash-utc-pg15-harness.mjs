#!/usr/bin/env node
/**
 * Disposable PG15 proof that the Quick Log event replay hash binds instants,
 * not the session TimeZone's rendering of them. Builds the real delegate,
 * foundation wrapper and legacy helper, applies the pinned event replay
 * migrations, witnesses the zone-dependent conflict, then applies the UTC
 * repair and retries. Sequential, one connection at a time. Not hosted proof.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  attestDisposableTarget,
  executeSql,
  psqlEnvironment,
  resetScaffold,
} from "./run-quicklog-manual-delegate-forward-repair-pg15-harness.mjs";
import {
  extractDefinition,
  FORWARD_MIGRATION_FILE,
  FORWARD_MIGRATION_SHA256,
  MIGRATION_FILE,
  MIGRATION_SHA256,
  validateLocalTarget,
} from "./run-quicklog-event-replay-lock-pg15-harness.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const UTC_HASH_MIGRATION = "20261001190000_quicklog_event_request_hash_utc.sql";
export const UTC_HASH_SHA256 = "d8cccdcc4141d3e91d94f56204115b08189e7b97b49aae61ff80aa8d8005a352";
export const UTC_HASH_WRAPPER_MD5 = "834408e54794ac4980757f86699ce45c";
const foundation = "20260725024026_quicklog_dual_timestamp_foundation.sql";
const signature =
  "text, uuid, text, uuid, uuid, text, text, jsonb, timestamptz, jsonb, jsonb, jsonb";
const helperSignature =
  "uuid, text, uuid, uuid, text, text, timestamptz, jsonb, jsonb, jsonb, jsonb";
const owner = "11111111-1111-4111-8111-111111111111";
const grow = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const INSTANT = "'2026-01-01T10:00:00Z'::timestamptz";
const DETAILS = `'{"logged_at":"2026-01-01T09:59:00Z"}'::jsonb`;
const LEGACY_LOGGED = "2026-01-01T10:01:00Z";
const ZONES = new Set(["UTC", "America/New_York", "Asia/Kolkata", "Pacific/Chatham"]);
const EDGE_INSTANT = "'2026-06-30T23:59:59.123456-07:00'::timestamptz";
const FORCE_ABORT_KEY = "event-utc-force-abort";
const sourceSql = `select md5(replace(prosrc, E'\\r', '')) from pg_proc where oid='public.quicklog_save_event(${signature})'::regprocedure;`;
const identitySql = `select jsonb_build_object('owner',proowner,'acl',proacl::text,'config',proconfig,'security_definer',prosecdef)::text from pg_proc where oid='public.quicklog_save_event(${signature})'::regprocedure;`;

const sqlFile = (name) =>
  readFileSync(resolve(root, "supabase/migrations", name), "utf8").replace(/\r/g, "");

function pinned(name, sha256, error) {
  const sql = sqlFile(name);
  if (createHash("sha256").update(sql).digest("hex") !== sha256) throw new Error(error);
  return sql;
}

export function pinnedUtcHashSql(sql = sqlFile(UTC_HASH_MIGRATION)) {
  if (typeof sql !== "string" || createHash("sha256").update(sql).digest("hex") !== UTC_HASH_SHA256)
    throw new Error("utc_hash_migration_fingerprint_mismatch");
  return sql;
}

function zone(name) {
  if (!ZONES.has(name)) throw new Error("zone_rejected");
  return name;
}

/** One keyed event save; returns the receipt and the TimeZone seen after it. */
function save(env, spawnImpl, { key, tz, occurred = INSTANT, note = "utc hash proof" }) {
  const raw = executeSql(
    `begin; set local statement_timeout='10s'; set local timezone='${zone(tz)}';
set local request.jwt.claim.sub='${owner}'; set local role authenticated;
select public.quicklog_save_event('${key}', '${grow}', 'observation', null, null, '${note}', null, null,
  ${occurred}, ${DETAILS}, null, null);
select current_setting('TimeZone');
commit;`,
    env,
    { stage: "event_call", spawnImpl },
  );
  const [receiptLine, tzLine] = raw.split(/\r?\n/);
  let receipt;
  try {
    receipt = JSON.parse(receiptLine);
  } catch {
    throw new Error("event_call:invalid_receipt");
  }
  if (tzLine !== tz) throw new Error("event_call:caller_time_zone_not_restored");
  return receipt;
}

/** The delegate's hash of this request, evaluated by a UTC session. */
function utcSessionHash(env, spawnImpl, { occurred = INSTANT, note = "utc hash proof" } = {}) {
  return executeSql(
    `begin; set local timezone='UTC';
select public.quicklog_event_request_hash_pre_logged_at('${grow}', 'observation', null, null, '${note}', null,
  ${occurred}, null,
  jsonb_build_object('__verdant_request_details_hash_v1', md5(jsonb_build_object(
    'is_sql_null', false, 'json_type', 'object', 'value', ${DETAILS})::text))
  || jsonb_build_object('logged_at', '2026-01-01T09:59:00Z'::timestamptz),
  null, null);
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

/**
 * A pre-dual-timestamp row with no diary companion (its request needed none),
 * hashed by the legacy helper in the given session zone.
 */
function legacyMirrorlessRow(env, spawnImpl, { key, event, tz }) {
  executeSql(
    `begin; set local timezone='${zone(tz)}';
set local verdant.quicklog_logged_at = '${LEGACY_LOGGED}';
insert into public.grow_events(id,user_id,grow_id,event_type,occurred_at,logged_at,note)
  values ('${event}','${owner}','${grow}','note',${INSTANT},'${LEGACY_LOGGED}','legacy utc proof');
insert into public.quicklog_idempotency(user_id,idempotency_key,grow_event_id,request_hash)
  values ('${owner}','${key}','${event}',public.quicklog_event_request_hash_pre_logged_at(
    '${grow}','note',null,null,'legacy utc proof',null,${INSTANT},null,'{}'::jsonb,null,null));
commit;`,
    env,
    { stage: "legacy_fixture", spawnImpl },
  );
}

function legacyRetry(env, spawnImpl, key, tz) {
  const raw = executeSql(
    `begin; set local statement_timeout='10s'; set local timezone='${zone(tz)}';
set local request.jwt.claim.sub='${owner}'; set local role authenticated;
select public.quicklog_save_event('${key}', '${grow}', 'note', null, null, 'legacy utc proof', null, null,
  ${INSTANT}, '{}'::jsonb, null, null);
select current_setting('TimeZone');
commit;`,
    env,
    { stage: "legacy_call", spawnImpl },
  );
  const [receiptLine, tzLine] = raw.split(/\r?\n/);
  if (tzLine !== tz) throw new Error("legacy_call:caller_time_zone_not_restored");
  try {
    return JSON.parse(receiptLine);
  } catch {
    throw new Error("legacy_call:invalid_receipt");
  }
}

function prepare(env, spawnImpl) {
  const delegate = extractDefinition(
    sqlFile("20260725023000_core_schema_forward_repair.sql"),
    "CREATE OR REPLACE FUNCTION public.quicklog_save_event(",
  );
  const originalWrapper = extractDefinition(
    sqlFile(foundation),
    "CREATE FUNCTION public.quicklog_save_event(",
  );
  const hash = extractDefinition(
    sqlFile(foundation),
    "CREATE FUNCTION public.quicklog_event_request_hash_pre_logged_at(",
  );
  resetScaffold(env, spawnImpl);
  executeSql(
    `begin;
alter table public.grow_events add column is_deleted boolean not null default false;
alter table public.diary_entries add column retracted_at timestamptz;
${delegate}
alter function public.quicklog_save_event(${signature}) rename to quicklog_save_event_pre_logged_at;
revoke all on function public.quicklog_save_event_pre_logged_at(${signature}) from public,anon,authenticated,service_role;
${originalWrapper}
revoke all on function public.quicklog_save_event(${signature}) from public,anon;
grant execute on function public.quicklog_save_event(${signature}) to authenticated,service_role;
${hash}
revoke all on function public.quicklog_event_request_hash_pre_logged_at(${helperSignature}) from public,anon,authenticated;
grant execute on function public.quicklog_event_request_hash_pre_logged_at(${helperSignature}) to service_role;
-- Harness-only fault: aborts inside the delegate, outside its own handler,
-- so the wrapper's block must roll back (and with it the TimeZone switch).
create function public.harness_force_abort() returns trigger language plpgsql as $$
begin
  if new.idempotency_key = '${FORCE_ABORT_KEY}' and new.status = 'save_started' then
    raise exception 'harness forced abort';
  end if;
  return new;
end $$;
create trigger harness_force_abort before insert on public.quicklog_audit_events
  for each row execute function public.harness_force_abort();
commit;`,
    env,
    { stage: "real_function_fixture", spawnImpl },
  );
}

export async function runEventRequestHashUtcHarness({
  url = process.env.QUICKLOG_EVENT_REPLAY_LOCK_PG15_URL,
  containerId = process.env.QUICKLOG_EVENT_REPLAY_LOCK_PG15_CONTAINER,
  containerRuntime = process.env.QUICKLOG_EVENT_REPLAY_LOCK_PG15_CONTAINER_RUNTIME,
  spawnImpl = spawnSync,
  repairSql,
} = {}) {
  const connection = validateLocalTarget({ url, containerId, containerRuntime });
  if (!connection) {
    process.stderr.write("Event request hash UTC PG15: database_target_rejected\n");
    return 1;
  }
  const env = psqlEnvironment(connection, containerId, containerRuntime);
  let stage = "target_attestation";
  let passed = 0;
  const pass = () => {
    passed += 1;
  };
  try {
    attestDisposableTarget(env, spawnImpl);
    stage = "pinned_source";
    const migration = pinned(MIGRATION_FILE, MIGRATION_SHA256, "migration_byte_pin_mismatch");
    const forward = pinned(
      FORWARD_MIGRATION_FILE,
      FORWARD_MIGRATION_SHA256,
      "forward_migration_byte_pin_mismatch",
    );
    const repair = repairSql ?? pinnedUtcHashSql();

    stage = "event_replay_chain";
    prepare(env, spawnImpl);
    executeSql(migration, env, { stage: "pinned_event_replay_migration", spawnImpl });
    executeSql(forward, env, { stage: "pinned_forward_migration", spawnImpl });

    stage = "legacy_session_dependence";
    const expectedUtc = utcSessionHash(env, spawnImpl);
    const utcOrigin = freshSave(env, spawnImpl, "utc_origin", {
      key: "event-utc-origin",
      tz: "UTC",
    });
    if (storedHash(env, spawnImpl, "event-utc-origin") !== expectedUtc)
      throw new Error("utc_origin:hash_not_utc_session_form");
    // Defect witness on the accepted wrapper: same instant, new session zone, refused.
    expectReceipt(
      "legacy_cross_zone_retry",
      save(env, spawnImpl, { key: "event-utc-origin", tz: "America/New_York" }),
      { ok: false, reason: "idempotency_key_conflict" },
    );
    pass();
    const nullOrigin = freshSave(env, spawnImpl, "null_origin", {
      key: "event-utc-null-origin",
      tz: "UTC",
      occurred: "null::timestamptz",
    });
    const nullHash = storedHash(env, spawnImpl, "event-utc-null-origin");
    // logged_at alone makes a NULL occurred_at request zone-dependent too.
    expectReceipt(
      "legacy_null_cross_zone_retry",
      save(env, spawnImpl, {
        key: "event-utc-null-origin",
        tz: "Pacific/Chatham",
        occurred: "null::timestamptz",
      }),
      { ok: false, reason: "idempotency_key_conflict" },
    );
    pass();
    const nyOrigin = freshSave(env, spawnImpl, "ny_origin", {
      key: "event-utc-ny-origin",
      tz: "America/New_York",
    });
    if (storedHash(env, spawnImpl, "event-utc-ny-origin") === expectedUtc)
      throw new Error("ny_origin:hash_not_session_specific");
    const legacyUtcEvent = "77777777-7777-4777-8777-777777777777";
    const legacyNyEvent = "88888888-8888-4888-8888-888888888888";
    legacyMirrorlessRow(env, spawnImpl, {
      key: "event-utc-legacy-utc",
      event: legacyUtcEvent,
      tz: "UTC",
    });
    legacyMirrorlessRow(env, spawnImpl, {
      key: "event-utc-legacy-ny",
      event: legacyNyEvent,
      tz: "America/New_York",
    });
    expectReceipt(
      "legacy_helper_cross_zone_retry",
      legacyRetry(env, spawnImpl, "event-utc-legacy-utc", "Asia/Kolkata"),
      { ok: false, reason: "idempotency_receipt_missing" },
    );
    pass();

    stage = "repair_migration";
    const identity = executeSql(identitySql, env, { stage: "identity_before", spawnImpl });
    executeSql(repair, env, { stage: "utc_hash_migration", spawnImpl });
    if (executeSql(identitySql, env, { stage: "identity_after", spawnImpl }) !== identity)
      throw new Error("event_wrapper_privileges_changed");
    pass();

    stage = "utc_stored_hash_retries";
    for (const tz of ["America/New_York", "Asia/Kolkata", "Pacific/Chatham", "UTC"])
      expectReceipt(`utc_origin_${tz}`, save(env, spawnImpl, { key: "event-utc-origin", tz }), {
        ok: true,
        reused: true,
        event: utcOrigin,
      });
    expectReceipt(
      "same_instant_offset_literal",
      save(env, spawnImpl, {
        key: "event-utc-origin",
        tz: "Asia/Kolkata",
        occurred: "'2026-01-01T05:00:00-05:00'::timestamptz",
      }),
      { ok: true, reused: true, event: utcOrigin },
    );
    pass();

    stage = "null_retries";
    expectReceipt(
      "null_origin_other_zone",
      save(env, spawnImpl, {
        key: "event-utc-null-origin",
        tz: "Pacific/Chatham",
        occurred: "null::timestamptz",
      }),
      { ok: true, reused: true, event: nullOrigin },
    );
    if (storedHash(env, spawnImpl, "event-utc-null-origin") !== nullHash)
      throw new Error("null_origin:hash_changed");
    pass();

    stage = "session_stored_hash_retries";
    expectReceipt(
      "ny_origin_same_zone",
      save(env, spawnImpl, { key: "event-utc-ny-origin", tz: "America/New_York" }),
      { ok: true, reused: true, event: nyOrigin },
    );
    // Documented residual: a pre-repair non-UTC hash verifies only from its own offset.
    expectReceipt(
      "ny_origin_other_zone",
      save(env, spawnImpl, { key: "event-utc-ny-origin", tz: "UTC" }),
      { ok: false, reason: "idempotency_key_conflict" },
    );
    pass();

    stage = "legacy_helper_retries";
    expectReceipt(
      "legacy_utc_from_kolkata",
      legacyRetry(env, spawnImpl, "event-utc-legacy-utc", "Asia/Kolkata"),
      { ok: true, reused: true, event: legacyUtcEvent },
    );
    expectReceipt(
      "legacy_ny_same_zone",
      legacyRetry(env, spawnImpl, "event-utc-legacy-ny", "America/New_York"),
      { ok: true, reused: true, event: legacyNyEvent },
    );
    // Residual: a non-UTC legacy hash retried from another offset stays refused.
    for (const tz of ["UTC", "Asia/Kolkata"])
      expectReceipt(
        `legacy_ny_from_${tz}`,
        legacyRetry(env, spawnImpl, "event-utc-legacy-ny", tz),
        { ok: false, reason: "idempotency_receipt_missing" },
      );
    pass();

    stage = "new_rows_store_utc_form";
    freshSave(env, spawnImpl, "kolkata_new", { key: "event-utc-kolkata-new", tz: "Asia/Kolkata" });
    if (storedHash(env, spawnImpl, "event-utc-kolkata-new") !== expectedUtc)
      throw new Error("kolkata_new:hash_not_utc_session_form");
    expectReceipt(
      "kolkata_new_retry",
      save(env, spawnImpl, { key: "event-utc-kolkata-new", tz: "America/New_York" }),
      { ok: true, reused: true },
    );
    const edgeEvent = freshSave(env, spawnImpl, "edge", {
      key: "event-utc-edge",
      tz: "Pacific/Chatham",
      occurred: EDGE_INSTANT,
    });
    if (
      storedHash(env, spawnImpl, "event-utc-edge") !==
      utcSessionHash(env, spawnImpl, { occurred: EDGE_INSTANT })
    )
      throw new Error("edge:hash_not_utc_session_form");
    expectReceipt(
      "edge_retry",
      save(env, spawnImpl, { key: "event-utc-edge", tz: "UTC", occurred: EDGE_INSTANT }),
      { ok: true, reused: true, event: edgeEvent },
    );
    pass();

    stage = "changed_requests_refused";
    expectReceipt(
      "changed_instant",
      save(env, spawnImpl, {
        key: "event-utc-origin",
        tz: "UTC",
        occurred: "'2026-01-01T10:00:01Z'::timestamptz",
      }),
      { ok: false, reason: "idempotency_key_conflict" },
    );
    expectReceipt(
      "changed_note",
      save(env, spawnImpl, { key: "event-utc-origin", tz: "America/New_York", note: "changed" }),
      { ok: false, reason: "idempotency_key_conflict" },
    );
    for (const key of ["event-utc-origin", "event-utc-ny-origin", "event-utc-null-origin"])
      if (!singleRow(env, spawnImpl, key)) throw new Error("changed_requests:row_count_changed");
    pass();

    stage = "aborted_delegate_restores_zone";
    expectReceipt(
      "forced_abort",
      save(env, spawnImpl, { key: FORCE_ABORT_KEY, tz: "Pacific/Chatham" }),
      { ok: false, reason: "save_failed" },
    );
    if (
      executeSql(
        `select count(*)=0 from public.quicklog_idempotency where idempotency_key='${FORCE_ABORT_KEY}';`,
        env,
        { stage: "forced_abort_rows", spawnImpl },
      ) !== "t"
    )
      throw new Error("forced_abort:row_written");
    pass();

    stage = "pinned_source_and_acl";
    if (executeSql(sourceSql, env, { stage: "wrapper_source", spawnImpl }) !== UTC_HASH_WRAPPER_MD5)
      throw new Error("wrapper_source_unexpected");
    if (
      executeSql(
        `select not has_function_privilege('anon','public.quicklog_save_event(${signature})'::regprocedure,'EXECUTE')
and has_function_privilege('authenticated','public.quicklog_save_event(${signature})'::regprocedure,'EXECUTE');`,
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
      `Event request hash UTC PG15: ${passed} passed, 0 failed (legacy zone conflicts witnessed, NULL occurred_at included; UTC-stored, NULL, same-zone, legacy-helper and edge retries accepted; cross-zone residuals and changed requests refused; aborted delegate restores the caller zone; ACL and preflight drift fenced)\n`,
    );
    return 0;
  } catch (error) {
    // Fixed stage and SQLSTATE only: no raw psql output or exception message.
    const sqlState = error instanceof Error && /:([0-9A-Z]{5}|unknown)$/.exec(error.message)?.[1];
    process.stderr.write(
      `Event request hash UTC PG15: ${stage}:proof_failed${sqlState ? ` sqlstate=${sqlState}` : ""}\n`,
    );
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exit(await runEventRequestHashUtcHarness());
