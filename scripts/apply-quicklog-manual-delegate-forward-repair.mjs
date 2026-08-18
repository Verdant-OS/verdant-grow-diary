#!/usr/bin/env node
/**
 * Fail-closed production delivery for one self-transactional Quick Log
 * delegate repair. This is deliberately not a generic migration runner.
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
export const APPLY_CONFIRMATION = "APPLY QUICKLOG MANUAL DELEGATE FORWARD REPAIR";
export const EXPECTED_REPOSITORY = "Verdant-OS/verdant-grow-diary";
export const EXPECTED_WORKFLOW_PATH =
  ".github/workflows/apply-quicklog-manual-delegate-forward-repair.yml";

// This digest is intentionally immutable once reviewed. It is updated only
// when the migration bytes themselves receive a new review before merge.
export const PINNED_MIGRATION = Object.freeze({
  version: "20260818010000",
  name: "quicklog_manual_delegate_forward_repair",
  file: "20260818010000_quicklog_manual_delegate_forward_repair.sql",
  sha256: "641C033A6453B180505CFB4EEAD8C97EC0C89C7EC0A501A64D4D5B1B71897B1C",
});

export const ACCEPTED_LEDGER_NAMES = Object.freeze([
  PINNED_MIGRATION.name,
  `${PINNED_MIGRATION.version}_${PINNED_MIGRATION.name}`,
]);

export const LEDGER_STATEMENT_MARKERS = Object.freeze([
  `-- applied verbatim by protected GitHub workflow; sha256=${PINNED_MIGRATION.sha256}`,
  "-- protected wrapper; self-transactional-migration=true;ledger-recovery=v1",
]);

export const EXPECTED_FUNCTION_FINGERPRINTS = Object.freeze({
  wrapper: Object.freeze({ bytes: 7752, md5: "0d3098b81787fa90898da921345c0dbc" }),
  defectiveDelegate: Object.freeze({
    bytes: 6548,
    md5: "e161b2e15c8de2e5ae1048edb4c72c3d",
  }),
  canonicalDelegate: Object.freeze({
    bytes: 6734,
    md5: "7ec296e422f7f47c8b2793b051840798",
  }),
  tryParseLoggedAt: Object.freeze({
    bytes: 414,
    md5: "77f1aa70a70a9714057ef226b6996149",
  }),
  tryParseUuid: Object.freeze({ bytes: 289, md5: "a34d120aad5c37a33ac05fd9597624f4" }),
  tryParseUuidFreshReplay: Object.freeze({
    bytes: 290,
    md5: "4b132ee2034f8e2887da1af582295ad8",
  }),
  stampLoggedAt: Object.freeze({
    bytes: 276,
    md5: "d9df46d36eb5d7aac767a3c87e53e92f",
  }),
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
const MANUAL_SIGNATURE =
  "text, uuid, text, numeric, text, numeric, numeric, numeric, timestamp with time zone, jsonb, text, text";

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
      "### Quick Log manual delegate forward repair",
      "",
      "**Status:** BLOCKED - solo-founder authorization rejected",
      "",
      `Reason code: ${reasonCode}`,
      "No database process was started. No untrusted authorization value is included.",
      "",
    ].join("\n"),
    logger,
    "Quick Log delegate delivery report",
  );
  writeTextFile(
    env.AUDIT_PATH ?? "",
    `${JSON.stringify(
      {
        schema_version: 1,
        tool: "apply-quicklog-manual-delegate-forward-repair",
        checked_at: now().toISOString(),
        outcome: "authorization_rejected",
        reason_code: reasonCode,
      },
      null,
      2,
    )}\n`,
    logger,
    "Quick Log delegate delivery audit",
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
    !/\nCOMMIT;\n\nNOTIFY pgrst, 'reload schema';\n$/.test(text)
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

const EXPECTED_ARGUMENT_NAMES_SQL = `array[
          'p_target_type','p_target_id','p_action','p_volume_ml','p_note',
          'p_temperature_c','p_humidity_pct','p_vpd_kpa','p_occurred_at',
          'p_details','p_idempotency_key','p_stage'
        ]::text[]`;

const EXPECTED_FUNCTION_ARGUMENTS_SQL = sqlLiteral(
  "p_target_type text, p_target_id uuid, p_action text, p_volume_ml numeric DEFAULT NULL::numeric, p_note text DEFAULT NULL::text, p_temperature_c numeric DEFAULT NULL::numeric, p_humidity_pct numeric DEFAULT NULL::numeric, p_vpd_kpa numeric DEFAULT NULL::numeric, p_occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_details jsonb DEFAULT NULL::jsonb, p_idempotency_key text DEFAULT NULL::text, p_stage text DEFAULT NULL::text",
);

export const RESULT_KEYS = Object.freeze([
  "ledger_exact_count",
  "ledger_conflict_count",
  "ledger_exact_names",
  "ledger_statements_contract",
  "migration_ledger_contract",
  "required_roles_contract",
  "wrapper_contract",
  "wrapper_oid",
  "wrapper_source_length",
  "wrapper_source_md5",
  "wrapper_service_execute",
  "delegate_contract",
  "delegate_oid",
  "delegate_overload_count",
  "delegate_source_length",
  "delegate_source_md5",
  "delegate_acl_contract",
  "helper_functions_contract",
  "logged_at_columns_contract",
  "request_hash_contract",
  "timestamp_triggers_contract",
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
), wrapper as (
  select p.*, owner_role.rolname owner_name, language_row.lanname language_name
  from pg_proc p
  join pg_roles owner_role on owner_role.oid = p.proowner
  join pg_language language_row on language_row.oid = p.prolang
  where p.oid = to_regprocedure('public.quicklog_save_manual(${MANUAL_SIGNATURE})')
), delegate as (
  select p.*, owner_role.rolname owner_name, language_row.lanname language_name
  from pg_proc p
  join pg_roles owner_role on owner_role.oid = p.proowner
  join pg_language language_row on language_row.oid = p.prolang
  where p.oid = to_regprocedure('public.quicklog_save_manual_pre_logged_at(${MANUAL_SIGNATURE})')
), function_overloads as (
  select p.proname, count(*)::integer overload_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'quicklog_save_manual',
      'quicklog_save_manual_pre_logged_at',
      'quicklog_try_parse_logged_at','quicklog_try_parse_uuid',
      'quicklog_stamp_diary_logged_at','quicklog_stamp_grow_event_logged_at'
    )
  group by p.proname
), wrapper_state as (
  select
    p.oid::bigint oid,
    octet_length(replace(p.prosrc, E'\\r', '')) source_length,
    md5(replace(p.prosrc, E'\\r', '')) source_md5,
    has_function_privilege('service_role', p.oid, 'EXECUTE') service_execute,
    p.prokind = 'f'
      and p.prorettype = 'jsonb'::regtype
      and not p.proretset
      and p.language_name = 'plpgsql'
      and p.owner_name = 'postgres'
      and p.prosecdef
      and not p.proisstrict
      and p.provolatile = 'v'
      and p.proparallel = 'u'
      and not p.proleakproof
      and p.pronargs = 12
      and p.pronargdefaults = 9
      and p.proargmodes is null
      and p.proallargtypes is null
      and p.proargnames = ${EXPECTED_ARGUMENT_NAMES_SQL}
      and oidvectortypes(p.proargtypes) = ${sqlLiteral(MANUAL_SIGNATURE)}
      and pg_get_function_arguments(p.oid) = ${EXPECTED_FUNCTION_ARGUMENTS_SQL}
      and p.proconfig = array['search_path=public, pg_temp']::text[]
      and octet_length(replace(p.prosrc, E'\\r', '')) = ${EXPECTED_FUNCTION_FINGERPRINTS.wrapper.bytes}
      and md5(replace(p.prosrc, E'\\r', '')) = '${EXPECTED_FUNCTION_FINGERPRINTS.wrapper.md5}'
      and coalesce((
        select array_agg(
          format('%s|%s|%s|%s',coalesce(grantee.rolname,'PUBLIC'),acl.privilege_type,acl.is_grantable,grantor.rolname)
          order by coalesce(grantee.rolname,'PUBLIC'),acl.privilege_type
        ) = array[
          'authenticated|EXECUTE|f|postgres',
          'postgres|EXECUTE|f|postgres',
          'service_role|EXECUTE|f|postgres'
        ]::text[]
        from aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) acl
        left join pg_roles grantee on grantee.oid = acl.grantee
        join pg_roles grantor on grantor.oid = acl.grantor
      ), false)
      and not has_function_privilege('anon',p.oid,'EXECUTE')
      and has_function_privilege('authenticated',p.oid,'EXECUTE')
      and has_function_privilege('service_role',p.oid,'EXECUTE') contract
  from wrapper p
), delegate_state as (
  select
    p.oid::bigint oid,
    octet_length(replace(p.prosrc, E'\\r', '')) source_length,
    md5(replace(p.prosrc, E'\\r', '')) source_md5,
    coalesce((
      select array_agg(
        format('%s|%s|%s|%s',coalesce(grantee.rolname,'PUBLIC'),acl.privilege_type,acl.is_grantable,grantor.rolname)
        order by coalesce(grantee.rolname,'PUBLIC'),acl.privilege_type
      ) = array['postgres|EXECUTE|f|postgres']::text[]
      from aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) acl
      left join pg_roles grantee on grantee.oid = acl.grantee
      join pg_roles grantor on grantor.oid = acl.grantor
    ), false) acl_contract,
    p.prokind = 'f'
      and p.prorettype = 'jsonb'::regtype
      and not p.proretset
      and p.language_name = 'plpgsql'
      and p.owner_name = 'postgres'
      and p.prosecdef
      and not p.proisstrict
      and p.provolatile = 'v'
      and p.proparallel = 'u'
      and not p.proleakproof
      and p.pronargs = 12
      and p.pronargdefaults = 9
      and p.proargmodes is null
      and p.proallargtypes is null
      and p.proargnames = ${EXPECTED_ARGUMENT_NAMES_SQL}
      and oidvectortypes(p.proargtypes) = ${sqlLiteral(MANUAL_SIGNATURE)}
      and pg_get_function_arguments(p.oid) = ${EXPECTED_FUNCTION_ARGUMENTS_SQL}
      and p.proconfig = array['search_path=public, pg_temp']::text[]
      and not has_function_privilege('anon',p.oid,'EXECUTE')
      and not has_function_privilege('authenticated',p.oid,'EXECUTE')
      and not has_function_privilege('service_role',p.oid,'EXECUTE') contract
  from delegate p
), helper_expected(signature, function_name, return_type, language_name, security_definer, is_strict, volatility, argument_count, argument_names, config, source_length, source_md5) as (
  values
    ('public.quicklog_try_parse_logged_at(text)','quicklog_try_parse_logged_at','timestamp with time zone','plpgsql',false,true,'i',1,array['p_value']::text[],array['search_path=pg_catalog, pg_temp']::text[],${EXPECTED_FUNCTION_FINGERPRINTS.tryParseLoggedAt.bytes},'${EXPECTED_FUNCTION_FINGERPRINTS.tryParseLoggedAt.md5}'),
    ('public.quicklog_try_parse_uuid(text)','quicklog_try_parse_uuid','uuid','plpgsql',false,true,'i',1,array['p_value']::text[],array['search_path=pg_catalog, pg_temp']::text[],${EXPECTED_FUNCTION_FINGERPRINTS.tryParseUuid.bytes},'${EXPECTED_FUNCTION_FINGERPRINTS.tryParseUuid.md5}'),
    ('public.quicklog_stamp_diary_logged_at()','quicklog_stamp_diary_logged_at','trigger','plpgsql',true,false,'v',0,null::text[],array['search_path=public, pg_temp']::text[],${EXPECTED_FUNCTION_FINGERPRINTS.stampLoggedAt.bytes},'${EXPECTED_FUNCTION_FINGERPRINTS.stampLoggedAt.md5}'),
    ('public.quicklog_stamp_grow_event_logged_at()','quicklog_stamp_grow_event_logged_at','trigger','plpgsql',true,false,'v',0,null::text[],array['search_path=public, pg_temp']::text[],${EXPECTED_FUNCTION_FINGERPRINTS.stampLoggedAt.bytes},'${EXPECTED_FUNCTION_FINGERPRINTS.stampLoggedAt.md5}')
), helper_state as (
  select count(*) = 4 and bool_and(
    p.oid is not null
    and p.proname = e.function_name
    and p.prokind = 'f'
    and not p.proretset
    and format_type(p.prorettype,null) = e.return_type
    and language_row.lanname = e.language_name
    and owner_role.rolname = 'postgres'
    and p.prosecdef = e.security_definer
    and p.proisstrict = e.is_strict
    and p.provolatile = e.volatility
    and p.proparallel = 'u'
    and not p.proleakproof
    and p.pronargs = e.argument_count
    and p.pronargdefaults = 0
    and p.proargmodes is null
    and p.proallargtypes is null
    and p.proargnames is not distinct from e.argument_names
    and p.proconfig = e.config
    and (
      (
        octet_length(case e.function_name
          when 'quicklog_try_parse_uuid' then p.prosrc
          else replace(p.prosrc, E'\\r', '')
        end) = e.source_length
        and md5(case e.function_name
          when 'quicklog_try_parse_uuid' then p.prosrc
          else replace(p.prosrc, E'\\r', '')
        end) = e.source_md5
      )
      or (
        e.function_name = 'quicklog_try_parse_uuid'
        and octet_length(p.prosrc) = ${EXPECTED_FUNCTION_FINGERPRINTS.tryParseUuidFreshReplay.bytes}
        and md5(p.prosrc) = '${EXPECTED_FUNCTION_FINGERPRINTS.tryParseUuidFreshReplay.md5}'
      )
    )
    and coalesce((
      select array_agg(
        format('%s|%s|%s|%s',coalesce(grantee.rolname,'PUBLIC'),acl.privilege_type,acl.is_grantable,grantor.rolname)
        order by coalesce(grantee.rolname,'PUBLIC'),acl.privilege_type
      ) = array['postgres|EXECUTE|f|postgres']::text[]
      from aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) acl
      left join pg_roles grantee on grantee.oid = acl.grantee
      join pg_roles grantor on grantor.oid = acl.grantor
    ), false)
  ) contract
  from helper_expected e
  left join pg_proc p on p.oid = to_regprocedure(e.signature)
  left join pg_roles owner_role on owner_role.oid = p.proowner
  left join pg_language language_row on language_row.oid = p.prolang
), trigger_state as (
  select count(*) = 2 and bool_and(
    tg.tgisinternal = false
    and tg.tgtype = 7
    and tg.tgenabled in ('O', 'A')
    and tg.tgqual is null
    and tg.tgnargs = 0
    and octet_length(tg.tgargs) = 0
    and tg.tgparentid = 0
    and (
      (tg.tgrelid = to_regclass('public.diary_entries')
       and tg.tgname = 'trg_quicklog_stamp_diary_logged_at'
       and tg.tgfoid = to_regprocedure('public.quicklog_stamp_diary_logged_at()'))
      or
      (tg.tgrelid = to_regclass('public.grow_events')
       and tg.tgname = 'trg_quicklog_stamp_grow_event_logged_at'
       and tg.tgfoid = to_regprocedure('public.quicklog_stamp_grow_event_logged_at()'))
    )
  ) contract
  from pg_trigger tg
  where (tg.tgrelid,tg.tgname) in (
    (to_regclass('public.diary_entries'),'trg_quicklog_stamp_diary_logged_at'),
    (to_regclass('public.grow_events'),'trg_quicklog_stamp_grow_event_logged_at')
  )
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
  'wrapper_contract',coalesce((select contract from wrapper_state),false)
    and coalesce((select overload_count=1 from function_overloads where proname='quicklog_save_manual'),false),
  'wrapper_oid',coalesce((select oid from wrapper_state),0),
  'wrapper_source_length',coalesce((select source_length from wrapper_state),0),
  'wrapper_source_md5',coalesce((select source_md5 from wrapper_state),''),
  'wrapper_service_execute',coalesce((select service_execute from wrapper_state),false),
  'delegate_contract',coalesce((select contract from delegate_state),false),
  'delegate_oid',coalesce((select oid from delegate_state),0),
  'delegate_overload_count',coalesce((select overload_count from function_overloads where proname='quicklog_save_manual_pre_logged_at'),0),
  'delegate_source_length',coalesce((select source_length from delegate_state),0),
  'delegate_source_md5',coalesce((select source_md5 from delegate_state),''),
  'delegate_acl_contract',coalesce((select acl_contract from delegate_state),false),
  'helper_functions_contract',coalesce((select contract from helper_state),false)
    and coalesce((select count(*)=4 and bool_and(overload_count=1) from function_overloads where proname in (
      'quicklog_try_parse_logged_at','quicklog_try_parse_uuid',
      'quicklog_stamp_diary_logged_at','quicklog_stamp_grow_event_logged_at'
    )),false),
  'logged_at_columns_contract',(
    select count(*)=2 and bool_and(
      a.atttypid='timestamp with time zone'::regtype
      and a.atttypmod = -1
      and not a.attnotnull
      and a.attgenerated = ''
      and a.attidentity = ''
      and not exists(
        select 1 from pg_attrdef d
        where d.adrelid=a.attrelid and d.adnum=a.attnum
      )
    )
    from pg_attribute a where (a.attrelid,a.attname) in (
      (to_regclass('public.diary_entries'),'logged_at'),
      (to_regclass('public.grow_events'),'logged_at')
    ) and a.attnum>0 and not a.attisdropped
  ),
  'request_hash_contract',coalesce((
    select a.atttypid='text'::regtype
      and a.atttypmod = -1
      and not a.attnotnull
      and a.attgenerated = ''
      and a.attidentity = ''
      and not exists(
        select 1 from pg_attrdef d
        where d.adrelid=a.attrelid and d.adnum=a.attnum
      )
    from pg_attribute a
    where a.attrelid=to_regclass('public.quicklog_idempotency')
      and a.attname='request_hash' and a.attnum>0 and not a.attisdropped
  ),false),
  'timestamp_triggers_contract',coalesce((select contract from trigger_state),false)
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
  "wrapper_contract",
  "wrapper_service_execute",
  "delegate_contract",
  "delegate_acl_contract",
  "helper_functions_contract",
  "logged_at_columns_contract",
  "request_hash_contract",
  "timestamp_triggers_contract",
]);
const INTEGER_KEYS = new Set([
  "ledger_exact_count",
  "ledger_conflict_count",
  "wrapper_oid",
  "wrapper_source_length",
  "delegate_oid",
  "delegate_overload_count",
  "delegate_source_length",
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
    typeof value.wrapper_source_md5 !== "string" ||
    !/^(?:[0-9a-f]{32})?$/.test(value.wrapper_source_md5) ||
    typeof value.delegate_source_md5 !== "string" ||
    !/^(?:[0-9a-f]{32})?$/.test(value.delegate_source_md5)
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
  "wrapper_contract",
  "delegate_contract",
  "delegate_acl_contract",
  "helper_functions_contract",
  "logged_at_columns_contract",
  "request_hash_contract",
  "timestamp_triggers_contract",
]);

function prerequisitesLive(result) {
  return (
    PREREQUISITE_KEYS.every((key) => result?.[key] === true) &&
    result.wrapper_service_execute === true &&
    result.wrapper_source_length === EXPECTED_FUNCTION_FINGERPRINTS.wrapper.bytes &&
    result.wrapper_source_md5 === EXPECTED_FUNCTION_FINGERPRINTS.wrapper.md5 &&
    result.delegate_overload_count === 1
  );
}

function isDefectiveDelegate(result) {
  return (
    result.delegate_source_length === EXPECTED_FUNCTION_FINGERPRINTS.defectiveDelegate.bytes &&
    result.delegate_source_md5 === EXPECTED_FUNCTION_FINGERPRINTS.defectiveDelegate.md5
  );
}

function isCanonicalDelegate(result) {
  return (
    result.delegate_source_length === EXPECTED_FUNCTION_FINGERPRINTS.canonicalDelegate.bytes &&
    result.delegate_source_md5 === EXPECTED_FUNCTION_FINGERPRINTS.canonicalDelegate.md5
  );
}

export function classifyPreflight(result) {
  if (!result || typeof result !== "object") return { status: "invalid", reason: "shape" };
  if (result.ledger_conflict_count !== 0 || result.ledger_exact_count > 1) {
    return { status: "ledger_drift", reason: "target_collision" };
  }
  if (!prerequisitesLive(result)) {
    return {
      status: "prerequisite_drift",
      reason:
        result.wrapper_service_execute !== true
          ? "wrapper_contract"
          : (PREREQUISITE_KEYS.find((key) => result[key] !== true) ?? "wrapper_contract"),
    };
  }
  if (!isDefectiveDelegate(result) && !isCanonicalDelegate(result)) {
    return { status: "schema_drift", reason: "delegate_fingerprint" };
  }
  if (result.ledger_exact_count === 0) {
    return isDefectiveDelegate(result)
      ? { status: "apply" }
      : { status: "schema_live_ledger_absent" };
  }
  if (result.ledger_exact_count !== 1) return { status: "invalid", reason: "ledger_shape" };
  if (isCanonicalDelegate(result) && result.ledger_statements_contract === true) {
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
    "select pg_advisory_xact_lock(20260818, 10000);",
    "lock table supabase_migrations.schema_migrations in share row exclusive mode;",
    "do $quicklog_manual_delegate_ledger_guard$",
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
    "     or not coalesce((v_state->>'wrapper_contract')::boolean,false)",
    "     or not coalesce((v_state->>'wrapper_service_execute')::boolean,false)",
    "     or not coalesce((v_state->>'delegate_contract')::boolean,false)",
    "     or not coalesce((v_state->>'delegate_acl_contract')::boolean,false)",
    "     or coalesce((v_state->>'delegate_overload_count')::integer,-1) <> 1",
    `     or coalesce((v_state->>'delegate_source_length')::integer,-1) <> ${EXPECTED_FUNCTION_FINGERPRINTS.canonicalDelegate.bytes}`,
    `     or coalesce(v_state->>'delegate_source_md5','') <> '${EXPECTED_FUNCTION_FINGERPRINTS.canonicalDelegate.md5}'`,
    "     or not coalesce((v_state->>'helper_functions_contract')::boolean,false)",
    "     or not coalesce((v_state->>'logged_at_columns_contract')::boolean,false)",
    "     or not coalesce((v_state->>'request_hash_contract')::boolean,false)",
    "     or not coalesce((v_state->>'timestamp_triggers_contract')::boolean,false) then",
    "    raise exception using errcode='55000', message='quicklog manual delegate ledger collision or canonical contract drift';",
    "  end if;",
    "end",
    "$quicklog_manual_delegate_ledger_guard$;",
    "insert into supabase_migrations.schema_migrations(version,name,statements)",
    `values (${sqlLiteral(PINNED_MIGRATION.version)},${sqlLiteral(PINNED_MIGRATION.name)},${markers});`,
    "commit;",
    "",
  ].join("\n");
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
        "### Quick Log manual delegate forward repair",
        "",
        `**Status:** ${status}`,
        "",
        ...lines,
        "",
        "No connection string, password, database row, raw query output, raw database error, or CA material is included.",
        "",
      ].join("\n"),
      logger,
      "Quick Log delegate delivery report",
    );
  const writeAudit = (outcome, base, extra = {}) =>
    writeTextFile(
      auditPath,
      `${JSON.stringify(
        {
          schema_version: 1,
          tool: "apply-quicklog-manual-delegate-forward-repair",
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
      "Quick Log delegate delivery audit",
    );
  const writeReceipt = (outcome, digest, base) =>
    writeTextFile(
      receiptPath,
      `${JSON.stringify(
        {
          schema_version: 1,
          tool: "apply-quicklog-manual-delegate-forward-repair",
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
      "Quick Log delegate PREFLIGHT receipt",
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

export function runQuickLogManualDelegateForwardRepair({
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
    logger.error("Quick Log delegate delivery inputs were rejected before database access.");
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
    logger.error("Read-only Quick Log delegate preflight did not complete.");
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
      logger.log("Quick Log manual delegate repair is already applied and verified.");
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
        ? "Quick Log manual delegate PREFLIGHT is SAFE_TO_APPLY."
        : "Quick Log manual delegate PREFLIGHT found recoverable schema_live_ledger_absent.",
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
    logger.log("Quick Log manual delegate repair is already applied and verified.");
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
    join(env.RUNNER_TEMP || env.TEMP || env.TMP || tmpdir(), "verdant-quicklog-delegate-ledger-"),
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
      "The exact canonical delegate and collision-guarded ledger row were not both proven.",
    ]);
    writeAudit("postflight_contract_failed", base, {
      receipt_digest: receipt.digest,
      recovery_path: recoveryPath,
    });
    return EXIT.POSTFLIGHT_CONTRACT_FAILED;
  }

  logger.log("Quick Log manual delegate repair and ledger state are verified.");
  writeReport("PASS - applied_verified", [
    "The exact self-transactional migration committed without an application write freeze.",
    "A canonical postflight passed before the separate collision-guarded ledger insert.",
    "The final read-only postflight proved the canonical delegate and exact ledger row.",
  ]);
  writeAudit("applied_verified", base, {
    receipt_digest: receipt.digest,
    recovery_path: recoveryPath,
  });
  return EXIT.OK;
}

const isDirectInvocation =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectInvocation) process.exitCode = runQuickLogManualDelegateForwardRepair();
