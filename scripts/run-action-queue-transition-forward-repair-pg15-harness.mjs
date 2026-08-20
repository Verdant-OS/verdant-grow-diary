#!/usr/bin/env node
/** Local-only PostgreSQL 15 runtime harness for the Action Queue transition repair. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildLedgerInsertSql,
  CATALOG_STATE_QUERY_SQL,
  classifyPreflight,
  parsePreflightStdout,
} from "./apply-action-queue-transition-forward-repair.mjs";

const MAX_PSQL_OUTPUT_BYTES = 1_048_576;
const DISPOSABLE_DATABASE = "verdant_action_queue_transition_repair";
const DISPOSABLE_DATABASE_USER = "postgres";
const DISPOSABLE_DATABASE_PORT = "5432";
const DISPOSABLE_SENTINEL = "verdant_action_queue_transition_repair_pg15_disposable_v1";
const MIGRATION_SUFFIX = "_action_queue_transition_forward_repair.sql";
const PINNED_MIGRATION_FILE = "20260819190852_action_queue_transition_forward_repair.sql";
const EXPECTED_MIGRATION_SHA256 =
  "fb887c43be86affc39e59c2113e1d627053a6058e2b8de06a6571d9f34f66c49";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_GROW_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER_TENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER_PLANT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const LEGACY_PLANT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OTHER_GROW_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const OTHER_TENT_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const ACTION_ID = "10000000-0000-4000-8000-000000000001";
const ILLEGAL_ACTION_ID = "10000000-0000-4000-8000-000000000002";

function fail(code) {
  process.stderr.write(`Action Queue transition PG15 harness failed: ${code}\n`);
  return 1;
}

export function buildPsqlArgs() {
  return ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"];
}

export function formatPsqlFailureCode(stage, stderr) {
  const value = String(stderr ?? "");
  const labeled = /(?:SQL state|SQLSTATE)[: ]+([0-9A-Z]{5})/i.exec(value)?.[1];
  const verbose = /^ERROR:\s+([0-9A-Z]{5})(?::|\s|$)/m.exec(value)?.[1];
  return `${stage}:${(labeled ?? verbose)?.toUpperCase() ?? "unknown"}`;
}

function disposableConnection(value) {
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
    PGAPPNAME: "verdant-action-queue-transition-repair-pg15-harness",
    ACTION_QUEUE_TRANSITION_REPAIR_PG15_CONTAINER: containerId ?? "",
    ACTION_QUEUE_TRANSITION_REPAIR_PG15_CONTAINER_RUNTIME: containerRuntime ?? "docker",
  };
}

function psqlCommand(env, args) {
  const containerId = env.ACTION_QUEUE_TRANSITION_REPAIR_PG15_CONTAINER;
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
  if (env.ACTION_QUEUE_TRANSITION_REPAIR_PG15_CONTAINER_RUNTIME === "wsl-docker") {
    return {
      command: "wsl.exe",
      args: ["-d", "Ubuntu", "--", "docker", ...dockerArgs],
    };
  }
  return { command: "docker", args: dockerArgs };
}

function spawnPsql({ env, input, spawnImpl = spawnSync }) {
  const invocation = psqlCommand(env, buildPsqlArgs());
  return spawnImpl(invocation.command, invocation.args, {
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

function requireSqlTrue(stage, sql, env, spawnImpl = spawnSync) {
  if (executeSql(sql, env, { stage, spawnImpl }) !== "t") {
    throw new Error(`${stage}:assertion_failed`);
  }
}

function extractFunctionDefinition(relativePath, functionPrefix) {
  const source = readFileSync(resolve(repoRoot, relativePath), "utf8");
  const start = source.indexOf(functionPrefix);
  if (start < 0 || source.indexOf(functionPrefix, start + functionPrefix.length) >= 0) {
    throw new Error("dependency_source_missing_or_ambiguous");
  }
  const terminator = "\n$$;";
  const end = source.indexOf(terminator, start);
  if (end < 0) throw new Error("dependency_source_malformed");
  return source.slice(start, end + terminator.length);
}

const guardFunctionDefinition = extractFunctionDefinition(
  "supabase/migrations/20260725093000_restore_action_queue_owner_decisions.sql",
  "CREATE OR REPLACE FUNCTION public.action_queue_guard_decision_fields()",
);
const historicalTransitionMigration = readFileSync(
  resolve(repoRoot, "supabase/migrations/20260726093000_action_queue_transition_rpc.sql"),
  "utf8",
);
const historicalContractMigration = readFileSync(
  resolve(repoRoot, "supabase/migrations/20260726094000_action_queue_transition_contract.sql"),
  "utf8",
);

export function validatePinnedMigrationFile({
  root = resolve(repoRoot, "supabase", "migrations"),
} = {}) {
  const matches = readdirSync(root)
    .filter((name) => name.endsWith(MIGRATION_SUFFIX))
    .sort();
  if (matches.length !== 1 || matches[0] !== PINNED_MIGRATION_FILE) {
    throw new Error("migration_file_unrecognized");
  }
  const sql = readFileSync(resolve(root, matches[0]), "utf8");
  const sha256 = createHash("sha256").update(sql).digest("hex");
  if (sha256 !== EXPECTED_MIGRATION_SHA256) {
    throw new Error("migration_digest_unrecognized");
  }
  return Object.freeze({ fileName: matches[0], sha256, sql });
}

const BASE_SCAFFOLD_SQL = `
drop schema if exists supabase_migrations cascade;
drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema auth authorization postgres;
create schema public authorization postgres;
create schema supabase_migrations authorization postgres;
create table supabase_migrations.schema_migrations (
  version text primary key,
  name text,
  statements text[]
);
alter table supabase_migrations.schema_migrations owner to postgres;

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'create role anon nologin';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'create role authenticated nologin';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'create role service_role nologin bypassrls';
  end if;
end
$roles$;
alter role anon nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
alter role authenticated nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
alter role service_role nologin nosuperuser nocreatedb nocreaterole noinherit noreplication bypassrls;

create function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create type public.app_role as enum ('operator', 'customer');
create table public.user_roles (
  user_id uuid not null,
  role public.app_role not null,
  primary key (user_id, role)
);
create function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists(
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create table public.grows (
  id uuid primary key,
  user_id uuid not null
);
create table public.tents (
  id uuid primary key,
  user_id uuid not null,
  grow_id uuid not null references public.grows(id)
);
create table public.plants (
  id uuid primary key,
  user_id uuid not null,
  grow_id uuid,
  tent_id uuid references public.tents(id)
);

create table public.action_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  grow_id uuid not null references public.grows(id) on delete cascade,
  tent_id uuid references public.tents(id) on delete set null,
  plant_id uuid references public.plants(id) on delete set null,
  status text not null default 'pending_approval',
  approved_at timestamptz,
  rejected_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint action_queue_status_chk check (
    status in ('pending_approval','approved','rejected','simulated','completed','cancelled')
  ),
  constraint action_queue_approved_at_lifecycle_chk check (
    approved_at is null or status in ('approved','completed','cancelled')
  ),
  constraint action_queue_rejected_at_lifecycle_chk check (
    rejected_at is null or status in ('rejected','cancelled')
  )
);

create table public.action_queue_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  action_queue_id uuid not null references public.action_queue(id) on delete cascade,
  grow_id uuid not null references public.grows(id),
  event_type text not null,
  previous_status text,
  new_status text,
  note text,
  created_at timestamptz not null default now(),
  constraint action_queue_events_event_type_check check (
    event_type in ('created','simulated','approved','rejected','completed','cancelled','note')
  )
);

create function public.set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;
create trigger action_queue_set_updated_at
before update on public.action_queue
for each row execute function public.set_updated_at();

alter table public.action_queue enable row level security;
alter table public.action_queue_events enable row level security;

create policy "Users view own action_queue"
  on public.action_queue for select to authenticated
  using (auth.uid() = user_id);

create policy "Users insert own action_queue"
  on public.action_queue for insert to authenticated
  with check (
    auth.uid() = action_queue.user_id
    and exists (
      select 1 from public.grows g
      where g.id = action_queue.grow_id and g.user_id = auth.uid()
    )
    and (
      action_queue.tent_id is null or exists (
        select 1 from public.tents t
        where t.id = action_queue.tent_id
          and t.user_id = auth.uid()
          and t.grow_id = action_queue.grow_id
      )
    )
    and (
      action_queue.plant_id is null or exists (
        select 1 from public.plants p
        where p.id = action_queue.plant_id
          and p.user_id = auth.uid()
          and p.grow_id = action_queue.grow_id
      )
    )
    and (
      action_queue.plant_id is null
      or action_queue.tent_id is null
      or exists (
        select 1 from public.plants p
        where p.id = action_queue.plant_id
          and p.user_id = auth.uid()
          and p.grow_id = action_queue.grow_id
          and p.tent_id = action_queue.tent_id
      )
    )
  );

create policy "Users update own action_queue"
  on public.action_queue for update to authenticated
  using (auth.uid() = action_queue.user_id)
  with check (
    auth.uid() = action_queue.user_id
    and exists (
      select 1 from public.grows g
      where g.id = action_queue.grow_id and g.user_id = auth.uid()
    )
    and (
      action_queue.tent_id is null or exists (
        select 1 from public.tents t
        where t.id = action_queue.tent_id
          and t.user_id = auth.uid()
          and t.grow_id = action_queue.grow_id
      )
    )
    and (
      action_queue.plant_id is null or exists (
        select 1 from public.plants p
        where p.id = action_queue.plant_id
          and p.user_id = auth.uid()
          and p.grow_id = action_queue.grow_id
      )
    )
    and (
      action_queue.plant_id is null
      or action_queue.tent_id is null
      or exists (
        select 1 from public.plants p
        where p.id = action_queue.plant_id
          and p.user_id = auth.uid()
          and p.grow_id = action_queue.grow_id
          and p.tent_id = action_queue.tent_id
      )
    )
  );

create policy "Users delete own action_queue"
  on public.action_queue for delete to authenticated
  using (auth.uid() = user_id);

create policy "Users view own action_queue_events"
  on public.action_queue_events for select to authenticated
  using (auth.uid() = user_id);

create policy "Users insert own action_queue_events"
  on public.action_queue_events for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.action_queue a
      where a.id = action_queue_events.action_queue_id
        and a.user_id = auth.uid()
    )
    and exists (
      select 1 from public.grows g
      where g.id = action_queue_events.grow_id
        and g.user_id = auth.uid()
    )
  );

create policy "Users delete own action_queue_events"
  on public.action_queue_events for delete to authenticated
  using (auth.uid() = user_id);

${guardFunctionDefinition}
alter function public.action_queue_guard_decision_fields() owner to postgres;
revoke all on function public.action_queue_guard_decision_fields()
  from public, anon, authenticated, service_role;
create trigger trg_action_queue_guard_decision_fields
before update of status, approved_at, rejected_at, completed_at
on public.action_queue
for each row execute function public.action_queue_guard_decision_fields();

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select on public.grows, public.tents, public.plants to authenticated;
grant select, insert, update, delete on public.action_queue to authenticated;
grant select, insert, update, delete on public.action_queue_events to authenticated;
grant all privileges on public.action_queue, public.action_queue_events to service_role;

insert into public.grows(id,user_id) values
  ('${OWNER_GROW_ID}','${OWNER_ID}'),
  ('${OTHER_GROW_ID}','${OTHER_ID}');
insert into public.tents(id,user_id,grow_id) values
  ('${OWNER_TENT_ID}','${OWNER_ID}','${OWNER_GROW_ID}'),
  ('${OTHER_TENT_ID}','${OTHER_ID}','${OTHER_GROW_ID}');
insert into public.plants(id,user_id,grow_id,tent_id) values
  ('${OWNER_PLANT_ID}','${OWNER_ID}','${OWNER_GROW_ID}','${OWNER_TENT_ID}'),
  ('${LEGACY_PLANT_ID}','${OWNER_ID}',null,'${OWNER_TENT_ID}');
insert into public.action_queue(
  id,user_id,grow_id,tent_id,plant_id,status
) values
  ('${ACTION_ID}','${OWNER_ID}','${OWNER_GROW_ID}','${OWNER_TENT_ID}','${OWNER_PLANT_ID}','pending_approval'),
  ('${ILLEGAL_ACTION_ID}','${OWNER_ID}','${OWNER_GROW_ID}','${OWNER_TENT_ID}','${OWNER_PLANT_ID}','pending_approval');
`;

function attestDisposableTarget(env, spawnImpl) {
  const result = executeSql(
    `select case
      when current_database() = '${DISPOSABLE_DATABASE}'
       and current_user = '${DISPOSABLE_DATABASE_USER}'
       and current_setting('server_version_num')::integer >= 150000
       and current_setting('server_version_num')::integer < 160000
       and exists (
         select 1
         from verdant_action_queue_transition_repair_harness.runtime_sentinel
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

function resetScaffold(env, spawnImpl = spawnSync) {
  executeSql(`begin;\n${BASE_SCAFFOLD_SQL}\ncommit;`, env, {
    stage: "baseline_scaffold",
    spawnImpl,
  });
}

function migrationResult(env, spawnImpl = spawnSync) {
  const migration = validatePinnedMigrationFile();
  return spawnPsql({
    env,
    input: `\\set VERBOSITY verbose\n${migration.sql}`,
    spawnImpl,
  });
}

function requireMigrationSuccess(stage, env, spawnImpl = spawnSync) {
  const result = migrationResult(env, spawnImpl);
  if (result?.error || result?.status !== 0) {
    throw new Error(formatPsqlFailureCode(stage, result?.stderr));
  }
}

function requireMigrationFailure(stage, env, spawnImpl = spawnSync) {
  const result = migrationResult(env, spawnImpl);
  if (!result?.error && result?.status === 0) {
    throw new Error(`${stage}:unexpected_success`);
  }
  const failure = formatPsqlFailureCode(stage, result?.stderr);
  if (failure !== `${stage}:55000`) throw new Error(failure);
}

function catalogFingerprintSql() {
  return `select
    (select md5(lower(regexp_replace(pg_get_expr(polwithcheck,polrelid),'\\s+','','g')))
       from pg_policy where polrelid='public.action_queue'::regclass
        and polname='Users insert own action_queue'),
    (select md5(lower(regexp_replace(pg_get_expr(polwithcheck,polrelid),'\\s+','','g')))
       from pg_policy where polrelid='public.action_queue_events'::regclass
        and polname in (
          'Users insert own action_queue_events',
          'Users append own non-transition action_queue_events'
        ));`;
}

function proveLegacyBaseline(env, spawnImpl = spawnSync) {
  const fingerprint = executeSql(catalogFingerprintSql(), env, {
    stage: "legacy_fingerprint",
    spawnImpl,
  });
  if (fingerprint !== "02cf2857792d152113b7ab13fae6ca3f|e79ba22f2e33a05579e48db4b022a4a9") {
    throw new Error("legacy_fingerprint:unexpected");
  }
  requireSqlTrue(
    "legacy_surface",
    `select
      to_regprocedure('public.action_queue_transition(uuid,text,text,text)') is null
      and has_table_privilege('authenticated','public.action_queue','update')
      and has_table_privilege('authenticated','public.action_queue','delete')
      and has_table_privilege('authenticated','public.action_queue_events','update')
      and has_table_privilege('authenticated','public.action_queue_events','delete');`,
    env,
    spawnImpl,
  );
}

function requireDeliveryClassification(stage, expectedStatus, env, spawnImpl = spawnSync) {
  const raw = executeSql(CATALOG_STATE_QUERY_SQL, env, { stage, spawnImpl });
  const state = parsePreflightStdout(`${raw}\n`);
  const classification = classifyPreflight(state);
  if (classification.status !== expectedStatus) {
    throw new Error(`${stage}:unexpected_${classification.status}`);
  }
  return state;
}

function proveProtectedDeliveryRecovery(env, spawnImpl = spawnSync) {
  requireDeliveryClassification("delivery_legacy_preflight", "apply", env, spawnImpl);
  proveRepairSuccess(env, spawnImpl);
  requireDeliveryClassification(
    "delivery_canonical_ledger_absent",
    "schema_live_ledger_absent",
    env,
    spawnImpl,
  );
  executeSql(buildLedgerInsertSql(), env, { stage: "delivery_ledger_insert", spawnImpl });
  requireDeliveryClassification("delivery_verify_only", "verify_only", env, spawnImpl);
}

function proveRepairSuccess(env, spawnImpl = spawnSync) {
  requireMigrationSuccess("repair_apply", env, spawnImpl);
  const fingerprint = executeSql(catalogFingerprintSql(), env, {
    stage: "repair_fingerprint",
    spawnImpl,
  });
  if (fingerprint !== "e08f43c1f4e1308a8d50e6cab797f933|420914cd6ffbd2d552c30e8d7b6ddf73") {
    throw new Error("repair_fingerprint:unexpected");
  }
  requireSqlTrue(
    "repair_catalog",
    `select
      to_regprocedure('public.action_queue_transition(uuid,text,text,text)') is not null
      and has_function_privilege('authenticated','public.action_queue_transition(uuid,text,text,text)','execute')
      and not has_function_privilege('anon','public.action_queue_transition(uuid,text,text,text)','execute')
      and not has_function_privilege('service_role','public.action_queue_transition(uuid,text,text,text)','execute')
      and has_table_privilege('authenticated','public.action_queue','select')
      and has_table_privilege('authenticated','public.action_queue','insert')
      and has_table_privilege('authenticated','public.action_queue_events','select')
      and has_table_privilege('authenticated','public.action_queue_events','insert')
      and not has_table_privilege('anon','public.action_queue','update')
      and not has_table_privilege('anon','public.action_queue','delete')
      and not has_table_privilege('anon','public.action_queue_events','update')
      and not has_table_privilege('anon','public.action_queue_events','delete')
      and not has_table_privilege('authenticated','public.action_queue','update')
      and not has_table_privilege('authenticated','public.action_queue','delete')
      and not has_table_privilege('authenticated','public.action_queue_events','update')
      and not has_table_privilege('authenticated','public.action_queue_events','delete');`,
    env,
    spawnImpl,
  );
}

function proveHardenedGrantBaselineConverges(env, spawnImpl = spawnSync) {
  resetScaffold(env, spawnImpl);
  executeSql(
    `revoke select, insert on public.action_queue from authenticated;
     revoke select, insert on public.action_queue_events from authenticated;`,
    env,
    { stage: "hardened_grant_baseline_mutation", spawnImpl },
  );
  requireMigrationSuccess("hardened_grant_baseline_repair", env, spawnImpl);
  requireSqlTrue(
    "hardened_grant_baseline_catalog",
    `select
      has_table_privilege('authenticated','public.action_queue','select')
      and has_table_privilege('authenticated','public.action_queue','insert')
      and has_table_privilege('authenticated','public.action_queue_events','select')
      and has_table_privilege('authenticated','public.action_queue_events','insert')
      and not has_table_privilege('authenticated','public.action_queue','update')
      and not has_table_privilege('authenticated','public.action_queue','delete')
      and not has_table_privilege('authenticated','public.action_queue_events','update')
      and not has_table_privilege('authenticated','public.action_queue_events','delete');`,
    env,
    spawnImpl,
  );
}

const ROLE_SQL = Object.freeze({
  authenticated: "set local role authenticated;",
  anon: "set local role anon;",
});

function asRoleSql(role, userId, body, { commit = false } = {}) {
  const roleSql = ROLE_SQL[role];
  if (!roleSql) throw new Error("role_unrecognized");
  return `begin;
${roleSql}
set local "request.jwt.claim.role" = '${role}';
set local "request.jwt.claim.sub" = '${userId}';
${body}
${commit ? "commit;" : "rollback;"}`;
}

function proveOwnerTransitionAndRetry(env, spawnImpl = spawnSync) {
  requireSqlTrue(
    "owner_transition",
    asRoleSql(
      "authenticated",
      OWNER_ID,
      `with result as (
        select public.action_queue_transition(
          '${ACTION_ID}','approve','pending_approval','grower approved'
        ) as value
      )
      select
        (value->>'ok')::boolean
        and value->>'new_status'='approved'
        and not (value->>'reused')::boolean
      from result;`,
      { commit: true },
    ),
    env,
    spawnImpl,
  );
  requireSqlTrue(
    "owner_transition_persisted",
    `select
      (select status='approved' and approved_at is not null
       from public.action_queue where id='${ACTION_ID}')
      and (select count(*)=1 from public.action_queue_events
           where action_queue_id='${ACTION_ID}' and event_type='approved');`,
    env,
    spawnImpl,
  );
  requireSqlTrue(
    "owner_transition_retry",
    asRoleSql(
      "authenticated",
      OWNER_ID,
      `with result as (
        select public.action_queue_transition(
          '${ACTION_ID}','approve','pending_approval','grower approved'
        ) as value
      )
      select
        (value->>'ok')::boolean
        and (value->>'reused')::boolean
      from result;`,
    ),
    env,
    spawnImpl,
  );
  requireSqlTrue(
    "owner_transition_retry_count",
    `select count(*)=1 from public.action_queue_events
      where action_queue_id='${ACTION_ID}' and event_type='approved';`,
    env,
    spawnImpl,
  );
}

function proveIllegalTransitionNoWrite(env, spawnImpl = spawnSync) {
  requireSqlTrue(
    "illegal_transition",
    asRoleSql(
      "authenticated",
      OWNER_ID,
      `with result as (
        select public.action_queue_transition(
          '${ILLEGAL_ACTION_ID}','complete','pending_approval',null
        ) as value
      )
      select not (value->>'ok')::boolean
        and value->>'reason'='illegal_transition'
      from result;`,
    ),
    env,
    spawnImpl,
  );
  requireSqlTrue(
    "illegal_transition_no_write",
    `select
      (select status='pending_approval' from public.action_queue
       where id='${ILLEGAL_ACTION_ID}')
      and not exists(select 1 from public.action_queue_events
        where action_queue_id='${ILLEGAL_ACTION_ID}');`,
    env,
    spawnImpl,
  );
}

function requireSqlFailure(stage, sql, env, spawnImpl = spawnSync) {
  const result = spawnPsql({
    env,
    input: `\\set VERBOSITY verbose\n${sql}`,
    spawnImpl,
  });
  if (!result?.error && result?.status === 0) {
    throw new Error(`${stage}:unexpected_success`);
  }
}

function proveDirectMutationFences(env, spawnImpl = spawnSync) {
  requireSqlFailure(
    "direct_update",
    asRoleSql(
      "authenticated",
      OWNER_ID,
      `update public.action_queue set status='rejected' where id='${ILLEGAL_ACTION_ID}';`,
    ),
    env,
    spawnImpl,
  );
  requireSqlFailure(
    "direct_delete",
    asRoleSql(
      "authenticated",
      OWNER_ID,
      `delete from public.action_queue where id='${ILLEGAL_ACTION_ID}';`,
    ),
    env,
    spawnImpl,
  );
  requireSqlTrue(
    "direct_mutation_unchanged",
    `select status='pending_approval' from public.action_queue
      where id='${ILLEGAL_ACTION_ID}';`,
    env,
    spawnImpl,
  );
}

function proveAppendOnlyEventFence(env, spawnImpl = spawnSync) {
  requireSqlFailure(
    "direct_transition_event",
    asRoleSql(
      "authenticated",
      OWNER_ID,
      `insert into public.action_queue_events(
        user_id,action_queue_id,grow_id,event_type,previous_status,new_status,note
      ) values (
        '${OWNER_ID}','${ILLEGAL_ACTION_ID}','${OWNER_GROW_ID}',
        'approved','pending_approval','approved','forged'
      );`,
    ),
    env,
    spawnImpl,
  );
  requireSqlTrue(
    "owner_note_event",
    asRoleSql(
      "authenticated",
      OWNER_ID,
      `insert into public.action_queue_events(
        user_id,action_queue_id,grow_id,event_type,previous_status,new_status,note
      ) values (
        '${OWNER_ID}','${ILLEGAL_ACTION_ID}','${OWNER_GROW_ID}',
        'note','pending_approval','pending_approval','observe tomorrow'
      );
      select true;`,
    ),
    env,
    spawnImpl,
  );
  requireSqlFailure(
    "event_delete",
    asRoleSql(
      "authenticated",
      OWNER_ID,
      `delete from public.action_queue_events where action_queue_id='${ACTION_ID}';`,
    ),
    env,
    spawnImpl,
  );
}

function proveCrossUserAndAnonymousFences(env, spawnImpl = spawnSync) {
  requireSqlTrue(
    "cross_user",
    asRoleSql(
      "authenticated",
      OTHER_ID,
      `with result as (
        select public.action_queue_transition(
          '${ILLEGAL_ACTION_ID}','reject','pending_approval',null
        ) as value
      )
      select not (value->>'ok')::boolean
        and value->>'reason'='action_not_found'
      from result;`,
    ),
    env,
    spawnImpl,
  );
  requireSqlFailure(
    "anonymous_rpc",
    asRoleSql(
      "anon",
      OWNER_ID,
      `select public.action_queue_transition(
        '${ILLEGAL_ACTION_ID}','reject','pending_approval',null
      );`,
    ),
    env,
    spawnImpl,
  );
}

function proveReconciledPlantFallback(env, spawnImpl = spawnSync) {
  requireSqlTrue(
    "reconciled_plant_fallback",
    asRoleSql(
      "authenticated",
      OWNER_ID,
      `insert into public.action_queue(
        user_id,grow_id,tent_id,plant_id,status
      ) values (
        '${OWNER_ID}','${OWNER_GROW_ID}','${OWNER_TENT_ID}',
        '${LEGACY_PLANT_ID}','pending_approval'
      );
      select true;`,
    ),
    env,
    spawnImpl,
  );
}

function proveCanonicalReapply(env, spawnImpl = spawnSync) {
  const before = executeSql(
    `select 'public.action_queue_transition(uuid,text,text,text)'::regprocedure::oid;`,
    env,
    { stage: "reapply_before", spawnImpl },
  );
  requireMigrationSuccess("repair_reapply", env, spawnImpl);
  const after = executeSql(
    `select 'public.action_queue_transition(uuid,text,text,text)'::regprocedure::oid;`,
    env,
    { stage: "reapply_after", spawnImpl },
  );
  if (before !== after) throw new Error("repair_reapply:oid_changed");
}

function proveHistoricalContractRepair(env, spawnImpl = spawnSync) {
  resetScaffold(env, spawnImpl);
  executeSql(historicalTransitionMigration, env, {
    stage: "historical_transition",
    spawnImpl,
  });
  executeSql(historicalContractMigration, env, {
    stage: "historical_contract",
    spawnImpl,
  });
  const before = executeSql(catalogFingerprintSql(), env, {
    stage: "historical_contract_fingerprint",
    spawnImpl,
  });
  if (before !== "4d4741c455cf307f3e4909041c9d85d7|420914cd6ffbd2d552c30e8d7b6ddf73") {
    throw new Error("historical_contract_fingerprint:unexpected");
  }
  requireMigrationSuccess("historical_contract_repair", env, spawnImpl);
  const after = executeSql(catalogFingerprintSql(), env, {
    stage: "historical_contract_reconciled",
    spawnImpl,
  });
  if (after !== "e08f43c1f4e1308a8d50e6cab797f933|420914cd6ffbd2d552c30e8d7b6ddf73") {
    throw new Error("historical_contract_reconciled:unexpected");
  }
}

function requireLegacyRollback(stage, mutationSql, env, spawnImpl = spawnSync) {
  resetScaffold(env, spawnImpl);
  executeSql(mutationSql, env, { stage: `${stage}_mutation`, spawnImpl });
  requireMigrationFailure(stage, env, spawnImpl);
  requireSqlTrue(
    `${stage}_rollback`,
    `select
      to_regprocedure('public.action_queue_transition(uuid,text,text,text)') is null
      and has_table_privilege('authenticated','public.action_queue','update');`,
    env,
    spawnImpl,
  );
}

function proveUnknownPolicyRejected(env, spawnImpl = spawnSync) {
  requireLegacyRollback(
    "unknown_policy",
    `drop policy "Users insert own action_queue" on public.action_queue;
     create policy "Users insert own action_queue" on public.action_queue
       for insert to authenticated with check (false);`,
    env,
    spawnImpl,
  );
}

function provePartialContractRejected(env, spawnImpl = spawnSync) {
  requireLegacyRollback(
    "partial_contract",
    `drop policy "Users update own action_queue" on public.action_queue;`,
    env,
    spawnImpl,
  );
}

function proveFunctionSourceRejected(env, spawnImpl = spawnSync) {
  resetScaffold(env, spawnImpl);
  executeSql(
    `create function public.action_queue_transition(
       p_action_queue_id uuid,
       p_transition text,
       p_expected_status text,
       p_note text default null::text
     ) returns jsonb language sql security definer set search_path=''
     as $$ select '{"ok":false}'::jsonb $$;
     revoke all on function public.action_queue_transition(uuid,text,text,text)
       from public, anon, service_role;
     grant execute on function public.action_queue_transition(uuid,text,text,text)
       to authenticated;`,
    env,
    { stage: "function_source_mutation", spawnImpl },
  );
  requireMigrationFailure("function_source", env, spawnImpl);
  requireSqlTrue(
    "function_source_rollback",
    `select
      (select prosrc like '%{"ok":false}%'
       from pg_proc
       where oid='public.action_queue_transition(uuid,text,text,text)'::regprocedure)
      and exists(select 1 from pg_policy
        where polrelid='public.action_queue'::regclass
          and polname='Users update own action_queue');`,
    env,
    spawnImpl,
  );
}

function proveFunctionOverloadRejected(env, spawnImpl = spawnSync) {
  requireLegacyRollback(
    "function_overload",
    `create function public.action_queue_transition(uuid)
       returns jsonb language sql as $$ select '{}'::jsonb $$;`,
    env,
    spawnImpl,
  );
}

function proveGuardSourceRejected(env, spawnImpl = spawnSync) {
  requireLegacyRollback(
    "guard_source",
    `create or replace function public.action_queue_guard_decision_fields()
       returns trigger language plpgsql security definer
       set search_path=public,pg_temp
       as $$ begin return new; end $$;`,
    env,
    spawnImpl,
  );
}

function proveGuardTriggerRejected(env, spawnImpl = spawnSync) {
  requireLegacyRollback(
    "guard_trigger",
    `alter table public.action_queue
       disable trigger trg_action_queue_guard_decision_fields;`,
    env,
    spawnImpl,
  );
}

function proveRlsDisabledRejected(env, spawnImpl = spawnSync) {
  requireLegacyRollback(
    "rls_disabled",
    `alter table public.action_queue disable row level security;`,
    env,
    spawnImpl,
  );
}

function proveRequiredGrantDriftRejected(env, spawnImpl = spawnSync) {
  requireLegacyRollback(
    "required_grant_drift",
    `revoke select on public.action_queue from authenticated;`,
    env,
    spawnImpl,
  );
}

function proveInheritedMutationGrantRejected(env, spawnImpl = spawnSync) {
  resetScaffold(env, spawnImpl);
  executeSql(
    `do $role$
     begin
       if not exists (
         select 1 from pg_roles where rolname = 'action_queue_inherited_writer'
       ) then
         create role action_queue_inherited_writer nologin;
       end if;
     end
     $role$;
     alter role authenticated inherit;
     grant action_queue_inherited_writer to authenticated;
     grant update, delete on public.action_queue, public.action_queue_events
       to action_queue_inherited_writer;`,
    env,
    { stage: "inherited_mutation_grant_mutation", spawnImpl },
  );
  requireMigrationFailure("inherited_mutation_grant", env, spawnImpl);
  requireSqlTrue(
    "inherited_mutation_grant_rollback",
    `select
      to_regprocedure('public.action_queue_transition(uuid,text,text,text)') is null
      and has_table_privilege('authenticated','public.action_queue','update')
      and has_table_privilege('authenticated','public.action_queue','delete')
      and has_table_privilege('authenticated','public.action_queue_events','update')
      and has_table_privilege('authenticated','public.action_queue_events','delete');`,
    env,
    spawnImpl,
  );
}

export async function runPg15Harness({
  databaseUrl = process.env.ACTION_QUEUE_TRANSITION_REPAIR_PG15_URL,
  containerId = process.env.ACTION_QUEUE_TRANSITION_REPAIR_PG15_CONTAINER,
  containerRuntime = process.env.ACTION_QUEUE_TRANSITION_REPAIR_PG15_CONTAINER_RUNTIME,
  spawnImpl = spawnSync,
} = {}) {
  const connection = disposableConnection(databaseUrl);
  if (
    !connection ||
    (containerId && !/^[0-9a-f]{12,64}$/i.test(containerId)) ||
    (containerRuntime && !new Set(["docker", "wsl-docker"]).has(containerRuntime))
  ) {
    return fail("database_target_rejected");
  }
  const env = psqlEnvironment(connection, containerId, containerRuntime);
  try {
    validatePinnedMigrationFile();
    attestDisposableTarget(env, spawnImpl);
    resetScaffold(env, spawnImpl);
    proveLegacyBaseline(env, spawnImpl);
    proveProtectedDeliveryRecovery(env, spawnImpl);
    proveHardenedGrantBaselineConverges(env, spawnImpl);
    proveOwnerTransitionAndRetry(env, spawnImpl);
    proveIllegalTransitionNoWrite(env, spawnImpl);
    proveDirectMutationFences(env, spawnImpl);
    proveAppendOnlyEventFence(env, spawnImpl);
    proveCrossUserAndAnonymousFences(env, spawnImpl);
    proveReconciledPlantFallback(env, spawnImpl);
    proveCanonicalReapply(env, spawnImpl);
    proveHistoricalContractRepair(env, spawnImpl);
    proveUnknownPolicyRejected(env, spawnImpl);
    provePartialContractRejected(env, spawnImpl);
    proveFunctionSourceRejected(env, spawnImpl);
    proveFunctionOverloadRejected(env, spawnImpl);
    proveGuardSourceRejected(env, spawnImpl);
    proveGuardTriggerRejected(env, spawnImpl);
    proveRlsDisabledRejected(env, spawnImpl);
    proveRequiredGrantDriftRejected(env, spawnImpl);
    proveInheritedMutationGrantRejected(env, spawnImpl);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "unknown");
  }
  process.stdout.write("Action Queue transition PG15 harness PASS\n");
  return 0;
}

const isDirectInvocation =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectInvocation) process.exitCode = await runPg15Harness();
