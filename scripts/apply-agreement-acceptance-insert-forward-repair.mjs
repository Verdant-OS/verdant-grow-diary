#!/usr/bin/env node
/**
 * Fail-closed production delivery for the self-transactional Agreement
 * acceptance insert forward repair. This is deliberately not a generic
 * migration runner.
 *
 * This workflow must NEVER target
 * 20260813030000_signup_acquisition_forward_repair.sql or any signup
 * acquisition forward repair. It applies only the pinned agreement acceptance
 * insert migration below.
 *
 * The migration owns its BEGIN/COMMIT, so it is submitted byte-for-byte in a
 * plain psql --file invocation. Only after a read-only canonical postflight is
 * the collision-guarded Supabase migration-ledger row inserted in a separate,
 * short transaction. An interrupted run is recoverable from the exact
 * canonical-schema/absent-ledger state without replaying the migration.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findUnsafeSqlReason } from "./apply-pinned-production-migrations.mjs";
import { buildPsqlEnvironment, writeTextFile } from "./lib/candidateNumberToolRuntime.mjs";
import { hardenProductionPsqlEnvironment } from "./lib/productionSupabaseTls.mjs";
import { SOLO_FOUNDER_POLICY } from "./lib/solo-founder-production-authorization.mjs";
import {
  assertSupabaseDatabaseTargetIdentity,
  SUPABASE_DATABASE_TARGETS,
} from "./lib/supabaseDatabaseTargetIdentity.mjs";

export { findUnsafeSqlReason };

export const PRODUCTION_PROJECT_REF = SUPABASE_DATABASE_TARGETS.production.projectRef;
export const APPLY_CONFIRMATION = "APPLY AGREEMENT ACCEPTANCE INSERT FORWARD REPAIR";
export const EXPECTED_REPOSITORY = "Verdant-OS/verdant-grow-diary";
export const EXPECTED_WORKFLOW_PATH =
  ".github/workflows/apply-agreement-acceptance-insert-forward-repair.yml";

// This digest is intentionally immutable once reviewed. It is updated only
// when the migration bytes themselves receive a new review before merge.
export const PINNED_MIGRATION = Object.freeze({
  version: "20260824180000",
  name: "agreement_acceptance_insert_forward_repair",
  file: "20260824180000_agreement_acceptance_insert_forward_repair.sql",
  sha256: "290C69365994681721DEE1A13337E6CAECAB31D169B17047E36052781BEC87F2",
});

export const ACCEPTED_LEDGER_NAMES = Object.freeze([
  PINNED_MIGRATION.name,
  `${PINNED_MIGRATION.version}_${PINNED_MIGRATION.name}`,
]);

export const LEDGER_STATEMENT_MARKERS = Object.freeze([
  `-- applied verbatim by protected GitHub workflow; sha256=${PINNED_MIGRATION.sha256}`,
  "-- protected agreement-acceptance insert repair; self-transactional-migration=true;ledger-recovery=v1",
]);

export const EXPECTED_FUNCTION_FINGERPRINTS = Object.freeze({
  rpc: Object.freeze({ bytes: 2322, md5: "d99932de74daba42ba11e52ceaa2cf97" }),
  triggerFn: Object.freeze({ bytes: 167, md5: "4bb29eee825171ce88ca37ca69806268" }),
});

export const EXIT = Object.freeze({
  OK: 0,
  INPUT_REJECTED: 1,
  NO_DATABASE_URL: 2,
  TARGET_REJECTED: 3,
  FILE_REJECTED: 4,
  PSQL_NOT_INVOCABLE: 5,
  PREFLIGHT_FAILED: 6,
  LEDGER_DRIFT: 7,
  SCHEMA_DRIFT: 8,
  APPLY_FAILED: 9,
  POSTFLIGHT_FAILED: 10,
  POSTFLIGHT_CONTRACT_FAILED: 11,
  DEPLOY_HEAD_ADVANCED: 12,
  RECEIPT_MISMATCH: 13,
  PREREQUISITE_DRIFT: 14,
  TLS_TRUST_REJECTED: 15,
  LEDGER_INSERT_FAILED: 16,
});

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsRoot = resolve(repoRoot, "supabase", "migrations");
function sha256(value) {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function safeSha(value) {
  const text = String(value ?? "").trim();
  return /^[0-9a-f]{40}$/.test(text) ? text : null;
}

function safeDigest(value) {
  const text = String(value ?? "").trim();
  return /^[0-9a-f]{64}$/.test(text) ? text : null;
}

function safePositiveIntegerText(value) {
  const text = String(value ?? "").trim();
  if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(Number(text))) return null;
  return text;
}

function validateSoloFounderRunnerAuthorization(env) {
  if (
    env.GITHUB_RUN_ATTEMPT !== "1" ||
    env.SOLO_FOUNDER_ACKNOWLEDGEMENT !== SOLO_FOUNDER_POLICY.acknowledgement ||
    env.SOLO_FOUNDER_DELIVERY_MODE !== SOLO_FOUNDER_POLICY.deliveryMode ||
    env.SOLO_FOUNDER_VERIFIED_USER_ID !== String(SOLO_FOUNDER_POLICY.founderUserId) ||
    env.SOLO_FOUNDER_VERIFIED_LOGIN !== SOLO_FOUNDER_POLICY.founderLogin ||
    env.SOLO_FOUNDER_VERIFIED_ENVIRONMENT !== SOLO_FOUNDER_POLICY.environmentName ||
    env.SOLO_FOUNDER_ACKNOWLEDGEMENT_VERIFIED !== "true" ||
    env.SOLO_FOUNDER_ENVIRONMENT_CONTRACT_VERIFIED !== "true" ||
    env.SOLO_FOUNDER_ENVIRONMENT_APPROVAL_VERIFIED !== "true" ||
    env.SOLO_FOUNDER_MINIMUM_REVIEW_SECONDS !== String(SOLO_FOUNDER_POLICY.minimumReviewSeconds) ||
    env.SOLO_FOUNDER_MAXIMUM_REVIEW_SECONDS !== String(SOLO_FOUNDER_POLICY.maximumReviewSeconds)
  ) {
    return null;
  }
  return Object.freeze({
    delivery_mode: SOLO_FOUNDER_POLICY.deliveryMode,
    founder_github_user_id: SOLO_FOUNDER_POLICY.founderUserId,
    founder_github_login: SOLO_FOUNDER_POLICY.founderLogin,
    production_environment: SOLO_FOUNDER_POLICY.environmentName,
    solo_founder_acknowledgement_verified: true,
    environment_contract_verified: true,
    environment_approval_verified: true,
    minimum_review_seconds: SOLO_FOUNDER_POLICY.minimumReviewSeconds,
    maximum_review_seconds: SOLO_FOUNDER_POLICY.maximumReviewSeconds,
  });
}

function writeSoloFounderAuthorizationFailure({ env, logger, now }) {
  const reasonCode = "solo_founder_authorization_rejected";
  writeTextFile(
    env.REPORT_PATH ?? "",
    [
      "### Agreement acceptance insert forward repair",
      "",
      "**Status:** BLOCKED - solo-founder authorization rejected",
      "",
      `Reason code: ${reasonCode}`,
      "No database process was started. No untrusted authorization value is included.",
      "",
    ].join("\n"),
    logger,
    "Agreement acceptance insert delivery report",
  );
  writeTextFile(
    env.AUDIT_PATH ?? "",
    `${JSON.stringify(
      {
        schema_version: 1,
        tool: "apply-agreement-acceptance-insert-forward-repair",
        checked_at: now().toISOString(),
        outcome: "authorization_rejected",
        reason_code: reasonCode,
      },
      null,
      2,
    )}\n`,
    logger,
    "Agreement acceptance insert delivery audit",
  );
}

export function validatePinnedMigrationFile({
  root = migrationsRoot,
  readFile = readFileSync,
} = {}) {
  const path = resolve(root, PINNED_MIGRATION.file);
  const value = readFile(path);
  const raw = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const text = raw.toString("utf8");
  if (sha256(raw) !== PINNED_MIGRATION.sha256) {
    throw new Error(`hash_mismatch:${PINNED_MIGRATION.version}`);
  }
  if (text.includes("\r")) throw new Error(`crlf_not_allowed:${PINNED_MIGRATION.version}`);
  if (!text.endsWith("\n")) throw new Error(`final_newline_missing:${PINNED_MIGRATION.version}`);
  if (
    !/^--[\s\S]*?\nBEGIN;\n/.test(text) ||
    !/\nNOTIFY pgrst, 'reload schema';\n\nCOMMIT;\n$/.test(text)
  ) {
    throw new Error(`transaction_shape_mismatch:${PINNED_MIGRATION.version}`);
  }
  const unsafeReason = findUnsafeSqlReason(text);
  // The one reviewed file intentionally owns its exact BEGIN/COMMIT. Every
  // other generic-runner hazard remains rejected.
  if (unsafeReason && unsafeReason !== "transaction_control") {
    throw new Error(`${unsafeReason}:${PINNED_MIGRATION.version}`);
  }
  return Object.freeze({ ...PINNED_MIGRATION, path, text });
}

export const RESULT_KEYS = Object.freeze([
  "ledger_exact_count",
  "ledger_conflict_count",
  "ledger_exact_names",
  "ledger_statements_contract",
  "migration_ledger_contract",
  "required_roles_contract",
  "table_contract",
  "authenticated_select",
  "authenticated_insert",
  "authenticated_update",
  "authenticated_delete",
  "anon_select",
  "anon_insert",
  "anon_update",
  "anon_delete",
  "select_policy_count",
  "insert_policy_count",
  "update_policy_count",
  "delete_policy_count",
  "policy_expr_contract",
  "rpc_overload_count",
  "rpc_contract",
  "rpc_oid",
  "rpc_source_length",
  "rpc_source_md5",
  "trigger_contract",
  "canonical_contract",
]);

export const CATALOG_STATE_QUERY_SQL = `with target_ledger as (
  select sm.version, sm.name, sm.statements
  from supabase_migrations.schema_migrations sm
  where sm.version = ${sqlLiteral(PINNED_MIGRATION.version)}
     or sm.name in (${ACCEPTED_LEDGER_NAMES.map(sqlLiteral).join(", ")})
), exact_ledger as (
  select * from target_ledger
  where version = ${sqlLiteral(PINNED_MIGRATION.version)}
    and name in (${ACCEPTED_LEDGER_NAMES.map(sqlLiteral).join(", ")})
), migration_schema as (
  select n.* from pg_namespace n where n.nspname = 'supabase_migrations'
), migration_ledger as (
  select c.* from pg_class c
  join migration_schema n on n.oid = c.relnamespace
  where c.relname = 'schema_migrations'
), role_oids as (
  select
    max(oid) filter (where rolname='postgres') postgres_oid,
    max(oid) filter (where rolname='anon') anon_oid,
    max(oid) filter (where rolname='authenticated') authenticated_oid,
    max(oid) filter (where rolname='service_role') service_role_oid
  from pg_roles
), table_state as (
  select count(*)=1 contract
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname='user_agreement_acceptances'
    and c.relkind='r'
    and c.relrowsecurity
), rpc_overloads as (
  select count(*)::integer overload_count
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='record_own_agreement_acceptances'
), rpc_proc as (
  select p.*, owner_role.rolname owner_name, language_row.lanname language_name
  from pg_proc p
  join pg_roles owner_role on owner_role.oid=p.proowner
  join pg_language language_row on language_row.oid=p.prolang
  where p.oid=to_regprocedure('public.record_own_agreement_acceptances(jsonb)')
), rpc_state as (
  select
    coalesce((select p.oid::bigint from rpc_proc p),0) oid,
    coalesce((select octet_length(replace(p.prosrc,E'\\r','')) from rpc_proc p),0) source_length,
    coalesce((select md5(replace(p.prosrc,E'\\r','')) from rpc_proc p),'') source_md5,
    coalesce((select
      p.prokind='f' and p.prorettype='integer'::regtype and not p.proretset
      and p.language_name='plpgsql' and p.owner_name='postgres' and not p.prosecdef
      and not p.proisstrict and not p.proleakproof and p.provolatile='v'
      and p.proparallel='u' and p.pronargs=1 and p.pronargdefaults=0
      and p.proargmodes is null and p.proallargtypes is null
      and p.proargnames=array['p_acceptances']::text[]
      and oidvectortypes(p.proargtypes)='jsonb'
      and p.proconfig=array['search_path=public, pg_temp']::text[]
      and octet_length(replace(p.prosrc,E'\\r',''))=${EXPECTED_FUNCTION_FINGERPRINTS.rpc.bytes}
      and md5(replace(p.prosrc,E'\\r',''))='${EXPECTED_FUNCTION_FINGERPRINTS.rpc.md5}'
      and coalesce((select array_agg(
        format('%s|%s|%s|%s',coalesce(grantee.rolname,'PUBLIC'),acl.privilege_type,acl.is_grantable,grantor.rolname)
        order by coalesce(grantee.rolname,'PUBLIC'),acl.privilege_type
      )=array['authenticated|EXECUTE|f|postgres','postgres|EXECUTE|f|postgres','service_role|EXECUTE|f|postgres']::text[]
      from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
      left join pg_roles grantee on grantee.oid=acl.grantee
      join pg_roles grantor on grantor.oid=acl.grantor),false)
      and not has_function_privilege((select anon_oid from role_oids),p.oid,'EXECUTE')
      and has_function_privilege((select authenticated_oid from role_oids),p.oid,'EXECUTE')
      and has_function_privilege((select service_role_oid from role_oids),p.oid,'EXECUTE')
    from rpc_proc p),false) contract
), trigger_fn as (
  select p.*, owner_role.rolname owner_name, language_row.lanname language_name
  from pg_proc p
  join pg_roles owner_role on owner_role.oid=p.proowner
  join pg_language language_row on language_row.oid=p.prolang
  where p.oid=to_regprocedure('public.set_agreement_acceptance_timestamps()')
), trigger_state as (
  select
    coalesce((select
      p.prokind='f' and p.prorettype='trigger'::regtype and not p.proretset
      and p.language_name='plpgsql' and p.owner_name='postgres' and not p.prosecdef
      and p.proconfig=array['search_path=public, pg_temp']::text[]
      and octet_length(replace(p.prosrc,E'\\r',''))=${EXPECTED_FUNCTION_FINGERPRINTS.triggerFn.bytes}
      and md5(replace(p.prosrc,E'\\r',''))='${EXPECTED_FUNCTION_FINGERPRINTS.triggerFn.md5}'
    from trigger_fn p),false)
    and coalesce((select count(*)=1 and bool_and(
      not tg.tgisinternal and tg.tgenabled='O' and tg.tgtype=7
      and tg.tgqual is null and tg.tgnargs=0 and octet_length(tg.tgargs)=0
      and tg.tgparentid=0
      and tg.tgfoid=to_regprocedure('public.set_agreement_acceptance_timestamps()')
    ) from pg_trigger tg
    where tg.tgrelid=to_regclass('public.user_agreement_acceptances')
      and tg.tgname='trg_set_agreement_acceptance_timestamps'),false) contract
), policy_facts as (
  select
    (select count(*)::integer from pg_policy p
      where p.polrelid=to_regclass('public.user_agreement_acceptances')
        and p.polname='Users view own acceptances' and p.polpermissive and p.polcmd='r'
        and p.polroles=array[(select authenticated_oid from role_oids)]::oid[]
        and p.polwithcheck is null
        and md5(lower(regexp_replace(pg_get_expr(p.polqual,p.polrelid),'\\s+','','g')))='b3c61a20be8f6d80b62d4abd81066fab') select_policy_count,
    (select count(*)::integer from pg_policy p
      where p.polrelid=to_regclass('public.user_agreement_acceptances')
        and p.polname='Users insert own acceptances' and p.polpermissive and p.polcmd='a'
        and p.polroles=array[(select authenticated_oid from role_oids)]::oid[]
        and p.polqual is null and p.polwithcheck is not null
        and md5(lower(regexp_replace(pg_get_expr(p.polwithcheck,p.polrelid),'\\s+','','g')))='b3c61a20be8f6d80b62d4abd81066fab') insert_policy_count,
    (select count(*)::integer from pg_policy p
      where p.polrelid=to_regclass('public.user_agreement_acceptances')
        and p.polcmd='w'
        and p.polroles @> array[(select authenticated_oid from role_oids)]::oid[]) update_policy_count,
    (select count(*)::integer from pg_policy p
      where p.polrelid=to_regclass('public.user_agreement_acceptances')
        and p.polcmd='d'
        and p.polroles @> array[(select authenticated_oid from role_oids)]::oid[]) delete_policy_count
), privilege_state as (
  select
    coalesce(has_table_privilege((select authenticated_oid from role_oids),to_regclass('public.user_agreement_acceptances'),'SELECT'),false) authenticated_select,
    coalesce(has_table_privilege((select authenticated_oid from role_oids),to_regclass('public.user_agreement_acceptances'),'INSERT'),false) authenticated_insert,
    coalesce(has_table_privilege((select authenticated_oid from role_oids),to_regclass('public.user_agreement_acceptances'),'UPDATE'),false) authenticated_update,
    coalesce(has_table_privilege((select authenticated_oid from role_oids),to_regclass('public.user_agreement_acceptances'),'DELETE'),false) authenticated_delete,
    coalesce(has_table_privilege((select anon_oid from role_oids),to_regclass('public.user_agreement_acceptances'),'SELECT'),false) anon_select,
    coalesce(has_table_privilege((select anon_oid from role_oids),to_regclass('public.user_agreement_acceptances'),'INSERT'),false) anon_insert,
    coalesce(has_table_privilege((select anon_oid from role_oids),to_regclass('public.user_agreement_acceptances'),'UPDATE'),false) anon_update,
    coalesce(has_table_privilege((select anon_oid from role_oids),to_regclass('public.user_agreement_acceptances'),'DELETE'),false) anon_delete
), contract_state as (
  select
    (f.select_policy_count=1 and f.insert_policy_count=1
      and f.update_policy_count=0 and f.delete_policy_count=0
      and pr.authenticated_select and pr.authenticated_insert
      and not pr.authenticated_update and not pr.authenticated_delete
      and not pr.anon_select and not pr.anon_insert
      and not pr.anon_update and not pr.anon_delete
      and (select overload_count=1 from rpc_overloads)
      and (select contract from rpc_state)
      and (select contract from trigger_state)) canonical_contract,
    (f.select_policy_count=1 and f.insert_policy_count=1
      and md5(lower(regexp_replace(
        coalesce((select pg_get_expr(p.polqual,p.polrelid) from pg_policy p
          where p.polrelid=to_regclass('public.user_agreement_acceptances')
            and p.polname='Users view own acceptances' limit 1),''),'\\s+','','g')))='b3c61a20be8f6d80b62d4abd81066fab'
      and md5(lower(regexp_replace(
        coalesce((select pg_get_expr(p.polwithcheck,p.polrelid) from pg_policy p
          where p.polrelid=to_regclass('public.user_agreement_acceptances')
            and p.polname='Users insert own acceptances' limit 1),''),'\\s+','','g')))='b3c61a20be8f6d80b62d4abd81066fab') policy_expr_contract
  from policy_facts f cross join privilege_state pr
)
select json_build_object(
  'ledger_exact_count',(select count(*)::integer from exact_ledger),
  'ledger_conflict_count',(
    select (count(*) - (select count(*) from exact_ledger))::integer from target_ledger
  ),
  'ledger_exact_names',coalesce((select json_agg(name order by name) from exact_ledger),'[]'::json),
  'ledger_statements_contract',coalesce((select statements = array[
    ${LEDGER_STATEMENT_MARKERS.map(sqlLiteral).join(",\n    ")}
  ]::text[] from exact_ledger),false),
  'migration_ledger_contract',coalesce((
    select ledger.relkind = 'r'
      and ledger.relpersistence = 'p'
      and not ledger.relispartition
      and not ledger.relrowsecurity
      and not ledger.relforcerowsecurity
      and owner_role.rolname = 'postgres'
      and current_user = 'postgres'
      and coalesce((
        select array_agg(format('%s|%s|%s|%s|%s|%s|%s',a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attgenerated,a.attidentity,d.oid is null) order by a.attnum) = array[
          '1|version|text|t|||t','2|name|text|f|||t','3|statements|text[]|f|||t'
        ]::text[]
        from pg_attribute a
        left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
        where a.attrelid = ledger.oid and a.attnum > 0 and not a.attisdropped
      ),false)
      and coalesce((select count(*)=1 and bool_and(
        conname='schema_migrations_pkey' and contype='p' and convalidated
        and not condeferrable and not condeferred
        and pg_get_constraintdef(oid,true)='PRIMARY KEY (version)'
      ) from pg_constraint where conrelid=ledger.oid),false)
      and not exists(select 1 from pg_trigger where tgrelid=ledger.oid and not tgisinternal)
      and not exists(select 1 from pg_rewrite where ev_class=ledger.oid)
      and not exists(select 1 from pg_inherits where inhrelid=ledger.oid or inhparent=ledger.oid)
      and has_table_privilege(current_user,ledger.oid,'SELECT,INSERT')
    from migration_ledger ledger
    join pg_roles owner_role on owner_role.oid=ledger.relowner
  ),false),
  'required_roles_contract',coalesce((
    select count(*)=4 and bool_and(case
      when rolname='postgres' then oid=current_user::regrole
      when rolname='service_role' then
        not rolsuper and not rolinherit and not rolcreaterole and not rolcreatedb
        and not rolcanlogin and not rolreplication and rolbypassrls
      else
        not rolsuper and not rolinherit and not rolcreaterole and not rolcreatedb
        and not rolcanlogin and not rolreplication and not rolbypassrls end)
    from pg_roles where rolname in ('postgres','anon','authenticated','service_role')
  ),false),
  'table_contract',coalesce((select contract from table_state),false),
  'authenticated_select',coalesce((select authenticated_select from privilege_state),false),
  'authenticated_insert',coalesce((select authenticated_insert from privilege_state),false),
  'authenticated_update',coalesce((select authenticated_update from privilege_state),false),
  'authenticated_delete',coalesce((select authenticated_delete from privilege_state),false),
  'anon_select',coalesce((select anon_select from privilege_state),false),
  'anon_insert',coalesce((select anon_insert from privilege_state),false),
  'anon_update',coalesce((select anon_update from privilege_state),false),
  'anon_delete',coalesce((select anon_delete from privilege_state),false),
  'select_policy_count',coalesce((select select_policy_count from policy_facts),0),
  'insert_policy_count',coalesce((select insert_policy_count from policy_facts),0),
  'update_policy_count',coalesce((select update_policy_count from policy_facts),0),
  'delete_policy_count',coalesce((select delete_policy_count from policy_facts),0),
  'policy_expr_contract',coalesce((select policy_expr_contract from contract_state),false),
  'rpc_overload_count',coalesce((select overload_count from rpc_overloads),0),
  'rpc_contract',coalesce((select contract from rpc_state),false),
  'rpc_oid',coalesce((select oid from rpc_state),0),
  'rpc_source_length',coalesce((select source_length from rpc_state),0),
  'rpc_source_md5',coalesce((select source_md5 from rpc_state),''),
  'trigger_contract',coalesce((select contract from trigger_state),false),
  'canonical_contract',coalesce((select canonical_contract from contract_state),false)
)`;

export const PREFLIGHT_SQL = `
set transaction read only;
set local lock_timeout = '8s';
set local statement_timeout = '30s';
set local search_path = pg_catalog, public, pg_temp;
${CATALOG_STATE_QUERY_SQL};
`;

const BOOLEAN_KEYS = new Set([
  "ledger_statements_contract",
  "migration_ledger_contract",
  "required_roles_contract",
  "table_contract",
  "authenticated_select",
  "authenticated_insert",
  "authenticated_update",
  "authenticated_delete",
  "anon_select",
  "anon_insert",
  "anon_update",
  "anon_delete",
  "policy_expr_contract",
  "rpc_contract",
  "trigger_contract",
  "canonical_contract",
]);
const INTEGER_KEYS = new Set([
  "ledger_exact_count",
  "ledger_conflict_count",
  "select_policy_count",
  "insert_policy_count",
  "update_policy_count",
  "delete_policy_count",
  "rpc_overload_count",
  "rpc_oid",
  "rpc_source_length",
]);

export function parsePreflightStdout(stdout) {
  const lines = String(stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== 1) throw new Error(`preflight_row_count:${lines.length}`);
  let value;
  try {
    value = JSON.parse(lines[0]);
  } catch {
    throw new Error("preflight_result_shape");
  }
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...RESULT_KEYS].sort())
  ) {
    throw new Error("preflight_result_shape");
  }
  for (const key of BOOLEAN_KEYS) {
    if (typeof value[key] !== "boolean") throw new Error("preflight_result_shape");
  }
  for (const key of INTEGER_KEYS) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) {
      throw new Error("preflight_result_shape");
    }
  }
  if (
    !Array.isArray(value.ledger_exact_names) ||
    value.ledger_exact_names.length !== value.ledger_exact_count ||
    value.ledger_exact_names.some((name) => !ACCEPTED_LEDGER_NAMES.includes(name)) ||
    new Set(value.ledger_exact_names).size !== value.ledger_exact_names.length ||
    typeof value.rpc_source_md5 !== "string" ||
    !/^(?:[0-9a-f]{32})?$/.test(value.rpc_source_md5)
  ) {
    throw new Error("preflight_result_shape");
  }
  return Object.freeze({
    ...value,
    ledger_exact_names: Object.freeze([...value.ledger_exact_names]),
  });
}

const PREREQUISITE_KEYS = Object.freeze([
  "migration_ledger_contract",
  "required_roles_contract",
  "table_contract",
]);

function prerequisitesLive(result) {
  return PREREQUISITE_KEYS.every((key) => result?.[key] === true);
}

export function classifyPreflight(result) {
  if (!result || typeof result !== "object") return { status: "invalid", reason: "shape" };
  if (result.ledger_conflict_count !== 0 || result.ledger_exact_count > 1) {
    return { status: "ledger_drift", reason: "target_collision" };
  }
  if (!prerequisitesLive(result)) {
    return {
      status: "prerequisite_drift",
      reason: PREREQUISITE_KEYS.find((key) => result[key] !== true) ?? "table_contract",
    };
  }
  if (result.ledger_exact_count === 0) {
    if (result.canonical_contract === true) return { status: "schema_live_ledger_absent" };
    if (result.table_contract === true && result.canonical_contract === false) {
      return { status: "apply" };
    }
    return { status: "schema_drift", reason: "catalog_shape" };
  }
  if (result.ledger_exact_count !== 1) return { status: "invalid", reason: "ledger_shape" };
  if (result.canonical_contract === true && result.ledger_statements_contract === true) {
    return { status: "verify_only" };
  }
  return { status: "schema_drift", reason: "recorded_effect_mismatch" };
}

export function buildPreflightReceipt({ state, headSha }) {
  const safeHead = safeSha(headSha);
  if (!safeHead) throw new Error("receipt_head_sha");
  const canonicalState = Object.fromEntries(RESULT_KEYS.map((key) => [key, state?.[key]]));
  const payload = {
    schema_version: 1,
    project_ref: PRODUCTION_PROJECT_REF,
    head_sha: safeHead,
    migration_version: PINNED_MIGRATION.version,
    migration_name: PINNED_MIGRATION.name,
    migration_sha256: PINNED_MIGRATION.sha256,
    state: canonicalState,
  };
  return Object.freeze({
    ...payload,
    digest: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
  });
}

export function buildReadOnlyPsqlArgs() {
  return [
    "-X",
    "-q",
    "-A",
    "-t",
    "-v",
    "ON_ERROR_STOP=1",
    "--single-transaction",
    "-c",
    PREFLIGHT_SQL,
  ];
}

export function buildLedgerInsertSql() {
  const markers = `array[${LEDGER_STATEMENT_MARKERS.map(sqlLiteral).join(", ")}]::text[]`;
  return [
    "\\set ON_ERROR_STOP on",
    "begin;",
    "set local lock_timeout = '8s';",
    "set local statement_timeout = '30s';",
    "set local search_path = pg_catalog, public, pg_temp;",
    "select pg_advisory_xact_lock(20260824, 180000);",
    "lock table supabase_migrations.schema_migrations in share row exclusive mode;",
    "do $agreement_acceptance_insert_ledger_guard$",
    "declare",
    "  v_state json;",
    "begin",
    "  execute $catalog_state$",
    CATALOG_STATE_QUERY_SQL,
    "  $catalog_state$ into v_state;",
    "  if coalesce((v_state->>'ledger_exact_count')::integer,-1) <> 0",
    "     or coalesce((v_state->>'ledger_conflict_count')::integer,-1) <> 0",
    "     or not coalesce((v_state->>'migration_ledger_contract')::boolean,false)",
    "     or not coalesce((v_state->>'required_roles_contract')::boolean,false)",
    "     or not coalesce((v_state->>'table_contract')::boolean,false)",
    "     or not coalesce((v_state->>'canonical_contract')::boolean,false)",
    "     or coalesce((v_state->>'rpc_overload_count')::integer,-1) <> 1",
    "     or not coalesce((v_state->>'rpc_contract')::boolean,false)",
    `     or coalesce((v_state->>'rpc_source_length')::integer,-1) <> ${EXPECTED_FUNCTION_FINGERPRINTS.rpc.bytes}`,
    `     or coalesce(v_state->>'rpc_source_md5','') <> '${EXPECTED_FUNCTION_FINGERPRINTS.rpc.md5}'`,
    "     or not coalesce((v_state->>'trigger_contract')::boolean,false)",
    "     or not coalesce((v_state->>'policy_expr_contract')::boolean,false) then",
    "    raise exception using errcode='55000', message='agreement acceptance insert ledger collision or canonical contract drift';",
    "  end if;",
    "end",
    "$agreement_acceptance_insert_ledger_guard$;",
    "insert into supabase_migrations.schema_migrations(version,name,statements)",
    `values (${sqlLiteral(PINNED_MIGRATION.version)},${sqlLiteral(PINNED_MIGRATION.name)},${markers});`,
    "commit;",
    "",
  ].join("\n");
}

export function loadPinnedMigration(options = {}) {
  return validatePinnedMigrationFile(options);
}

function runReadOnlyQuery({ childEnv, spawnImpl }) {
  let result;
  try {
    result = spawnImpl("psql", buildReadOnlyPsqlArgs(), { encoding: "utf8", env: childEnv });
  } catch {
    return { ok: false, kind: "not_invocable" };
  }
  if (result?.error) return { ok: false, kind: "not_invocable" };
  if (result?.status !== 0) return { ok: false, kind: "query_failed" };
  return { ok: true, stdout: result.stdout };
}

function runPlainFile({ path, childEnv, spawnImpl, failureKind }) {
  let result;
  try {
    result = spawnImpl("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "--file", path], {
      encoding: "utf8",
      env: childEnv,
    });
  } catch {
    return { ok: false, kind: "not_invocable" };
  }
  if (result?.error) return { ok: false, kind: "not_invocable" };
  if (result?.status !== 0) return { ok: false, kind: failureKind };
  return { ok: true };
}

const AUDIT_OUTCOMES = new Set([
  "input_rejected",
  "deploy_head_advanced",
  "no_database_url",
  "target_rejected",
  "tls_trust_rejected",
  "file_rejected",
  "preflight_failed",
  "ledger_drift",
  "prerequisite_drift",
  "schema_drift",
  "safe_to_apply",
  "schema_live_ledger_absent",
  "already_applied_verified",
  "receipt_mismatch",
  "apply_failed",
  "postflight_failed",
  "postflight_contract_failed",
  "ledger_insert_failed",
  "applied_verified",
]);

function makeArtifactWriters({ reportPath, auditPath, receiptPath, authorization, now, logger }) {
  const writeReport = (status, lines) =>
    writeTextFile(
      reportPath,
      [
        "### Agreement acceptance insert forward repair",
        "",
        `**Status:** ${status}`,
        "",
        ...lines,
        "",
        "No connection string, password, database row, raw query output, raw database error, or CA material is included.",
        "",
      ].join("\n"),
      logger,
      "Agreement acceptance insert delivery report",
    );
  const writeAudit = (outcome, base, extra = {}) =>
    writeTextFile(
      auditPath,
      `${JSON.stringify(
        {
          schema_version: 1,
          tool: "apply-agreement-acceptance-insert-forward-repair",
          target_env: "production",
          project_ref: PRODUCTION_PROJECT_REF,
          checked_at: now().toISOString(),
          outcome: AUDIT_OUTCOMES.has(outcome) ? outcome : "preflight_failed",
          migration_version: PINNED_MIGRATION.version,
          migration_name: PINNED_MIGRATION.name,
          migration_sha256: PINNED_MIGRATION.sha256,
          expected_head_sha: safeSha(base.expectedHeadSha),
          observed_head_sha: safeSha(base.observedHeadSha),
          repository: base.repository,
          repository_id: base.repositoryId,
          workflow_path: EXPECTED_WORKFLOW_PATH,
          run_id: base.runId,
          run_attempt: base.runAttempt,
          operation: base.operation,
          ...authorization,
          ...(safeDigest(extra.receipt_digest) ? { receipt_digest: extra.receipt_digest } : {}),
          ...(new Set(["migration_then_ledger", "ledger_only"]).has(extra.recovery_path)
            ? { recovery_path: extra.recovery_path }
            : {}),
        },
        null,
        2,
      )}\n`,
      logger,
      "Agreement acceptance insert delivery audit",
    );
  const writeReceipt = (outcome, digest, base) =>
    writeTextFile(
      receiptPath,
      `${JSON.stringify(
        {
          schema_version: 1,
          tool: "apply-agreement-acceptance-insert-forward-repair",
          operation: "PREFLIGHT",
          outcome,
          safe_to_apply: true,
          repository: base.repository,
          repository_id: base.repositoryId,
          workflow_path: EXPECTED_WORKFLOW_PATH,
          run_id: base.runId,
          run_attempt: base.runAttempt,
          event: base.event,
          branch: base.branch,
          head_sha: base.expectedHeadSha,
          project_ref: PRODUCTION_PROJECT_REF,
          migration_version: PINNED_MIGRATION.version,
          migration_name: PINNED_MIGRATION.name,
          migration_sha256: PINNED_MIGRATION.sha256,
          state_digest: digest,
          ...authorization,
        },
        null,
        2,
      )}\n`,
      logger,
      "Agreement acceptance insert PREFLIGHT receipt",
    );
  return { writeReport, writeAudit, writeReceipt };
}

function blockedClassificationExit(classification) {
  if (classification.status === "ledger_drift" || classification.status === "invalid") {
    return EXIT.LEDGER_DRIFT;
  }
  if (classification.status === "prerequisite_drift") return EXIT.PREREQUISITE_DRIFT;
  return EXIT.SCHEMA_DRIFT;
}

export function runAgreementAcceptanceInsertForwardRepair({
  env = process.env,
  spawnImpl = spawnSync,
  readFile = readFileSync,
  logger = console,
  now = () => new Date(),
} = {}) {
  const authorization = validateSoloFounderRunnerAuthorization(env);
  if (!authorization) {
    logger.error("solo_founder_authorization_rejected");
    writeSoloFounderAuthorizationFailure({ env, logger, now });
    return EXIT.INPUT_REJECTED;
  }
  const operation = String(env.OPERATION ?? "").trim();
  const expectedHeadSha = String(env.EXPECTED_HEAD_SHA ?? "").trim();
  const observedHeadSha = String(env.GITHUB_SHA ?? "").trim();
  const currentDeployHeadSha = String(env.CURRENT_DEPLOY_HEAD_SHA ?? "").trim();
  const reviewedReceiptDigest = safeDigest(env.PREFLIGHT_RECEIPT_DIGEST);
  const repository = env.GITHUB_REPOSITORY === EXPECTED_REPOSITORY ? EXPECTED_REPOSITORY : null;
  const repositoryId = safePositiveIntegerText(env.GITHUB_REPOSITORY_ID);
  const runId = safePositiveIntegerText(env.GITHUB_RUN_ID);
  const runAttemptText = safePositiveIntegerText(env.GITHUB_RUN_ATTEMPT);
  const runAttempt = runAttemptText === null ? null : Number(runAttemptText);
  const expectedWorkflowRef = `${EXPECTED_REPOSITORY}/${EXPECTED_WORKFLOW_PATH}@refs/heads/verdant-grow-diary`;
  const base = {
    operation,
    expectedHeadSha,
    observedHeadSha,
    repository,
    repositoryId,
    runId,
    runAttempt,
    event: env.GITHUB_EVENT_NAME === "workflow_dispatch" ? "workflow_dispatch" : null,
    branch: env.GITHUB_REF_NAME === "verdant-grow-diary" ? "verdant-grow-diary" : null,
  };
  const { writeReport, writeAudit, writeReceipt } = makeArtifactWriters({
    reportPath: env.REPORT_PATH ?? "",
    auditPath: env.AUDIT_PATH ?? "",
    receiptPath: env.PREFLIGHT_RECEIPT_PATH ?? "",
    authorization,
    now,
    logger,
  });

  if (
    !["PREFLIGHT", "APPLY"].includes(operation) ||
    env.TARGET_ENV !== "production" ||
    env.CONFIRM_PROJECT_REF !== PRODUCTION_PROJECT_REF ||
    safeSha(expectedHeadSha) === null ||
    expectedHeadSha !== observedHeadSha ||
    repository === null ||
    repositoryId === null ||
    runId === null ||
    runAttempt === null ||
    env.GITHUB_WORKFLOW_REF !== expectedWorkflowRef ||
    base.event !== "workflow_dispatch" ||
    base.branch !== "verdant-grow-diary"
  ) {
    logger.error(
      "Agreement acceptance insert delivery inputs were rejected before database access.",
    );
    writeReport("BLOCKED - confirmation rejected", ["No database process was started."]);
    writeAudit("input_rejected", base);
    return EXIT.INPUT_REJECTED;
  }
  if (operation === "APPLY" && currentDeployHeadSha !== expectedHeadSha) {
    logger.error("The deploy branch advanced during environment review.");
    writeReport("BLOCKED - deploy branch advanced", [
      "Run a new PREFLIGHT from the current deploy head.",
    ]);
    writeAudit("deploy_head_advanced", base);
    return EXIT.DEPLOY_HEAD_ADVANCED;
  }
  if (
    operation === "APPLY" &&
    (env.CONFIRM_APPLY !== APPLY_CONFIRMATION ||
      reviewedReceiptDigest === null ||
      safePositiveIntegerText(env.PREFLIGHT_RUN_ID) === null)
  ) {
    logger.error("APPLY confirmation or reviewed receipt was rejected.");
    writeReport("BLOCKED - APPLY confirmation rejected", ["No database process was started."]);
    writeAudit("input_rejected", base);
    return EXIT.INPUT_REJECTED;
  }

  const databaseUrl = env.SUPABASE_DB_URL ?? "";
  if (!databaseUrl) {
    logger.error("The protected production database URL is not configured.");
    writeReport("BLOCKED - database secret missing", ["No database process was started."]);
    writeAudit("no_database_url", base);
    return EXIT.NO_DATABASE_URL;
  }

  let childEnv;
  try {
    assertSupabaseDatabaseTargetIdentity({ targetEnv: "production", databaseUrl });
    childEnv = buildPsqlEnvironment(env, databaseUrl, "production");
  } catch {
    logger.error("Production database identity was rejected.");
    writeReport("BLOCKED - target identity rejected", ["No database process was started."]);
    writeAudit("target_rejected", base);
    return EXIT.TARGET_REJECTED;
  }
  try {
    childEnv = hardenProductionPsqlEnvironment({ sourceEnv: env, childEnv });
  } catch {
    logger.error("Production database TLS trust was rejected.");
    writeReport("BLOCKED - production TLS trust rejected", ["No database process was started."]);
    writeAudit("tls_trust_rejected", base);
    return EXIT.TLS_TRUST_REJECTED;
  }

  let migration;
  try {
    migration = validatePinnedMigrationFile({ readFile });
  } catch {
    logger.error("Pinned migration validation failed.");
    writeReport("BLOCKED - migration artifact rejected", ["No database process was started."]);
    writeAudit("file_rejected", base);
    return EXIT.FILE_REJECTED;
  }

  const preflight = runReadOnlyQuery({ childEnv, spawnImpl });
  if (!preflight.ok) {
    logger.error("Read-only Agreement acceptance insert preflight did not complete.");
    writeReport("BLOCKED - preflight failed", ["No migration SQL was submitted."]);
    writeAudit("preflight_failed", base);
    return preflight.kind === "not_invocable" ? EXIT.PSQL_NOT_INVOCABLE : EXIT.PREFLIGHT_FAILED;
  }
  let state;
  let classification;
  try {
    state = parsePreflightStdout(preflight.stdout);
    classification = classifyPreflight(state);
  } catch {
    logger.error("Read-only preflight result was rejected.");
    writeReport("BLOCKED - preflight malformed", ["No migration SQL was submitted."]);
    writeAudit("preflight_failed", base);
    return EXIT.PREFLIGHT_FAILED;
  }
  const receipt = buildPreflightReceipt({ state, headSha: expectedHeadSha });
  const receiptLine = `State-bound PREFLIGHT receipt: ${receipt.digest}`;

  if (!["apply", "schema_live_ledger_absent", "verify_only"].includes(classification.status)) {
    writeReport("BLOCKED - catalog contract drift", ["Nothing was written.", receiptLine]);
    writeAudit(
      classification.status === "ledger_drift"
        ? "ledger_drift"
        : classification.status === "prerequisite_drift"
          ? "prerequisite_drift"
          : "schema_drift",
      base,
      { receipt_digest: receipt.digest },
    );
    return blockedClassificationExit(classification);
  }

  if (operation === "PREFLIGHT") {
    if (classification.status === "verify_only") {
      logger.log("Agreement acceptance insert repair is already applied and verified.");
      writeReport("PASS - already_applied_verified", [
        "This PREFLIGHT was read-only.",
        receiptLine,
      ]);
      writeAudit("already_applied_verified", base, { receipt_digest: receipt.digest });
      return EXIT.OK;
    }
    const outcome =
      classification.status === "apply" ? "safe_to_apply" : "schema_live_ledger_absent";
    logger.log(
      outcome === "safe_to_apply"
        ? "Agreement acceptance insert PREFLIGHT is SAFE_TO_APPLY."
        : "Agreement acceptance insert PREFLIGHT found recoverable schema_live_ledger_absent.",
    );
    writeReport(
      outcome === "safe_to_apply" ? "PASS - SAFE_TO_APPLY" : "PASS - schema_live_ledger_absent",
      ["This PREFLIGHT was read-only.", receiptLine],
    );
    writeAudit(outcome, base, { receipt_digest: receipt.digest });
    writeReceipt(outcome, receipt.digest, base);
    return EXIT.OK;
  }

  if (classification.status === "verify_only") {
    logger.log("Agreement acceptance insert repair is already applied and verified.");
    writeReport("PASS - already_applied_verified", [
      "No persistent write was attempted.",
      receiptLine,
    ]);
    writeAudit("already_applied_verified", base, { receipt_digest: receipt.digest });
    return EXIT.OK;
  }
  if (reviewedReceiptDigest !== receipt.digest) {
    writeReport("BLOCKED - PREFLIGHT receipt mismatch", [
      "No migration file was submitted.",
      receiptLine,
    ]);
    writeAudit("receipt_mismatch", base, { receipt_digest: receipt.digest });
    return EXIT.RECEIPT_MISMATCH;
  }

  const recoveryPath = classification.status === "apply" ? "migration_then_ledger" : "ledger_only";
  if (classification.status === "apply") {
    const applied = runPlainFile({
      path: migration.path,
      childEnv,
      spawnImpl,
      failureKind: "apply_failed",
    });
    if (!applied.ok) {
      writeReport("FAIL - migration apply failed", ["No ledger row was inserted."]);
      writeAudit("apply_failed", base, { receipt_digest: receipt.digest });
      return applied.kind === "not_invocable" ? EXIT.PSQL_NOT_INVOCABLE : EXIT.APPLY_FAILED;
    }
  }

  // A fresh read-only postflight is required immediately before any ledger
  // write. This also makes the canonical/ledger-absent crash state explicit.
  const canonicalPostflight = runReadOnlyQuery({ childEnv, spawnImpl });
  if (!canonicalPostflight.ok) {
    writeReport("FAIL - canonical postflight unavailable", ["No ledger row was inserted."]);
    writeAudit("postflight_failed", base, { receipt_digest: receipt.digest });
    return canonicalPostflight.kind === "not_invocable"
      ? EXIT.PSQL_NOT_INVOCABLE
      : EXIT.POSTFLIGHT_FAILED;
  }
  let canonicalClassification;
  try {
    canonicalClassification = classifyPreflight(parsePreflightStdout(canonicalPostflight.stdout));
  } catch {
    canonicalClassification = { status: "invalid" };
  }
  if (canonicalClassification.status !== "schema_live_ledger_absent") {
    writeReport("FAIL - canonical postflight contract mismatch", ["No ledger row was inserted."]);
    writeAudit("postflight_contract_failed", base, { receipt_digest: receipt.digest });
    return EXIT.POSTFLIGHT_CONTRACT_FAILED;
  }

  const temporaryRoot = mkdtempSync(
    join(
      env.RUNNER_TEMP || env.TEMP || env.TMP || tmpdir(),
      "verdant-agreement-acceptance-ledger-",
    ),
  );
  const ledgerPath = join(temporaryRoot, `ledger-${PINNED_MIGRATION.version}.sql`);
  try {
    writeFileSync(ledgerPath, buildLedgerInsertSql(), { encoding: "utf8", mode: 0o600 });
    const ledger = runPlainFile({
      path: ledgerPath,
      childEnv,
      spawnImpl,
      failureKind: "ledger_insert_failed",
    });
    if (!ledger.ok) {
      writeReport("FAIL - ledger insert failed", [
        "The schema may be canonical with its ledger row absent; run a new PREFLIGHT.",
      ]);
      writeAudit("ledger_insert_failed", base, {
        receipt_digest: receipt.digest,
        recovery_path: recoveryPath,
      });
      return ledger.kind === "not_invocable" ? EXIT.PSQL_NOT_INVOCABLE : EXIT.LEDGER_INSERT_FAILED;
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }

  const finalPostflight = runReadOnlyQuery({ childEnv, spawnImpl });
  if (!finalPostflight.ok) {
    writeReport("FAIL - final postflight unavailable", ["Treat the delivery as unverified."]);
    writeAudit("postflight_failed", base, {
      receipt_digest: receipt.digest,
      recovery_path: recoveryPath,
    });
    return finalPostflight.kind === "not_invocable"
      ? EXIT.PSQL_NOT_INVOCABLE
      : EXIT.POSTFLIGHT_FAILED;
  }
  let finalClassification;
  try {
    finalClassification = classifyPreflight(parsePreflightStdout(finalPostflight.stdout));
  } catch {
    finalClassification = { status: "invalid" };
  }
  if (finalClassification.status !== "verify_only") {
    writeReport("FAIL - final postflight contract mismatch", [
      "The exact canonical agreement-acceptance contract and collision-guarded ledger row were not both proven.",
    ]);
    writeAudit("postflight_contract_failed", base, {
      receipt_digest: receipt.digest,
      recovery_path: recoveryPath,
    });
    return EXIT.POSTFLIGHT_CONTRACT_FAILED;
  }

  logger.log("Agreement acceptance insert repair and ledger state are verified.");
  writeReport("PASS - applied_verified", [
    "The exact self-transactional migration committed without an application write freeze.",
    "A canonical postflight passed before the separate collision-guarded ledger insert.",
    "The final read-only postflight proved the canonical agreement-acceptance contract and exact ledger row.",
  ]);
  writeAudit("applied_verified", base, {
    receipt_digest: receipt.digest,
    recovery_path: recoveryPath,
  });
  return EXIT.OK;
}

const isDirectInvocation =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectInvocation) process.exitCode = runAgreementAcceptanceInsertForwardRepair();
