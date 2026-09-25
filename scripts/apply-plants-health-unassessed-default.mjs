#!/usr/bin/env node
/**
 * Fail-closed production delivery for one self-transactional plants migration:
 * 20260924120000_plants_health_unassessed_default (BUG-009: new plants start
 * "not assessed", not "healthy"). This is deliberately not a generic runner.
 *
 * The migration owns its BEGIN/COMMIT, so it is submitted byte-for-byte in a
 * plain psql --file invocation. Only after a read-only canonical postflight is
 * the collision-guarded Supabase migration-ledger row inserted in a separate,
 * short transaction. An interrupted run is recoverable from the exact
 * canonical-schema/absent-ledger state without replaying the migration.
 *
 * The migration changes three things and nothing else:
 *   - validate_plant_row() also accepts 'unknown' (CREATE OR REPLACE, which
 *     keeps the function's owner, grants and trigger binding);
 *   - plants.health defaults to 'unknown';
 *   - plants.health gets a column comment.
 * It rewrites no existing row. Before delivery the lane requires the exact
 * legacy function body and default, and that nothing else on public.plants
 * guards health values: a CHECK constraint, another trigger or a policy that
 * rejected 'unknown' would make every default insert fail after delivery.
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
  ledgerColumnRowsWithNoDefaultFlag,
  ledgerConstraintRows,
} from "./lib/supabaseMigrationLedgerShape.mjs";
import {
  assertSupabaseDatabaseTargetIdentity,
  SUPABASE_DATABASE_TARGETS,
} from "./lib/supabaseDatabaseTargetIdentity.mjs";

export { findUnsafeSqlReason };

export const PRODUCTION_PROJECT_REF = SUPABASE_DATABASE_TARGETS.production.projectRef;
export const APPLY_CONFIRMATION = "APPLY PLANTS HEALTH UNASSESSED DEFAULT";
export const EXPECTED_REPOSITORY = "Verdant-OS/verdant-grow-diary";
export const EXPECTED_WORKFLOW_PATH =
  ".github/workflows/apply-plants-health-unassessed-default.yml";
export const TOOL_NAME = "apply-plants-health-unassessed-default";

// This digest is intentionally immutable once reviewed. The migration is
// introduced by #1683; once merged its bytes can never change, and a mismatch
// means the checkout is not the reviewed file.
export const PINNED_MIGRATION = Object.freeze({
  version: "20260924120000",
  name: "plants_health_unassessed_default",
  file: "20260924120000_plants_health_unassessed_default.sql",
  sha256: "B0F6C2717679BD19FA51C1FB1D3CDFC8405739A081C9B1B8D408055E72B9655B",
});

export const ACCEPTED_LEDGER_NAMES = Object.freeze([
  PINNED_MIGRATION.name,
  `${PINNED_MIGRATION.version}_${PINNED_MIGRATION.name}`,
]);

export const LEDGER_STATEMENT_MARKERS = Object.freeze([
  `-- applied verbatim by protected GitHub workflow; sha256=${PINNED_MIGRATION.sha256}`,
  "-- protected wrapper; self-transactional-migration=true;ledger-recovery=v1",
]);

// Source fingerprints (octet length + md5 of pg_proc.prosrc without CR),
// measured on PostgreSQL 15.19. The legacy body is validate_plant_row() as
// defined by 20260516204601 (its only definition); the delivered body comes
// from the pinned migration.
export const EXPECTED_FUNCTION_FINGERPRINTS = Object.freeze({
  legacy: Object.freeze({ bytes: 297, md5: "b58d8cc95ea0c85a9c18045fa77123b1" }),
  delivered: Object.freeze({ bytes: 307, md5: "1a2dc73c88871084508ece97352abcb5" }),
});

export const VALIDATE_FUNCTION_SIGNATURE = "public.validate_plant_row()";
export const PLANTS_TABLE = "public.plants";
export const VALIDATE_TRIGGER_NAME = "trg_plants_validate";
export const LEGACY_HEALTH_DEFAULT = "'healthy'::text";
export const DELIVERED_HEALTH_DEFAULT = "'unknown'::text";
export const DELIVERED_HEALTH_COMMENT =
  "Grower-assessed plant health: healthy | watch | issue, or unknown (not assessed; the default). Never derived from sensors or AI.";

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
      "### Plants health unassessed default delivery",
      "",
      "**Status:** BLOCKED - solo-founder authorization rejected",
      "",
      `Reason code: ${reasonCode}`,
      "No database process was started. No untrusted authorization value is included.",
      "",
    ].join("\n"),
    logger,
    "Plants health delivery report",
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
    "Plants health delivery audit",
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

// The migration ledger as measured on production (see
// scripts/lib/supabaseMigrationLedgerShape.mjs), rendered in this lane's format.
export const MIGRATION_LEDGER_COLUMNS = Object.freeze(ledgerColumnRowsWithNoDefaultFlag());
export const MIGRATION_LEDGER_CONSTRAINTS = Object.freeze(ledgerConstraintRows());

export const RESULT_KEYS = Object.freeze([
  "ledger_exact_count",
  "ledger_conflict_count",
  "ledger_exact_names",
  "ledger_statements_contract",
  "migration_ledger_contract",
  "required_roles_contract",
  "plants_table_contract",
  "plants_table_oid",
  "validate_trigger_contract",
  "health_column_contract",
  "health_guard_drift_count",
  "validate_function_overload_count",
  "validate_function_contract",
  "validate_function_oid",
  "validate_function_acl",
  "validate_function_legacy_source",
  "validate_function_delivered_source",
  "health_default_legacy",
  "health_default_delivered",
  "health_comment_delivered",
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
), plants as (
  select c.* from pg_class c where c.oid = to_regclass(${sqlLiteral(PLANTS_TABLE)})
), health_column as (
  select a.* from pg_attribute a
  join plants on plants.oid = a.attrelid
  where a.attname = 'health' and a.attnum > 0 and not a.attisdropped
), validate_function as (
  select p.*, owner_role.rolname owner_name, language_row.lanname language_name
  from pg_proc p
  join pg_roles owner_role on owner_role.oid = p.proowner
  join pg_language language_row on language_row.oid = p.prolang
  where p.oid = to_regprocedure(${sqlLiteral(VALIDATE_FUNCTION_SIGNATURE)})
), validate_source as (
  select
    octet_length(replace(p.prosrc, E'\\r', '')) source_length,
    md5(replace(p.prosrc, E'\\r', '')) source_md5
  from validate_function p
), health_default as (
  select pg_get_expr(d.adbin, d.adrelid) expression
  from health_column a
  join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
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
  'plants_table_contract',coalesce((
    select c.relkind = 'r'
      and c.relpersistence = 'p'
      and not c.relispartition
      and c.relrowsecurity
      and owner_role.rolname = 'postgres'
      and not exists(select 1 from pg_inherits where inhrelid=c.oid or inhparent=c.oid)
      and not exists(select 1 from pg_rewrite where ev_class=c.oid)
    from plants c
    join pg_roles owner_role on owner_role.oid = c.relowner
  ),false),
  'plants_table_oid',coalesce((select oid::bigint from plants),0),
  'validate_trigger_contract',coalesce((
    select count(*) = 1 and bool_and(
      not tg.tgisinternal
      and tg.tgenabled = 'O'
      and tg.tgtype = 23
      and tg.tgqual is null
      and tg.tgnargs = 0
      and octet_length(tg.tgargs) = 0
      and tg.tgattr::text = ''
      and tg.tgparentid = 0
      and tg.tgfoid = to_regprocedure(${sqlLiteral(VALIDATE_FUNCTION_SIGNATURE)})
    )
    from pg_trigger tg
    join plants on plants.oid = tg.tgrelid
    where tg.tgname = ${sqlLiteral(VALIDATE_TRIGGER_NAME)}
  ),false),
  'health_column_contract',coalesce((
    select count(*) = 1 and bool_and(
      a.atttypid = 'text'::regtype
      and a.atttypmod = -1
      and a.attnotnull
      and a.attgenerated = ''
      and a.attidentity = ''
    )
    from health_column a
  ),false),
  'health_guard_drift_count',coalesce((
    select (
      (select count(*) from pg_constraint con
        where con.conrelid = a.attrelid
          and con.contype = 'c'
          and con.conkey @> array[a.attnum]::smallint[])
      + (select count(*) from pg_trigger tg
        join pg_proc fn on fn.oid = tg.tgfoid
        where tg.tgrelid = a.attrelid
          and not tg.tgisinternal
          and tg.tgname <> ${sqlLiteral(VALIDATE_TRIGGER_NAME)}
          and fn.prosrc ilike '%health%')
      + (select count(*) from pg_policy pol
        where pol.polrelid = a.attrelid
          and (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') ilike '%health%'
            or coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ilike '%health%'))
    )::integer
    from health_column a
  ),0),
  'validate_function_overload_count',(
    select count(*)::integer from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'validate_plant_row'
  ),
  'validate_function_contract',coalesce((
    select p.prokind = 'f'
      and p.prorettype = 'trigger'::regtype
      and not p.proretset
      and p.language_name = 'plpgsql'
      and p.owner_name = 'postgres'
      and not p.prosecdef
      and not p.proisstrict
      and p.provolatile = 'v'
      and p.proparallel = 'u'
      and not p.proleakproof
      and p.pronargs = 0
      and p.pronargdefaults = 0
      and p.proargmodes is null
      and p.proallargtypes is null
      and p.proargnames is null
      and p.proconfig = array['search_path=public']::text[]
    from validate_function p
  ),false),
  'validate_function_oid',coalesce((select oid::bigint from validate_function),0),
  'validate_function_acl',coalesce((
    select json_agg(
      format('%s|%s|%s|%s',coalesce(grantee.rolname,'PUBLIC'),acl.privilege_type,acl.is_grantable,grantor.rolname)
      order by coalesce(grantee.rolname,'PUBLIC'),acl.privilege_type
    )
    from validate_function p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    left join pg_roles grantee on grantee.oid = acl.grantee
    join pg_roles grantor on grantor.oid = acl.grantor
  ),'[]'::json),
  'validate_function_legacy_source',coalesce((
    select source_length = ${EXPECTED_FUNCTION_FINGERPRINTS.legacy.bytes}
      and source_md5 = ${sqlLiteral(EXPECTED_FUNCTION_FINGERPRINTS.legacy.md5)}
    from validate_source
  ),false),
  'validate_function_delivered_source',coalesce((
    select source_length = ${EXPECTED_FUNCTION_FINGERPRINTS.delivered.bytes}
      and source_md5 = ${sqlLiteral(EXPECTED_FUNCTION_FINGERPRINTS.delivered.md5)}
    from validate_source
  ),false),
  'health_default_legacy',coalesce((
    select expression = ${sqlLiteral(LEGACY_HEALTH_DEFAULT)} from health_default
  ),false),
  'health_default_delivered',coalesce((
    select expression = ${sqlLiteral(DELIVERED_HEALTH_DEFAULT)} from health_default
  ),false),
  'health_comment_delivered',coalesce((
    select col_description(a.attrelid, a.attnum) = ${sqlLiteral(DELIVERED_HEALTH_COMMENT)}
    from health_column a
  ),false)
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
  "plants_table_contract",
  "validate_trigger_contract",
  "health_column_contract",
  "validate_function_contract",
  "validate_function_legacy_source",
  "validate_function_delivered_source",
  "health_default_legacy",
  "health_default_delivered",
  "health_comment_delivered",
]);
const INTEGER_KEYS = new Set([
  "ledger_exact_count",
  "ledger_conflict_count",
  "plants_table_oid",
  "health_guard_drift_count",
  "validate_function_overload_count",
  "validate_function_oid",
]);
// One aclexplode row: grantee|privilege|grantable|grantor. Role names are
// bounded identifiers; the list is bound into the receipt digest.
const ACL_ENTRY = /^[A-Za-z_][A-Za-z0-9_]{0,62}\|EXECUTE\|[tf]\|[A-Za-z_][A-Za-z0-9_]{0,62}$/;

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
  if (
    !Array.isArray(value.validate_function_acl) ||
    value.validate_function_acl.length > 32 ||
    value.validate_function_acl.some(
      (entry) => typeof entry !== "string" || !ACL_ENTRY.test(entry),
    ) ||
    new Set(value.validate_function_acl).size !== value.validate_function_acl.length
  ) {
    throw new Error("preflight_result_shape");
  }
  return Object.freeze({
    ...value,
    ledger_exact_names: Object.freeze([...value.ledger_exact_names]),
    validate_function_acl: Object.freeze([...value.validate_function_acl]),
  });
}

const PREREQUISITE_KEYS = Object.freeze([
  "migration_ledger_contract",
  "required_roles_contract",
  "plants_table_contract",
  "validate_trigger_contract",
  "health_column_contract",
  "validate_function_contract",
]);

/** The legacy body and default, and no delivered comment. */
function targetAbsent(result) {
  return (
    result.validate_function_legacy_source === true &&
    result.health_default_legacy === true &&
    result.health_comment_delivered === false
  );
}

/** The delivered body, default and comment. */
function targetCanonical(result) {
  return (
    result.validate_function_delivered_source === true &&
    result.health_default_delivered === true &&
    result.health_comment_delivered === true
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
  if (result.validate_function_overload_count !== 1) {
    return { status: "prerequisite_drift", reason: "validate_function_overload_count" };
  }
  // A CHECK constraint, another trigger or a policy that inspects health could
  // reject 'unknown', and every insert that omits health would then fail.
  if (result.health_guard_drift_count !== 0) {
    return { status: "prerequisite_drift", reason: "health_guard_drift_count" };
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

/**
 * CREATE OR REPLACE keeps validate_plant_row()'s grants, so delivery must
 * leave its ACL exactly as the reviewed PREFLIGHT observed it.
 */
export function aclUnchanged(before, after) {
  return (
    Array.isArray(before?.validate_function_acl) &&
    Array.isArray(after?.validate_function_acl) &&
    JSON.stringify(before.validate_function_acl) === JSON.stringify(after.validate_function_acl)
  );
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
    ...PREREQUISITE_KEYS,
    "validate_function_delivered_source",
    "health_default_delivered",
    "health_comment_delivered",
  ];
  return [
    "\\set ON_ERROR_STOP on",
    "begin;",
    "set local lock_timeout = '8s';",
    "set local statement_timeout = '30s';",
    "set local search_path = pg_catalog, public, pg_temp;",
    "select pg_advisory_xact_lock(20260924, 120000);",
    "lock table supabase_migrations.schema_migrations in share row exclusive mode;",
    "do $plants_health_default_ledger_guard$",
    "declare",
    "  v_state json;",
    "begin",
    "  execute $catalog_state$",
    CATALOG_STATE_QUERY_SQL,
    "  $catalog_state$ into v_state;",
    "  if coalesce((v_state->>'ledger_exact_count')::integer,-1) <> 0",
    "     or coalesce((v_state->>'ledger_conflict_count')::integer,-1) <> 0",
    ...requireTrue.map((key) => `     or not coalesce((v_state->>'${key}')::boolean,false)`),
    "     or coalesce((v_state->>'validate_function_overload_count')::integer,-1) <> 1",
    "     or coalesce((v_state->>'health_guard_drift_count')::integer,-1) <> 0 then",
    "    raise exception using errcode='55000', message='plants health default ledger collision or canonical contract drift';",
    "  end if;",
    "end",
    "$plants_health_default_ledger_guard$;",
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
        "### Plants health unassessed default delivery",
        "",
        `**Status:** ${status}`,
        "",
        ...lines,
        "",
        "No connection string, password, database row, raw query output, raw database error, or CA material is included.",
        "",
      ].join("\n"),
      logger,
      "Plants health delivery report",
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
      "Plants health delivery audit",
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
      "Plants health PREFLIGHT receipt",
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

export function runPlantsHealthUnassessedDefault({
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
    logger.error("Plants health delivery inputs were rejected before database access.");
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
    logger.error("Read-only plants health preflight did not complete.");
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
      logger.log("Plants health unassessed default is already applied and verified.");
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
        ? "Plants health PREFLIGHT is SAFE_TO_APPLY."
        : "Plants health PREFLIGHT found recoverable schema_live_ledger_absent.",
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
    logger.log("Plants health unassessed default is already applied and verified.");
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
  let canonicalState = null;
  try {
    canonicalState = parsePreflightStdout(canonicalPostflight.stdout);
    canonicalClassification = classifyPreflight(canonicalState);
  } catch {
    canonicalClassification = { status: "invalid" };
  }
  if (
    canonicalClassification.status !== "schema_live_ledger_absent" ||
    !aclUnchanged(state, canonicalState)
  ) {
    writeReport("FAIL - canonical postflight contract mismatch", ["No ledger row was inserted."]);
    writeAudit("postflight_contract_failed", base, { receipt_digest: receipt.digest });
    return EXIT.POSTFLIGHT_CONTRACT_FAILED;
  }

  const temporaryRoot = mkdtempSync(
    join(env.RUNNER_TEMP || env.TEMP || env.TMP || tmpdir(), "verdant-plants-health-ledger-"),
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
  let finalState = null;
  try {
    finalState = parsePreflightStdout(finalPostflight.stdout);
    finalClassification = classifyPreflight(finalState);
  } catch {
    finalClassification = { status: "invalid" };
  }
  if (finalClassification.status !== "verify_only" || !aclUnchanged(state, finalState)) {
    writeReport("FAIL - final postflight contract mismatch", [
      "The exact canonical objects and collision-guarded ledger row were not both proven.",
    ]);
    writeAudit("postflight_contract_failed", base, {
      receipt_digest: receipt.digest,
      recovery_path: recoveryPath,
    });
    return EXIT.POSTFLIGHT_CONTRACT_FAILED;
  }

  logger.log("Plants health unassessed default and ledger state are verified.");
  writeReport("PASS - applied_verified", [
    "The exact self-transactional migration committed without an application write freeze.",
    "validate_plant_row() kept the grants the reviewed PREFLIGHT observed.",
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
if (isDirectInvocation) process.exitCode = runPlantsHealthUnassessedDefault();
