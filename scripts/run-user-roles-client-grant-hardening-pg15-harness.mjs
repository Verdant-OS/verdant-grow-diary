#!/usr/bin/env node
/**
 * Local-only PostgreSQL 15 and 17 runtime harness for
 * 20260925090000_user_roles_client_grant_hardening. The target's major version
 * is attested against USER_ROLES_GRANTS_PG_MAJOR (default 15). Production runs
 * PostgreSQL 17, where the browser roles also hold MAINTAIN.
 *
 * Builds production's measured baseline — public.user_roles from the reviewed
 * 20260517010926 migration, Supabase-style default grants that give anon and
 * authenticated every table privilege, and a platform role holding
 * INSERT/SELECT — then proves, against a disposable database only:
 *   - the hole is real at baseline: anon can TRUNCATE every role row, which
 *     RLS does not govern;
 *   - after the migration anon has no privilege, authenticated has SELECT
 *     only, and every other grantee and policy is byte-for-byte unchanged;
 *   - a signed-in grower still reads their own role and has_role() still
 *     works; client writes and TRUNCATE are denied; service_role and a
 *     SECURITY DEFINER role grant still work;
 *   - re-applying the migration is a no-op;
 *   - it fails closed, changing nothing, on inherited client privileges,
 *     disabled RLS, owner drift or an RLS-bypassing client role;
 *   - on PostgreSQL 17 only: the browser roles hold MAINTAIN at baseline and
 *     can REINDEX, lose both after the migration, and an inherited MAINTAIN
 *     makes the migration fail closed.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_PSQL_OUTPUT_BYTES = 1_048_576;
const DISPOSABLE_DATABASE = "verdant_user_roles_grants";
const DISPOSABLE_DATABASE_USER = "postgres";
const DISPOSABLE_DATABASE_PORT = "5432";
const DISPOSABLE_SCHEMA = "verdant_user_roles_grants_harness";
const DISPOSABLE_SENTINEL = "verdant_user_roles_grants_pg15_disposable_v1";
export const MIGRATION_FILE = "20260925090000_user_roles_client_grant_hardening.sql";
const PREREQUISITE_MIGRATION_FILE = "20260517010926_65004f70-4e2c-48b3-bfcb-37bb8d2f0040.sql";
const EXPECTED_PREREQUISITE_SHA256 =
  "f210c51d6a4191bbdf0bccd8252c3b6c81d605a6ba9e36e8ff977414bd946542";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const OPERATOR_ID = "11111111-1111-4111-8111-111111111111";
const GROWER_ID = "22222222-2222-4222-8222-222222222222";

/** Server major versions the harness runs against; 17 is production's. */
export const SUPPORTED_PG_MAJORS = Object.freeze(["15", "17"]);

/** The measured browser-role end state: PUBLIC and anon nothing, authenticated SELECT. */
export const EXPECTED_CLIENT_ACL = Object.freeze(["authenticated|SELECT|f"]);

function fail(code) {
  process.stderr.write(`user_roles grant hardening harness failed: ${code}\n`);
  return 1;
}

export function formatPsqlFailureCode(stage, stderr) {
  const match = /(?:SQL state|SQLSTATE)[: ]+([0-9A-Z]{5})|^ERROR:\s*([0-9A-Z]{5})\s*$/im.exec(
    String(stderr ?? ""),
  );
  return `${stage}:${(match?.[1] ?? match?.[2])?.toUpperCase() ?? "unknown"}`;
}

export function buildPsqlArgs({ quiet }) {
  return ["-X", ...(quiet ? ["-q"] : []), "-A", "-t", "-v", "ON_ERROR_STOP=1"];
}

export function disposableConnection(value) {
  try {
    const url = new URL(value);
    if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) return null;
    if (!new Set(["127.0.0.1", "localhost", "::1", "[::1]"]).has(url.hostname)) return null;
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

function psqlEnvironment(connection, source = process.env) {
  return {
    PATH: source.PATH ?? "",
    SYSTEMROOT: source.SYSTEMROOT ?? source.SystemRoot ?? "",
    PGHOST: connection.hostname,
    PGPORT: DISPOSABLE_DATABASE_PORT,
    PGUSER: DISPOSABLE_DATABASE_USER,
    PGPASSWORD: connection.password,
    PGDATABASE: DISPOSABLE_DATABASE,
    PGCONNECT_TIMEOUT: "5",
    PGAPPNAME: "verdant-user-roles-grants-pg15-harness",
  };
}

function spawnPsql({ env, input, spawnImpl = spawnSync }) {
  return spawnImpl("psql", buildPsqlArgs({ quiet: true }), {
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

function requireSqlFailure(label, sql, expectedCode, env, spawnImpl = spawnSync) {
  const result = spawnPsql({ env, input: `\\set VERBOSITY sqlstate\n${sql}`, spawnImpl });
  if (!result?.error && result?.status === 0) throw new Error(`${label}:unexpected_success`);
  const observed = formatPsqlFailureCode(label, result?.stderr);
  if (observed !== `${label}:${expectedCode}`) throw new Error(`${label}:wrong_failure`);
}

function requireSqlTrue(label, sql, env, spawnImpl = spawnSync) {
  if (executeSql(sql, env, { stage: label, spawnImpl }) !== "t") {
    throw new Error(`${label}:false`);
  }
}

/**
 * Section 1 ("ROLES INFRASTRUCTURE") of the reviewed migration: the app_role
 * enum, public.user_roles, has_role() and both user_roles policies, verbatim.
 */
export function readUserRolesPrerequisite() {
  const sql = readFileSync(
    resolve(repoRoot, "supabase", "migrations", PREREQUISITE_MIGRATION_FILE),
    "utf8",
  );
  if (createHash("sha256").update(sql).digest("hex") !== EXPECTED_PREREQUISITE_SHA256) {
    throw new Error("prerequisite_migration_fingerprint_mismatch");
  }
  const start = sql.indexOf("-- Enum of supported roles");
  const end = sql.indexOf("-- 2. PLANTS");
  if (start < 0 || end < start) throw new Error("prerequisite_migration_shape_drift");
  const section = sql.slice(start, sql.lastIndexOf("\n-- ===", end));
  for (const required of [
    "CREATE TABLE IF NOT EXISTS public.user_roles (",
    "ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;",
    'CREATE POLICY "Users view own roles"',
    'CREATE POLICY "Operators manage roles"',
  ]) {
    if (!section.includes(required)) throw new Error("prerequisite_migration_shape_drift");
  }
  return section;
}

export function readMigration() {
  const sql = readFileSync(resolve(repoRoot, "supabase", "migrations", MIGRATION_FILE), "utf8");
  if (!/\nBEGIN;\n/.test(sql) || !/\nCOMMIT;\n$/.test(sql)) {
    throw new Error("migration_transaction_shape_mismatch");
  }
  if (sql.includes("supabase.co")) throw new Error("migration_remote_target_forbidden");
  return sql;
}

const BASE_SCAFFOLD_SQL = `
drop schema if exists public cascade;
drop schema if exists auth cascade;
do $roles$
begin
  if not exists(select 1 from pg_roles where rolname='anon') then
    execute 'create role anon nologin nosuperuser nocreatedb nocreaterole inherit noreplication nobypassrls';
  end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then
    execute 'create role authenticated nologin nosuperuser nocreatedb nocreaterole inherit noreplication nobypassrls';
  end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then
    execute 'create role service_role nologin nosuperuser nocreatedb nocreaterole inherit noreplication bypassrls';
  end if;
  -- Stand-in for the platform role production grants INSERT/SELECT to.
  if not exists(select 1 from pg_roles where rolname='sandbox_exec') then
    execute 'create role sandbox_exec nologin';
  end if;
  if exists(
    select 1 from pg_roles
    where rolname in ('anon','authenticated')
      and (rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolcanlogin)
  ) then
    raise exception 'existing harness client role has unsafe attributes' using errcode = '55000';
  end if;
end
$roles$;
create schema public authorization postgres;
create schema auth authorization postgres;
grant usage on schema public, auth to anon, authenticated, service_role;
-- Supabase-style creation defaults: every new public table grants the
-- browser roles every privilege, as production's user_roles still shows.
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to anon, authenticated, service_role;
create table auth.users(id uuid primary key);
create function auth.uid()
returns uuid
language sql
stable
set search_path to 'pg_catalog', 'pg_temp'
as $$
  select nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
revoke all on function auth.uid() from public;
grant execute on function auth.uid() to anon, authenticated, service_role;
`;

const SEED_SQL = `
grant insert, select on public.user_roles to sandbox_exec;
insert into auth.users(id) values ('${OPERATOR_ID}'), ('${GROWER_ID}');
insert into public.user_roles(user_id, role) values
  ('${OPERATOR_ID}', 'operator'),
  ('${GROWER_ID}', 'customer');
-- The staff-grant trigger pattern: a SECURITY DEFINER function owned by the
-- table owner may still write roles after the client grants are gone.
create function public.harness_definer_grant(p_user_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.user_roles(user_id, role) values (p_user_id, 'operator')
  on conflict (user_id, role) do nothing
$$;
revoke all on function public.harness_definer_grant(uuid) from public, anon;
grant execute on function public.harness_definer_grant(uuid) to authenticated;
`;

/** Read-only proof that the target is the disposable database on the expected major version. */
export function buildTargetAttestationSql(pgMajor) {
  if (!SUPPORTED_PG_MAJORS.includes(pgMajor)) throw new Error("pg_major_rejected");
  return `
begin;
set transaction read only;
set local lock_timeout = '5s';
set local statement_timeout = '10s';
set local search_path = pg_catalog, pg_temp;
select case
  when current_database() = '${DISPOSABLE_DATABASE}'
   and current_user = '${DISPOSABLE_DATABASE_USER}'
   and current_setting('server_version_num')::integer / 10000 = ${pgMajor}
   and coalesce((
     select n.nspowner = current_user::regrole
        and c.relowner = current_user::regrole
        and c.relkind = 'r'
        and c.relpersistence = 'p'
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = '${DISPOSABLE_SCHEMA}'
       and c.relname = 'runtime_sentinel'
   ), false)
   and coalesce((
     select count(*) = 1 and bool_and(sentinel = '${DISPOSABLE_SENTINEL}')
     from ${DISPOSABLE_SCHEMA}.runtime_sentinel
   ), false)
  then '${DISPOSABLE_SENTINEL}'
  else 'rejected'
end;
commit;
`;
}

function attestDisposableTarget(pgMajor, env, spawnImpl) {
  const observed = executeSql(buildTargetAttestationSql(pgMajor), env, {
    stage: "target_attestation",
    spawnImpl,
  });
  if (observed !== DISPOSABLE_SENTINEL) throw new Error("database_target_attestation_rejected");
}

/** Production baseline: scaffold + the reviewed user_roles DDL + measured grants + seed. */
function resetBaseline(env, spawnImpl) {
  executeSql(
    `begin;\n${BASE_SCAFFOLD_SQL}\n${readUserRolesPrerequisite()}\n${SEED_SQL}\ncommit;`,
    env,
    { stage: "baseline", spawnImpl },
  );
}

function applyMigration(env, spawnImpl) {
  return spawnPsql({ env, input: `\\set VERBOSITY sqlstate\n${readMigration()}`, spawnImpl });
}

function requireMigrationSuccess(label, env, spawnImpl) {
  const result = applyMigration(env, spawnImpl);
  if (result?.error || result?.status !== 0) {
    throw new Error(formatPsqlFailureCode(label, result?.stderr));
  }
}

function requireMigrationFailure(label, env, spawnImpl) {
  const result = applyMigration(env, spawnImpl);
  if (!result?.error && result?.status === 0) throw new Error(`${label}:unexpected_success`);
  if (formatPsqlFailureCode(label, result?.stderr) !== `${label}:55000`) {
    throw new Error(`${label}:wrong_failure`);
  }
}

/** Direct grants for PUBLIC, anon and authenticated, in migration order. */
function clientAcl(env, spawnImpl) {
  return executeSql(
    `select coalesce(string_agg(format('%s|%s|%s', coalesce(g.rolname, 'PUBLIC'), a.privilege_type, a.is_grantable),
       ',' order by coalesce(g.rolname, 'PUBLIC'), a.privilege_type), '')
     from pg_class c
     cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
     left join pg_roles g on g.oid = a.grantee
     where c.oid = 'public.user_roles'::regclass
       and (a.grantee = 0 or g.rolname in ('anon', 'authenticated'));`,
    env,
    { stage: "client_acl", spawnImpl },
  );
}

/** Everything the migration must preserve: other grantees, column grants, policies, rows. */
function preservedDigest(env, spawnImpl) {
  return executeSql(
    `select md5(concat_ws(E'\\n',
       (select string_agg(format('%s|%s|%s|%s', g.rolname, a.privilege_type, a.is_grantable, gr.rolname),
          ',' order by g.rolname, a.privilege_type)
        from pg_class c
        cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
        join pg_roles g on g.oid = a.grantee
        join pg_roles gr on gr.oid = a.grantor
        where c.oid = 'public.user_roles'::regclass and g.rolname not in ('anon', 'authenticated')),
       (select string_agg(format('%s|%s|%s|%s|%s', p.polname, p.polcmd, p.polpermissive, p.polroles::text,
          coalesce(pg_get_expr(p.polqual, p.polrelid), '')), ',' order by p.polname)
        from pg_policy p where p.polrelid = 'public.user_roles'::regclass),
       (select string_agg(format('%s|%s', user_id, role), ',' order by user_id, role)
        from public.user_roles),
       (select c.relrowsecurity::text || c.relforcerowsecurity::text || c.relowner::regrole::text
        from pg_class c where c.oid = 'public.user_roles'::regclass)
     ));`,
    env,
    { stage: "preserved_digest", spawnImpl },
  );
}

function asRole(role, sql, userId = null) {
  return `begin;
${userId ? `set local request.jwt.claim.sub = '${userId}';` : ""}
set local role ${role};
${sql}
rollback;`;
}

function proveBaselineHole(env, spawnImpl) {
  resetBaseline(env, spawnImpl);
  // RLS still stops a self-granted operator row …
  requireSqlFailure(
    "baseline_anon_insert_rls",
    asRole(
      "anon",
      `insert into public.user_roles(user_id, role) values ('${GROWER_ID}', 'operator');`,
    ),
    "42501",
    env,
    spawnImpl,
  );
  // … but not TRUNCATE: at baseline anon can empty the table.
  requireSqlTrue(
    "baseline_anon_truncate_succeeds",
    asRole(
      "anon",
      `truncate public.user_roles;
       reset role;
       select count(*) = 0 from public.user_roles;`,
    ),
    env,
    spawnImpl,
  );
}

function proveHardenedEndState(env, spawnImpl) {
  resetBaseline(env, spawnImpl);
  const before = preservedDigest(env, spawnImpl);
  requireMigrationSuccess("apply", env, spawnImpl);
  if (clientAcl(env, spawnImpl) !== EXPECTED_CLIENT_ACL.join(",")) {
    throw new Error("apply:client_acl_not_canonical");
  }
  if (preservedDigest(env, spawnImpl) !== before) throw new Error("apply:preserved_state_changed");

  for (const [label, sql] of [
    ["anon_select", "select count(*) from public.user_roles;"],
    [
      "anon_insert",
      `insert into public.user_roles(user_id, role) values ('${GROWER_ID}', 'operator');`,
    ],
    ["anon_truncate", "truncate public.user_roles;"],
  ]) {
    requireSqlFailure(label, asRole("anon", sql), "42501", env, spawnImpl);
  }
  for (const [label, sql] of [
    [
      "operator_client_insert",
      `insert into public.user_roles(user_id, role) values ('${GROWER_ID}', 'operator');`,
    ],
    [
      "operator_client_update",
      `update public.user_roles set role = 'operator' where user_id = '${GROWER_ID}';`,
    ],
    ["operator_client_delete", `delete from public.user_roles where user_id = '${GROWER_ID}';`],
    ["operator_client_truncate", "truncate public.user_roles;"],
  ]) {
    requireSqlFailure(label, asRole("authenticated", sql, OPERATOR_ID), "42501", env, spawnImpl);
  }
  requireSqlTrue(
    "grower_reads_own_role",
    asRole(
      "authenticated",
      `select count(*) = 1 and bool_and(user_id = '${GROWER_ID}' and role = 'customer')
       from public.user_roles;`,
      GROWER_ID,
    ),
    env,
    spawnImpl,
  );
  requireSqlTrue(
    "has_role_still_resolves",
    asRole(
      "authenticated",
      `select public.has_role(auth.uid(), 'operator') and not public.has_role('${GROWER_ID}', 'operator');`,
      OPERATOR_ID,
    ),
    env,
    spawnImpl,
  );
  requireSqlTrue(
    "service_role_writes",
    asRole(
      "service_role",
      `insert into public.user_roles(user_id, role) values ('${GROWER_ID}', 'operator');
       select count(*) = 3 from public.user_roles;`,
    ),
    env,
    spawnImpl,
  );
  requireSqlTrue(
    "definer_grant_still_writes",
    asRole(
      "authenticated",
      `select public.harness_definer_grant('${GROWER_ID}');
       reset role;
       select count(*) = 1 from public.user_roles where user_id = '${GROWER_ID}' and role = 'operator';`,
      GROWER_ID,
    ),
    env,
    spawnImpl,
  );

  const hardened = preservedDigest(env, spawnImpl);
  requireMigrationSuccess("reapply", env, spawnImpl);
  if (clientAcl(env, spawnImpl) !== EXPECTED_CLIENT_ACL.join(",")) {
    throw new Error("reapply:client_acl_changed");
  }
  if (preservedDigest(env, spawnImpl) !== hardened) throw new Error("reapply:state_changed");
}

function proveColumnGrantsRemoved(env, spawnImpl) {
  resetBaseline(env, spawnImpl);
  executeSql(
    "grant insert (role), update (role) on public.user_roles to authenticated; grant select (role) on public.user_roles to anon;",
    env,
    { stage: "column_grant_setup", spawnImpl },
  );
  requireMigrationSuccess("column_apply", env, spawnImpl);
  requireSqlTrue(
    "column_grants_removed",
    `select not has_any_column_privilege('authenticated', 'public.user_roles', 'INSERT,UPDATE,REFERENCES')
        and not has_any_column_privilege('anon', 'public.user_roles', 'SELECT,INSERT,UPDATE,REFERENCES')
        and not exists (select 1 from pg_attribute where attrelid = 'public.user_roles'::regclass
                          and attnum > 0 and attacl is not null);`,
    env,
    spawnImpl,
  );
}

/** Each case runs on a fresh baseline; the migration must fail with 55000 and change nothing. */
export const FAIL_CLOSED_CASES = Object.freeze([
  {
    label: "inherited_client_write",
    setup: `do $r$ begin
              if not exists (select 1 from pg_roles where rolname = 'user_roles_harness_writer') then
                create role user_roles_harness_writer nologin;
              end if;
            end $r$;
            grant insert on public.user_roles to user_roles_harness_writer;
            grant user_roles_harness_writer to authenticated;`,
    cleanup: "revoke user_roles_harness_writer from authenticated;",
  },
  {
    // TRUNCATE is not a column privilege, so only the per-privilege check
    // can see it arriving through membership.
    label: "inherited_client_truncate",
    setup: `do $r$ begin
              if not exists (select 1 from pg_roles where rolname = 'user_roles_harness_truncator') then
                create role user_roles_harness_truncator nologin;
              end if;
            end $r$;
            grant truncate on public.user_roles to user_roles_harness_truncator;
            grant user_roles_harness_truncator to anon;`,
    cleanup: "revoke user_roles_harness_truncator from anon;",
  },
  {
    label: "rls_disabled",
    setup: "alter table public.user_roles disable row level security;",
  },
  {
    label: "owner_drift",
    setup: "alter table public.user_roles owner to service_role;",
  },
  {
    label: "client_role_bypassrls",
    setup: "alter role authenticated bypassrls;",
    cleanup: "alter role authenticated nobypassrls;",
  },
]);

/** PostgreSQL 17 only: MAINTAIN, and so this case, does not exist before 17. */
export const PG17_FAIL_CLOSED_CASES = Object.freeze([
  {
    label: "inherited_client_maintain",
    setup: `do $r$ begin
              if not exists (select 1 from pg_roles where rolname = 'user_roles_harness_maintainer') then
                create role user_roles_harness_maintainer nologin;
              end if;
            end $r$;
            grant maintain on public.user_roles to user_roles_harness_maintainer;
            grant user_roles_harness_maintainer to authenticated;`,
    cleanup: "revoke user_roles_harness_maintainer from authenticated;",
  },
]);

function proveFailClosed(cases, env, spawnImpl) {
  for (const drift of cases) {
    resetBaseline(env, spawnImpl);
    executeSql(drift.setup, env, { stage: `${drift.label}_setup`, spawnImpl });
    try {
      const before = `${clientAcl(env, spawnImpl)}#${preservedDigest(env, spawnImpl)}`;
      requireMigrationFailure(drift.label, env, spawnImpl);
      if (`${clientAcl(env, spawnImpl)}#${preservedDigest(env, spawnImpl)}` !== before) {
        throw new Error(`${drift.label}:state_changed`);
      }
    } finally {
      if (drift.cleanup) {
        executeSql(drift.cleanup, env, { stage: `${drift.label}_cleanup`, spawnImpl });
      }
    }
  }
}

/**
 * PostgreSQL 17 only. Supabase's default grants give the browser roles
 * MAINTAIN (VACUUM, ANALYZE, REINDEX, CLUSTER, LOCK TABLE), which RLS does
 * not govern; the migration's MAINTAIN branch must remove it.
 */
function proveMaintainRevoked(env, spawnImpl) {
  resetBaseline(env, spawnImpl);
  requireSqlTrue(
    "baseline_client_maintain",
    `select has_table_privilege('anon', 'public.user_roles', 'MAINTAIN')
        and has_table_privilege('authenticated', 'public.user_roles', 'MAINTAIN');`,
    env,
    spawnImpl,
  );
  requireSqlTrue(
    "baseline_anon_reindex_succeeds",
    asRole("anon", "reindex table public.user_roles;\nselect true;"),
    env,
    spawnImpl,
  );
  requireMigrationSuccess("maintain_apply", env, spawnImpl);
  requireSqlTrue(
    "client_maintain_revoked",
    `select not has_table_privilege('anon', 'public.user_roles', 'MAINTAIN')
        and not has_table_privilege('authenticated', 'public.user_roles', 'MAINTAIN');`,
    env,
    spawnImpl,
  );
  requireSqlFailure(
    "anon_reindex",
    asRole("anon", "reindex table public.user_roles;"),
    "42501",
    env,
    spawnImpl,
  );
  requireSqlFailure(
    "operator_client_reindex",
    asRole("authenticated", "reindex table public.user_roles;", OPERATOR_ID),
    "42501",
    env,
    spawnImpl,
  );
}

export async function runPg15Harness({
  databaseUrl = process.env.USER_ROLES_GRANTS_PG15_URL,
  pgMajor = process.env.USER_ROLES_GRANTS_PG_MAJOR ?? "15",
  spawnImpl = spawnSync,
} = {}) {
  if (!SUPPORTED_PG_MAJORS.includes(pgMajor)) return fail("pg_major_rejected");
  const connection = disposableConnection(databaseUrl);
  if (!connection) return fail("database_target_rejected");
  const env = psqlEnvironment(connection);
  try {
    attestDisposableTarget(pgMajor, env, spawnImpl);
    proveBaselineHole(env, spawnImpl);
    proveHardenedEndState(env, spawnImpl);
    proveColumnGrantsRemoved(env, spawnImpl);
    proveFailClosed(FAIL_CLOSED_CASES, env, spawnImpl);
    if (pgMajor === "17") {
      proveMaintainRevoked(env, spawnImpl);
      proveFailClosed(PG17_FAIL_CLOSED_CASES, env, spawnImpl);
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : "unknown");
  }
  process.stdout.write(`user_roles grant hardening PG${pgMajor} harness PASS\n`);
  return 0;
}

const isDirectInvocation =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectInvocation) process.exitCode = await runPg15Harness();
