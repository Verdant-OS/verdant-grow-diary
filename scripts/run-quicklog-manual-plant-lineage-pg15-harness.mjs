#!/usr/bin/env node
/** Disposable PostgreSQL 15 proof for same-owner, cross-grow plant Quick Logs. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MANUAL_DELIVERY_ORDER,
  validManualDeliveryOrder,
  assertManualDeliveryStep,
  MANUAL_DELIVERY_FILES,
  buildManualDeliveryStepSql,
} from "./lib/quicklogManualDeliveryOrder.mjs";
export { MANUAL_DELIVERY_ORDER, validManualDeliveryOrder };
import {
  attestDisposableTarget,
  disposableConnection,
  executeSql,
  psqlEnvironment,
  resetScaffold,
} from "./run-quicklog-manual-delegate-forward-repair-pg15-harness.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const owner = "11111111-1111-4111-8111-111111111111";
const plant = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const originalGrow = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const originalTent = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const otherOwnedGrow = "33333333-3333-4333-8333-333333333333";
const otherOwnedTent = "44444444-4444-4444-8444-444444444444";
const deliveryFiles = MANUAL_DELIVERY_FILES;

export function loadManualDeliverySql(migrationRoot = resolve(root, "supabase/migrations")) {
  return deliveryFiles.map(({ file, sha256 }) => {
    const sql = sqlFile(file, migrationRoot);
    if (createHash("sha256").update(sql).digest("hex") !== sha256) {
      throw new Error("migration_fingerprint_mismatch");
    }
    return sql;
  });
}

export function deliverManualMigration({ order, completed, version, sql, env, spawnImpl }) {
  const next = assertManualDeliveryStep({ order, completed, version });
  const guardedSql = buildManualDeliveryStepSql({ order, version, sql });
  executeSql(guardedSql, env, { stage: `manual_delivery_${version}`, spawnImpl });
  return next;
}

// Only a script error with the exact PostgreSQL refusal is a negative witness.
// Connection/process failures and unrelated SQL errors must fail the proof.
function requireSqlRefusal({ stage, expectedMessage, run, spawnImpl }) {
  let result;
  try {
    run((...args) => {
      result = spawnImpl(...args);
      return result;
    });
  } catch {
    const expectedError =
      typeof result?.stderr === "string" &&
      result.stderr.split(/\r?\n/).some((line) => {
        const match = /^(?:psql:[^\r\n]*:\d+:\s*)?ERROR:\s+(?:P0001:\s+)?([a-z_]+)$/.exec(
          line.trim(),
        );
        return match?.[1] === expectedMessage;
      });
    if (result?.status === 3 && !result.error && !result.signal && expectedError) return;
    throw new Error(stage + ":expected_sql_refusal_missing");
  }
  throw new Error(stage + ":unexpected_success");
}

// Fingerprint every relation's data and catalog definition in the disposable scaffold.
// SQL refusals must leave this covered persistent state unchanged; they do execute SQL.
export const DELIVERY_DATABASE_SNAPSHOT_SQL = `select md5(jsonb_build_object(
  'relations', (select jsonb_agg(to_jsonb(c) order by c.oid) from pg_class c
    join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','supabase_migrations')),
  'columns', (select jsonb_agg(to_jsonb(a) order by a.attrelid,a.attnum) from pg_attribute a
    join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','auth','supabase_migrations')),
  'functions', (select jsonb_agg(to_jsonb(p) order by p.oid) from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','auth','supabase_migrations')),
  'constraints', (select jsonb_agg(to_jsonb(k) order by k.oid) from pg_constraint k
    join pg_namespace n on n.oid=k.connamespace where n.nspname in ('public','auth','supabase_migrations')),
  'triggers', (select jsonb_agg(to_jsonb(t) order by t.oid) from pg_trigger t
    join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','auth','supabase_migrations')),
  'policies', (select jsonb_agg(to_jsonb(p) order by p.oid) from pg_policy p
    join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','auth','supabase_migrations')),
  'data', (select jsonb_agg(jsonb_build_object('table',format('%I.%I',n.nspname,c.relname),
    'rows',query_to_xml(format('select to_jsonb(t) from %I.%I t order by to_jsonb(t)::text',n.nspname,c.relname),
      true,false,'')::text) order by n.nspname,c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p') and n.nspname in ('public','auth','supabase_migrations'))
)::text);`;
const signature =
  "text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb, text, text";

function proveDeliveryAclRefusals(input) {
  const { env, spawnImpl, version } = input;
  const cases = [
    ["wrapper_extra_grantee", "quicklog_save_manual", "quicklog_delegate_probe", false],
    [
      "delegate_extra_grantee",
      "quicklog_save_manual_pre_logged_at",
      "quicklog_delegate_probe",
      false,
    ],
    ["wrapper_grant_option", "quicklog_save_manual", "authenticated", true],
  ];
  for (const [name, fn, role, grantOption] of cases) {
    const stage = `acl_${version}_${name}`;
    const original = executeSql(DELIVERY_DATABASE_SNAPSHOT_SQL, env, {
      stage: `${stage}_original`,
      spawnImpl,
    });
    executeSql(
      `grant execute on function public.${fn}(${signature}) to ${role}${grantOption ? " with grant option" : ""};`,
      env,
      { stage: `${stage}_inject`, spawnImpl },
    );
    try {
      const before = executeSql(DELIVERY_DATABASE_SNAPSHOT_SQL, env, {
        stage: `${stage}_before`,
        spawnImpl,
      });
      requireSqlRefusal({
        stage,
        expectedMessage: "delivery_order_rejected",
        spawnImpl,
        run: (observedSpawn) => deliverManualMigration({ ...input, spawnImpl: observedSpawn }),
      });
      const after = executeSql(DELIVERY_DATABASE_SNAPSHOT_SQL, env, {
        stage: `${stage}_after`,
        spawnImpl,
      });
      if (!/^[0-9a-f]{32}$/.test(before) || after !== before) {
        throw new Error(`${stage}:changed_database`);
      }
    } finally {
      executeSql(
        `revoke ${grantOption ? "grant option for " : ""}execute on function public.${fn}(${signature}) from ${role};`,
        env,
        { stage: `${stage}_restore`, spawnImpl },
      );
    }
    const restored = executeSql(DELIVERY_DATABASE_SNAPSHOT_SQL, env, {
      stage: `${stage}_restored`,
      spawnImpl,
    });
    if (!/^[0-9a-f]{32}$/.test(original) || restored !== original) {
      throw new Error(`${stage}:fixture_not_restored`);
    }
  }
}

function sqlFile(name, migrationRoot = resolve(root, "supabase/migrations")) {
  const sql = readFileSync(resolve(migrationRoot, name), "utf8").replace(/\r\n/g, "\n");
  if (!/^BEGIN;\n/m.test(sql) || !/COMMIT;\s*(?:NOTIFY pgrst, 'reload schema';\s*)?$/.test(sql)) {
    throw new Error("migration_shape_rejected");
  }
  return sql;
}

function requireTrue(label, sql, env, spawnImpl) {
  if (executeSql(sql, env, { stage: label, spawnImpl }) !== "t") {
    throw new Error(`${label}:false`);
  }
}

function authenticatedUpdate(tentId, env, spawnImpl) {
  const tent = tentId === null ? "null" : `'${tentId}'::uuid`;
  return executeSql(
    `begin;
set local request.jwt.claim.sub = '${owner}';
set local role authenticated;
update public.plants set tent_id=${tent} where id='${plant}' returning id;
commit;`,
    env,
    { stage: "authenticated_plant_update", spawnImpl },
  );
}

function call(key, env, spawnImpl) {
  const raw = executeSql(
    `begin;
set local request.jwt.claim.sub = '${owner}';
set local role authenticated;
select public.quicklog_save_manual(
  'plant', '${plant}'::uuid, 'note', null, 'lineage proof',
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

function setupSameOwnerRls(env, spawnImpl) {
  executeSql(
    `insert into public.grows(id,user_id) values ('${otherOwnedGrow}','${owner}');
insert into public.tents(id,user_id,grow_id) values
  ('${otherOwnedTent}','${owner}','${otherOwnedGrow}');
alter table public.grows enable row level security;
alter table public.tents enable row level security;
alter table public.plants enable row level security;
grant select on public.grows, public.tents to authenticated;
grant select, update on public.plants to authenticated;
create policy "Users view own grows" on public.grows for select to authenticated
  using (auth.uid() = user_id);
create policy "Users view own tents" on public.tents for select to authenticated
  using (auth.uid() = user_id);
create policy "Users view own plants" on public.plants for select to authenticated
  using (auth.uid() = user_id);
create policy "Users update own plants" on public.plants for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (grow_id is null or exists (
      select 1 from public.grows g where g.id = grow_id and g.user_id = auth.uid()
    ))
    and (tent_id is null or exists (
      select 1 from public.tents t where t.id = tent_id and t.user_id = auth.uid()
    ))
  );`,
    env,
    { stage: "same_owner_rls_fixture", spawnImpl },
  );
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

export async function runPlantLineageHarness({
  url = process.env.QUICKLOG_MANUAL_LINEAGE_PG15_URL,
  containerId = process.env.QUICKLOG_MANUAL_LINEAGE_PG15_CONTAINER,
  containerRuntime = process.env.QUICKLOG_MANUAL_LINEAGE_PG15_CONTAINER_RUNTIME,
  deliveryOrder = MANUAL_DELIVERY_ORDER,
  spawnImpl = spawnSync,
} = {}) {
  if (!validManualDeliveryOrder(deliveryOrder)) {
    process.stderr.write("Quick Log plant lineage PG15 harness failed: delivery_order_rejected\n");
    return 1;
  }
  const connection = validateLocalTarget({ url, containerId, containerRuntime });
  if (!connection) {
    process.stderr.write("Quick Log plant lineage PG15 harness failed: database_target_rejected\n");
    return 1;
  }
  const env = psqlEnvironment(connection, containerId, containerRuntime);
  try {
    // Validate every immutable input before even the disposable reset.
    const [reuseSql, lineageSql, metadataSql] = loadManualDeliverySql();
    attestDisposableTarget(env, spawnImpl);
    resetScaffold(env, spawnImpl);
    executeSql(sqlFile("20260818010000_quicklog_manual_delegate_forward_repair.sql"), env, {
      stage: "delegate_repair",
      spawnImpl,
    });
    executeSql(
      "alter table public.grow_events add column is_deleted boolean not null default false;",
      env,
      { stage: "retraction_fixture", spawnImpl },
    );
    executeSql("alter table public.diary_entries add column retracted_at timestamptz;", env, {
      stage: "diary_retraction_fixture",
      spawnImpl,
    });
    const reverseBefore = executeSql(DELIVERY_DATABASE_SNAPSHOT_SQL, env, {
      stage: "reverse_order_database_before",
      spawnImpl,
    });
    let reverseRejected = false;
    try {
      deliverManualMigration({
        order: deliveryOrder,
        completed: [],
        version: MANUAL_DELIVERY_ORDER[2],
        sql: metadataSql,
        env,
        spawnImpl,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "delivery_order_rejected")
        reverseRejected = true;
      else throw error;
    }
    if (!reverseRejected) throw new Error("reverse_order_accepted");
    // Defense in depth: bypassing the delivery gate still cannot commit 183000
    // before its required parent. Stop at its first error, as an operator must.
    requireSqlRefusal({
      stage: "reverse_metadata_before_parent",
      expectedMessage: "quicklog_manual_metadata_lock_preflight_unrecognized",
      spawnImpl,
      run: (observedSpawn) =>
        executeSql(metadataSql, env, {
          stage: "reverse_metadata_before_parent",
          spawnImpl: observedSpawn,
        }),
    });
    const reverseAfter = executeSql(DELIVERY_DATABASE_SNAPSHOT_SQL, env, {
      stage: "reverse_order_database_after",
      spawnImpl,
    });
    if (!/^[0-9a-f]{32}$/.test(reverseBefore) || reverseAfter !== reverseBefore) {
      throw new Error("reverse_order_changed_database");
    }
    const sql = lineageSql;
    requireSqlRefusal({
      stage: "lineage_before_parent",
      expectedMessage: "quicklog_manual_lineage_preflight_unrecognized",
      spawnImpl,
      run: (observedSpawn) =>
        executeSql(sql, env, { stage: "lineage_before_parent", spawnImpl: observedSpawn }),
    });
    requireTrue(
      "missing_parent_left_delegate_unchanged",
      `select md5(replace(prosrc, E'\\r', ''))='7ec296e422f7f47c8b2793b051840798'
       from pg_proc where oid='public.quicklog_save_manual_pre_logged_at(${signature})'::regprocedure;`,
      env,
      spawnImpl,
    );
    const reuseInput = {
      order: deliveryOrder,
      completed: [],
      version: MANUAL_DELIVERY_ORDER[0],
      sql: reuseSql,
      env,
      spawnImpl,
    };
    proveDeliveryAclRefusals(reuseInput);
    let completed = deliverManualMigration(reuseInput);
    // A fabricated completed prefix must not permit skipping 160000. The old
    // 183000 source preflight accepts this wrapper; the delivery catalog gate must not.
    const skippedBefore = executeSql(DELIVERY_DATABASE_SNAPSHOT_SQL, env, {
      stage: "skipped_lineage_database_before",
      spawnImpl,
    });
    requireSqlRefusal({
      stage: "skipped_lineage",
      expectedMessage: "delivery_order_rejected",
      spawnImpl,
      run: (observedSpawn) =>
        deliverManualMigration({
          order: deliveryOrder,
          completed: MANUAL_DELIVERY_ORDER.slice(0, 2),
          version: MANUAL_DELIVERY_ORDER[2],
          sql: metadataSql,
          env,
          spawnImpl: observedSpawn,
        }),
    });
    const skippedAfter = executeSql(DELIVERY_DATABASE_SNAPSHOT_SQL, env, {
      stage: "skipped_lineage_database_after",
      spawnImpl,
    });
    if (!/^[0-9a-f]{32}$/.test(skippedBefore) || skippedAfter !== skippedBefore) {
      throw new Error("skipped_lineage_changed_database");
    }
    setupSameOwnerRls(env, spawnImpl);

    // The existing same-owner policies permit this cross-grow tent assignment.
    if (authenticatedUpdate(otherOwnedTent, env, spawnImpl) !== plant) {
      throw new Error("same_owner_cross_grow_update_not_reproduced");
    }
    const before = call("plant-lineage-baseline-0001", env, spawnImpl);
    if (before.ok !== true || before.reused !== false) {
      throw new Error("baseline_wrong_target_save_not_reproduced");
    }
    requireTrue(
      "baseline_mixed_row",
      `select grow_id='${originalGrow}' and tent_id='${otherOwnedTent}'
       from public.grow_events where id='${before.grow_event_id}';`,
      env,
      spawnImpl,
    );
    const delegateBefore = executeSql(
      `select oid::text from pg_proc where
       oid='public.quicklog_save_manual_pre_logged_at(${signature})'::regprocedure;`,
      env,
      { stage: "delegate_identity_before", spawnImpl },
    );
    const lineageInput = {
      order: deliveryOrder,
      completed,
      version: MANUAL_DELIVERY_ORDER[1],
      sql,
      env,
      spawnImpl,
    };
    proveDeliveryAclRefusals(lineageInput);
    completed = deliverManualMigration(lineageInput);
    const metadataInput = {
      order: deliveryOrder,
      completed,
      version: MANUAL_DELIVERY_ORDER[2],
      sql: metadataSql,
      env,
      spawnImpl,
    };
    proveDeliveryAclRefusals(metadataInput);
    deliverManualMigration(metadataInput);
    requireTrue(
      "full_chain_wrapper_identity_and_grants",
      `select md5(replace(prosrc, E'\\r', ''))='1875cf01f7d1aa843d4b8ad080f9bcb2'
        and not has_function_privilege('anon', oid, 'EXECUTE')
        and has_function_privilege('authenticated', oid, 'EXECUTE')
        and has_function_privilege('service_role', oid, 'EXECUTE')
       from pg_proc where oid='public.quicklog_save_manual(${signature})'::regprocedure;`,
      env,
      spawnImpl,
    );

    const rejected = call("plant-lineage-rejected-0001", env, spawnImpl);
    if (rejected.ok !== false || rejected.reason !== "plant_tent_grow_mismatch") {
      throw new Error("mixed_plant_not_rejected");
    }
    requireTrue(
      "rejection_wrote_no_rows",
      `select not exists (select 1 from public.quicklog_idempotency
       where idempotency_key='plant-lineage-rejected-0001')
       and (select count(*)=1 from public.grow_events where user_id='${owner}')
       and (select count(*)=1 from public.diary_entries where user_id='${owner}');`,
      env,
      spawnImpl,
    );
    if (authenticatedUpdate(originalTent, env, spawnImpl) !== plant) {
      throw new Error("same_grow_update_failed");
    }
    // The rejected attempt did not claim its key. Repairing the assignment
    // must let that exact logical submission save once, then reuse that row.
    const valid = call("plant-lineage-rejected-0001", env, spawnImpl);
    if (valid.ok !== true || valid.reused !== false) throw new Error("same_grow_save_failed");
    requireTrue(
      "valid_lineage_persisted",
      `select grow_id='${originalGrow}' and tent_id='${originalTent}'
       from public.grow_events where id='${valid.grow_event_id}';`,
      env,
      spawnImpl,
    );
    const replay = call("plant-lineage-rejected-0001", env, spawnImpl);
    if (
      replay.ok !== true ||
      replay.reused !== true ||
      replay.grow_event_id !== valid.grow_event_id
    ) {
      throw new Error("same_grow_exact_retry_failed");
    }
    requireTrue(
      "repair_retry_one_row",
      `select (select count(*)=1 from public.quicklog_idempotency
         where user_id='${owner}' and idempotency_key='plant-lineage-rejected-0001')
       and (select count(*)=2 from public.grow_events where user_id='${owner}')
       and (select count(*)=2 from public.diary_entries where user_id='${owner}');`,
      env,
      spawnImpl,
    );
    if (authenticatedUpdate(null, env, spawnImpl) !== plant) {
      throw new Error("unassigned_update_failed");
    }
    const unassigned = call("plant-lineage-unassigned-0001", env, spawnImpl);
    if (unassigned.ok !== true || unassigned.reused !== false) {
      throw new Error("unassigned_save_failed");
    }
    requireTrue(
      "unassigned_lineage_persisted",
      `select grow_id='${originalGrow}' and tent_id is null
       from public.grow_events where id='${unassigned.grow_event_id}';`,
      env,
      spawnImpl,
    );
    requireTrue(
      "delegate_identity_and_acl_preserved",
      `select oid::text='${delegateBefore}'
         and not has_function_privilege('anon', oid, 'EXECUTE')
         and not has_function_privilege('authenticated', oid, 'EXECUTE')
       from pg_proc where oid='public.quicklog_save_manual_pre_logged_at(${signature})'::regprocedure;`,
      env,
      spawnImpl,
    );
  } catch (error) {
    process.stderr.write(
      `Quick Log plant lineage PG15 harness failed: ${error instanceof Error ? error.message : "unknown"}\n`,
    );
    return 1;
  }
  process.stdout.write(
    "Quick Log plant lineage PG15 harness PASS: full chain 002000 -> 160000 -> 183000; reverse and skipped-lineage refused, covered persistent state unchanged\n",
  );
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = await runPlantLineageHarness();
}
