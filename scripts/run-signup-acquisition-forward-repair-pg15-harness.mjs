#!/usr/bin/env node
import { readFileSync, rmSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  PREFLIGHT_SQL,
  LEDGER_STATEMENT_MARKERS,
  buildApplySql,
  buildReadOnlyPsqlArgs,
  classifyPreflight,
  parsePreflightStdout,
  schemaEffectLive,
  validatePinnedMigrationFile,
} from "./apply-signup-acquisition-forward-repair.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_PSQL_OUTPUT_BYTES = 1_048_576;

function fail(code) {
  throw new Error(`signup_repair_pg15_harness:${code}`);
}

function safeFailureCode(error) {
  if (!(error instanceof Error)) return "unexpected_error";
  const match = /^signup_repair_pg15_harness:([a-z0-9_]{1,80})$/.exec(error.message);
  return match?.[1] ?? "unexpected_error";
}

export function formatPsqlFailureCode(stage, stderr) {
  const safeStage = /^[a-z0-9_]{1,48}$/.test(stage) ? stage : "psql";
  const sqlState = /\bERROR:\s+([0-9A-Z]{5})\b/i.exec(String(stderr ?? ""))?.[1];
  return `${safeStage}_${sqlState?.toLowerCase() ?? "unknown"}`;
}

export function buildPsqlArgs({ quiet }) {
  if (!quiet) return buildReadOnlyPsqlArgs({ includeCommand: false });
  return ["-X", "-q", "-t", "-v", "ON_ERROR_STOP=1", "--single-transaction"];
}

function loopbackConnection(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("connection_rejected");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "::1"].includes(url.hostname) ||
    !url.username ||
    !url.pathname.slice(1)
  ) {
    fail("connection_rejected");
  }
  return Object.freeze({
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  });
}

function psqlEnvironment(connection) {
  const inherited = {};
  for (const key of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP"]) {
    if (process.env[key]) inherited[key] = process.env[key];
  }
  return Object.freeze({ ...inherited, ...connection, PGAPPNAME: "verdant-signup-repair-pg15-ci" });
}

function executeSql(sql, env, { quiet = true, failureCode = "psql" } = {}) {
  const result = spawnSync("psql", buildPsqlArgs({ quiet }), {
    encoding: "utf8",
    env,
    input: `\\set VERBOSITY sqlstate\n${sql}`,
    maxBuffer: MAX_PSQL_OUTPUT_BYTES,
  });
  if (result.error || result.status !== 0) {
    fail(formatPsqlFailureCode(failureCode, result.stderr));
  }
  return String(result.stdout ?? "");
}

function executeSqlExpectFailure(sql, env, expectedSqlState, failureCode) {
  const result = spawnSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "--single-transaction"], {
    encoding: "utf8",
    env,
    input: `\\set VERBOSITY sqlstate\n${sql}`,
    maxBuffer: MAX_PSQL_OUTPUT_BYTES,
  });
  if (
    result.error ||
    result.status === 0 ||
    !String(result.stderr ?? "").includes(expectedSqlState)
  ) {
    fail(failureCode);
  }
}

function spawnPsql({ env, input, file, applicationName }) {
  return new Promise((resolvePromise, rejectPromise) => {
    const args = ["-X", "-q", "-v", "ON_ERROR_STOP=1", "--single-transaction"];
    if (file) args.push("--file", file);
    const child = spawn("psql", args, {
      env: { ...env, PGAPPNAME: applicationName },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let outputBytes = 0;
    let settled = false;
    const rejectClosed = () => {
      if (settled) return;
      settled = true;
      child.kill();
      rejectPromise(new Error("signup_repair_pg15_harness:async_psql_failed"));
    };
    for (const stream of [child.stdout, child.stderr]) {
      stream.on("data", (chunk) => {
        outputBytes += chunk.length;
        if (outputBytes > MAX_PSQL_OUTPUT_BYTES) rejectClosed();
      });
    }
    child.on("error", rejectClosed);
    child.on("close", (status) => {
      if (settled) return;
      settled = true;
      if (status !== 0) rejectPromise(new Error("signup_repair_pg15_harness:async_psql_failed"));
      else resolvePromise();
    });
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

async function waitForDatabaseBoolean(env, sql, code) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (executeSql(sql, env, { quiet: false }).trim() === "t") return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  fail(code);
}

function extractFunctionDefinition(relativePath, functionPrefix) {
  const source = readFileSync(resolve(repoRoot, relativePath), "utf8");
  const start = source.indexOf(functionPrefix);
  if (start < 0) fail("dependency_source_missing");
  const end = source.indexOf("\n$$;", start);
  if (end < 0) fail("dependency_source_malformed");
  return source.slice(start, end + 4);
}

const generateReferralCodeDefinition = extractFunctionDefinition(
  "supabase/migrations/20260721194325_f96507e6-a612-4d26-a99d-2a261f2c0ad5.sql",
  "CREATE OR REPLACE FUNCTION public.generate_referral_code()",
);
const convertReferralDefinition = extractFunctionDefinition(
  "supabase/migrations/20260721194239_18592b2d-3ca9-4608-bbf5-c2262e422c70.sql",
  "CREATE OR REPLACE FUNCTION public.convert_referral(",
);
const hasRoleDefinition = extractFunctionDefinition(
  "supabase/migrations/20260517010926_65004f70-4e2c-48b3-bfcb-37bb8d2f0040.sql",
  "CREATE OR REPLACE FUNCTION public.has_role(",
);
const handleNewUserDefinition = extractFunctionDefinition(
  "supabase/migrations/20260721194325_f96507e6-a612-4d26-a99d-2a261f2c0ad5.sql",
  "CREATE OR REPLACE FUNCTION public.handle_new_user()",
);

const BASE_SCAFFOLD_SQL = `
drop schema if exists auth cascade;
drop schema if exists supabase_migrations cascade;
drop schema if exists public cascade;
create schema auth authorization postgres;
create schema supabase_migrations authorization postgres;
create schema public authorization postgres;

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'signup_repair_drift_owner') then create role signup_repair_drift_owner nologin; end if;
end
$roles$;

create table supabase_migrations.schema_migrations (
  version text primary key,
  name text,
  statements text[]
);

create table auth.users (
  id uuid primary key,
  raw_user_meta_data jsonb,
  created_at timestamptz,
  email character varying,
  email_confirmed_at timestamptz
);

create table public.profiles (
  user_id uuid primary key,
  display_name text,
  nugs_total bigint not null default 0,
  level integer not null default 0,
  tier text not null default 'seedling',
  current_badge text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  marketing_opt_in boolean not null default false,
  marketing_opt_in_at timestamptz,
  referral_code text
);
create unique index profiles_referral_code_uq
  on public.profiles(referral_code)
  where referral_code is not null;

create table public.subscriptions (
  user_id uuid not null references auth.users(id) on delete cascade,
  price_id text,
  created_at timestamptz not null default now(),
  environment text,
  status text,
  paddle_subscription_id text,
  current_period_end timestamptz
);

create type public.app_role as enum ('operator', 'customer');
create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  primary key (user_id, role)
);

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referee_user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  status text not null default 'pending',
  referrer_credits integer not null default 0,
  referee_credits integer not null default 0,
  environment text not null,
  created_at timestamptz not null default now(),
  converted_at timestamptz,
  meta jsonb not null default '{}'::jsonb
);
create unique index referrals_referee_uq on public.referrals(referee_user_id);

create function auth.uid()
returns uuid
language sql
stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

grant usage on schema public, auth to anon, authenticated;

create function public.grant_lovable_credits(uuid, integer, text, text, text)
returns void
language plpgsql
as $$ begin return; end $$;

${generateReferralCodeDefinition}
revoke all on function public.generate_referral_code() from public, anon, authenticated;

${convertReferralDefinition}
revoke all on function public.convert_referral(uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.convert_referral(uuid, uuid, text, text, boolean) to service_role;

${hasRoleDefinition}
alter function public.has_role(uuid, public.app_role) set search_path = public, pg_temp;
revoke all on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;

${handleNewUserDefinition}
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Model the grandfathered hosted-project defaults documented by supabase/seed.sql.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;
grant execute on function public.handle_new_user() to service_role;
`;

const PARTIAL_TARGET_SQL = `
create table public.signup_acquisition_attributions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  source text not null,
  created_at timestamptz not null default now()
);
`;

function resetScaffold(env) {
  executeSql(BASE_SCAFFOLD_SQL, env, { failureCode: "baseline_scaffold" });
}

function readPreflight(env) {
  return parsePreflightStdout(executeSql(PREFLIGHT_SQL, env, { quiet: false }));
}

function requireStatus(label, state, status, reason) {
  const classification = classifyPreflight(state);
  if (classification.status !== status || (reason && classification.reason !== reason)) {
    fail(`${label}_classification`);
  }
  return state;
}

function applyPinnedMigration(env, { trailingSql = "", expectFailure = false } = {}) {
  const migration = validatePinnedMigrationFile();
  const applyRoot = mkdtempSync(join(tmpdir(), "verdant-signup-repair-pg15-"));
  const applyPath = join(applyRoot, "apply.sql");
  try {
    writeFileSync(applyPath, `${buildApplySql(migration)}\n${trailingSql}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    const result = spawnSync(
      "psql",
      ["-X", "-q", "-v", "ON_ERROR_STOP=1", "--single-transaction", "--file", applyPath],
      { encoding: "utf8", env, maxBuffer: MAX_PSQL_OUTPUT_BYTES },
    );
    if (result.error || (expectFailure ? result.status === 0 : result.status !== 0)) {
      fail("apply_transaction");
    }
  } finally {
    rmSync(applyRoot, { recursive: true, force: true });
  }
}

function proveBaselineAndApply(env) {
  resetScaffold(env);
  const preapply_handle_fingerprint_preserved = executeSql(
    "select md5(pg_get_functiondef('public.handle_new_user()'::regprocedure)) = 'd67b343a174e86b5ba9ee065c43545ed';",
    env,
    { quiet: false },
  ).trim();
  if (preapply_handle_fingerprint_preserved !== "t") {
    fail("preapply_handle_fingerprint_preserved");
  }
  executeSql(
    `
      alter table auth.users disable trigger on_auth_user_created;
      insert into auth.users (id, raw_user_meta_data, created_at, email, email_confirmed_at)
      values (
        '01010101-0101-4101-8101-010101010101',
        '{"verdant_signup_source":"pricing_page"}'::jsonb,
        '2026-08-14T10:00:00Z'::timestamptz,
        'preexisting@example.invalid',
        null
      );
      alter table auth.users enable trigger on_auth_user_created;
    `,
    env,
  );
  const absent = readPreflight(env);
  requireStatus("baseline_absent", absent, "apply");
  if (absent.ledger_exact_count !== 0) fail("baseline_ledger_exact_count");

  applyPinnedMigration(env);

  const applied = readPreflight(env);
  requireStatus("postflight", applied, "verify_only");
  if (applied.ledger_exact_count !== 1 || applied.ledger_conflict_count !== 0) {
    fail("postflight_ledger_exact_count");
  }
  if (!schemaEffectLive(applied)) fail("postflight_exact_contract");

  const ledger_wrapper_markers_recorded = executeSql(
    `select statements = array[
      '${LEDGER_STATEMENT_MARKERS[0]}',
      '${LEDGER_STATEMENT_MARKERS[1]}'
    ]::text[]
    from supabase_migrations.schema_migrations
    where version = '20260813030000'
      and name = 'signup_acquisition_forward_repair';`,
    env,
    { quiet: false },
  ).trim();
  if (ledger_wrapper_markers_recorded !== "t") fail("ledger_wrapper_markers_recorded");

  const hosted_default_acl_normalized = executeSql(
    `
      select
        not has_table_privilege('service_role', 'public.signup_acquisition_attributions', 'SELECT,INSERT,UPDATE,DELETE')
        and not has_function_privilege('service_role', 'public.handle_new_user()', 'EXECUTE')
        and not has_function_privilege('service_role', 'public.record_signup_acquisition_first_touch(text)', 'EXECUTE')
        and not has_function_privilege('service_role', 'public.signup_acquisition_operator_snapshot()', 'EXECUTE')
        and not has_function_privilege('service_role', 'public.signup_to_paid_operator_snapshot()', 'EXECUTE')
        and has_function_privilege('authenticated', 'public.record_signup_acquisition_first_touch(text)', 'EXECUTE')
        and has_function_privilege('authenticated', 'public.signup_acquisition_operator_snapshot()', 'EXECUTE')
        and has_function_privilege('authenticated', 'public.signup_to_paid_operator_snapshot()', 'EXECUTE');
    `,
    env,
    { quiet: false },
  ).trim();
  if (hosted_default_acl_normalized !== "t") fail("hosted_default_acl_normalized");

  const preexisting_user_backfill = executeSql(
    `
      select exists (
        select 1 from public.signup_acquisition_attributions
        where user_id = '01010101-0101-4101-8101-010101010101'
          and source = 'pricing_page'
          and created_at = '2026-08-14T10:00:00Z'::timestamptz
      );
    `,
    env,
    { quiet: false },
  ).trim();
  if (preexisting_user_backfill !== "t") fail("preexisting_user_backfill");

  const attributed_auth_user_insert = executeSql(
    `
      insert into auth.users (id, raw_user_meta_data, created_at, email, email_confirmed_at)
      values (
        '11111111-1111-4111-8111-111111111111',
        '{"verdant_signup_source":"landing_page","display_name":"runtime"}'::jsonb,
        now(),
        'runtime-attributed@example.invalid',
        null
      );
      select exists (
        select 1 from public.signup_acquisition_attributions
        where user_id = '11111111-1111-4111-8111-111111111111'
          and source = 'landing_page'
      ) and exists (
        select 1 from public.profiles
        where user_id = '11111111-1111-4111-8111-111111111111'
      );
    `,
    env,
    { quiet: false },
  ).trim();
  if (attributed_auth_user_insert !== "t") fail("attributed_auth_user_insert");

  const unknown_source_is_not_attributed = executeSql(
    `
      insert into auth.users (id, raw_user_meta_data, created_at, email, email_confirmed_at)
      values (
        '22222222-2222-4222-8222-222222222222',
        '{"verdant_signup_source":"unknown","display_name":"runtime"}'::jsonb,
        now(),
        'runtime-unknown@example.invalid',
        null
      );
      select not exists (
        select 1 from public.signup_acquisition_attributions
        where user_id = '22222222-2222-4222-8222-222222222222'
      ) and exists (
        select 1 from public.profiles
        where user_id = '22222222-2222-4222-8222-222222222222'
      );
    `,
    env,
    { quiet: false },
  ).trim();
  if (unknown_source_is_not_attributed !== "t") fail("unknown_source_is_not_attributed");

  const idempotent_rerun = readPreflight(env);
  requireStatus("idempotent_rerun", idempotent_rerun, "verify_only");
}

function proveFirstTouchRpc(env) {
  executeSql(
    `
      insert into auth.users (id, raw_user_meta_data, created_at, email, email_confirmed_at)
      values
        ('33333333-3333-4333-8333-333333333333', '{}'::jsonb, now(), 'fresh-valid@example.invalid', null),
        ('44444444-4444-4444-8444-444444444444', '{}'::jsonb, now(), 'fresh-invalid@example.invalid', null),
        ('55555555-5555-4555-8555-555555555555', '{}'::jsonb, now() - interval '31 minutes', 'expired@example.invalid', null);
    `,
    env,
  );

  const first_touch_valid = executeSql(
    `
      set local role authenticated;
      set local "request.jwt.claim.sub" = '33333333-3333-4333-8333-333333333333';
      select public.record_signup_acquisition_first_touch('context_check');
    `,
    env,
    { quiet: false },
  ).trim();
  if (first_touch_valid !== "t") fail("first_touch_valid");
  if (
    executeSql(
      `select exists (
        select 1 from public.signup_acquisition_attributions
        where user_id = '33333333-3333-4333-8333-333333333333' and source = 'context_check'
      );`,
      env,
      { quiet: false },
    ).trim() !== "t"
  ) {
    fail("first_touch_valid");
  }

  const first_touch_invalid = executeSql(
    `
      set local role authenticated;
      set local "request.jwt.claim.sub" = '44444444-4444-4444-8444-444444444444';
      select not public.record_signup_acquisition_first_touch('not_allowlisted');
    `,
    env,
    { quiet: false },
  ).trim();
  if (first_touch_invalid !== "t") fail("first_touch_invalid");
  if (
    executeSql(
      `select not exists (
        select 1 from public.signup_acquisition_attributions
        where user_id = '44444444-4444-4444-8444-444444444444'
      );`,
      env,
      { quiet: false },
    ).trim() !== "t"
  ) {
    fail("first_touch_invalid");
  }

  const first_touch_expired = executeSql(
    `
      set local role authenticated;
      set local "request.jwt.claim.sub" = '55555555-5555-4555-8555-555555555555';
      select not public.record_signup_acquisition_first_touch('landing_page');
    `,
    env,
    { quiet: false },
  ).trim();
  if (first_touch_expired !== "t") fail("first_touch_expired");
  if (
    executeSql(
      `select not exists (
        select 1 from public.signup_acquisition_attributions
        where user_id = '55555555-5555-4555-8555-555555555555'
      );`,
      env,
      { quiet: false },
    ).trim() !== "t"
  ) {
    fail("first_touch_expired");
  }
}

function proveSnapshotsAndAccess(env) {
  executeSql(
    `
      insert into auth.users (id, raw_user_meta_data, created_at, email, email_confirmed_at)
      values
        ('66666666-6666-4666-8666-666666666666', '{"verdant_signup_source":"landing_page"}'::jsonb, now(), 'operator@example.invalid', now()),
        ('77777777-7777-4777-8777-777777777777', '{}'::jsonb, now(), 'customer@example.invalid', now());
      insert into public.user_roles (user_id, role)
      values ('66666666-6666-4666-8666-666666666666', 'operator');
      insert into public.subscriptions (
        user_id, price_id, created_at, environment, status, paddle_subscription_id, current_period_end
      ) values
        ('66666666-6666-4666-8666-666666666666', 'pro_monthly', now(), 'live', 'active', 'sub_active', now() + interval '30 days'),
        ('66666666-6666-4666-8666-666666666666', 'pro_monthly', now() - interval '1 day', 'live', 'active', 'sub_duplicate', now() + interval '20 days'),
        ('77777777-7777-4777-8777-777777777777', 'pro_monthly', now(), 'sandbox', 'active', 'sub_sandbox', now() + interval '30 days'),
        ('77777777-7777-4777-8777-777777777777', 'pro_monthly', now(), 'live', 'canceled', 'sub_canceled', now() + interval '30 days'),
        ('77777777-7777-4777-8777-777777777777', 'pro_monthly', now(), 'live', 'active', 'sub_expired', now() - interval '1 day');
    `,
    env,
  );

  const operator_snapshot_paid_fixture = executeSql(
    `
      set local role authenticated;
      set local "request.jwt.claim.sub" = '66666666-6666-4666-8666-666666666666';
      with acquisition as (
        select public.signup_acquisition_operator_snapshot() as body
      ), paid as (
        select public.signup_to_paid_operator_snapshot() as body
      )
      select
        (acquisition.body->>'ok')::boolean
        and (paid.body->>'ok')::boolean
        and (paid.body->'counts'->>'active_paid_total')::bigint = 1
        and (paid.body->'sources'->'landing_page'->>'active_paid')::bigint = 1
      from acquisition cross join paid;
    `,
    env,
    { quiet: false },
  ).trim();
  if (operator_snapshot_paid_fixture !== "t") fail("operator_snapshot_paid_fixture");

  const non_operator_snapshot_denial = executeSql(
    `
      set local role authenticated;
      set local "request.jwt.claim.sub" = '77777777-7777-4777-8777-777777777777';
      select
        public.signup_acquisition_operator_snapshot()->>'reason' = 'operator_required'
        and public.signup_to_paid_operator_snapshot()->>'reason' = 'operator_required';
    `,
    env,
    { quiet: false },
  ).trim();
  if (non_operator_snapshot_denial !== "t") fail("non_operator_snapshot_denial");

  if (
    executeSql(
      `select has_schema_privilege('anon', 'public', 'USAGE')
        and has_schema_privilege('authenticated', 'public', 'USAGE');`,
      env,
      { quiet: false },
    ).trim() !== "t"
  ) {
    fail("client_schema_usage_missing");
  }
  executeSqlExpectFailure(
    "set local role anon; select count(*) from public.signup_acquisition_attributions;",
    env,
    "42501",
    "direct_anon_table_denial",
  );
  executeSqlExpectFailure(
    "set local role anon; insert into public.signup_acquisition_attributions(user_id, source) values ('77777777-7777-4777-8777-777777777777', 'landing_page');",
    env,
    "42501",
    "direct_anon_table_denial",
  );

  executeSqlExpectFailure(
    "set local role authenticated; select count(*) from public.signup_acquisition_attributions;",
    env,
    "42501",
    "direct_authenticated_table_denial",
  );
  executeSqlExpectFailure(
    "set local role authenticated; insert into public.signup_acquisition_attributions(user_id, source) values ('77777777-7777-4777-8777-777777777777', 'landing_page');",
    env,
    "42501",
    "direct_authenticated_table_denial",
  );
}

function proveCompatiblePartial(env) {
  resetScaffold(env);
  executeSql(PARTIAL_TARGET_SQL, env);
  requireStatus("compatible_partial", readPreflight(env), "apply");
  applyPinnedMigration(env);
  const applied = readPreflight(env);
  requireStatus("compatible_partial_applied_verified", applied, "verify_only");
  if (!schemaEffectLive(applied)) fail("compatible_partial_applied_verified");
}

function proveLateTransactionRollback(env) {
  resetScaffold(env);
  requireStatus("late_transaction_baseline", readPreflight(env), "apply");
  applyPinnedMigration(env, {
    trailingSql:
      "do $late_transaction_failure$ begin raise exception 'intentional harness rollback'; end $late_transaction_failure$;",
    expectFailure: true,
  });
  const late_transaction_rollback = executeSql(
    `
      select
        to_regclass('public.signup_acquisition_attributions') is null
        and to_regprocedure('public.record_signup_acquisition_first_touch(text)') is null
        and to_regprocedure('public.signup_acquisition_operator_snapshot()') is null
        and to_regprocedure('public.signup_to_paid_operator_snapshot()') is null
        and md5(pg_get_functiondef('public.handle_new_user()'::regprocedure)) = 'd67b343a174e86b5ba9ee065c43545ed'
        and not exists (
          select 1 from supabase_migrations.schema_migrations
          where version = '20260813030000'
             or name in ('signup_acquisition_forward_repair', '20260813030000_signup_acquisition_forward_repair')
        );
    `,
    env,
    { quiet: false },
  ).trim();
  if (late_transaction_rollback !== "t") fail("late_transaction_rollback");
  requireStatus("late_transaction_rollback_state", readPreflight(env), "apply");
}

function proveLockedProfileIndexGuardRollback(env) {
  resetScaffold(env);
  requireStatus("locked_profile_index_guard_preflight", readPreflight(env), "apply");
  executeSql(
    `
      drop index public.profiles_referral_code_uq;
      create unique index profiles_referral_code_uq
        on public.profiles(display_name)
        where referral_code is not null;
    `,
    env,
  );
  applyPinnedMigration(env, { expectFailure: true });
  const locked_profile_index_guard_rollback = executeSql(
    `
      select
        to_regclass('public.signup_acquisition_attributions') is null
        and not exists (
          select 1 from supabase_migrations.schema_migrations
          where version = '20260813030000'
             or name in ('signup_acquisition_forward_repair', '20260813030000_signup_acquisition_forward_repair')
        );
    `,
    env,
    { quiet: false },
  ).trim();
  if (locked_profile_index_guard_rollback !== "t") {
    fail("locked_profile_index_guard_rollback");
  }
}

function proveUnexpectedDefaultAclRollback(env) {
  resetScaffold(env);
  requireStatus("unexpected_default_acl_preflight", readPreflight(env), "apply");
  executeSql(
    `
      alter default privileges for role postgres in schema public
        grant select on tables to signup_repair_drift_owner;
      alter default privileges for role postgres in schema public
        grant execute on functions to signup_repair_drift_owner;
    `,
    env,
  );
  applyPinnedMigration(env, { expectFailure: true });
  const unexpected_default_acl_rollback = executeSql(
    `
      select
        to_regclass('public.signup_acquisition_attributions') is null
        and to_regprocedure('public.record_signup_acquisition_first_touch(text)') is null
        and not exists (
          select 1 from supabase_migrations.schema_migrations
          where version = '20260813030000'
             or name in ('signup_acquisition_forward_repair', '20260813030000_signup_acquisition_forward_repair')
        );
    `,
    env,
    { quiet: false },
  ).trim();
  if (unexpected_default_acl_rollback !== "t") fail("unexpected_default_acl_rollback");
}

async function proveConcurrentSignupGapClosed(env) {
  resetScaffold(env);
  const migration = validatePinnedMigrationFile();
  const applyRoot = mkdtempSync(join(tmpdir(), "verdant-signup-repair-concurrency-"));
  const applyPath = join(applyRoot, "apply.sql");
  const lockStatement = "lock table auth.users in share row exclusive mode;";
  try {
    const applySql = buildApplySql(migration);
    if (!applySql.includes(lockStatement)) fail("concurrency_lock_missing");
    writeFileSync(
      applyPath,
      applySql.replace(lockStatement, `${lockStatement}\nselect pg_sleep(3);`),
      {
        encoding: "utf8",
        mode: 0o600,
      },
    );

    const applyPromise = spawnPsql({
      env,
      file: applyPath,
      applicationName: "signup-repair-concurrency-apply",
    });
    await waitForDatabaseBoolean(
      env,
      `select exists (
        select 1
        from pg_locks lock_row
        join pg_class relation on relation.oid = lock_row.relation
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        join pg_stat_activity activity on activity.pid = lock_row.pid
        where namespace.nspname = 'auth'
          and relation.relname = 'users'
          and lock_row.mode = 'ShareRowExclusiveLock'
          and lock_row.granted
          and activity.application_name = 'signup-repair-concurrency-apply'
      );`,
      "concurrency_apply_lock_not_observed",
    );

    const insertPromise = spawnPsql({
      env,
      input: `
        set local statement_timeout = '10s';
        insert into auth.users (id, raw_user_meta_data, created_at, email, email_confirmed_at)
        values (
          '88888888-8888-4888-8888-888888888888',
          '{"verdant_signup_source":"blueprint_targets"}'::jsonb,
          now(),
          'concurrent@example.invalid',
          null
        );
      `,
      applicationName: "signup-repair-concurrency-insert",
    });
    await waitForDatabaseBoolean(
      env,
      `select exists (
        select 1
        from pg_stat_activity waiter
        where waiter.application_name = 'signup-repair-concurrency-insert'
          and cardinality(pg_blocking_pids(waiter.pid)) > 0
      );`,
      "concurrency_insert_not_blocked",
    );
    await Promise.all([applyPromise, insertPromise]);

    const concurrent_signup_gap_closed = executeSql(
      `
        select exists (
          select 1 from public.profiles
          where user_id = '88888888-8888-4888-8888-888888888888'
        ) and exists (
          select 1 from public.signup_acquisition_attributions
          where user_id = '88888888-8888-4888-8888-888888888888'
            and source = 'blueprint_targets'
        );
      `,
      env,
      { quiet: false },
    ).trim();
    if (concurrent_signup_gap_closed !== "t") fail("concurrent_signup_gap_closed");
  } finally {
    rmSync(applyRoot, { recursive: true, force: true });
  }
}

function proveUnsafeMutation(
  env,
  label,
  mutationSql,
  { targetSql = PARTIAL_TARGET_SQL, reason } = {},
) {
  resetScaffold(env);
  if (targetSql) executeSql(targetSql, env);
  if (mutationSql) executeSql(mutationSql, env);
  requireStatus(label, readPreflight(env), "prerequisite_drift", reason);
}

function proveRecordedSchemaDrift(env, label, mutationSql) {
  resetScaffold(env);
  applyPinnedMigration(env);
  executeSql(mutationSql, env);
  requireStatus(label, readPreflight(env), "schema_drift", "recorded_effect_mismatch");
}

function proveUnsafeScenarios(env) {
  proveCompatiblePartial(env);
  proveUnsafeMutation(
    env,
    "unexpected_creation_default_acl",
    `alter default privileges for role postgres in schema public
       grant execute on functions to signup_repair_drift_owner;`,
    { targetSql: "", reason: "creation_default_acl_contract" },
  );
  proveUnsafeMutation(
    env,
    "check_false",
    "alter table public.signup_acquisition_attributions add constraint unsafe_check check (false);",
    { reason: "target_table_incompatible" },
  );
  proveUnsafeMutation(
    env,
    "unique_source_constraint",
    "alter table public.signup_acquisition_attributions add constraint unsafe_source_unique unique (source);",
    { reason: "target_table_incompatible" },
  );
  proveUnsafeMutation(
    env,
    "standalone_unique_source_index",
    "create unique index unsafe_source_uq on public.signup_acquisition_attributions(source);",
    { reason: "target_table_incompatible" },
  );
  proveUnsafeMutation(
    env,
    "extra_plain_index",
    "create index unsafe_created_at_idx on public.signup_acquisition_attributions(created_at);",
    { reason: "target_table_incompatible" },
  );
  proveUnsafeMutation(
    env,
    "extra_target_column",
    "alter table public.signup_acquisition_attributions add column unsafe_extra text;",
    { reason: "target_table_incompatible" },
  );
  proveUnsafeMutation(
    env,
    "altered_target_column",
    "alter table public.signup_acquisition_attributions alter column source type character varying;",
    { reason: "target_table_incompatible" },
  );
  proveUnsafeMutation(
    env,
    "extra_foreign_key",
    "alter table public.signup_acquisition_attributions add constraint unsafe_extra_fk foreign key (user_id) references auth.users(id);",
    { reason: "target_table_incompatible" },
  );
  proveUnsafeMutation(
    env,
    "extra_exclusion_constraint",
    "alter table public.signup_acquisition_attributions add constraint unsafe_exclusion exclude using gist (tstzrange(created_at, created_at, '[]') with &&);",
    { reason: "target_table_incompatible" },
  );
  proveUnsafeMutation(
    env,
    "target_user_trigger",
    `
      create function public.unsafe_target_trigger() returns trigger language plpgsql as $$ begin return new; end $$;
      create trigger unsafe_target_trigger before insert on public.signup_acquisition_attributions
      for each row execute function public.unsafe_target_trigger();
    `,
    { reason: "target_table_incompatible" },
  );
  proveUnsafeMutation(
    env,
    "target_rewrite_rule",
    "create rule unsafe_target_rule as on insert to public.signup_acquisition_attributions do instead nothing;",
    { reason: "target_table_incompatible" },
  );
  proveUnsafeMutation(
    env,
    "force_row_level_security",
    "alter table public.signup_acquisition_attributions enable row level security; alter table public.signup_acquisition_attributions force row level security;",
    { reason: "target_table_incompatible" },
  );
  proveUnsafeMutation(env, "partitioned_target", "", {
    targetSql: `
        create table public.signup_acquisition_attributions (
          user_id uuid primary key references auth.users(id) on delete cascade,
          source text not null,
          created_at timestamptz not null default now()
        ) partition by hash (user_id);
      `,
    reason: "target_table_incompatible",
  });
  proveUnsafeMutation(env, "unlogged_target", "", {
    targetSql: `
        create unlogged table public.signup_acquisition_attributions (
          user_id uuid primary key references auth.users(id) on delete cascade,
          source text not null,
          created_at timestamptz not null default now()
        );
      `,
    reason: "target_table_incompatible",
  });
  proveUnsafeMutation(
    env,
    "target_owner_drift",
    "alter table public.signup_acquisition_attributions owner to signup_repair_drift_owner;",
    { reason: "target_table_incompatible" },
  );
  proveUnsafeMutation(
    env,
    "target_acl_drift",
    "grant select on public.signup_acquisition_attributions to signup_repair_drift_owner;",
    { reason: "target_table_incompatible" },
  );
  proveUnsafeMutation(
    env,
    "missing_profiles_user_id_uniqueness",
    `alter table public.profiles drop constraint profiles_pkey;
     create unique index profiles_pkey on public.profiles(user_id);`,
    { targetSql: "", reason: "profiles_user_id_conflict_contract" },
  );
  proveUnsafeMutation(
    env,
    "altered_profiles_prerequisite",
    "alter table public.profiles alter column display_name type character varying;",
    { targetSql: "", reason: "profiles_contract" },
  );
  proveUnsafeMutation(
    env,
    "profile_omitted_required_column",
    "alter table public.profiles add column unsafe_required text not null;",
    { targetSql: "", reason: "profiles_insert_contract" },
  );
  proveUnsafeMutation(
    env,
    "profile_marketing_opt_in_at_not_null",
    "alter table public.profiles alter column marketing_opt_in_at set not null;",
    { targetSql: "", reason: "profiles_insert_contract" },
  );
  proveUnsafeMutation(
    env,
    "profile_marketing_opt_in_default_drift",
    "alter table public.profiles alter column marketing_opt_in set default true;",
    { targetSql: "", reason: "profiles_insert_contract" },
  );
  proveUnsafeMutation(
    env,
    "profile_check_not_valid",
    "alter table public.profiles add constraint unsafe_profile_check check (false) not valid;",
    { targetSql: "", reason: "profiles_insert_contract" },
  );
  proveUnsafeMutation(
    env,
    "profile_unique_constraint",
    "alter table public.profiles add constraint unsafe_profile_unique unique (display_name);",
    { targetSql: "", reason: "profiles_insert_contract" },
  );
  proveUnsafeMutation(
    env,
    "profile_exclusion_constraint",
    "alter table public.profiles add constraint unsafe_profile_exclusion exclude using gist (tstzrange(created_at, created_at, '[]') with &&);",
    { targetSql: "", reason: "profiles_insert_contract" },
  );
  proveUnsafeMutation(
    env,
    "profile_standalone_unique_index",
    "create unique index unsafe_profile_display_name_uq on public.profiles(display_name);",
    { targetSql: "", reason: "profiles_insert_contract" },
  );
  proveUnsafeMutation(
    env,
    "profile_insert_trigger",
    `
      create function public.unsafe_profile_insert_trigger() returns trigger
      language plpgsql as $$ begin return new; end $$;
      create trigger unsafe_profile_insert_trigger before insert on public.profiles
      for each row execute function public.unsafe_profile_insert_trigger();
    `,
    { targetSql: "", reason: "profiles_insert_contract" },
  );
  proveUnsafeMutation(
    env,
    "profile_insert_rule",
    "create rule unsafe_profile_insert_rule as on insert to public.profiles do instead nothing;",
    { targetSql: "", reason: "profiles_insert_contract" },
  );
  proveUnsafeMutation(
    env,
    "missing_user_roles",
    "alter table public.user_roles rename to user_roles_missing;",
    { targetSql: "", reason: "user_roles_contract" },
  );
  proveUnsafeMutation(
    env,
    "dependency_body_drift",
    `
      create or replace function public.generate_referral_code()
      returns text language plpgsql security definer set search_path = public, pg_temp
      as $$ begin return 'drift'; end $$;
    `,
    { targetSql: "", reason: "dependency_security_contract" },
  );
  proveUnsafeMutation(
    env,
    "dependency_search_path_drift",
    "alter function public.generate_referral_code() set search_path = public;",
    { targetSql: "", reason: "dependency_security_contract" },
  );
  proveUnsafeMutation(
    env,
    "dependency_owner_drift",
    "alter function public.generate_referral_code() owner to signup_repair_drift_owner;",
    { targetSql: "", reason: "dependency_security_contract" },
  );
  proveUnsafeMutation(
    env,
    "dependency_acl_drift",
    "grant execute on function public.generate_referral_code() to authenticated;",
    { targetSql: "", reason: "dependency_security_contract" },
  );
  proveUnsafeMutation(
    env,
    "target_function_owner_drift",
    `create function public.record_signup_acquisition_first_touch(p_source text)
       returns boolean language plpgsql security definer set search_path = public, pg_temp
       as $$ begin return true; end $$;
     alter function public.record_signup_acquisition_first_touch(text) owner to signup_repair_drift_owner;`,
    { targetSql: "", reason: "target_functions_preapply_contract" },
  );
  proveUnsafeMutation(
    env,
    "target_function_extra_role_acl",
    `
       create function public.record_signup_acquisition_first_touch(p_source text)
       returns boolean language plpgsql security definer set search_path = public, pg_temp
       as $$ begin return true; end $$;
       grant execute on function public.record_signup_acquisition_first_touch(text) to signup_repair_drift_owner;
     `,
    { targetSql: "", reason: "target_functions_preapply_contract" },
  );
  proveUnsafeMutation(
    env,
    "disabled_auth_trigger",
    "alter table auth.users disable trigger on_auth_user_created;",
    { targetSql: "", reason: "signup_trigger_contract" },
  );
  proveUnsafeMutation(
    env,
    "wrong_auth_trigger",
    `
      drop trigger on_auth_user_created on auth.users;
      create function public.wrong_handle_new_user() returns trigger language plpgsql as $$ begin return new; end $$;
      create trigger on_auth_user_created after insert on auth.users
      for each row execute function public.wrong_handle_new_user();
    `,
    { targetSql: "", reason: "signup_trigger_contract" },
  );
  proveUnsafeMutation(
    env,
    "migration_ledger_column_drift",
    "alter table supabase_migrations.schema_migrations alter column name set not null;",
    { targetSql: "", reason: "migration_ledger_contract" },
  );
  proveUnsafeMutation(
    env,
    "migration_ledger_owner_drift",
    "alter table supabase_migrations.schema_migrations owner to signup_repair_drift_owner;",
    { targetSql: "", reason: "migration_ledger_contract" },
  );
  proveUnsafeMutation(
    env,
    "migration_schema_owner_drift",
    "alter schema supabase_migrations owner to signup_repair_drift_owner;",
    { targetSql: "", reason: "migration_ledger_contract" },
  );
  proveUnsafeMutation(
    env,
    "migration_ledger_acl_drift",
    "grant select on supabase_migrations.schema_migrations to service_role;",
    { targetSql: "", reason: "migration_ledger_contract" },
  );
  proveUnsafeMutation(
    env,
    "migration_schema_acl_drift",
    "grant usage on schema supabase_migrations to service_role;",
    { targetSql: "", reason: "migration_ledger_contract" },
  );
  proveUnsafeMutation(
    env,
    "migration_ledger_insert_trigger",
    `
      create function public.unsafe_migration_ledger_trigger() returns trigger
      language plpgsql as $$ begin return new; end $$;
      create trigger unsafe_migration_ledger_trigger before insert
      on supabase_migrations.schema_migrations
      for each row execute function public.unsafe_migration_ledger_trigger();
    `,
    { targetSql: "", reason: "migration_ledger_contract" },
  );

  proveRecordedSchemaDrift(
    env,
    "altered_source_check_with_ledger",
    `
      alter table public.signup_acquisition_attributions
        drop constraint signup_acquisition_attributions_source_check;
      alter table public.signup_acquisition_attributions
        add constraint signup_acquisition_attributions_source_check
        check (source = 'landing_page');
    `,
  );
  proveRecordedSchemaDrift(
    env,
    "unvalidated_source_check_with_ledger",
    `
      alter table public.signup_acquisition_attributions
        drop constraint signup_acquisition_attributions_source_check;
      alter table public.signup_acquisition_attributions
        add constraint signup_acquisition_attributions_source_check check (
          source in (
            'landing_page','pricing_page','founder_page','founder_share',
            'pricing_interest_share','operator_outreach','grower_invite',
            'context_check','vpd_calculator','csv_history','blueprint_targets'
          )
        ) not valid;
    `,
  );
}

function proveCatalogShadowIsolation(env) {
  resetScaffold(env);
  executeSql(
    `create function public.md5(text)
       returns text
       language sql
       immutable
       as $$ select repeat('0', 32) $$;`,
    env,
  );

  requireStatus("hostile_public_md5_shadow_ignored", readPreflight(env), "apply");
  applyPinnedMigration(env);
  requireStatus("hostile_public_md5_shadow_postflight", readPreflight(env), "verify_only");
}

export async function runPg15Harness({ databaseUrl = process.env.SIGNUP_REPAIR_PG15_URL } = {}) {
  const env = psqlEnvironment(loopbackConnection(databaseUrl));
  const version = Number(executeSql("show server_version_num;", env, { quiet: false }).trim());
  if (!Number.isInteger(version) || version < 150000 || version >= 160000) {
    fail("postgres_major_not_15");
  }
  proveCatalogShadowIsolation(env);
  proveBaselineAndApply(env);
  proveFirstTouchRpc(env);
  proveSnapshotsAndAccess(env);
  proveLateTransactionRollback(env);
  proveLockedProfileIndexGuardRollback(env);
  proveUnexpectedDefaultAclRollback(env);
  await proveConcurrentSignupGapClosed(env);
  proveUnsafeScenarios(env);
  console.log("Signup-acquisition PostgreSQL 15 runtime harness passed all scenarios.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runPg15Harness();
  } catch (error) {
    console.error(
      `Signup-acquisition PostgreSQL 15 runtime harness failed closed. failure_code=${safeFailureCode(error)}`,
    );
    process.exitCode = 1;
  }
}
