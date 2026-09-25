#!/usr/bin/env node
/**
 * Fail-closed production delivery for one self-transactional Quick Log
 * revision migration: 20260916111000_quicklog_revision_idempotent_replay.
 * This is deliberately not a generic migration runner.
 *
 * The migration owns its BEGIN/COMMIT, so it is submitted byte-for-byte in a
 * plain psql --file invocation. Only after a read-only canonical postflight is
 * the collision-guarded Supabase migration-ledger row inserted in a separate,
 * short transaction. An interrupted run is recoverable from the exact
 * canonical-schema/absent-ledger state without replaying the migration.
 *
 * The migration is purely additive: one internal receipt table, one internal
 * SECURITY DEFINER helper and two keyed overloads of the existing
 * quicklog_correct_entry / quicklog_retract_entry RPCs. The unkeyed legacy
 * signatures are prerequisites; their exact reviewed bodies are pinned here
 * and must be unchanged before and after delivery.
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
export const APPLY_CONFIRMATION = "APPLY QUICKLOG REVISION IDEMPOTENT REPLAY";
export const EXPECTED_REPOSITORY = "Verdant-OS/verdant-grow-diary";
export const EXPECTED_WORKFLOW_PATH =
  ".github/workflows/apply-quicklog-revision-idempotent-replay.yml";
export const TOOL_NAME = "apply-quicklog-revision-idempotent-replay";

// This digest is intentionally immutable once reviewed. The migration is
// merged history (#1460), so its bytes can never change; a mismatch means the
// checkout is not the reviewed file.
export const PINNED_MIGRATION = Object.freeze({
  version: "20260916111000",
  name: "quicklog_revision_idempotent_replay",
  file: "20260916111000_quicklog_revision_idempotent_replay.sql",
  sha256: "CE6A9DBFB51CAF5CE20256EA0C957F88EC8FD76D6A4047BA6832B25A7933D70C",
});

export const ACCEPTED_LEDGER_NAMES = Object.freeze([
  PINNED_MIGRATION.name,
  `${PINNED_MIGRATION.version}_${PINNED_MIGRATION.name}`,
]);

export const LEDGER_STATEMENT_MARKERS = Object.freeze([
  `-- applied verbatim by protected GitHub workflow; sha256=${PINNED_MIGRATION.sha256}`,
  "-- protected wrapper; self-transactional-migration=true;ledger-recovery=v1",
]);

// Source fingerprints (octet length + md5 of pg_proc.prosrc without CR).
// The legacy pair comes from 20260811090000_quicklog_corrections_retractions;
// the delivered trio comes from the pinned migration itself.
export const EXPECTED_FUNCTION_FINGERPRINTS = Object.freeze({
  legacyCorrect: Object.freeze({ bytes: 11000, md5: "bd7777aaefa3f1908d53f3ff9fc6e6ab" }),
  legacyRetract: Object.freeze({ bytes: 4865, md5: "df9384e775dd0cd046f327a2535be20d" }),
  applyOnce: Object.freeze({ bytes: 2484, md5: "fd435febaf3bba7c7338c8d73ad20db6" }),
  keyedCorrect: Object.freeze({ bytes: 168, md5: "dba2f8c0d248cf11d8f1647eb93b1a4c" }),
  keyedRetract: Object.freeze({ bytes: 163, md5: "4957ee16afc635da363841b1c90b8bd8" }),
});

export const FUNCTION_SIGNATURES = Object.freeze({
  legacyCorrect: "public.quicklog_correct_entry(text,jsonb,uuid,uuid,text)",
  legacyRetract: "public.quicklog_retract_entry(text,uuid,uuid,text)",
  applyOnce: "public.quicklog_revision_apply_once(text,text,text,jsonb,uuid,uuid,text)",
  keyedCorrect: "public.quicklog_correct_entry(text,text,jsonb,uuid,uuid,text)",
  keyedRetract: "public.quicklog_retract_entry(text,text,uuid,uuid,text)",
});

export const RECEIPT_TABLE = "public.quicklog_revision_idempotency";

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

function sqlTextArray(values) {
  return `array[${values.map(sqlLiteral).join(",")}]::text[]`;
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
      "### Quick Log revision idempotent replay delivery",
      "",
      "**Status:** BLOCKED - solo-founder authorization rejected",
      "",
      `Reason code: ${reasonCode}`,
      "No database process was started. No untrusted authorization value is included.",
      "",
    ].join("\n"),
    logger,
    "Quick Log revision delivery report",
  );
  writeTextFile(
    env.AUDIT_PATH ?? "",
    `${JSON.stringify(
      {
        schema_version: 1,
        tool: TOOL_NAME,
        checked_at: now().toISOString(),
        outcome: "authorization_rejected",
        reason_code: reasonCode,
      },
      null,
      2,
    )}\n`,
    logger,
    "Quick Log revision delivery audit",
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
  if (!/^--[\s\S]*?\nBEGIN;\n/.test(text) || !/\nCOMMIT;\n$/.test(text)) {
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

const FUNCTION_ACL_SQL = `coalesce((
      select array_agg(
        format('%s|%s|%s|%s',coalesce(grantee.rolname,'PUBLIC'),acl.privilege_type,acl.is_grantable,grantor.rolname)
        order by coalesce(grantee.rolname,'PUBLIC'),acl.privilege_type
      )
      from aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) acl
      left join pg_roles grantee on grantee.oid = acl.grantee
      join pg_roles grantor on grantor.oid = acl.grantor
    ), array[]::text[])`;

const CLIENT_EXECUTE_ACL = sqlTextArray([
  "authenticated|EXECUTE|f|postgres",
  "postgres|EXECUTE|f|postgres",
  "service_role|EXECUTE|f|postgres",
]);
const OWNER_ONLY_EXECUTE_ACL = sqlTextArray(["postgres|EXECUTE|f|postgres"]);

// One row per function the delivery reads. `present` never implies the
// contract; the contract row pins ABI, owner, language, security, config,
// source fingerprint and exact ACL.
const FUNCTION_EXPECTATIONS = Object.freeze([
  {
    key: "legacy_correct",
    signature: FUNCTION_SIGNATURES.legacyCorrect,
    language: "plpgsql",
    argumentCount: 5,
    argumentDefaults: 3,
    argumentNames: [
      "p_reason_code",
      "p_changes",
      "p_grow_event_id",
      "p_diary_entry_id",
      "p_reason_note",
    ],
    fingerprint: EXPECTED_FUNCTION_FINGERPRINTS.legacyCorrect,
    acl: CLIENT_EXECUTE_ACL,
  },
  {
    key: "legacy_retract",
    signature: FUNCTION_SIGNATURES.legacyRetract,
    language: "plpgsql",
    argumentCount: 4,
    argumentDefaults: 3,
    argumentNames: ["p_reason_code", "p_grow_event_id", "p_diary_entry_id", "p_reason_note"],
    fingerprint: EXPECTED_FUNCTION_FINGERPRINTS.legacyRetract,
    acl: CLIENT_EXECUTE_ACL,
  },
  {
    key: "apply_once",
    signature: FUNCTION_SIGNATURES.applyOnce,
    language: "plpgsql",
    argumentCount: 7,
    argumentDefaults: 0,
    argumentNames: [
      "p_idempotency_key",
      "p_kind",
      "p_reason_code",
      "p_changes",
      "p_grow_event_id",
      "p_diary_entry_id",
      "p_reason_note",
    ],
    fingerprint: EXPECTED_FUNCTION_FINGERPRINTS.applyOnce,
    acl: OWNER_ONLY_EXECUTE_ACL,
  },
  {
    key: "keyed_correct",
    signature: FUNCTION_SIGNATURES.keyedCorrect,
    language: "sql",
    argumentCount: 6,
    argumentDefaults: 3,
    argumentNames: [
      "p_idempotency_key",
      "p_reason_code",
      "p_changes",
      "p_grow_event_id",
      "p_diary_entry_id",
      "p_reason_note",
    ],
    fingerprint: EXPECTED_FUNCTION_FINGERPRINTS.keyedCorrect,
    acl: CLIENT_EXECUTE_ACL,
  },
  {
    key: "keyed_retract",
    signature: FUNCTION_SIGNATURES.keyedRetract,
    language: "sql",
    argumentCount: 5,
    argumentDefaults: 3,
    argumentNames: [
      "p_idempotency_key",
      "p_reason_code",
      "p_grow_event_id",
      "p_diary_entry_id",
      "p_reason_note",
    ],
    fingerprint: EXPECTED_FUNCTION_FINGERPRINTS.keyedRetract,
    acl: CLIENT_EXECUTE_ACL,
  },
]);

const FUNCTION_EXPECTED_VALUES_SQL = FUNCTION_EXPECTATIONS.map(
  (row) =>
    `    (${[
      sqlLiteral(row.key),
      sqlLiteral(row.signature),
      sqlLiteral(row.language),
      row.argumentCount,
      row.argumentDefaults,
      sqlTextArray(row.argumentNames),
      row.fingerprint.bytes,
      sqlLiteral(row.fingerprint.md5),
      row.acl,
    ].join(",")})`,
).join(",\n");

// The Supabase migration ledger as MEASURED on production (knk) on 2026-09-25:
// six columns and a unique idempotency_key. Older delivery lanes pin the
// three-column shape and NOINHERIT client roles; production has neither, so
// those contracts would block there. The delivered INSERT names only
// version/name/statements; the other three columns are nullable with no
// default, and a NULL idempotency_key cannot collide with the unique key.
export const MIGRATION_LEDGER_COLUMNS = Object.freeze([
  "1|version|text|t|||t",
  "2|statements|text[]|f|||t",
  "3|name|text|f|||t",
  "4|created_by|text|f|||t",
  "5|idempotency_key|text|f|||t",
  "6|rollback|text[]|f|||t",
]);
export const MIGRATION_LEDGER_CONSTRAINTS = Object.freeze([
  "schema_migrations_idempotency_key_key|u|t|f|f|UNIQUE (idempotency_key)",
  "schema_migrations_pkey|p|t|f|f|PRIMARY KEY (version)",
]);

export const RESULT_KEYS = Object.freeze([
  "ledger_exact_count",
  "ledger_conflict_count",
  "ledger_exact_names",
  "ledger_statements_contract",
  "migration_ledger_contract",
  "required_roles_contract",
  "legacy_functions_contract",
  "legacy_correct_oid",
  "legacy_retract_oid",
  "correct_overload_count",
  "retract_overload_count",
  "apply_once_overload_count",
  "receipt_table_present",
  "receipt_table_contract",
  "receipt_table_oid",
  "apply_once_present",
  "apply_once_contract",
  "apply_once_oid",
  "keyed_correct_present",
  "keyed_correct_contract",
  "keyed_correct_oid",
  "keyed_retract_present",
  "keyed_retract_contract",
  "keyed_retract_oid",
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
), function_expected(key, signature, language_name, argument_count, argument_defaults, argument_names, source_length, source_md5, expected_acl) as (
  values
${FUNCTION_EXPECTED_VALUES_SQL}
), function_state as (
  select
    e.key,
    p.oid is not null present,
    coalesce(p.oid::bigint, 0) oid,
    coalesce(p.oid is not null
      and p.prokind = 'f'
      and p.prorettype = 'jsonb'::regtype
      and not p.proretset
      and language_row.lanname = e.language_name
      and owner_role.rolname = 'postgres'
      and p.prosecdef
      and not p.proisstrict
      and p.provolatile = 'v'
      and p.proparallel = 'u'
      and not p.proleakproof
      and p.pronargs = e.argument_count
      and p.pronargdefaults = e.argument_defaults
      and p.proargmodes is null
      and p.proallargtypes is null
      and p.proargnames = e.argument_names
      and p.proconfig = array['search_path=public, pg_temp']::text[]
      and octet_length(replace(p.prosrc, E'\\r', '')) = e.source_length
      and md5(replace(p.prosrc, E'\\r', '')) = e.source_md5
      and ${FUNCTION_ACL_SQL} = e.expected_acl
      and not has_function_privilege('anon', p.oid, 'EXECUTE'), false) contract
  from function_expected e
  left join pg_proc p on p.oid = to_regprocedure(e.signature)
  left join pg_roles owner_role on owner_role.oid = p.proowner
  left join pg_language language_row on language_row.oid = p.prolang
), function_overloads as (
  select p.proname, count(*)::integer overload_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('quicklog_correct_entry','quicklog_retract_entry','quicklog_revision_apply_once')
  group by p.proname
), receipt_table as (
  select c.* from pg_class c where c.oid = to_regclass(${sqlLiteral(RECEIPT_TABLE)})
), receipt_table_state as (
  select
    c.oid::bigint oid,
    c.relkind = 'r'
      and c.relpersistence = 'p'
      and not c.relispartition
      and c.relrowsecurity
      and not c.relforcerowsecurity
      and owner_role.rolname = 'postgres'
      and coalesce((
        select array_agg(format('%s|%s|%s|%s|%s|%s|%s',a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attgenerated,a.attidentity,coalesce(pg_get_expr(d.adbin,d.adrelid),'')) order by a.attnum) = array[
          '1|user_id|uuid|t|||',
          '2|idempotency_key|text|t|||',
          '3|request|jsonb|t|||',
          '4|receipt|jsonb|t|||',
          '5|created_at|timestamp with time zone|t|||now()'
        ]::text[]
        from pg_attribute a
        left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      ),false)
      and coalesce((
        select array_agg(format('%s|%s|%s|%s|%s',con.conname,con.contype,con.convalidated,con.condeferrable,pg_get_constraintdef(con.oid,true)) order by con.conname) = array[
          'quicklog_revision_idempotency_idempotency_key_check|c|t|f|CHECK (char_length(idempotency_key) >= 8 AND char_length(idempotency_key) <= 200)',
          'quicklog_revision_idempotency_pkey|p|t|f|PRIMARY KEY (user_id, idempotency_key)'
        ]::text[]
        from pg_constraint con where con.conrelid = c.oid
      ),false)
      and (select count(*) from pg_index i where i.indrelid = c.oid) = 1
      and not exists(select 1 from pg_policy pol where pol.polrelid = c.oid)
      and not exists(select 1 from pg_trigger tg where tg.tgrelid = c.oid and not tg.tgisinternal)
      and not exists(select 1 from pg_rewrite rw where rw.ev_class = c.oid)
      and not exists(select 1 from pg_inherits inh where inh.inhrelid = c.oid or inh.inhparent = c.oid)
      and not exists(select 1 from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and a.attacl is not null)
      and not exists(
        select 1 from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
        where acl.grantee = 0
      )
      and not has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      and not has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      and has_table_privilege('service_role', c.oid, 'SELECT')
      and has_table_privilege('service_role', c.oid, 'INSERT')
      and has_table_privilege('service_role', c.oid, 'UPDATE')
      and has_table_privilege('service_role', c.oid, 'DELETE') contract
  from receipt_table c
  join pg_roles owner_role on owner_role.oid = c.relowner
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
          ${MIGRATION_LEDGER_COLUMNS.map(sqlLiteral).join(",")}
        ]::text[]
        from pg_attribute a
        left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
        where a.attrelid = ledger.oid and a.attnum > 0 and not a.attisdropped
      ),false)
      and coalesce((select array_agg(
        format('%s|%s|%s|%s|%s|%s',conname,contype,convalidated,condeferrable,condeferred,pg_get_constraintdef(oid,true))
        order by conname
      ) = array[${MIGRATION_LEDGER_CONSTRAINTS.map(sqlLiteral).join(",")}]::text[]
      from pg_constraint where conrelid=ledger.oid),false)
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
        not rolsuper and not rolcreaterole and not rolcreatedb
        and not rolcanlogin and not rolreplication and rolbypassrls
      else
        not rolsuper and not rolcreaterole and not rolcreatedb
        and not rolcanlogin and not rolreplication and not rolbypassrls end)
    from pg_roles where rolname in ('postgres','anon','authenticated','service_role')
  ),false),
  'legacy_functions_contract',coalesce((
    select count(*)=2 and bool_and(contract) from function_state
    where key in ('legacy_correct','legacy_retract')
  ),false),
  'legacy_correct_oid',(select oid from function_state where key='legacy_correct'),
  'legacy_retract_oid',(select oid from function_state where key='legacy_retract'),
  'correct_overload_count',coalesce((select overload_count from function_overloads where proname='quicklog_correct_entry'),0),
  'retract_overload_count',coalesce((select overload_count from function_overloads where proname='quicklog_retract_entry'),0),
  'apply_once_overload_count',coalesce((select overload_count from function_overloads where proname='quicklog_revision_apply_once'),0),
  'receipt_table_present',exists(select 1 from receipt_table),
  'receipt_table_contract',coalesce((select contract from receipt_table_state),false),
  'receipt_table_oid',coalesce((select oid from receipt_table_state),0),
  'apply_once_present',(select present from function_state where key='apply_once'),
  'apply_once_contract',(select contract from function_state where key='apply_once'),
  'apply_once_oid',(select oid from function_state where key='apply_once'),
  'keyed_correct_present',(select present from function_state where key='keyed_correct'),
  'keyed_correct_contract',(select contract from function_state where key='keyed_correct'),
  'keyed_correct_oid',(select oid from function_state where key='keyed_correct'),
  'keyed_retract_present',(select present from function_state where key='keyed_retract'),
  'keyed_retract_contract',(select contract from function_state where key='keyed_retract'),
  'keyed_retract_oid',(select oid from function_state where key='keyed_retract')
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
  "legacy_functions_contract",
  "receipt_table_present",
  "receipt_table_contract",
  "apply_once_present",
  "apply_once_contract",
  "keyed_correct_present",
  "keyed_correct_contract",
  "keyed_retract_present",
  "keyed_retract_contract",
]);
const INTEGER_KEYS = new Set([
  "ledger_exact_count",
  "ledger_conflict_count",
  "legacy_correct_oid",
  "legacy_retract_oid",
  "correct_overload_count",
  "retract_overload_count",
  "apply_once_overload_count",
  "receipt_table_oid",
  "apply_once_oid",
  "keyed_correct_oid",
  "keyed_retract_oid",
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
    new Set(value.ledger_exact_names).size !== value.ledger_exact_names.length
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
  "legacy_functions_contract",
]);

const TARGET_PRESENCE_KEYS = Object.freeze([
  "receipt_table_present",
  "apply_once_present",
  "keyed_correct_present",
  "keyed_retract_present",
]);

const TARGET_CONTRACT_KEYS = Object.freeze([
  "receipt_table_contract",
  "apply_once_contract",
  "keyed_correct_contract",
  "keyed_retract_contract",
]);

/** No delivered object exists and only the legacy overloads are present. */
function targetAbsent(result) {
  return (
    TARGET_PRESENCE_KEYS.every((key) => result[key] === false) &&
    result.correct_overload_count === 1 &&
    result.retract_overload_count === 1 &&
    result.apply_once_overload_count === 0
  );
}

/** Every delivered object exists with its exact reviewed contract. */
function targetCanonical(result) {
  return (
    TARGET_PRESENCE_KEYS.every((key) => result[key] === true) &&
    TARGET_CONTRACT_KEYS.every((key) => result[key] === true) &&
    result.correct_overload_count === 2 &&
    result.retract_overload_count === 2 &&
    result.apply_once_overload_count === 1
  );
}

export function classifyPreflight(result) {
  if (!result || typeof result !== "object") return { status: "invalid", reason: "shape" };
  if (result.ledger_conflict_count !== 0 || result.ledger_exact_count > 1) {
    return { status: "ledger_drift", reason: "target_collision" };
  }
  const missingPrerequisite = PREREQUISITE_KEYS.find((key) => result[key] !== true);
  if (missingPrerequisite) {
    return { status: "prerequisite_drift", reason: missingPrerequisite };
  }
  const absent = targetAbsent(result);
  const canonical = targetCanonical(result);
  if (!absent && !canonical) {
    return { status: "schema_drift", reason: "target_partial_or_fingerprint" };
  }
  if (result.ledger_exact_count === 0) {
    return absent ? { status: "apply" } : { status: "schema_live_ledger_absent" };
  }
  if (result.ledger_exact_count !== 1) return { status: "invalid", reason: "ledger_shape" };
  if (canonical && result.ledger_statements_contract === true) {
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
  const requireTrue = [
    "migration_ledger_contract",
    "required_roles_contract",
    "legacy_functions_contract",
    ...TARGET_PRESENCE_KEYS,
    ...TARGET_CONTRACT_KEYS,
  ];
  return [
    "\\set ON_ERROR_STOP on",
    "begin;",
    "set local lock_timeout = '8s';",
    "set local statement_timeout = '30s';",
    "set local search_path = pg_catalog, public, pg_temp;",
    "select pg_advisory_xact_lock(20260916, 111000);",
    "lock table supabase_migrations.schema_migrations in share row exclusive mode;",
    "do $quicklog_revision_replay_ledger_guard$",
    "declare",
    "  v_state json;",
    "begin",
    "  execute $catalog_state$",
    CATALOG_STATE_QUERY_SQL,
    "  $catalog_state$ into v_state;",
    "  if coalesce((v_state->>'ledger_exact_count')::integer,-1) <> 0",
    "     or coalesce((v_state->>'ledger_conflict_count')::integer,-1) <> 0",
    ...requireTrue.map((key) => `     or not coalesce((v_state->>'${key}')::boolean,false)`),
    "     or coalesce((v_state->>'correct_overload_count')::integer,-1) <> 2",
    "     or coalesce((v_state->>'retract_overload_count')::integer,-1) <> 2",
    "     or coalesce((v_state->>'apply_once_overload_count')::integer,-1) <> 1 then",
    "    raise exception using errcode='55000', message='quicklog revision replay ledger collision or canonical contract drift';",
    "  end if;",
    "end",
    "$quicklog_revision_replay_ledger_guard$;",
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
        "### Quick Log revision idempotent replay delivery",
        "",
        `**Status:** ${status}`,
        "",
        ...lines,
        "",
        "No connection string, password, database row, raw query output, raw database error, or CA material is included.",
        "",
      ].join("\n"),
      logger,
      "Quick Log revision delivery report",
    );
  const writeAudit = (outcome, base, extra = {}) =>
    writeTextFile(
      auditPath,
      `${JSON.stringify(
        {
          schema_version: 1,
          tool: TOOL_NAME,
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
          ...(typeof extra.reason === "string" && /^[a-z_]{1,64}$/.test(extra.reason)
            ? { reason: extra.reason }
            : {}),
        },
        null,
        2,
      )}\n`,
      logger,
      "Quick Log revision delivery audit",
    );
  const writeReceipt = (outcome, digest, base) =>
    writeTextFile(
      receiptPath,
      `${JSON.stringify(
        {
          schema_version: 1,
          tool: TOOL_NAME,
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
      "Quick Log revision PREFLIGHT receipt",
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

export function runQuickLogRevisionIdempotentReplay({
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
    logger.error("Quick Log revision delivery inputs were rejected before database access.");
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
    logger.error("Read-only Quick Log revision preflight did not complete.");
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
    writeReport("BLOCKED - catalog contract drift", [
      "Nothing was written.",
      `Reason: ${classification.reason ?? classification.status}`,
      receiptLine,
    ]);
    writeAudit(
      classification.status === "ledger_drift"
        ? "ledger_drift"
        : classification.status === "prerequisite_drift"
          ? "prerequisite_drift"
          : "schema_drift",
      base,
      { receipt_digest: receipt.digest, reason: classification.reason },
    );
    return blockedClassificationExit(classification);
  }

  if (operation === "PREFLIGHT") {
    if (classification.status === "verify_only") {
      logger.log("Quick Log revision idempotent replay is already applied and verified.");
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
        ? "Quick Log revision PREFLIGHT is SAFE_TO_APPLY."
        : "Quick Log revision PREFLIGHT found recoverable schema_live_ledger_absent.",
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
    logger.log("Quick Log revision idempotent replay is already applied and verified.");
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
    join(env.RUNNER_TEMP || env.TEMP || env.TMP || tmpdir(), "verdant-quicklog-revision-ledger-"),
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
      "The exact canonical objects and collision-guarded ledger row were not both proven.",
    ]);
    writeAudit("postflight_contract_failed", base, {
      receipt_digest: receipt.digest,
      recovery_path: recoveryPath,
    });
    return EXIT.POSTFLIGHT_CONTRACT_FAILED;
  }

  logger.log("Quick Log revision idempotent replay and ledger state are verified.");
  writeReport("PASS - applied_verified", [
    "The exact self-transactional migration committed without an application write freeze.",
    "A canonical postflight passed before the separate collision-guarded ledger insert.",
    "The final read-only postflight proved the canonical objects and exact ledger row.",
  ]);
  writeAudit("applied_verified", base, {
    receipt_digest: receipt.digest,
    recovery_path: recoveryPath,
  });
  return EXIT.OK;
}

const isDirectInvocation =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectInvocation) process.exitCode = runQuickLogRevisionIdempotentReplay();
