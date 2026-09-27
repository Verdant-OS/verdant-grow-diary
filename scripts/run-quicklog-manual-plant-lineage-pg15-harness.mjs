#!/usr/bin/env node
/** Disposable PostgreSQL 15 proof for same-owner, cross-grow plant Quick Logs. */
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
const database =
  "postgresql://postgres:verdant-runtime-only@127.0.0.1:5432/verdant_quicklog_delegate_repair";
const owner = "11111111-1111-4111-8111-111111111111";
const plant = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const originalGrow = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const originalTent = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const otherOwnedGrow = "33333333-3333-4333-8333-333333333333";
const otherOwnedTent = "44444444-4444-4444-8444-444444444444";
const migration = "20260927160000_quicklog_manual_plant_tent_lineage.sql";
const migrationSha256 = "f39608859f07708ce9575b9faef4780f8dbbc20472e5d0c06aedcfa5e7a1529a";
const signature =
  "text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb, text, text";

function sqlFile(name) {
  const sql = readFileSync(resolve(root, "supabase/migrations", name), "utf8").replace(
    /\r\n/g,
    "\n",
  );
  if (!/^BEGIN;\n/m.test(sql) || !/COMMIT;\nNOTIFY pgrst, 'reload schema';\n$/.test(sql)) {
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
  spawnImpl = spawnSync,
} = {}) {
  const connection = validateLocalTarget({ url, containerId, containerRuntime });
  if (!connection) {
    process.stderr.write("Quick Log plant lineage PG15 harness failed: database_target_rejected\n");
    return 1;
  }
  const env = psqlEnvironment(connection, containerId, containerRuntime);
  try {
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
    executeSql(sqlFile("20260927002000_quicklog_manual_reuse_fence.sql"), env, {
      stage: "manual_reuse_parent",
      spawnImpl,
    });
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
    const sql = sqlFile(migration);
    if (createHash("sha256").update(sql).digest("hex") !== migrationSha256) {
      throw new Error("migration_fingerprint_mismatch");
    }
    executeSql(sql, env, { stage: "plant_lineage_apply", spawnImpl });

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
    const valid = call("plant-lineage-valid-0001", env, spawnImpl);
    if (valid.ok !== true || valid.reused !== false) throw new Error("same_grow_save_failed");
    requireTrue(
      "valid_lineage_persisted",
      `select grow_id='${originalGrow}' and tent_id='${originalTent}'
       from public.grow_events where id='${valid.grow_event_id}';`,
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
  process.stdout.write("Quick Log plant lineage PG15 harness PASS (8 assertions)\n");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = await runPlantLineageHarness();
}
