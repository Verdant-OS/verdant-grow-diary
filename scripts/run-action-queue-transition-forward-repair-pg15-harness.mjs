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
const GUARD_MIGRATION_SUFFIX = "_action_queue_guard_decision_fields_forward_repair.sql";
const PINNED_GUARD_MIGRATION_FILE =
  "20260819190000_action_queue_guard_decision_fields_forward_repair.sql";
const EXPECTED_GUARD_MIGRATION_SHA256 =
  "7d8493e9b5dbb21709fa30fede767eb59fb2482cf8cfaf8d75b74afd0dd41f25";
const TABLE_ACL_MIGRATION_SUFFIX = "_action_queue_table_acl_forward_repair.sql";
const PINNED_TABLE_ACL_MIGRATION_FILE = "20260820235900_action_queue_table_acl_forward_repair.sql";
const EXPECTED_TABLE_ACL_MIGRATION_SHA256 =
  "25867036eccb978aa73b3a6268de20d46cab74cc818ee8ef33fbe7f072ceaf1e";
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

const legacyGuardFunctionDefinition = extractFunctionDefinition(
  "supabase/migrations/20260721225930_b34caa3e-17e4-47c1-9847-19d1c184d83c.sql",
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

export function validatePinnedGuardMigrationFile({
  root = resolve(repoRoot, "supabase", "migrations"),
} = {}) {
  const matches = readdirSync(root)
    .filter((name) => name.endsWith(GUARD_MIGRATION_SUFFIX))
    .sort();
  if (matches.length !== 1 || matches[0] !== PINNED_GUARD_MIGRATION_FILE) {
    throw new Error("guard_migration_file_unrecognized");
  }
  const sql = readFileSync(resolve(root, matches[0]), "utf8");
  const sha256 = createHash("sha256").update(sql).digest("hex");
  if (sha256 !== EXPECTED_GUARD_MIGRATION_SHA256) {
    throw new Error("guard_migration_digest_unrecognized");
  }
  return Object.freeze({ fileName: matches[0], sha256, sql });
}

export function validatePinnedTableAclMigrationFile({
  root = resolve(repoRoot, "supabase", "migrations"),
} = {}) {
  const matches = readdirSync(root)
    .filter((name) => name.endsWith(TABLE_ACL_MIGRATION_SUFFIX))
    .sort();
  if (matches.length !== 1 || matches[0] !== PINNED_TABLE_ACL_MIGRATION_FILE) {
    throw new Error("table_acl_migration_file_unrecognized");
  }
  const sql = readFileSync(resolve(root, matches[0]), "utf8");
  const sha256 = createHash("sha256").update(sql).digest("hex");
  if (sha256 !== EXPECTED_TABLE_ACL_MIGRATION_SHA256) {
    throw new Error("table_acl_migration_digest_unrecognized");
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
  if not exists (select 1 from pg_roles where rolname = 'sandbox_exec') then
    execute 'create role sandbox_exec nologin';
  end if;
end
$roles$;
alter role anon nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
alter role authenticated nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
alter role service_role nologin nosuperuser nocreatedb nocreaterole noinherit noreplication bypassrls;
alter role sandbox_exec nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;

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

${legacyGuardFunctionDefinition}
alter function public.action_queue_guard_decision_fields() owner to postgres;
revoke all on function public.action_queue_guard_decision_fields() from public;
revoke execute on function public.action_queue_guard_decision_fields()
  from anon, authenticated;
grant execute on function public.action_queue_guard_decision_fields()
  to service_role;
create trigger trg_action_queue_guard_decision_fields
before update of status, approved_at, rejected_at
on public.action_queue
for each row execute function public.action_queue_guard_decision_fields();

grant usage on schema public, auth to anon, authenticated, service_role, sandbox_exec;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select on public.grows, public.tents, public.plants to authenticated;
grant all privileges on public.action_queue, public.action_queue_events
  to anon, authenticated, service_role;
grant select, insert on public.action_queue, public.action_queue_events
  to sandbox_exec;

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

function guardMigrationResult(env, spawnImpl = spawnSync) {
  const migration = validatePinnedGuardMigrationFile();
  return spawnPsql({
    env,
    input: `\\set VERBOSITY verbose\n${migration.sql}`,
    spawnImpl,
  });
}

function tableAclMigrationResult(env, spawnImpl = spawnSync) {
  const migration = validatePinnedTableAclMigrationFile();
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

function requireGuardMigrationSuccess(stage, env, spawnImpl = spawnSync) {
  const result = guardMigrationResult(env, spawnImpl);
  if (result?.error || result?.status !== 0) {
    throw new Error(formatPsqlFailureCode(stage, result?.stderr));
  }
}

function requireGuardMigrationFailure(stage, env, spawnImpl = spawnSync) {
  const result = guardMigrationResult(env, spawnImpl);
  if (!result?.error && result?.status === 0) {
    throw new Error(`${stage}:unexpected_success`);
  }
  const failure = formatPsqlFailureCode(stage, result?.stderr);
  if (failure !== `${stage}:55000`) throw new Error(failure);
}

function requireTableAclMigrationSuccess(stage, env, spawnImpl = spawnSync) {
  const result = tableAclMigrationResult(env, spawnImpl);
  if (result?.error || result?.status !== 0) {
    throw new Error(formatPsqlFailureCode(stage, result?.stderr));
  }
}

function requireTableAclMigrationFailure(stage, env, spawnImpl = spawnSync) {
  const result = tableAclMigrationResult(env, spawnImpl);
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

function proveLegacyGuardBaseline(env, spawnImpl = spawnSync) {
  requireSqlTrue(
    "legacy_guard_contract",
    `select
      p.proconfig = ARRAY['search_path=public']::text[]
      and octet_length(replace(p.prosrc, E'\\r', '')) = 1028
      and md5(replace(p.prosrc, E'\\r', '')) = '09459a9cc8532aae905639b3055c680f'
      and owner_role.rolname = 'postgres'
      and p.prosecdef
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('authenticated', p.oid, 'execute')
      and has_function_privilege('service_role', p.oid, 'execute')
      and (
        select array_agg(
          format(
            '%s|%s|%s|%s',
            coalesce(grantee.rolname, 'PUBLIC'),
            acl.privilege_type,
            acl.is_grantable,
            grantor.rolname
          )
          order by coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type
        )
        from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
        left join pg_roles as grantee on grantee.oid = acl.grantee
        join pg_roles as grantor on grantor.oid = acl.grantor
      ) = ARRAY[
        'postgres|EXECUTE|f|postgres',
        'service_role|EXECUTE|f|postgres'
      ]::text[]
      and (
        select array_agg(a.attname order by a.attname)
        from pg_trigger as tg
        cross join lateral unnest(tg.tgattr::smallint[]) as trigger_column(attnum)
        join pg_attribute as a
          on a.attrelid = tg.tgrelid
         and a.attnum = trigger_column.attnum
        where tg.tgrelid = 'public.action_queue'::regclass
          and tg.tgname = 'trg_action_queue_guard_decision_fields'
          and not tg.tgisinternal
          and tg.tgenabled = 'O'
          and tg.tgfoid = p.oid
      ) = ARRAY['approved_at', 'rejected_at', 'status']::name[]
    from pg_proc as p
    join pg_roles as owner_role on owner_role.oid = p.proowner
    where p.oid = 'public.action_queue_guard_decision_fields()'::regprocedure;`,
    env,
    spawnImpl,
  );
}

function requireRepairedGuardContract(stage, env, spawnImpl = spawnSync) {
  requireSqlTrue(
    stage,
    `select
      p.proconfig = ARRAY['search_path=public, pg_temp']::text[]
      and octet_length(replace(p.prosrc, E'\\r', '')) = 1101
      and md5(replace(p.prosrc, E'\\r', '')) = '88e81c4dfbc6d17260def35d1a619ee1'
      and owner_role.rolname = 'postgres'
      and p.prosecdef
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('service_role', p.oid, 'execute')
      and (
        select array_agg(
          format(
            '%s|%s|%s|%s',
            coalesce(grantee.rolname, 'PUBLIC'),
            acl.privilege_type,
            acl.is_grantable,
            grantor.rolname
          )
          order by coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type
        )
        from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
        left join pg_roles as grantee on grantee.oid = acl.grantee
        join pg_roles as grantor on grantor.oid = acl.grantor
      ) = ARRAY['postgres|EXECUTE|f|postgres']::text[]
      and (
        select array_agg(a.attname order by a.attname)
        from pg_trigger as tg
        cross join lateral unnest(tg.tgattr::smallint[]) as trigger_column(attnum)
        join pg_attribute as a
          on a.attrelid = tg.tgrelid
         and a.attnum = trigger_column.attnum
        where tg.tgrelid = 'public.action_queue'::regclass
          and tg.tgname = 'trg_action_queue_guard_decision_fields'
          and not tg.tgisinternal
          and tg.tgenabled = 'O'
          and tg.tgfoid = p.oid
      ) = ARRAY['approved_at', 'completed_at', 'rejected_at', 'status']::name[]
    from pg_proc as p
    join pg_roles as owner_role on owner_role.oid = p.proowner
    where p.oid = 'public.action_queue_guard_decision_fields()'::regprocedure;`,
    env,
    spawnImpl,
  );
}

function proveGuardRepairSuccess(env, spawnImpl = spawnSync) {
  const beforeOid = executeSql(
    `select 'public.action_queue_guard_decision_fields()'::regprocedure::oid;`,
    env,
    { stage: "guard_repair_before", spawnImpl },
  );
  requireGuardMigrationSuccess("guard_repair_apply", env, spawnImpl);
  const afterOid = executeSql(
    `select 'public.action_queue_guard_decision_fields()'::regprocedure::oid;`,
    env,
    { stage: "guard_repair_after", spawnImpl },
  );
  if (beforeOid !== afterOid) throw new Error("guard_repair_apply:oid_changed");
  requireRepairedGuardContract("guard_repair_catalog", env, spawnImpl);
  requireSqlTrue(
    "guard_repair_scope",
    `select
      (select count(*) = 2 from public.action_queue)
      and (select count(*) = 0 from public.action_queue_events)
      and to_regprocedure('public.action_queue_transition(uuid,text,text,text)') is null;`,
    env,
    spawnImpl,
  );
}

function proveGuardCanonicalReapply(env, spawnImpl = spawnSync) {
  const beforeOid = executeSql(
    `select 'public.action_queue_guard_decision_fields()'::regprocedure::oid;`,
    env,
    { stage: "guard_reapply_before", spawnImpl },
  );
  requireGuardMigrationSuccess("guard_repair_reapply", env, spawnImpl);
  const afterOid = executeSql(
    `select 'public.action_queue_guard_decision_fields()'::regprocedure::oid;`,
    env,
    { stage: "guard_reapply_after", spawnImpl },
  );
  if (beforeOid !== afterOid) throw new Error("guard_repair_reapply:oid_changed");
  requireRepairedGuardContract("guard_reapply_catalog", env, spawnImpl);
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
  requireGuardMigrationSuccess("hardened_grant_guard_repair", env, spawnImpl);
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

function measuredTableAclSql() {
  return `with privilege_universe as (
      select distinct acl.privilege_type
      from aclexplode(acldefault('r', 'postgres'::regrole)) as acl
      where acl.privilege_type not in ('UPDATE', 'DELETE')
    ), subjects(role_name) as (
      values ('anon'::text), ('authenticated'::text)
    ), relations(table_name) as (
      values ('action_queue'::text), ('action_queue_events'::text)
    ), expected as (
      select array_agg(
        format('%s|%s|%s|f|postgres', r.table_name, s.role_name, u.privilege_type)
        order by r.table_name, s.role_name, u.privilege_type
      ) as rows
      from relations r cross join subjects s cross join privilege_universe u
    ), actual as (
      select coalesce(array_agg(
        format('%s|%s|%s|%s|%s', c.relname, grantee.rolname,
               acl.privilege_type, acl.is_grantable, grantor.rolname)
        order by c.relname, grantee.rolname, acl.privilege_type, grantor.rolname
      ), array[]::text[]) as rows
      from pg_class c
      cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
      join pg_roles grantee on grantee.oid = acl.grantee
      join pg_roles grantor on grantor.oid = acl.grantor
      where c.oid in ('public.action_queue'::regclass,
                      'public.action_queue_events'::regclass)
        and grantee.rolname in ('anon', 'authenticated')
    )
    select actual.rows = expected.rows
      and not exists (
        select 1
        from pg_class c
        cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
        where c.oid in ('public.action_queue'::regclass,
                        'public.action_queue_events'::regclass)
          and acl.grantee = 0
      )
      and not exists (
        select 1
        from pg_attribute a
        cross join lateral aclexplode(a.attacl) acl
        left join pg_roles grantee on grantee.oid = acl.grantee
        where a.attrelid in ('public.action_queue'::regclass,
                             'public.action_queue_events'::regclass)
          and a.attnum > 0 and not a.attisdropped
          and (acl.grantee = 0 or grantee.rolname in ('anon', 'authenticated'))
      )
    from actual, expected;`;
}

function canonicalTableAclSql() {
  return `with privilege_universe as (
      select distinct acl.privilege_type
      from aclexplode(acldefault('r', 'postgres'::regrole)) as acl
    ), relations(table_name) as (
      values ('action_queue'::text), ('action_queue_events'::text)
    ), client_subjects(role_name) as (
      values ('anon'::text), ('authenticated'::text)
    ), client_direct as (
      select coalesce(array_agg(
        format('%s|%s|%s|%s|%s', c.relname, grantee.rolname,
               acl.privilege_type, acl.is_grantable, grantor.rolname)
        order by c.relname, grantee.rolname, acl.privilege_type, grantor.rolname
      ), array[]::text[]) as rows
      from pg_class c
      cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
      join pg_roles grantee on grantee.oid = acl.grantee
      join pg_roles grantor on grantor.oid = acl.grantor
      where c.oid in ('public.action_queue'::regclass,
                      'public.action_queue_events'::regclass)
        and grantee.rolname in ('anon', 'authenticated')
    ), client_effective as (
      select coalesce(array_agg(
        format('%s|%s|%s',r.table_name,s.role_name,u.privilege_type)
        order by r.table_name,s.role_name,u.privilege_type
      ),array[]::text[]) as rows
      from relations r cross join client_subjects s cross join privilege_universe u
      where has_table_privilege(
        s.role_name,format('public.%I',r.table_name),u.privilege_type
      )
    ), privileged_effective as (
      select coalesce(array_agg(
        format('%s|%s|%s',r.table_name,s.role_name,u.privilege_type)
        order by r.table_name,s.role_name,u.privilege_type
      ),array[]::text[]) as rows
      from relations r
      cross join (values ('postgres'::text),('sandbox_exec'::text),('service_role'::text)) s(role_name)
      cross join privilege_universe u
      where has_table_privilege(
        s.role_name,format('public.%I',r.table_name),u.privilege_type
      )
    ), expected_privileged as (
      select array_agg(format('%s|%s|%s',table_name,role_name,privilege_type)
                       order by table_name,role_name,privilege_type) as rows
      from (
        select r.table_name,s.role_name,u.privilege_type
        from relations r
        cross join (values ('postgres'::text),('service_role'::text)) s(role_name)
        cross join privilege_universe u
        union all
        select r.table_name,'sandbox_exec'::text,u.privilege_type
        from relations r cross join privilege_universe u
        where u.privilege_type in ('SELECT','INSERT')
      ) expected_rows
    )
    select client_direct.rows = array[
        'action_queue|authenticated|INSERT|f|postgres',
        'action_queue|authenticated|SELECT|f|postgres',
        'action_queue_events|authenticated|INSERT|f|postgres',
        'action_queue_events|authenticated|SELECT|f|postgres'
      ]::text[]
      and client_effective.rows = array[
        'action_queue|authenticated|INSERT',
        'action_queue|authenticated|SELECT',
        'action_queue_events|authenticated|INSERT',
        'action_queue_events|authenticated|SELECT'
      ]::text[]
      and privileged_effective.rows = expected_privileged.rows
      and not exists (
        select 1
        from pg_class c
        cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
        where c.oid in ('public.action_queue'::regclass,
                        'public.action_queue_events'::regclass)
          and acl.grantee = 0
      )
      and not exists (
        select 1
        from pg_attribute a
        cross join lateral aclexplode(a.attacl) acl
        left join pg_roles grantee on grantee.oid = acl.grantee
        where a.attrelid in ('public.action_queue'::regclass,
                             'public.action_queue_events'::regclass)
          and a.attnum > 0 and not a.attisdropped
          and (acl.grantee = 0 or grantee.rolname in ('anon', 'authenticated'))
      )
    from client_direct,client_effective,privileged_effective,expected_privileged;`;
}

function tableAclPreservedScopeSql() {
  return `select md5(concat_ws('|',
    (select format('%s:%s', count(*), md5(coalesce(string_agg(to_jsonb(q)::text, E'\\n' order by q.id), '')))
       from public.action_queue q),
    (select format('%s:%s', count(*), md5(coalesce(string_agg(to_jsonb(e)::text, E'\\n' order by e.id), '')))
       from public.action_queue_events e),
    (select md5(coalesce(string_agg(
       format('%s|%s|%s|%s|%s|%s|%s', p.oid, p.polname, p.polpermissive,
              p.polcmd, p.polroles::text, coalesce(pg_get_expr(p.polqual,p.polrelid),''),
              coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')),
       E'\\n' order by p.polrelid,p.polname), ''))
       from pg_policy p
       where p.polrelid in ('public.action_queue'::regclass,
                            'public.action_queue_events'::regclass)),
    (select md5(coalesce(string_agg(
       format('%s|%s|%s|%s|%s|%s|%s', p.oid,p.proname,
              pg_get_function_identity_arguments(p.oid),owner_role.rolname,
              coalesce(p.proacl::text,''),pg_get_functiondef(p.oid),
              coalesce(obj_description(p.oid,'pg_proc'),'')),
       E'\\n' order by p.proname,pg_get_function_identity_arguments(p.oid)), ''))
       from pg_proc p
       join pg_namespace n on n.oid=p.pronamespace
       join pg_roles owner_role on owner_role.oid=p.proowner
       where n.nspname='public'
         and p.proname like 'action_queue\\_%' escape '\\'),
    (select md5(coalesce(string_agg(
       format('%s|%s|%s|%s|%s',c.relname,coalesce(grantee.rolname,acl.grantee::text),
              acl.privilege_type,acl.is_grantable,coalesce(grantor.rolname,acl.grantor::text)),
       E'\\n' order by c.relname,acl.grantee,acl.privilege_type,acl.grantor), ''))
       from pg_class c
       cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
       left join pg_roles grantee on grantee.oid=acl.grantee
       left join pg_roles grantor on grantor.oid=acl.grantor
       where c.oid in ('public.action_queue'::regclass,
                       'public.action_queue_events'::regclass)
         and coalesce(grantee.rolname,'PUBLIC') not in ('PUBLIC','anon','authenticated'))
  ));`;
}

function proveMeasuredTableAclGap(env, spawnImpl = spawnSync) {
  requireSqlTrue("measured_table_acl_gap", measuredTableAclSql(), env, spawnImpl);
}

function proveTableAclRepairSuccess(env, spawnImpl = spawnSync) {
  const before = executeSql(tableAclPreservedScopeSql(), env, {
    stage: "table_acl_scope_before",
    spawnImpl,
  });
  requireTableAclMigrationSuccess("table_acl_repair_apply", env, spawnImpl);
  const after = executeSql(tableAclPreservedScopeSql(), env, {
    stage: "table_acl_scope_after",
    spawnImpl,
  });
  if (before !== after) throw new Error("table_acl_repair_apply:scope_changed");
  requireSqlTrue("table_acl_repair_catalog", canonicalTableAclSql(), env, spawnImpl);
}

function proveTableAclCanonicalReapply(env, spawnImpl = spawnSync) {
  const before = executeSql(tableAclPreservedScopeSql(), env, {
    stage: "table_acl_reapply_before",
    spawnImpl,
  });
  requireTableAclMigrationSuccess("table_acl_repair_reapply", env, spawnImpl);
  const after = executeSql(tableAclPreservedScopeSql(), env, {
    stage: "table_acl_reapply_after",
    spawnImpl,
  });
  if (before !== after) throw new Error("table_acl_repair_reapply:scope_changed");
  requireSqlTrue("table_acl_reapply_catalog", canonicalTableAclSql(), env, spawnImpl);
}

function proveUnknownTableAclRejected(env, spawnImpl = spawnSync) {
  executeSql("grant update on public.action_queue to anon;", env, {
    stage: "unknown_table_acl_mutation",
    spawnImpl,
  });
  requireTableAclMigrationFailure("unknown_table_acl", env, spawnImpl);
  requireSqlTrue(
    "unknown_table_acl_rollback",
    "select has_table_privilege('anon','public.action_queue','update');",
    env,
    spawnImpl,
  );
  executeSql("revoke update on public.action_queue from anon;", env, {
    stage: "unknown_table_acl_cleanup",
    spawnImpl,
  });
  requireSqlTrue("unknown_table_acl_cleanup_catalog", canonicalTableAclSql(), env, spawnImpl);
}

const ROLE_SQL = Object.freeze({
  authenticated: "set local role authenticated;",
  anon: "set local role anon;",
  sandbox_exec: "set local role sandbox_exec;",
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

function requireSqlStateFailure(stage, sql, expectedSqlState, env, spawnImpl = spawnSync) {
  const result = spawnPsql({
    env,
    input: `\\set VERBOSITY verbose\n${sql}`,
    spawnImpl,
  });
  if (!result?.error && result?.status === 0) {
    throw new Error(`${stage}:unexpected_success`);
  }
  const failure = formatPsqlFailureCode(stage, result?.stderr);
  if (failure !== `${stage}:${expectedSqlState}`) throw new Error(failure);
}

function proveDirectTruncateFences(env, spawnImpl = spawnSync) {
  for (const role of ["authenticated", "anon"]) {
    requireSqlStateFailure(
      `${role}_direct_truncate_events`,
      asRoleSql(role, OWNER_ID, "truncate table public.action_queue_events;"),
      "42501",
      env,
      spawnImpl,
    );
    requireSqlStateFailure(
      `${role}_direct_truncate_queue`,
      `begin;
       grant truncate on public.action_queue_events to ${role};
       ${ROLE_SQL[role]}
       set local "request.jwt.claim.role" = '${role}';
       set local "request.jwt.claim.sub" = '${OWNER_ID}';
       truncate table public.action_queue_events, public.action_queue;
       rollback;`,
      "42501",
      env,
      spawnImpl,
    );
  }
  requireSqlTrue("direct_truncate_acl_unchanged", canonicalTableAclSql(), env, spawnImpl);
  requireSqlTrue(
    "direct_truncate_rows_unchanged",
    `select
      (select count(*) = 2 from public.action_queue)
      and (select count(*) = 0 from public.action_queue_events);`,
    env,
    spawnImpl,
  );
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
  requireGuardMigrationSuccess("historical_contract_guard_repair", env, spawnImpl);
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
  requireGuardMigrationSuccess(`${stage}_guard_repair`, env, spawnImpl);
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

function proveUnknownGuardSourceRejected(env, spawnImpl = spawnSync) {
  resetScaffold(env, spawnImpl);
  executeSql(
    `create or replace function public.action_queue_guard_decision_fields()
       returns trigger language plpgsql security definer
       set search_path=public
       as $$
       begin
         perform 1;
         return new;
       end;
       $$;`,
    env,
    { stage: "unknown_guard_source_mutation", spawnImpl },
  );
  const beforeOid = executeSql(
    `select 'public.action_queue_guard_decision_fields()'::regprocedure::oid;`,
    env,
    { stage: "unknown_guard_source_before", spawnImpl },
  );
  requireGuardMigrationFailure("unknown_guard_source", env, spawnImpl);
  const afterOid = executeSql(
    `select 'public.action_queue_guard_decision_fields()'::regprocedure::oid;`,
    env,
    { stage: "unknown_guard_source_after", spawnImpl },
  );
  if (beforeOid !== afterOid) throw new Error("unknown_guard_source:oid_changed");
  requireSqlTrue(
    "unknown_guard_source_rollback",
    `select
      md5(replace(p.prosrc, E'\\r', '')) not in (
        '09459a9cc8532aae905639b3055c680f',
        '88e81c4dfbc6d17260def35d1a619ee1'
      )
      and p.proconfig = ARRAY['search_path=public']::text[]
      and has_function_privilege('service_role', p.oid, 'execute')
      and to_regprocedure('public.action_queue_transition(uuid,text,text,text)') is null
      and (
        select array_agg(a.attname order by a.attname)
        from pg_trigger as tg
        cross join lateral unnest(tg.tgattr::smallint[]) as trigger_column(attnum)
        join pg_attribute as a
          on a.attrelid = tg.tgrelid
         and a.attnum = trigger_column.attnum
        where tg.tgrelid = 'public.action_queue'::regclass
          and tg.tgname = 'trg_action_queue_guard_decision_fields'
          and not tg.tgisinternal
          and tg.tgenabled = 'O'
          and tg.tgfoid = p.oid
      ) = ARRAY['approved_at', 'rejected_at', 'status']::name[]
    from pg_proc as p
    where p.oid = 'public.action_queue_guard_decision_fields()'::regprocedure;`,
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
  requireGuardMigrationSuccess("function_source_guard_repair", env, spawnImpl);
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
  requireGuardMigrationSuccess("inherited_mutation_grant_guard_repair", env, spawnImpl);
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
    validatePinnedGuardMigrationFile();
    validatePinnedTableAclMigrationFile();
    attestDisposableTarget(env, spawnImpl);
    resetScaffold(env, spawnImpl);
    proveLegacyBaseline(env, spawnImpl);
    proveLegacyGuardBaseline(env, spawnImpl);
    proveGuardRepairSuccess(env, spawnImpl);
    proveGuardCanonicalReapply(env, spawnImpl);
    proveProtectedDeliveryRecovery(env, spawnImpl);
    proveHardenedGrantBaselineConverges(env, spawnImpl);
    proveMeasuredTableAclGap(env, spawnImpl);
    proveTableAclRepairSuccess(env, spawnImpl);
    proveTableAclCanonicalReapply(env, spawnImpl);
    proveUnknownTableAclRejected(env, spawnImpl);
    proveDirectTruncateFences(env, spawnImpl);
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
    proveUnknownGuardSourceRejected(env, spawnImpl);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "unknown");
  }
  process.stdout.write("Action Queue transition PG15 harness PASS\n");
  return 0;
}

const isDirectInvocation =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectInvocation) process.exitCode = await runPg15Harness();
