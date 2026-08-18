#!/usr/bin/env node
/**
 * Manual, fail-closed production delivery path for the immutable
 * 20260813030000 signup-acquisition forward repair.
 *
 * This is deliberately not a generic migration runner. It accepts one exact
 * reviewed file, one exact Verdant production project, and one exact deploy
 * commit. Before any write it runs a transaction-enforced read-only query that
 * classifies both the migration ledger and the live schema contract. When the
 * target is absent, the migration body and its filename-derived ledger row are
 * submitted together in one psql --single-transaction file. A second read-only
 * query must prove the exact ledger row and the complete effect before success.
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
export const APPLY_CONFIRMATION = "APPLY SIGNUP ACQUISITION FORWARD REPAIR";
export const EXPECTED_REPOSITORY = "Verdant-OS/verdant-grow-diary";
export const EXPECTED_WORKFLOW_PATH =
  ".github/workflows/apply-signup-acquisition-forward-repair.yml";

export const PINNED_MIGRATION = Object.freeze({
  version: "20260813030000",
  name: "signup_acquisition_forward_repair",
  file: "20260813030000_signup_acquisition_forward_repair.sql",
  sha256: "6C002AB676218C32C27E41E7A8E90FF4F452C41D7EDB446B0FCB950B93D3DEBA",
});

export const ACCEPTED_LEDGER_NAMES = Object.freeze([
  PINNED_MIGRATION.name,
  `${PINNED_MIGRATION.version}_${PINNED_MIGRATION.name}`,
]);

export const LEDGER_STATEMENT_MARKERS = Object.freeze([
  `-- applied verbatim by protected GitHub workflow; sha256=${PINNED_MIGRATION.sha256}`,
  "-- protected wrapper; acl-normalization=v1;service_role=revoked",
]);

export const EXPECTED_FUNCTION_DEFINITION_FINGERPRINTS = Object.freeze({
  handle_new_user: Object.freeze({ md5: "d7a62d761a50cc4a4783242a37b039ed", bytes: 2197 }),
  record_signup_acquisition_first_touch: Object.freeze({
    md5: "3a48b1c40e4e73177f13e5c7092fa4bf",
    bytes: 996,
  }),
  signup_acquisition_operator_snapshot: Object.freeze({
    md5: "47ef35bbef7d59de3211f4cb6ecc383b",
    bytes: 2761,
  }),
  signup_to_paid_operator_snapshot: Object.freeze({
    md5: "c5fd7770fb47b299d1460441777a77ed",
    bytes: 4240,
  }),
});

// These definitions are taken from the latest effective migration lineage.
// The disposable PostgreSQL 15 gate ratifies the exact pg_get_functiondef
// representation before this runner can be considered releasable.
export const EXPECTED_DEPENDENCY_DEFINITION_FINGERPRINTS = Object.freeze({
  generate_referral_code: Object.freeze({
    md5: "3d8c98ed4f79632a2704e28731f2e091",
    bytes: 690,
  }),
  convert_referral: Object.freeze({
    md5: "45bc9b61dd7019db6e5273914880d112",
    bytes: 2568,
  }),
  has_role: Object.freeze({ md5: "d1d3c1bab8cfb8d7aed032a1b9efa698", bytes: 300 }),
});

export const EXPECTED_DATABASE_FINGERPRINTS = Object.freeze({
  source_check: Object.freeze({ md5: "01b8bcc5e882ec68c9bf8641ec6845d0", bytes: 294 }),
  signup_trigger: Object.freeze({ md5: "786e53a33077b3a68f1ec248e238d18a", bytes: 110 }),
  primary_key: Object.freeze({ md5: "0a0db78b5fb70bf8475b3bd434e6842b" }),
  foreign_key: Object.freeze({ md5: "85d8b2f5f0c0f6b4dcb854efb61a8cb1" }),
});

export const REQUIRED_PREREQUISITE_COLUMNS = Object.freeze({
  "auth.users": Object.freeze({
    id: "uuid",
    raw_user_meta_data: "jsonb",
    created_at: "timestamp with time zone",
    email: "character varying",
    email_confirmed_at: "timestamp with time zone",
  }),
  "public.profiles": Object.freeze({
    user_id: "uuid",
    display_name: "text",
    marketing_opt_in: "boolean",
    marketing_opt_in_at: "timestamp with time zone",
    referral_code: "text",
    created_at: "timestamp with time zone",
  }),
  "public.subscriptions": Object.freeze({
    user_id: "uuid",
    price_id: "text",
    created_at: "timestamp with time zone",
    environment: "text",
    status: "text",
    paddle_subscription_id: "text",
    current_period_end: "timestamp with time zone",
  }),
  "public.user_roles": Object.freeze({
    user_id: "uuid",
    role: "public.app_role",
  }),
});

export const EXPECTED_SOURCES = Object.freeze([
  "blueprint_targets",
  "context_check",
  "csv_history",
  "founder_page",
  "founder_share",
  "grower_invite",
  "landing_page",
  "operator_outreach",
  "pricing_interest_share",
  "pricing_page",
  "vpd_calculator",
]);

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
      "### Signup-acquisition forward-repair delivery",
      "",
      "**Status:** BLOCKED - solo-founder authorization rejected",
      "",
      `Reason code: ${reasonCode}`,
      "No database process was started. No untrusted authorization value is included.",
      "",
    ].join("\n"),
    logger,
    "signup-acquisition repair report",
  );
  writeTextFile(
    env.AUDIT_PATH ?? "",
    `${JSON.stringify(
      {
        schema_version: 1,
        tool: "apply-signup-acquisition-forward-repair",
        checked_at: now().toISOString(),
        outcome: "authorization_rejected",
        reason_code: reasonCode,
      },
      null,
      2,
    )}\n`,
    logger,
    "signup-acquisition repair audit",
  );
}

function prerequisiteColumnValuesSql() {
  return Object.entries(REQUIRED_PREREQUISITE_COLUMNS)
    .flatMap(([relation, columns]) => {
      const [schemaName, tableName] = relation.split(".");
      return Object.entries(columns).map(
        ([columnName, typeName]) =>
          `    (${sqlLiteral(relation)}, ${sqlLiteral(schemaName)}, ${sqlLiteral(tableName)}, ${sqlLiteral(columnName)}, ${sqlLiteral(typeName)})`,
      );
    })
    .join(",\n");
}

export function validatePinnedMigrationFile({
  root = migrationsRoot,
  readFile = readFileSync,
} = {}) {
  const path = resolve(root, PINNED_MIGRATION.file);
  const rawValue = readFile(path);
  const raw = Buffer.isBuffer(rawValue) ? rawValue : Buffer.from(rawValue);
  const text = raw.toString("utf8");
  const observedHash = sha256(raw);

  if (observedHash !== PINNED_MIGRATION.sha256) {
    throw new Error(`hash_mismatch:${PINNED_MIGRATION.version}`);
  }
  if (text.includes("\r")) {
    throw new Error(`crlf_not_allowed:${PINNED_MIGRATION.version}`);
  }
  if (!text.endsWith("\n")) {
    throw new Error(`final_newline_missing:${PINNED_MIGRATION.version}`);
  }
  const unsafeReason = findUnsafeSqlReason(text);
  if (unsafeReason) {
    throw new Error(`${unsafeReason}:${PINNED_MIGRATION.version}`);
  }

  return Object.freeze({ ...PINNED_MIGRATION, path, text });
}

export function buildApplySql(migration) {
  if (
    migration?.version !== PINNED_MIGRATION.version ||
    migration?.name !== PINNED_MIGRATION.name ||
    migration?.file !== PINNED_MIGRATION.file ||
    migration?.sha256 !== PINNED_MIGRATION.sha256 ||
    typeof migration?.text !== "string" ||
    sha256(Buffer.from(migration.text, "utf8")) !== PINNED_MIGRATION.sha256 ||
    findUnsafeSqlReason(migration.text)
  ) {
    throw new Error("validated_migration_required");
  }

  const ledgerStatement = `array[${LEDGER_STATEMENT_MARKERS.map(sqlLiteral).join(", ")}]::text[]`;

  return [
    "\\set ON_ERROR_STOP on",
    "set transaction isolation level read committed;",
    "set local lock_timeout = '8s';",
    "set local statement_timeout = '120s';",
    "set local search_path = pg_catalog, public, pg_temp;",
    "lock table supabase_migrations.schema_migrations in share row exclusive mode;",
    "lock table auth.users in share row exclusive mode;",
    "lock table public.profiles in share row exclusive mode;",
    "",
    "do $signup_acquisition_locked_profiles_guard$",
    "declare",
    "  v_contract boolean;",
    "begin",
    "  with profiles as (",
    "    select c.*",
    "    from pg_class c",
    "    join pg_namespace n on n.oid = c.relnamespace",
    "    where n.nspname = 'public' and c.relname = 'profiles'",
    "  )",
    "  select",
    "    profiles.relkind = 'r'",
    "    and profiles.relpersistence = 'p'",
    "    and not profiles.relispartition",
    "    and not profiles.relforcerowsecurity",
    "    and owner_role.rolname = 'postgres'",
    "    and has_table_privilege(current_user, profiles.oid, 'INSERT,UPDATE' )",
    "    and coalesce((",
    "      select array_agg(",
    "        format(",
    "          '%s|%s|%s|%s|%s|%s',",
    "          a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull,",
    "          coalesce(pg_get_expr(d.adbin, d.adrelid), ''), a.attgenerated, a.attidentity",
    "        ) order by a.attnum",
    "      ) = array[",
    "        'user_id|uuid|t|||',",
    "        'display_name|text|f|||',",
    "        'nugs_total|bigint|t|0||',",
    "        'level|integer|t|0||',",
    "        'tier|text|t|''seedling''::text||',",
    "        'current_badge|text|f|||',",
    "        'created_at|timestamp with time zone|t|now()||',",
    "        'updated_at|timestamp with time zone|t|now()||',",
    "        'marketing_opt_in|boolean|t|false||',",
    "        'marketing_opt_in_at|timestamp with time zone|f|||',",
    "        'referral_code|text|f|||'",
    "      ]::text[]",
    "      from pg_attribute a",
    "      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum",
    "      where a.attrelid = profiles.oid and a.attnum > 0 and not a.attisdropped",
    "    ), false)",
    "    and coalesce((",
    "      select count(*) = 1 and bool_and(",
    "        con.conname = 'profiles_pkey'",
    "        and con.contype = 'p'",
    "        and con.convalidated",
    "        and not con.condeferrable",
    "        and not con.condeferred",
    "        and pg_get_constraintdef(con.oid, true) = 'PRIMARY KEY (user_id)'",
    "      )",
    "      from pg_constraint con where con.conrelid = profiles.oid",
    "    ), false)",
    "    and coalesce((",
    "      select count(*) = 2 and bool_and(case",
    "        when index_class.relname = 'profiles_pkey' then",
    "          idx.indisprimary and idx.indisunique and idx.indisvalid and idx.indisready",
    "          and idx.indimmediate and not idx.indisexclusion",
    "          and idx.indpred is null and idx.indexprs is null",
    "          and idx.indnkeyatts = 1 and idx.indnatts = 1",
    "          and idx.indexrelid = pk.conindid",
    "          and idx.indkey[0] = user_id_attribute.attnum",
    "        when index_class.relname = 'profiles_referral_code_uq' then",
    "          not idx.indisprimary and idx.indisunique and idx.indisvalid and idx.indisready",
    "          and idx.indimmediate and not idx.indisexclusion and idx.indexprs is null",
    "          and idx.indnkeyatts = 1 and idx.indnatts = 1",
    "          and idx.indkey[0] = referral_code_attribute.attnum",
    "          and pg_get_expr(idx.indpred, idx.indrelid) = '(referral_code IS NOT NULL)'",
    "        else false",
    "      end)",
    "      from pg_index idx",
    "      join pg_class index_class on index_class.oid = idx.indexrelid",
    "      join pg_attribute user_id_attribute",
    "        on user_id_attribute.attrelid = profiles.oid",
    "       and user_id_attribute.attname = 'user_id'",
    "       and not user_id_attribute.attisdropped",
    "      join pg_attribute referral_code_attribute",
    "        on referral_code_attribute.attrelid = profiles.oid",
    "       and referral_code_attribute.attname = 'referral_code'",
    "       and not referral_code_attribute.attisdropped",
    "      join pg_constraint pk",
    "        on pk.conrelid = profiles.oid",
    "       and pk.conname = 'profiles_pkey'",
    "       and pk.contype = 'p'",
    "      where idx.indrelid = profiles.oid",
    "    ), false)",
    "    and not exists (",
    "      select 1 from pg_trigger tg",
    "      where tg.tgrelid = profiles.oid and not tg.tgisinternal and (tg.tgtype & 4) = 4",
    "    )",
    "    and not exists (",
    "      select 1 from pg_rewrite rw",
    "      where rw.ev_class = profiles.oid and rw.ev_type = '3'",
    "    )",
    "    into v_contract",
    "  from profiles",
    "  join pg_roles owner_role on owner_role.oid = profiles.relowner;",
    "",
    "  if not coalesce(v_contract, false) then",
    "    raise exception using",
    "      errcode = '55000',",
    "      message = 'signup-acquisition repair refused incompatible profiles surface';",
    "  end if;",
    "end",
    "$signup_acquisition_locked_profiles_guard$;",
    "",
    "do $signup_acquisition_locked_prerequisite_guard$",
    "declare",
    "  v_contract boolean;",
    "begin",
    "  with migration_schema as (",
    "    select n.oid, n.nspowner, n.nspacl",
    "    from pg_namespace n",
    "    where n.nspname = 'supabase_migrations'",
    "  ), migration_ledger as (",
    "    select c.*",
    "    from pg_class c",
    "    join migration_schema n on n.oid = c.relnamespace",
    "    where c.relname = 'schema_migrations'",
    "  )",
    "  select",
    "    ledger.relkind = 'r'",
    "    and ledger.relpersistence = 'p'",
    "    and not ledger.relispartition",
    "    and not ledger.relrowsecurity",
    "    and not ledger.relforcerowsecurity",
    "    and ledger.relreplident = 'd'",
    "    and ledger.reloptions is null",
    "    and schema_owner.rolname = current_user",
    "    and ledger_owner.rolname = current_user",
    "    and current_user = 'postgres'",
    "    and has_schema_privilege(current_user, schema.oid, 'USAGE,CREATE')",
    "    and has_table_privilege(current_user, ledger.oid, 'SELECT,INSERT,UPDATE')",
    "    and coalesce((",
    "      select array_agg(",
    "        format(",
    "          '%s|%s|%s|%s|%s|%s|%s',",
    "          a.attnum, a.attname, format_type(a.atttypid, a.atttypmod),",
    "          a.attnotnull, coalesce(pg_get_expr(d.adbin, d.adrelid), ''),",
    "          a.attgenerated, a.attidentity",
    "        ) order by a.attnum",
    "      ) = array[",
    "        '1|version|text|t|||',",
    "        '2|name|text|f|||',",
    "        '3|statements|text[]|f|||'",
    "      ]::text[]",
    "      from pg_attribute a",
    "      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum",
    "      where a.attrelid = ledger.oid and a.attnum > 0 and not a.attisdropped",
    "    ), false)",
    "    and coalesce((",
    "      select count(*) = 1 and bool_and(",
    "        con.conname = 'schema_migrations_pkey'",
    "        and con.contype = 'p'",
    "        and con.convalidated",
    "        and not con.condeferrable",
    "        and not con.condeferred",
    "        and pg_get_constraintdef(con.oid, true) = 'PRIMARY KEY (version)'",
    "      )",
    "      from pg_constraint con where con.conrelid = ledger.oid",
    "    ), false)",
    "    and coalesce((",
    "      select count(*) = 1 and bool_and(",
    "        index_class.relname = 'schema_migrations_pkey'",
    "        and idx.indisprimary and idx.indisunique and idx.indisvalid and idx.indisready",
    "        and idx.indimmediate and not idx.indisexclusion",
    "        and idx.indpred is null and idx.indexprs is null",
    "        and idx.indnkeyatts = 1 and idx.indnatts = 1",
    "      )",
    "      from pg_index idx",
    "      join pg_class index_class on index_class.oid = idx.indexrelid",
    "      where idx.indrelid = ledger.oid",
    "    ), false)",
    "    and coalesce((",
    "      select array_agg(",
    "        format('%s|%s|%s|%s', coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type, acl.is_grantable, grantor.rolname)",
    "        order by coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type",
    "      ) = array[",
    "        format('%s|DELETE|f|%s', current_user, current_user),",
    "        format('%s|INSERT|f|%s', current_user, current_user),",
    "        format('%s|REFERENCES|f|%s', current_user, current_user),",
    "        format('%s|SELECT|f|%s', current_user, current_user),",
    "        format('%s|TRIGGER|f|%s', current_user, current_user),",
    "        format('%s|TRUNCATE|f|%s', current_user, current_user),",
    "        format('%s|UPDATE|f|%s', current_user, current_user)",
    "      ]::text[]",
    "      from aclexplode(coalesce(ledger.relacl, acldefault('r', ledger.relowner))) acl",
    "      left join pg_roles grantee on grantee.oid = acl.grantee",
    "      join pg_roles grantor on grantor.oid = acl.grantor",
    "    ), false)",
    "    and coalesce((",
    "      select array_agg(",
    "        format('%s|%s|%s|%s', coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type, acl.is_grantable, grantor.rolname)",
    "        order by coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type",
    "      ) = array[",
    "        format('%s|CREATE|f|%s', current_user, current_user),",
    "        format('%s|USAGE|f|%s', current_user, current_user)",
    "      ]::text[]",
    "      from aclexplode(coalesce(schema.nspacl, acldefault('n', schema.nspowner))) acl",
    "      left join pg_roles grantee on grantee.oid = acl.grantee",
    "      join pg_roles grantor on grantor.oid = acl.grantor",
    "    ), false)",
    "    and not exists (select 1 from pg_inherits inh where inh.inhrelid = ledger.oid or inh.inhparent = ledger.oid)",
    "    and not exists (select 1 from pg_publication_rel publication where publication.prrelid = ledger.oid)",
    "    and not exists (select 1 from pg_policy policy where policy.polrelid = ledger.oid)",
    "    and not exists (select 1 from pg_trigger tg where tg.tgrelid = ledger.oid and not tg.tgisinternal)",
    "    and not exists (select 1 from pg_rewrite rw where rw.ev_class = ledger.oid)",
    "    into v_contract",
    "  from migration_ledger ledger",
    "  join migration_schema schema on schema.oid = ledger.relnamespace",
    "  join pg_roles schema_owner on schema_owner.oid = schema.nspowner",
    "  join pg_roles ledger_owner on ledger_owner.oid = ledger.relowner;",
    "",
    "  if not coalesce(v_contract, false) then",
    "    raise exception using",
    "      errcode = '55000',",
    "      message = 'signup-acquisition repair refused incompatible migration ledger';",
    "  end if;",
    "end",
    "$signup_acquisition_locked_prerequisite_guard$;",
    "",
    "do $signup_acquisition_apply_guard$",
    "declare",
    "  v_collision_count integer;",
    "begin",
    "  select count(*)",
    "    into v_collision_count",
    "  from supabase_migrations.schema_migrations sm",
    `  where sm.version = ${sqlLiteral(PINNED_MIGRATION.version)}`,
    `     or sm.name = ${sqlLiteral(ACCEPTED_LEDGER_NAMES[0])}`,
    `     or sm.name = ${sqlLiteral(ACCEPTED_LEDGER_NAMES[1])};`,
    "",
    "  if v_collision_count <> 0 then",
    "    raise exception using",
    "      errcode = '55000',",
    "      message = 'signup-acquisition repair refused a concurrent ledger collision';",
    "  end if;",
    "end",
    "$signup_acquisition_apply_guard$;",
    "",
    `-- BEGIN EXACT PINNED FILE: ${PINNED_MIGRATION.file}`,
    migration.text,
    `-- END EXACT PINNED FILE: ${PINNED_MIGRATION.file}`,
    "",
    "-- Normalize legacy hosted default privileges that the immutable migration does not revoke.",
    "revoke all on table public.signup_acquisition_attributions from service_role;",
    "revoke all on function public.handle_new_user() from service_role;",
    "revoke all on function public.record_signup_acquisition_first_touch(text) from service_role;",
    "revoke all on function public.signup_acquisition_operator_snapshot() from service_role;",
    "revoke all on function public.signup_to_paid_operator_snapshot() from service_role;",
    "",
    "do $signup_acquisition_locked_acl_postcondition$",
    "declare",
    "  v_table_contract boolean;",
    "  v_function_contract boolean;",
    "begin",
    "  with target as (",
    "    select c.oid, c.relowner, c.relacl",
    "    from pg_class c join pg_namespace n on n.oid = c.relnamespace",
    "    where n.nspname = 'public' and c.relname = 'signup_acquisition_attributions'",
    "  ), acl_entries as (",
    "    select format('%s|%s|%s|%s', coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type, acl.is_grantable, grantor.rolname) as entry",
    "    from target",
    "    cross join lateral aclexplode(coalesce(target.relacl, acldefault('r', target.relowner))) acl",
    "    left join pg_roles grantee on grantee.oid = acl.grantee",
    "    join pg_roles grantor on grantor.oid = acl.grantor",
    "  )",
    "  select (select array_agg(entry order by entry) from acl_entries) = array[",
    "      'postgres|DELETE|f|postgres',",
    "      'postgres|INSERT|f|postgres',",
    "      'postgres|REFERENCES|f|postgres',",
    "      'postgres|SELECT|f|postgres',",
    "      'postgres|TRIGGER|f|postgres',",
    "      'postgres|TRUNCATE|f|postgres',",
    "      'postgres|UPDATE|f|postgres'",
    "    ]::text[]",
    "    and not has_table_privilege('anon', target.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')",
    "    and not has_table_privilege('authenticated', target.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')",
    "    and not has_table_privilege('service_role', target.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')",
    "    into v_table_contract",
    "  from target;",
    "",
    "  with expected(oid, entries, authenticated_execute) as (",
    "    values",
    "      (to_regprocedure('public.handle_new_user()'), array['postgres|EXECUTE|f|postgres']::text[], false),",
    "      (to_regprocedure('public.record_signup_acquisition_first_touch(text)'), array['authenticated|EXECUTE|f|postgres','postgres|EXECUTE|f|postgres']::text[], true),",
    "      (to_regprocedure('public.signup_acquisition_operator_snapshot()'), array['authenticated|EXECUTE|f|postgres','postgres|EXECUTE|f|postgres']::text[], true),",
    "      (to_regprocedure('public.signup_to_paid_operator_snapshot()'), array['authenticated|EXECUTE|f|postgres','postgres|EXECUTE|f|postgres']::text[], true)",
    "  ), actual as (",
    "    select expected.oid, expected.entries, expected.authenticated_execute,",
    "      array_agg(format('%s|%s|%s|%s', coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type, acl.is_grantable, grantor.rolname) order by coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type) as observed_entries",
    "    from expected",
    "    join pg_proc function_row on function_row.oid = expected.oid",
    "    cross join lateral aclexplode(coalesce(function_row.proacl, acldefault('f', function_row.proowner))) acl",
    "    left join pg_roles grantee on grantee.oid = acl.grantee",
    "    join pg_roles grantor on grantor.oid = acl.grantor",
    "    group by expected.oid, expected.entries, expected.authenticated_execute",
    "  )",
    "  select count(*) = 4 and bool_and(",
    "      actual.observed_entries = actual.entries",
    "      and not has_function_privilege('anon', actual.oid, 'EXECUTE')",
    "      and not has_function_privilege('service_role', actual.oid, 'EXECUTE')",
    "      and has_function_privilege('authenticated', actual.oid, 'EXECUTE') = actual.authenticated_execute",
    "    ) into v_function_contract",
    "  from actual;",
    "",
    "  if not coalesce(v_table_contract, false) or not coalesce(v_function_contract, false) then",
    "    raise exception using errcode = '55000', message = 'signup-acquisition repair refused noncanonical ACL state';",
    "  end if;",
    "end",
    "$signup_acquisition_locked_acl_postcondition$;",
    "",
    "insert into supabase_migrations.schema_migrations (version, name, statements)",
    `values (${sqlLiteral(PINNED_MIGRATION.version)}, ${sqlLiteral(PINNED_MIGRATION.name)}, ${ledgerStatement});`,
    "",
  ].join("\n");
}

/**
 * One JSON row, generated by SELECT statements only. SET TRANSACTION READ
 * ONLY is enforced inside the caller's --single-transaction invocation, so a
 * future accidental write added to this query is rejected by Postgres too.
 */
export const PREFLIGHT_SQL = `
set transaction read only;
set local lock_timeout = '8s';
set local statement_timeout = '30s';
set local search_path = pg_catalog, public, pg_temp;
with target_ledger as (
  select sm.version, sm.name, sm.statements
  from supabase_migrations.schema_migrations sm
  where sm.version = '${PINNED_MIGRATION.version}'
     or sm.name = '${ACCEPTED_LEDGER_NAMES[0]}'
     or sm.name = '${ACCEPTED_LEDGER_NAMES[1]}'
), migration_schema as (
  select n.oid, n.nspowner, n.nspacl
  from pg_namespace n
  where n.nspname = 'supabase_migrations'
), migration_ledger as (
  select c.*
  from pg_class c
  join migration_schema n on n.oid = c.relnamespace
  where c.relname = 'schema_migrations'
), migration_ledger_column_state as (
  select coalesce(
    array_agg(
      format(
        '%s|%s|%s|%s|%s|%s|%s',
        a.attnum,
        a.attname,
        format_type(a.atttypid, a.atttypmod),
        a.attnotnull,
        coalesce(pg_get_expr(d.adbin, d.adrelid), ''),
        a.attgenerated,
        a.attidentity
      ) order by a.attnum
    ) = array[
      '1|version|text|t|||',
      '2|name|text|f|||',
      '3|statements|text[]|f|||'
    ]::text[],
    false
  ) as contract
  from migration_ledger ledger
  join pg_attribute a
    on a.attrelid = ledger.oid
   and a.attnum > 0
   and not a.attisdropped
  left join pg_attrdef d on d.adrelid = ledger.oid and d.adnum = a.attnum
), migration_ledger_constraint_state as (
  select
    count(*) = 1
    and count(*) filter (
      where con.conname = 'schema_migrations_pkey'
        and con.contype = 'p'
        and con.convalidated
        and not con.condeferrable
        and not con.condeferred
        and pg_get_constraintdef(con.oid, true) = 'PRIMARY KEY (version)'
    ) = 1 as contract
  from migration_ledger ledger
  join pg_constraint con on con.conrelid = ledger.oid
), migration_ledger_index_state as (
  select
    count(*) = 1
    and count(*) filter (
      where index_class.relname = 'schema_migrations_pkey'
        and idx.indisprimary
        and idx.indisunique
        and idx.indisvalid
        and idx.indisready
        and idx.indimmediate
        and not idx.indisexclusion
        and idx.indpred is null
        and idx.indexprs is null
        and idx.indnkeyatts = 1
        and idx.indnatts = 1
    ) = 1 as contract
  from migration_ledger ledger
  join pg_index idx on idx.indrelid = ledger.oid
  join pg_class index_class on index_class.oid = idx.indexrelid
), migration_ledger_acl_state as (
  select coalesce(
    array_agg(
      format(
        '%s|%s|%s|%s',
        coalesce(grantee.rolname, 'PUBLIC'),
        acl.privilege_type,
        acl.is_grantable,
        grantor.rolname
      ) order by coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type
    ) = array[
      format('%s|DELETE|f|%s', current_user, current_user),
      format('%s|INSERT|f|%s', current_user, current_user),
      format('%s|REFERENCES|f|%s', current_user, current_user),
      format('%s|SELECT|f|%s', current_user, current_user),
      format('%s|TRIGGER|f|%s', current_user, current_user),
      format('%s|TRUNCATE|f|%s', current_user, current_user),
      format('%s|UPDATE|f|%s', current_user, current_user)
    ]::text[],
    false
  ) as contract
  from migration_ledger ledger
  cross join lateral aclexplode(coalesce(ledger.relacl, acldefault('r', ledger.relowner))) acl
  left join pg_roles grantee on grantee.oid = acl.grantee
  join pg_roles grantor on grantor.oid = acl.grantor
), migration_schema_acl_state as (
  select coalesce(
    array_agg(
      format(
        '%s|%s|%s|%s',
        coalesce(grantee.rolname, 'PUBLIC'),
        acl.privilege_type,
        acl.is_grantable,
        grantor.rolname
      ) order by coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type
    ) = array[
      format('%s|CREATE|f|%s', current_user, current_user),
      format('%s|USAGE|f|%s', current_user, current_user)
    ]::text[],
    false
  ) as contract
  from migration_schema schema
  cross join lateral aclexplode(coalesce(nspacl, acldefault('n', schema.nspowner))) acl
  left join pg_roles grantee on grantee.oid = acl.grantee
  join pg_roles grantor on grantor.oid = acl.grantor
), migration_ledger_trigger_rule_state as (
  select
    not exists (
      select 1
      from migration_ledger ledger
      join pg_trigger tg on tg.tgrelid = ledger.oid
      where not tg.tgisinternal
    )
    and not exists (
      select 1
      from migration_ledger ledger
      join pg_rewrite rw on rw.ev_class = ledger.oid
    ) as contract
), required_columns(relation_key, schema_name, table_name, column_name, type_name) as (
  values
${prerequisiteColumnValuesSql()}
), required_column_state as (
  select
    r.relation_key,
    count(distinct c.oid) = 1
      and bool_and(
        c.relkind = 'r'
        and c.relpersistence = 'p'
        and not c.relispartition
        and not exists (
          select 1 from pg_inherits inh
          where inh.inhrelid = c.oid or inh.inhparent = c.oid
        )
      )
      and count(a.attname) = count(*)
      and bool_and(a.attname is not null and a.atttypid = to_regtype(r.type_name)) as contract
  from required_columns r
  left join pg_namespace n on n.nspname = r.schema_name
  left join pg_class c
    on c.relnamespace = n.oid
   and c.relname = r.table_name
  left join pg_attribute a
    on a.attrelid = c.oid
   and a.attname = r.column_name
   and a.attnum > 0
   and not a.attisdropped
  group by r.relation_key
), auth_users_table as (
  select c.*
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'auth' and c.relname = 'users'
), profiles_table as (
  select c.*
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'profiles'
), user_roles_table as (
  select c.*
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'user_roles'
), target_table as (
  select
    c.oid,
    c.relkind,
    c.relpersistence,
    c.relispartition,
    c.relrowsecurity,
    c.relforcerowsecurity,
    c.relreplident,
    c.reloptions,
    c.relacl,
    c.relowner
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'signup_acquisition_attributions'
), target_column_state as (
  select array_agg(
    format(
      '%s|%s|%s|%s|%s',
      a.attnum,
      a.attname,
      format_type(a.atttypid, a.atttypmod),
      case when a.attnotnull then 'not_null' else 'nullable' end,
      coalesce(pg_get_expr(d.adbin, d.adrelid), '')
    ) order by a.attnum
  ) as column_shape
  from target_table t
  join pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid = t.oid and d.adnum = a.attnum
), profiles_primary_key as (
  select con.*, pg_get_constraintdef(con.oid, true) as definition
  from pg_constraint con
  where con.conrelid = to_regclass('public.profiles')
    and con.conname = 'profiles_pkey'
    and con.contype = 'p'
), profiles_primary_index as (
  select idx.*
  from pg_index idx
  join profiles_primary_key pk on pk.conindid = idx.indexrelid
), profiles_referral_index as (
  select idx.*
  from pg_index idx
  where idx.indexrelid = to_regclass('public.profiles_referral_code_uq')
    and idx.indrelid = to_regclass('public.profiles')
), profiles_supplied_columns_contract as (
  select coalesce(
    array_agg(
      format(
        '%s|%s|%s|%s|%s|%s',
        a.attname,
        format_type(a.atttypid, a.atttypmod),
        a.attnotnull,
        coalesce(pg_get_expr(d.adbin, d.adrelid), ''),
        a.attgenerated,
        a.attidentity
      ) order by a.attnum
    ) = array[
      'user_id|uuid|t|||',
      'display_name|text|f|||',
      'nugs_total|bigint|t|0||',
      'level|integer|t|0||',
      'tier|text|t|''seedling''::text||',
      'current_badge|text|f|||',
      'created_at|timestamp with time zone|t|now()||',
      'updated_at|timestamp with time zone|t|now()||',
      'marketing_opt_in|boolean|t|false||',
      'marketing_opt_in_at|timestamp with time zone|f|||',
      'referral_code|text|f|||'
    ]::text[],
    false
  ) as contract
  from profiles_table t
  join pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid = t.oid and d.adnum = a.attnum
), profiles_insert_constraints_contract as (
  select not exists (
    select 1
    from profiles_table t
    join pg_constraint con on con.conrelid = t.oid
    where con.contype in ('c','u','x','f')
       or (con.contype = 'c' and not con.convalidated)
  ) as contract
), profiles_insert_indexes_contract as (
  select coalesce(
    array_agg(index_class.relname::text order by index_class.relname) =
      array['profiles_pkey','profiles_referral_code_uq']::text[],
    false
  ) as contract
  from profiles_table t
  join pg_index idx on idx.indrelid = t.oid
  join pg_class index_class on index_class.oid = idx.indexrelid
), profiles_insert_triggers_rules_contract as (
  select
    not exists (
      select 1
      from profiles_table t
      join pg_trigger tg on tg.tgrelid = t.oid
      where not tg.tgisinternal and (tg.tgtype & 4) = 4
    )
    and not exists (
      select 1
      from profiles_table t
      join pg_rewrite rw on rw.ev_class = t.oid
      where rw.ev_type = '3'
    ) as contract
), target_constraint_rows as (
  select con.*, pg_get_constraintdef(con.oid, true) as definition
  from pg_constraint con
  join target_table t on t.oid = con.conrelid
), target_constraint_summary as (
  select
    count(*)::integer as total_count,
    count(*) filter (
      where conname = 'signup_acquisition_attributions_pkey' and contype = 'p'
    )::integer as primary_count,
    count(*) filter (
      where conname = 'signup_acquisition_attributions_user_id_fkey' and contype = 'f'
    )::integer as foreign_count,
    count(*) filter (
      where conname = 'signup_acquisition_attributions_source_check' and contype = 'c'
    )::integer as source_count
  from target_constraint_rows
), target_index_rows as (
  select idx.*, con.conname as constraint_name, con.contype as constraint_type
  from pg_index idx
  join target_table t on t.oid = idx.indrelid
  left join pg_constraint con
    on con.conrelid = t.oid
   and con.conindid = idx.indexrelid
), target_trigger_rule_state as (
  select
    not exists (
      select 1 from pg_trigger tg
      join target_table t on t.oid = tg.tgrelid
      where not tg.tgisinternal
    )
    and not exists (
      select 1 from pg_rewrite rw
      join target_table t on t.oid = rw.ev_class
    ) as contract
), target_existing_values_state as (
  select case
    when not exists (select 1 from target_table) then false
    else query_to_xml(
      $values_query$
        select count(*) as invalid_count
        from public.signup_acquisition_attributions
        where source is null
           or source <> all (array[
             'landing_page','pricing_page','founder_page','founder_share',
             'pricing_interest_share','operator_outreach','grower_invite',
             'context_check','vpd_calculator','csv_history','blueprint_targets'
           ]::text[])
      $values_query$,
      false,
      true,
      ''
    )::text like '%<invalid_count>0</invalid_count>%'
  end as contract
), source_constraint as (
  select
    con.convalidated,
    con.conkey,
    pg_get_constraintdef(con.oid, true) as definition
  from pg_constraint con
  join target_table t on t.oid = con.conrelid
  where con.conname = 'signup_acquisition_attributions_source_check'
    and con.contype = 'c'
), constraint_sources as (
  select coalesce(array_agg(matches[1] order by matches[1]), array[]::text[]) as sources
  from source_constraint sc
  cross join lateral regexp_matches(
    sc.definition,
    $verdant_source$'([^']+)'$verdant_source$,
    'g'
  ) as source_match(matches)
), primary_key_constraint as (
  select con.convalidated, con.conkey, pg_get_constraintdef(con.oid, true) as definition
  from pg_constraint con
  join target_table t on t.oid = con.conrelid
  where con.conname = 'signup_acquisition_attributions_pkey'
    and con.contype = 'p'
), foreign_key_constraint as (
  select
    con.convalidated,
    con.conkey,
    con.confkey,
    con.confrelid,
    con.confdeltype,
    pg_get_constraintdef(con.oid, true) as definition
  from pg_constraint con
  join target_table t on t.oid = con.conrelid
  where con.conname = 'signup_acquisition_attributions_user_id_fkey'
    and con.contype = 'f'
), signup_trigger as (
  select
    tg.tgenabled,
    tg.tgtype,
    tg.tgfoid,
    pg_get_triggerdef(tg.oid, true) as definition
  from pg_trigger tg
  where tg.tgrelid = to_regclass('auth.users')
    and tg.tgname = 'on_auth_user_created'
    and not tg.tgisinternal
), function_rows as (
  select
    p.oid,
    p.proname,
    p.prosecdef,
    p.proconfig,
    p.proacl,
    p.proowner,
    p.prokind,
    p.proretset,
    p.proargnames,
    p.proargmodes,
    p.proallargtypes,
    p.provolatile,
    p.prorettype,
    l.lanname,
    p.prosrc,
    owner_role.rolname as owner_name,
    md5(pg_get_functiondef(p.oid)) as definition_md5,
    octet_length(pg_get_functiondef(p.oid)) as definition_bytes
  from pg_proc p
  join pg_language l on l.oid = p.prolang
  join pg_roles owner_role on owner_role.oid = p.proowner
  where p.oid in (
    to_regprocedure('public.handle_new_user()'),
    to_regprocedure('public.record_signup_acquisition_first_touch(text)'),
    to_regprocedure('public.signup_acquisition_operator_snapshot()'),
    to_regprocedure('public.signup_to_paid_operator_snapshot()')
  )
), dependency_rows as (
  select
    p.oid,
    p.proname,
    p.prosecdef,
    p.proconfig,
    p.proacl,
    p.proowner,
    p.provolatile,
    p.prorettype,
    l.lanname,
    owner_role.rolname as owner_name,
    md5(pg_get_functiondef(p.oid)) as definition_md5,
    octet_length(pg_get_functiondef(p.oid)) as definition_bytes
  from pg_proc p
  join pg_language l on l.oid = p.prolang
  join pg_roles owner_role on owner_role.oid = p.proowner
  where p.oid in (
    to_regprocedure('public.generate_referral_code()'),
    to_regprocedure('public.convert_referral(uuid,uuid,text,text,boolean)'),
    to_regprocedure('public.has_role(uuid,public.app_role)')
  )
), function_acl as (
  select
    f.oid,
    array_agg(
      format(
        '%s|%s|%s|%s',
        coalesce(grantee_role.rolname, 'PUBLIC'),
        a.privilege_type,
        a.is_grantable,
        grantor_role.rolname
      ) order by coalesce(grantee_role.rolname, 'PUBLIC'), a.privilege_type
    ) as entries
  from function_rows f
  cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
  left join pg_roles grantee_role on grantee_role.oid = a.grantee
  join pg_roles grantor_role on grantor_role.oid = a.grantor
  group by f.oid
), dependency_acl as (
  select
    f.oid,
    array_agg(
      format(
        '%s|%s|%s|%s',
        coalesce(grantee_role.rolname, 'PUBLIC'),
        a.privilege_type,
        a.is_grantable,
        grantor_role.rolname
      ) order by coalesce(grantee_role.rolname, 'PUBLIC'), a.privilege_type
    ) as entries
  from dependency_rows f
  cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
  left join pg_roles grantee_role on grantee_role.oid = a.grantee
  join pg_roles grantor_role on grantor_role.oid = a.grantor
  group by f.oid
), target_acl_entries as (
  select
    coalesce(grantee_role.rolname, 'PUBLIC') as grantee_name,
    a.privilege_type,
    a.is_grantable,
    grantor_role.rolname as grantor_name,
    format(
      '%s|%s|%s|%s',
      coalesce(grantee_role.rolname, 'PUBLIC'),
      a.privilege_type,
      a.is_grantable,
      grantor_role.rolname
    ) as entry
  from target_table t
  cross join lateral aclexplode(coalesce(t.relacl, acldefault('r', t.relowner))) a
  left join pg_roles grantee_role on grantee_role.oid = a.grantee
  join pg_roles grantor_role on grantor_role.oid = a.grantor
), target_acl_state as (
  select
    coalesce(
      bool_and(grantee_name in ('postgres', 'PUBLIC', 'anon', 'authenticated', 'service_role')),
      false
    ) as preapply_contract,
    coalesce(
      array_agg(entry order by grantee_name, privilege_type) = array[
        'postgres|DELETE|f|postgres',
        'postgres|INSERT|f|postgres',
        'postgres|REFERENCES|f|postgres',
        'postgres|SELECT|f|postgres',
        'postgres|TRIGGER|f|postgres',
        'postgres|TRUNCATE|f|postgres',
        'postgres|UPDATE|f|postgres'
      ]::text[],
      false
    ) as exact_contract
  from target_acl_entries
), table_access as (
  select
    not exists (
      select 1 from target_table t
      where has_table_privilege('anon', t.oid, 'SELECT')
         or has_table_privilege('anon', t.oid, 'INSERT')
         or has_table_privilege('anon', t.oid, 'UPDATE')
         or has_table_privilege('anon', t.oid, 'DELETE')
         or has_table_privilege('anon', t.oid, 'TRUNCATE')
         or has_table_privilege('anon', t.oid, 'REFERENCES')
         or has_table_privilege('anon', t.oid, 'TRIGGER')
         or has_table_privilege('authenticated', t.oid, 'SELECT')
         or has_table_privilege('authenticated', t.oid, 'INSERT')
         or has_table_privilege('authenticated', t.oid, 'UPDATE')
         or has_table_privilege('authenticated', t.oid, 'DELETE')
         or has_table_privilege('authenticated', t.oid, 'TRUNCATE')
         or has_table_privilege('authenticated', t.oid, 'REFERENCES')
         or has_table_privilege('authenticated', t.oid, 'TRIGGER')
    ) as client_acl_blocked,
    not exists (
      select 1 from pg_policy pol join target_table t on t.oid = pol.polrelid
    ) as no_policies
)
select jsonb_build_object(
  'ledger_exact_count', (
    select count(*)::integer from target_ledger
    where version = '${PINNED_MIGRATION.version}'
      and name in ('${ACCEPTED_LEDGER_NAMES[0]}', '${ACCEPTED_LEDGER_NAMES[1]}')
  ),
  'ledger_conflict_count', (
    select count(*)::integer from target_ledger
    where not (
      version = '${PINNED_MIGRATION.version}'
      and name in ('${ACCEPTED_LEDGER_NAMES[0]}', '${ACCEPTED_LEDGER_NAMES[1]}')
    )
  ),
  'ledger_exact_names', coalesce((
    select jsonb_agg(name order by name)
    from target_ledger
    where version = '${PINNED_MIGRATION.version}'
      and name in ('${ACCEPTED_LEDGER_NAMES[0]}', '${ACCEPTED_LEDGER_NAMES[1]}')
  ), '[]'::jsonb),
  'ledger_statements_contract', coalesce((
    select count(*) = 1 and bool_and(
      statements = array[
        '${LEDGER_STATEMENT_MARKERS[0]}',
        '${LEDGER_STATEMENT_MARKERS[1]}'
      ]::text[]
    )
    from target_ledger
    where version = '${PINNED_MIGRATION.version}'
      and name in ('${ACCEPTED_LEDGER_NAMES[0]}', '${ACCEPTED_LEDGER_NAMES[1]}')
  ), false),
  'migration_ledger_contract',
    coalesce((
      select
        count(*) = 1
        and bool_and(
          ledger.relkind = 'r'
          and ledger.relpersistence = 'p'
          and not ledger.relispartition
          and not ledger.relrowsecurity
          and not ledger.relforcerowsecurity
          and ledger.relreplident = 'd'
          and ledger.reloptions is null
          and schema_owner.rolname = current_user
          and ledger_owner.rolname = current_user
          and current_user = 'postgres'
          and has_schema_privilege(current_user, schema.oid, 'USAGE,CREATE')
          and has_table_privilege(current_user, ledger.oid, 'SELECT,INSERT,UPDATE')
          and not exists (
            select 1 from pg_inherits inh
            where inh.inhrelid = ledger.oid or inh.inhparent = ledger.oid
          )
          and not exists (
            select 1 from pg_publication_rel publication
            where publication.prrelid = ledger.oid
          )
          and not exists (
            select 1 from pg_policy policy
            where policy.polrelid = ledger.oid
          )
        )
      from migration_ledger ledger
      join migration_schema schema on schema.oid = ledger.relnamespace
      join pg_roles schema_owner on schema_owner.oid = schema.nspowner
      join pg_roles ledger_owner on ledger_owner.oid = ledger.relowner
    ), false)
    and coalesce((select contract from migration_ledger_column_state), false)
    and coalesce((select contract from migration_ledger_constraint_state), false)
    and coalesce((select contract from migration_ledger_index_state), false)
    and coalesce((select contract from migration_schema_acl_state), false)
    and coalesce((select contract from migration_ledger_acl_state), false)
    and coalesce((select contract from migration_ledger_trigger_rule_state), false),
  'auth_users_contract', coalesce((
    select
      columns.contract
      and users.relkind = 'r'
      and users.relpersistence = 'p'
      and not users.relispartition
      and has_table_privilege(current_user, users.oid, 'SELECT')
      and has_table_privilege(current_user, users.oid, 'UPDATE')
    from required_column_state columns
    join auth_users_table users on true
    where columns.relation_key = 'auth.users'
  ), false),
  'creation_default_acl_contract', not exists (
    select 1
    from pg_default_acl defaults
    cross join lateral aclexplode(defaults.defaclacl) acl
    left join pg_roles grantee on grantee.oid = acl.grantee
    join pg_roles grantor on grantor.oid = acl.grantor
    where defaults.defaclrole = (select oid from pg_roles where rolname = current_user)
      and defaults.defaclnamespace in (
        0,
        (select oid from pg_namespace where nspname = 'public')
      )
      and defaults.defaclobjtype in ('r', 'f')
      and (
        grantor.rolname <> current_user
        or coalesce(grantee.rolname, 'PUBLIC') not in (
          current_user, 'PUBLIC', 'anon', 'authenticated', 'service_role'
        )
        or (
          defaults.defaclobjtype = 'r'
          and acl.privilege_type not in (
            'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'
          )
        )
        or (defaults.defaclobjtype = 'f' and acl.privilege_type <> 'EXECUTE')
      )
  ),
  'profiles_contract', coalesce((
    select contract from required_column_state where relation_key = 'public.profiles'
  ), false),
  'profiles_insert_contract', coalesce((
    select
      t.relkind = 'r'
      and t.relpersistence = 'p'
      and not t.relispartition
      and not t.relforcerowsecurity
      and profile_owner.rolname = 'postgres'
      and handle.owner_name = 'postgres'
      and handle.prosecdef
      and t.relowner = handle.proowner
      and has_table_privilege(handle.proowner, t.oid, 'INSERT')
      and coalesce((select contract from profiles_supplied_columns_contract), false)
      and coalesce((select contract from profiles_insert_constraints_contract), false)
      and coalesce((select contract from profiles_insert_indexes_contract), false)
      and coalesce((select contract from profiles_insert_triggers_rules_contract), false)
      and not exists (
        select 1
        from pg_attribute a
        where a.attrelid = t.oid
          and a.attnum > 0
          and not a.attisdropped
          and a.attname in (
            'user_id','display_name','marketing_opt_in','marketing_opt_in_at','referral_code'
          )
          and (a.attgenerated <> '' or a.attidentity <> '')
      )
      and not exists (
        select 1
        from pg_attribute a
        where a.attrelid = t.oid
          and a.attnum > 0
          and not a.attisdropped
          and a.attnotnull and not a.atthasdef
          and a.attgenerated = '' and a.attidentity = ''
          and a.attname not in (
            'user_id','display_name','marketing_opt_in','marketing_opt_in_at','referral_code'
          )
      )
    from profiles_table t
    join pg_roles profile_owner on profile_owner.oid = t.relowner
    join function_rows handle on handle.oid = to_regprocedure('public.handle_new_user()')
  ), false),
  'profiles_user_id_conflict_contract', coalesce((
    select
      pk.convalidated
      and not pk.condeferrable
      and not pk.condeferred
      and pk.conkey = array[(
        select attnum from pg_attribute
        where attrelid = to_regclass('public.profiles') and attname = 'user_id'
      )]::smallint[]
      and md5(pk.definition) = '${EXPECTED_DATABASE_FINGERPRINTS.primary_key.md5}'
      and idx.indisprimary
      and idx.indisunique
      and idx.indisvalid
      and idx.indisready
      and idx.indimmediate
      and not idx.indisexclusion
      and idx.indpred is null
      and idx.indexprs is null
      and idx.indnkeyatts = 1
      and idx.indnatts = 1
      and idx.indkey[0] = (
        select attnum from pg_attribute
        where attrelid = to_regclass('public.profiles') and attname = 'user_id'
      )
    from profiles_primary_key pk
    join profiles_primary_index idx on true
  ), false),
  'profiles_referral_code_index_contract', coalesce((
    select
      idx.indisunique
      and idx.indisvalid
      and idx.indisready
      and idx.indimmediate
      and not idx.indisprimary
      and not idx.indisexclusion
      and idx.indexprs is null
      and idx.indnkeyatts = 1
      and idx.indnatts = 1
      and idx.indkey[0] = (
        select attnum from pg_attribute
        where attrelid = to_regclass('public.profiles') and attname = 'referral_code'
      )
      and pg_get_expr(idx.indpred, idx.indrelid) = '(referral_code IS NOT NULL)'
    from profiles_referral_index idx
  ), false),
  'subscriptions_contract', coalesce((
    select contract from required_column_state where relation_key = 'public.subscriptions'
  ), false),
  'user_roles_contract', coalesce((
    select
      columns.contract
      and t.relkind = 'r'
      and t.relpersistence = 'p'
      and not t.relispartition
      and not t.relforcerowsecurity
      and table_owner.rolname = 'postgres'
      and role_check.owner_name = 'postgres'
      and role_check.prosecdef
      and t.relowner = role_check.proowner
      and has_table_privilege(role_check.proowner, t.oid, 'SELECT')
    from required_column_state columns
    join user_roles_table t on true
    join pg_roles table_owner on table_owner.oid = t.relowner
    join dependency_rows role_check
      on role_check.oid = to_regprocedure('public.has_role(uuid,public.app_role)')
    where columns.relation_key = 'public.user_roles'
  ), false),
  'app_role_contract', exists (
    select 1
    from pg_type typ
    join pg_namespace n on n.oid = typ.typnamespace
    join pg_enum e on e.enumtypid = typ.oid and e.enumlabel = 'operator'
    where n.nspname = 'public' and typ.typname = 'app_role' and typ.typtype = 'e'
  ),
  'dependency_functions_contract',
    coalesce((select prorettype = 'text'::regtype from pg_proc where oid = to_regprocedure('public.generate_referral_code()')), false)
    and coalesce((select prorettype = 'jsonb'::regtype from pg_proc where oid = to_regprocedure('public.convert_referral(uuid,uuid,text,text,boolean)')), false)
    and coalesce((select prorettype = 'boolean'::regtype from pg_proc where oid = to_regprocedure('public.has_role(uuid,public.app_role)')), false),
  'target_functions_preapply_contract',
    exists (
      select 1 from function_rows f
      where f.oid = to_regprocedure('public.handle_new_user()')
    )
    and not exists (
      select 1
      from function_rows f
      where f.owner_name <> 'postgres'
         or f.prokind <> 'f'
         or f.proretset
         or f.proargmodes is not null
         or f.proallargtypes is not null
         or case
              when f.oid = to_regprocedure('public.handle_new_user()') then
                f.prorettype <> 'trigger'::regtype or f.proargnames is not null
              when f.oid = to_regprocedure('public.record_signup_acquisition_first_touch(text)') then
                f.prorettype <> 'boolean'::regtype
                or f.proargnames <> array['p_source']::text[]
              when f.oid in (
                to_regprocedure('public.signup_acquisition_operator_snapshot()'),
                to_regprocedure('public.signup_to_paid_operator_snapshot()')
              ) then f.prorettype <> 'jsonb'::regtype or f.proargnames is not null
              else true
            end
    )
    and not exists (
      select 1
      from function_rows f
      cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) acl
      left join pg_roles grantee on grantee.oid = acl.grantee
      join pg_roles grantor on grantor.oid = acl.grantor
      where grantor.rolname <> 'postgres'
         or acl.privilege_type <> 'EXECUTE'
         or coalesce(grantee.rolname, 'PUBLIC') not in (
           'postgres','PUBLIC','anon','authenticated','service_role'
         )
         or (
           f.oid <> to_regprocedure('public.handle_new_user()')
           and coalesce(grantee.rolname, 'PUBLIC') = 'authenticated'
           and acl.is_grantable
         )
    ),
  'dependency_security_contract',
    (select count(*) = 3 from dependency_rows)
    and coalesce((
      select
        f.prosecdef
        and f.proconfig = array['search_path=public, pg_temp']::text[]
        and f.lanname = 'plpgsql'
        and f.provolatile = 'v'
        and f.prorettype = 'text'::regtype
        and f.owner_name = 'postgres'
        and f.definition_md5 = '${EXPECTED_DEPENDENCY_DEFINITION_FINGERPRINTS.generate_referral_code.md5}'
        and f.definition_bytes = ${EXPECTED_DEPENDENCY_DEFINITION_FINGERPRINTS.generate_referral_code.bytes}
        and acl.entries = array['postgres|EXECUTE|f|postgres']::text[]
        and not has_function_privilege('anon', f.oid, 'EXECUTE')
        and not has_function_privilege('authenticated', f.oid, 'EXECUTE')
      from dependency_rows f join dependency_acl acl using (oid)
      where f.oid = to_regprocedure('public.generate_referral_code()')
    ), false)
    and coalesce((
      select
        f.prosecdef
        and f.proconfig = array['search_path=public, pg_temp']::text[]
        and f.lanname = 'plpgsql'
        and f.provolatile = 'v'
        and f.prorettype = 'jsonb'::regtype
        and f.owner_name = 'postgres'
        and f.definition_md5 = '${EXPECTED_DEPENDENCY_DEFINITION_FINGERPRINTS.convert_referral.md5}'
        and f.definition_bytes = ${EXPECTED_DEPENDENCY_DEFINITION_FINGERPRINTS.convert_referral.bytes}
        and acl.entries = array[
          'postgres|EXECUTE|f|postgres',
          'service_role|EXECUTE|f|postgres'
        ]::text[]
        and not has_function_privilege('anon', f.oid, 'EXECUTE')
        and not has_function_privilege('authenticated', f.oid, 'EXECUTE')
        and has_function_privilege('service_role', f.oid, 'EXECUTE')
      from dependency_rows f join dependency_acl acl using (oid)
      where f.oid = to_regprocedure('public.convert_referral(uuid,uuid,text,text,boolean)')
    ), false)
    and coalesce((
      select
        f.prosecdef
        and f.proconfig = array['search_path=public, pg_temp']::text[]
        and f.lanname = 'sql'
        and f.provolatile = 's'
        and f.prorettype = 'boolean'::regtype
        and f.owner_name = 'postgres'
        and f.definition_md5 = '${EXPECTED_DEPENDENCY_DEFINITION_FINGERPRINTS.has_role.md5}'
        and f.definition_bytes = ${EXPECTED_DEPENDENCY_DEFINITION_FINGERPRINTS.has_role.bytes}
        and acl.entries = array[
          'authenticated|EXECUTE|f|postgres',
          'postgres|EXECUTE|f|postgres',
          'service_role|EXECUTE|f|postgres'
        ]::text[]
        and not has_function_privilege('anon', f.oid, 'EXECUTE')
        and has_function_privilege('authenticated', f.oid, 'EXECUTE')
        and has_function_privilege('service_role', f.oid, 'EXECUTE')
      from dependency_rows f join dependency_acl acl using (oid)
      where f.oid = to_regprocedure('public.has_role(uuid,public.app_role)')
    ), false),
  'signup_trigger_contract', coalesce((
    select
      st.tgenabled = 'O'
      and st.tgtype = 5
      and st.tgfoid = to_regprocedure('public.handle_new_user()')
      and md5(st.definition) = '${EXPECTED_DATABASE_FINGERPRINTS.signup_trigger.md5}'
      and octet_length(st.definition) = ${EXPECTED_DATABASE_FINGERPRINTS.signup_trigger.bytes}
    from signup_trigger st
  ), false),
  'table_exists', exists(select 1 from target_table),
  'target_relation_contract', coalesce((
    select
      t.relkind = 'r'
      and t.relpersistence = 'p'
      and not t.relispartition
      and not t.relforcerowsecurity
      and t.relreplident = 'd'
      and coalesce(cardinality(t.reloptions), 0) = 0
      and not exists (
        select 1 from pg_inherits inh
        where inh.inhrelid = t.oid or inh.inhparent = t.oid
      )
      and not exists (
        select 1 from pg_publication_rel publication
        where publication.prrelid = t.oid
      )
    from target_table t
  ), false),
  'target_owner_preapply_contract', coalesce((
    select
      target_owner.rolname = 'postgres'
      and handle.owner_name = 'postgres'
      and t.relowner = handle.proowner
      and has_table_privilege(handle.proowner, t.oid, 'INSERT')
      and has_table_privilege(handle.proowner, t.oid, 'SELECT')
    from target_table t
    join pg_roles target_owner on target_owner.oid = t.relowner
    join function_rows handle on handle.oid = to_regprocedure('public.handle_new_user()')
  ), false),
  'object_owner_contract', coalesce((
    select
      target_owner.rolname = 'postgres'
      and (select count(*) = 4 and bool_and(f.owner_name = 'postgres') from function_rows f)
      and (select count(*) = 3 and bool_and(f.owner_name = 'postgres') from dependency_rows f)
    from target_table t
    join pg_roles target_owner on target_owner.oid = t.relowner
  ), false),
  'row_security_enabled', coalesce((select relrowsecurity from target_table), false),
  'table_columns_contract', coalesce((
    select column_shape = array[
      '1|user_id|uuid|not_null|',
      '2|source|text|not_null|',
      '3|created_at|timestamp with time zone|not_null|now()'
    ]::text[] from target_column_state
  ), false),
  'primary_key_contract', coalesce((
    select
      pk.convalidated
      and pk.conkey = array[(select attnum from pg_attribute where attrelid = (select oid from target_table) and attname = 'user_id')]::smallint[]
      and md5(pk.definition) = '${EXPECTED_DATABASE_FINGERPRINTS.primary_key.md5}'
    from primary_key_constraint pk
  ), false),
  'foreign_key_contract', coalesce((
    select
      fk.convalidated
      and fk.conkey = array[(select attnum from pg_attribute where attrelid = (select oid from target_table) and attname = 'user_id')]::smallint[]
      and fk.confrelid = to_regclass('auth.users')
      and fk.confkey = array[(select attnum from pg_attribute where attrelid = to_regclass('auth.users') and attname = 'id')]::smallint[]
      and fk.confdeltype = 'c'
      and md5(fk.definition) = '${EXPECTED_DATABASE_FINGERPRINTS.foreign_key.md5}'
    from foreign_key_constraint fk
  ), false),
  'target_constraints_preapply_contract', coalesce((
    select
      summary.primary_count = 1
      and summary.foreign_count = 1
      and summary.source_count between 0 and 1
      and summary.total_count = 2 + summary.source_count
    from target_constraint_summary summary
  ), false),
  'target_constraints_exact_contract', coalesce((
    select
      summary.primary_count = 1
      and summary.foreign_count = 1
      and summary.source_count = 1
      and summary.total_count = 3
    from target_constraint_summary summary
  ), false),
  'target_index_contract', coalesce((
    select
      count(*) = 1
      and bool_and(
        idx.constraint_name = 'signup_acquisition_attributions_pkey'
        and idx.constraint_type = 'p'
        and idx.indisprimary
        and idx.indisunique
        and idx.indisvalid
        and idx.indisready
        and idx.indimmediate
        and not idx.indisexclusion
        and idx.indpred is null
        and idx.indexprs is null
        and idx.indnkeyatts = 1
        and idx.indnatts = 1
        and idx.indkey[0] = (
          select attnum from pg_attribute
          where attrelid = (select oid from target_table) and attname = 'user_id'
        )
      )
    from target_index_rows idx
  ), false),
  'target_triggers_rules_contract', coalesce((
    select contract from target_trigger_rule_state
  ), false),
  'target_existing_values_contract', coalesce((
    select contract from target_existing_values_state
  ), false),
  'target_acl_preapply_contract', coalesce((
    select preapply_contract from target_acl_state
  ), false),
  'target_acl_exact_contract', coalesce((
    select exact_contract from target_acl_state
  ), false),
  'source_check_contract', coalesce((
    select
      sc.convalidated
      and sc.conkey = array[(select attnum from pg_attribute where attrelid = (select oid from target_table) and attname = 'source')]::smallint[]
      and md5(sc.definition) = '${EXPECTED_DATABASE_FINGERPRINTS.source_check.md5}'
      and octet_length(sc.definition) = ${EXPECTED_DATABASE_FINGERPRINTS.source_check.bytes}
    from source_constraint sc
  ), false),
  'no_policies_contract', coalesce((select no_policies from table_access), false),
  'constraint_sources', coalesce((select to_jsonb(sources) from constraint_sources), '[]'::jsonb),
  'handle_new_user_contract', coalesce((
    select
      f.prosecdef
      and f.proconfig = array['search_path=public, pg_temp']::text[]
      and f.lanname = 'plpgsql'
      and f.provolatile = 'v'
      and f.prorettype = 'trigger'::regtype
      and f.definition_md5 = '${EXPECTED_FUNCTION_DEFINITION_FINGERPRINTS.handle_new_user.md5}'
      and f.definition_bytes = ${EXPECTED_FUNCTION_DEFINITION_FINGERPRINTS.handle_new_user.bytes}
      and acl.entries = array['postgres|EXECUTE|f|postgres']::text[]
      and not has_function_privilege('anon', f.oid, 'EXECUTE')
      and not has_function_privilege('authenticated', f.oid, 'EXECUTE')
    from function_rows f join function_acl acl using (oid)
    where f.oid = to_regprocedure('public.handle_new_user()')
  ), false),
  'first_touch_contract', coalesce((
    select
      f.prosecdef
      and f.proconfig = array['search_path=public, pg_temp']::text[]
      and f.lanname = 'plpgsql'
      and f.provolatile = 'v'
      and f.prorettype = 'boolean'::regtype
      and f.definition_md5 = '${EXPECTED_FUNCTION_DEFINITION_FINGERPRINTS.record_signup_acquisition_first_touch.md5}'
      and f.definition_bytes = ${EXPECTED_FUNCTION_DEFINITION_FINGERPRINTS.record_signup_acquisition_first_touch.bytes}
      and acl.entries = array[
        'authenticated|EXECUTE|f|postgres',
        'postgres|EXECUTE|f|postgres'
      ]::text[]
      and not has_function_privilege('anon', f.oid, 'EXECUTE')
      and has_function_privilege('authenticated', f.oid, 'EXECUTE')
    from function_rows f join function_acl acl using (oid)
    where f.oid = to_regprocedure('public.record_signup_acquisition_first_touch(text)')
  ), false),
  'acquisition_snapshot_contract', coalesce((
    select
      f.prosecdef
      and f.proconfig = array['search_path=public, pg_temp']::text[]
      and f.lanname = 'plpgsql'
      and f.provolatile = 's'
      and f.prorettype = 'jsonb'::regtype
      and f.definition_md5 = '${EXPECTED_FUNCTION_DEFINITION_FINGERPRINTS.signup_acquisition_operator_snapshot.md5}'
      and f.definition_bytes = ${EXPECTED_FUNCTION_DEFINITION_FINGERPRINTS.signup_acquisition_operator_snapshot.bytes}
      and acl.entries = array[
        'authenticated|EXECUTE|f|postgres',
        'postgres|EXECUTE|f|postgres'
      ]::text[]
      and not has_function_privilege('anon', f.oid, 'EXECUTE')
      and has_function_privilege('authenticated', f.oid, 'EXECUTE')
    from function_rows f join function_acl acl using (oid)
    where f.oid = to_regprocedure('public.signup_acquisition_operator_snapshot()')
  ), false),
  'paid_snapshot_contract', coalesce((
    select
      f.prosecdef
      and f.proconfig = array['search_path=public, pg_temp']::text[]
      and f.lanname = 'plpgsql'
      and f.provolatile = 's'
      and f.prorettype = 'jsonb'::regtype
      and f.definition_md5 = '${EXPECTED_FUNCTION_DEFINITION_FINGERPRINTS.signup_to_paid_operator_snapshot.md5}'
      and f.definition_bytes = ${EXPECTED_FUNCTION_DEFINITION_FINGERPRINTS.signup_to_paid_operator_snapshot.bytes}
      and acl.entries = array[
        'authenticated|EXECUTE|f|postgres',
        'postgres|EXECUTE|f|postgres'
      ]::text[]
      and not has_function_privilege('anon', f.oid, 'EXECUTE')
      and has_function_privilege('authenticated', f.oid, 'EXECUTE')
    from function_rows f join function_acl acl using (oid)
    where f.oid = to_regprocedure('public.signup_to_paid_operator_snapshot()')
  ), false),
  'retired_billing_branch_absent', coalesce((
    select position(
      'billing_subscriptions'
      in regexp_replace(f.prosrc, $comments$--[^\\r\\n]*$comments$, '', 'g')
    ) = 0
    from function_rows f
    where f.oid = to_regprocedure('public.signup_to_paid_operator_snapshot()')
  ), false),
  'client_access_contract', coalesce((
    select access.client_acl_blocked and access.no_policies and acl.exact_contract
    from table_access access cross join target_acl_state acl
  ), false)
)::text;
`;

const RESULT_KEYS = Object.freeze([
  "acquisition_snapshot_contract",
  "app_role_contract",
  "auth_users_contract",
  "client_access_contract",
  "constraint_sources",
  "creation_default_acl_contract",
  "dependency_functions_contract",
  "dependency_security_contract",
  "target_functions_preapply_contract",
  "first_touch_contract",
  "foreign_key_contract",
  "handle_new_user_contract",
  "ledger_conflict_count",
  "ledger_exact_count",
  "ledger_exact_names",
  "ledger_statements_contract",
  "migration_ledger_contract",
  "no_policies_contract",
  "paid_snapshot_contract",
  "primary_key_contract",
  "profiles_contract",
  "profiles_insert_contract",
  "profiles_referral_code_index_contract",
  "profiles_user_id_conflict_contract",
  "retired_billing_branch_absent",
  "row_security_enabled",
  "signup_trigger_contract",
  "source_check_contract",
  "subscriptions_contract",
  "user_roles_contract",
  "table_columns_contract",
  "table_exists",
  "target_acl_exact_contract",
  "target_acl_preapply_contract",
  "target_constraints_exact_contract",
  "target_constraints_preapply_contract",
  "target_existing_values_contract",
  "target_index_contract",
  "target_owner_preapply_contract",
  "target_relation_contract",
  "target_triggers_rules_contract",
  "object_owner_contract",
]);

const BOOLEAN_KEYS = Object.freeze([
  "table_exists",
  "target_relation_contract",
  "target_owner_preapply_contract",
  "object_owner_contract",
  "row_security_enabled",
  "table_columns_contract",
  "primary_key_contract",
  "foreign_key_contract",
  "target_constraints_preapply_contract",
  "target_constraints_exact_contract",
  "target_index_contract",
  "target_triggers_rules_contract",
  "target_existing_values_contract",
  "target_acl_preapply_contract",
  "target_acl_exact_contract",
  "source_check_contract",
  "no_policies_contract",
  "handle_new_user_contract",
  "first_touch_contract",
  "acquisition_snapshot_contract",
  "paid_snapshot_contract",
  "retired_billing_branch_absent",
  "client_access_contract",
  "auth_users_contract",
  "creation_default_acl_contract",
  "ledger_statements_contract",
  "migration_ledger_contract",
  "profiles_contract",
  "profiles_insert_contract",
  "profiles_user_id_conflict_contract",
  "profiles_referral_code_index_contract",
  "subscriptions_contract",
  "user_roles_contract",
  "app_role_contract",
  "dependency_functions_contract",
  "dependency_security_contract",
  "target_functions_preapply_contract",
  "signup_trigger_contract",
]);

const PREREQUISITE_KEYS = Object.freeze([
  "auth_users_contract",
  "creation_default_acl_contract",
  "migration_ledger_contract",
  "profiles_contract",
  "profiles_insert_contract",
  "profiles_user_id_conflict_contract",
  "profiles_referral_code_index_contract",
  "subscriptions_contract",
  "user_roles_contract",
  "app_role_contract",
  "dependency_functions_contract",
  "dependency_security_contract",
  "target_functions_preapply_contract",
  "signup_trigger_contract",
]);

export function parsePreflightStdout(stdout) {
  const lines = String(stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== 1) throw new Error(`preflight_row_count:${lines.length}`);

  let value;
  try {
    value = JSON.parse(lines[0]);
  } catch {
    throw new Error("preflight_result_json");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("preflight_result_shape");
  }
  const keys = Object.keys(value).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...RESULT_KEYS].sort())) {
    throw new Error("preflight_result_shape");
  }
  for (const key of ["ledger_exact_count", "ledger_conflict_count"]) {
    if (!Number.isInteger(value[key]) || value[key] < 0) {
      throw new Error("preflight_result_shape");
    }
  }
  for (const key of BOOLEAN_KEYS) {
    if (typeof value[key] !== "boolean") throw new Error("preflight_result_shape");
  }
  if (
    !Array.isArray(value.constraint_sources) ||
    value.constraint_sources.some((source) => typeof source !== "string")
  ) {
    throw new Error("preflight_result_shape");
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
    constraint_sources: Object.freeze([...value.constraint_sources]),
    ledger_exact_names: Object.freeze([...value.ledger_exact_names]),
  });
}

function sourceContractMatches(sources) {
  if (new Set(sources).size !== sources.length) return false;
  const observed = [...sources].sort();
  return JSON.stringify(observed) === JSON.stringify(EXPECTED_SOURCES);
}

export function prerequisitesLive(result) {
  return PREREQUISITE_KEYS.every((key) => result?.[key] === true);
}

export function targetPreApplyCompatible(result) {
  return (
    result?.table_exists === false ||
    (result?.table_exists === true &&
      result.target_relation_contract === true &&
      result.target_owner_preapply_contract === true &&
      result.table_columns_contract === true &&
      result.primary_key_contract === true &&
      result.foreign_key_contract === true &&
      result.target_constraints_preapply_contract === true &&
      result.target_index_contract === true &&
      result.target_triggers_rules_contract === true &&
      result.target_existing_values_contract === true &&
      result.target_acl_preapply_contract === true &&
      result.no_policies_contract === true)
  );
}

export function schemaEffectLive(result) {
  return (
    prerequisitesLive(result) &&
    result.ledger_statements_contract === true &&
    result.table_exists === true &&
    result.target_relation_contract === true &&
    result.object_owner_contract === true &&
    result.row_security_enabled === true &&
    result.table_columns_contract === true &&
    result.primary_key_contract === true &&
    result.foreign_key_contract === true &&
    result.target_constraints_exact_contract === true &&
    result.target_index_contract === true &&
    result.target_triggers_rules_contract === true &&
    result.target_existing_values_contract === true &&
    result.target_acl_exact_contract === true &&
    result.source_check_contract === true &&
    result.no_policies_contract === true &&
    sourceContractMatches(result.constraint_sources) &&
    result.handle_new_user_contract === true &&
    result.first_touch_contract === true &&
    result.acquisition_snapshot_contract === true &&
    result.paid_snapshot_contract === true &&
    result.retired_billing_branch_absent === true &&
    result.client_access_contract === true
  );
}

export function classifyPreflight(result) {
  if (!result || typeof result !== "object") {
    return { status: "invalid", reason: "result_missing" };
  }
  if (result.ledger_conflict_count !== 0 || result.ledger_exact_count > 1) {
    return { status: "ledger_drift", reason: "target_collision" };
  }
  const missingPrerequisite = PREREQUISITE_KEYS.find((key) => result[key] !== true);
  if (missingPrerequisite) {
    return { status: "prerequisite_drift", reason: missingPrerequisite };
  }
  if (result.ledger_exact_count === 0 && !targetPreApplyCompatible(result)) {
    return { status: "prerequisite_drift", reason: "target_table_incompatible" };
  }
  if (result.ledger_exact_count === 0) {
    return { status: "apply" };
  }
  if (result.ledger_exact_count !== 1) {
    return { status: "invalid", reason: "ledger_shape" };
  }
  if (!schemaEffectLive(result)) {
    return { status: "schema_drift", reason: "recorded_effect_mismatch" };
  }
  return { status: "verify_only" };
}

export function buildPreflightReceipt({ state, headSha }) {
  const safeHeadSha = safeSha(headSha);
  if (!safeHeadSha) throw new Error("receipt_head_sha_rejected");
  const canonicalState = Object.fromEntries(RESULT_KEYS.map((key) => [key, state?.[key]]));
  const payload = {
    receipt_schema_version: 1,
    tool: "apply-signup-acquisition-forward-repair",
    project_ref: PRODUCTION_PROJECT_REF,
    head_sha: safeHeadSha,
    migration_version: PINNED_MIGRATION.version,
    migration_name: PINNED_MIGRATION.name,
    migration_file: PINNED_MIGRATION.file,
    migration_sha256: PINNED_MIGRATION.sha256,
    state: canonicalState,
  };
  const digest = sha256(Buffer.from(JSON.stringify(payload), "utf8")).toLowerCase();
  return Object.freeze({
    project_ref: payload.project_ref,
    head_sha: payload.head_sha,
    migration_version: payload.migration_version,
    migration_sha256: payload.migration_sha256,
    receipt_id: `signup-acquisition-forward-repair-preflight:${digest}`,
    digest,
  });
}

const AUDIT_LEDGER_STATES = new Set([
  "apply",
  "verify_only",
  "ledger_drift",
  "schema_drift",
  "prerequisite_drift",
  "invalid",
]);
const AUDIT_REASON_CODES = new Set([
  "input_rejected",
  "database_secret_missing",
  "target_identity_rejected",
  "tls_trust_rejected",
  "file_validation_rejected",
  "psql_not_invocable",
  "query_failed",
  "preflight_result_rejected",
  "target_collision",
  "recorded_effect_mismatch",
  "receipt_missing",
  "receipt_mismatch",
  "deploy_head_advanced",
  "apply_failed",
  "postflight_failed",
  "postflight_result_rejected",
  "postflight_contract_failed",
  "target_table_incompatible",
  ...PREREQUISITE_KEYS,
]);

export function sanitizeAuditExtras(extra = {}) {
  const safe = {};
  if (extra.operation === "PREFLIGHT" || extra.operation === "APPLY") {
    safe.operation = extra.operation;
  }
  if (typeof extra.safe_to_apply === "boolean") safe.safe_to_apply = extra.safe_to_apply;
  const receiptDigest = safeDigest(extra.receipt_digest);
  if (receiptDigest) safe.receipt_digest = receiptDigest;
  if (AUDIT_LEDGER_STATES.has(extra.ledger_state)) safe.ledger_state = extra.ledger_state;
  if (typeof extra.schema_effect_live === "boolean") {
    safe.schema_effect_live = extra.schema_effect_live;
  }
  if (typeof extra.prerequisites_live === "boolean") {
    safe.prerequisites_live = extra.prerequisites_live;
  }
  if (AUDIT_REASON_CODES.has(extra.reason_code)) safe.reason_code = extra.reason_code;
  return safe;
}

export function buildReadOnlyPsqlArgs({ includeCommand = true } = {}) {
  return [
    "-X",
    "-q",
    "-A",
    "-t",
    "-v",
    "ON_ERROR_STOP=1",
    "--single-transaction",
    ...(includeCommand ? ["-c", PREFLIGHT_SQL] : []),
  ];
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

function runApplyFile({ path, childEnv, spawnImpl }) {
  let result;
  try {
    result = spawnImpl(
      "psql",
      ["-X", "-q", "-v", "ON_ERROR_STOP=1", "--single-transaction", "--file", path],
      { encoding: "utf8", env: childEnv },
    );
  } catch {
    return { ok: false, kind: "not_invocable" };
  }
  if (result?.error) return { ok: false, kind: "not_invocable" };
  if (result?.status !== 0) return { ok: false, kind: "apply_failed" };
  return { ok: true };
}

function makeArtifactWriters({
  reportPath,
  auditPath,
  preflightReceiptPath,
  authorization,
  now,
  logger,
}) {
  const writeReport = (status, lines) => {
    writeTextFile(
      reportPath,
      [
        "### Signup-acquisition forward-repair delivery",
        "",
        `**Status:** ${status}`,
        "",
        ...lines,
        "",
        "No connection string, password, database row, raw query output, or raw database error is included.",
        "",
      ].join("\n"),
      logger,
      "signup-acquisition repair report",
    );
  };
  const writeAudit = (outcome, base, extra = {}) => {
    writeTextFile(
      auditPath,
      `${JSON.stringify(
        {
          schema_version: 1,
          tool: "apply-signup-acquisition-forward-repair",
          target_env: "production",
          project_ref: PRODUCTION_PROJECT_REF,
          checked_at: now().toISOString(),
          outcome,
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
          ...authorization,
          ...sanitizeAuditExtras({ operation: base.operation, ...extra }),
        },
        null,
        2,
      )}\n`,
      logger,
      "signup-acquisition repair audit",
    );
  };
  const writePreflightReceipt = (stateDigest, base) => {
    writeTextFile(
      preflightReceiptPath,
      `${JSON.stringify(
        {
          schema_version: 1,
          tool: "apply-signup-acquisition-forward-repair",
          operation: "PREFLIGHT",
          outcome: "safe_to_apply",
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
          state_digest: stateDigest,
          ...authorization,
        },
        null,
        2,
      )}\n`,
      logger,
      "signup-acquisition PREFLIGHT receipt",
    );
  };
  return { writeReport, writeAudit, writePreflightReceipt };
}

export function runSignupAcquisitionForwardRepair({
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
  const { writeReport, writeAudit, writePreflightReceipt } = makeArtifactWriters({
    reportPath: env.REPORT_PATH ?? "",
    auditPath: env.AUDIT_PATH ?? "",
    preflightReceiptPath: env.PREFLIGHT_RECEIPT_PATH ?? "",
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
    logger.error("Signup-acquisition repair inputs were rejected before database access.");
    writeReport("BLOCKED - confirmation rejected", [
      "The target, project confirmation, apply phrase, or exact deploy commit did not match.",
      "No database process was started.",
    ]);
    writeAudit("input_rejected", base, { reason_code: "input_rejected" });
    return EXIT.INPUT_REJECTED;
  }

  if (operation === "APPLY" && currentDeployHeadSha !== expectedHeadSha) {
    logger.error("The deploy branch advanced during environment review.");
    writeReport("BLOCKED - deploy branch advanced", [
      "The current verdant-grow-diary head no longer matches the reviewed workflow commit.",
      "No database process was started. Run a new PREFLIGHT from the current branch head.",
    ]);
    writeAudit("deploy_head_advanced", base, { reason_code: "deploy_head_advanced" });
    return EXIT.DEPLOY_HEAD_ADVANCED;
  }

  if (
    operation === "APPLY" &&
    (env.CONFIRM_APPLY !== APPLY_CONFIRMATION || reviewedReceiptDigest === null)
  ) {
    logger.error("APPLY requires the exact confirmation phrase and reviewed receipt digest.");
    writeReport("BLOCKED - APPLY confirmation rejected", [
      "The exact apply phrase or 64-character PREFLIGHT receipt digest did not match.",
      "No database process was started.",
    ]);
    writeAudit("input_rejected", base, { reason_code: "input_rejected" });
    return EXIT.INPUT_REJECTED;
  }

  const databaseUrl = env.SUPABASE_DB_URL ?? "";
  if (!databaseUrl) {
    logger.error("The protected production database URL is not configured.");
    writeReport("BLOCKED - database secret missing", [
      "The verdant-production-solo-founder environment did not provide SUPABASE_DB_URL.",
      "No database process was started.",
    ]);
    writeAudit("no_database_url", base, { reason_code: "database_secret_missing" });
    return EXIT.NO_DATABASE_URL;
  }

  let childEnv;
  try {
    assertSupabaseDatabaseTargetIdentity({ targetEnv: "production", databaseUrl });
    childEnv = buildPsqlEnvironment(env, databaseUrl, "production");
  } catch {
    logger.error("Production database identity was rejected.");
    writeReport("BLOCKED - target identity rejected", [
      "The protected URL did not prove the pinned Verdant production project.",
      "No database process was started.",
    ]);
    writeAudit("target_rejected", base, { reason_code: "target_identity_rejected" });
    return EXIT.TARGET_REJECTED;
  }

  try {
    childEnv = hardenProductionPsqlEnvironment({ sourceEnv: env, childEnv });
  } catch {
    logger.error("Production database TLS trust was rejected.");
    writeReport("BLOCKED - production TLS trust rejected", [
      "No database process was started.",
      "Repair the protected production CA secret before running PREFLIGHT or APPLY.",
    ]);
    writeAudit("tls_trust_rejected", base, { reason_code: "tls_trust_rejected" });
    return EXIT.TLS_TRUST_REJECTED;
  }

  let migration;
  try {
    migration = validatePinnedMigrationFile({ readFile });
  } catch {
    logger.error("Pinned migration validation failed.");
    writeReport("BLOCKED - migration artifact rejected", [
      "The migration filename, version, name, byte hash, newline, or transaction fence did not match the reviewed artifact.",
      "No database process was started.",
    ]);
    writeAudit("file_rejected", base, { reason_code: "file_validation_rejected" });
    return EXIT.FILE_REJECTED;
  }

  const preflight = runReadOnlyQuery({ childEnv, spawnImpl });
  if (!preflight.ok) {
    logger.error("Read-only signup-acquisition preflight did not complete.");
    writeReport("BLOCKED - preflight failed", [
      "The ledger and schema state remain unknown. No migration SQL was submitted.",
    ]);
    writeAudit("preflight_failed", base, {
      reason_code: preflight.kind === "not_invocable" ? "psql_not_invocable" : "query_failed",
    });
    return preflight.kind === "not_invocable" ? EXIT.PSQL_NOT_INVOCABLE : EXIT.PREFLIGHT_FAILED;
  }

  let preflightResult;
  let classification;
  try {
    preflightResult = parsePreflightStdout(preflight.stdout);
    classification = classifyPreflight(preflightResult);
  } catch {
    logger.error("Read-only preflight result was rejected.");
    writeReport("BLOCKED - preflight malformed", [
      "The query did not return the exact expected result shape. No migration SQL was submitted.",
    ]);
    writeAudit("preflight_failed", base, { reason_code: "preflight_result_rejected" });
    return EXIT.PREFLIGHT_FAILED;
  }

  const receipt = buildPreflightReceipt({ state: preflightResult, headSha: expectedHeadSha });
  const receiptLine = `State-bound PREFLIGHT receipt: ${receipt.digest}`;

  if (classification.status === "ledger_drift" || classification.status === "invalid") {
    logger.error("The target migration version or name is in an unsafe ledger state.");
    writeReport("BLOCKED - migration ledger drift", [
      "A version/name collision or malformed target state was detected. Nothing was written.",
      receiptLine,
    ]);
    writeAudit("ledger_drift", base, {
      ledger_state: classification.status,
      receipt_digest: receipt.digest,
      reason_code:
        classification.reason === "target_collision"
          ? "target_collision"
          : "preflight_result_rejected",
    });
    return EXIT.LEDGER_DRIFT;
  }

  if (classification.status === "prerequisite_drift") {
    logger.error(
      "A required table, column, enum, dependency function, or signup trigger is missing.",
    );
    writeReport("BLOCKED - prerequisite drift", [
      "The pinned migration cannot be applied safely against the observed prerequisite contract.",
      "Nothing was written.",
      receiptLine,
    ]);
    writeAudit("prerequisite_drift", base, {
      ledger_state: classification.status,
      receipt_digest: receipt.digest,
      prerequisites_live: false,
      reason_code: classification.reason,
    });
    return EXIT.PREREQUISITE_DRIFT;
  }

  if (classification.status === "schema_drift") {
    logger.error("The exact ledger row exists, but its recorded schema effect does not match.");
    writeReport("BLOCKED - recorded schema effect drift", [
      "The exact migration ledger row exists, but one or more table, RLS, allowlist, function, or access checks failed.",
      "The runner will not delete ledger history or re-apply over a recorded version. Investigate the drift directly.",
      receiptLine,
    ]);
    writeAudit("schema_drift", base, {
      ledger_state: classification.status,
      receipt_digest: receipt.digest,
      schema_effect_live: false,
      prerequisites_live: prerequisitesLive(preflightResult),
      reason_code: "recorded_effect_mismatch",
    });
    return EXIT.SCHEMA_DRIFT;
  }

  if (operation === "PREFLIGHT") {
    if (classification.status === "apply") {
      logger.log("Signup-acquisition forward repair PREFLIGHT is SAFE_TO_APPLY.");
      writeReport("PASS - SAFE_TO_APPLY", [
        "The exact ledger identities are absent and every prerequisite contract passed.",
        "This PREFLIGHT was read-only and did not submit a migration file.",
        receiptLine,
      ]);
      writeAudit("safe_to_apply", base, {
        safe_to_apply: true,
        receipt_digest: receipt.digest,
        ledger_state: "apply",
        schema_effect_live: schemaEffectLive(preflightResult),
        prerequisites_live: true,
      });
      writePreflightReceipt(receipt.digest, base);
      return EXIT.OK;
    }

    logger.log("Signup-acquisition forward repair was already applied and is verified.");
    writeReport("PASS - already applied", [
      "An accepted exact ledger identity and the complete schema/access contract already exist.",
      "This PREFLIGHT was read-only and did not submit a migration file.",
      receiptLine,
    ]);
    writeAudit("already_applied_verified", base, {
      safe_to_apply: false,
      receipt_digest: receipt.digest,
      ledger_state: "verify_only",
      schema_effect_live: true,
      prerequisites_live: true,
    });
    return EXIT.OK;
  }

  if (reviewedReceiptDigest !== receipt.digest) {
    logger.error("The reviewed PREFLIGHT receipt does not match the rerun database state.");
    writeReport("BLOCKED - PREFLIGHT receipt mismatch", [
      "The deploy SHA, migration pin, project, ledger, prerequisites, or schema state changed after review.",
      "No migration file was submitted. Run and review a new PREFLIGHT.",
      receiptLine,
    ]);
    writeAudit("receipt_mismatch", base, {
      safe_to_apply: false,
      receipt_digest: receipt.digest,
      ledger_state: classification.status,
      schema_effect_live: schemaEffectLive(preflightResult),
      prerequisites_live: prerequisitesLive(preflightResult),
      reason_code: "receipt_mismatch",
    });
    return EXIT.RECEIPT_MISMATCH;
  }

  if (classification.status === "verify_only") {
    logger.log("Signup-acquisition forward repair was already applied and is verified.");
    writeReport("PASS - already applied", [
      "An accepted exact ledger identity and the complete schema/access contract already exist.",
      "No persistent write was attempted.",
      receiptLine,
    ]);
    writeAudit("already_applied_verified", base, {
      ledger_state: "verify_only",
      receipt_digest: receipt.digest,
      schema_effect_live: true,
      prerequisites_live: true,
    });
    return EXIT.OK;
  }

  const temporaryRoot = mkdtempSync(
    join(env.RUNNER_TEMP || env.TEMP || env.TMP || tmpdir(), "verdant-signup-repair-apply-"),
  );
  const applyPath = join(temporaryRoot, `apply-${PINNED_MIGRATION.version}.sql`);
  try {
    writeFileSync(applyPath, buildApplySql(migration), { encoding: "utf8", mode: 0o600 });
    const apply = runApplyFile({ path: applyPath, childEnv, spawnImpl });
    if (!apply.ok) {
      logger.error("Signup-acquisition repair transaction failed and was rolled back.");
      writeReport("FAIL - apply transaction rolled back", [
        "psql returned a failure while applying the exact migration and ledger row in one transaction.",
        "No partial ledger success is assumed. Inspect the protected database logs, then re-dispatch.",
      ]);
      writeAudit("apply_failed", base, {
        receipt_digest: receipt.digest,
        ledger_state: "apply",
        reason_code: "apply_failed",
      });
      return apply.kind === "not_invocable" ? EXIT.PSQL_NOT_INVOCABLE : EXIT.APPLY_FAILED;
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }

  const postflight = runReadOnlyQuery({ childEnv, spawnImpl });
  if (!postflight.ok) {
    logger.error("Read-only postflight verification did not complete.");
    writeReport("FAIL - postflight unavailable", [
      "The transaction returned success, but the workflow cannot prove the final ledger and schema contract.",
      "Treat the repair as unverified until this workflow is rerun.",
    ]);
    writeAudit("postflight_failed", base, {
      receipt_digest: receipt.digest,
      reason_code: "postflight_failed",
    });
    return EXIT.POSTFLIGHT_FAILED;
  }

  let postflightResult;
  let postflightClassification;
  try {
    postflightResult = parsePreflightStdout(postflight.stdout);
    postflightClassification = classifyPreflight(postflightResult);
  } catch {
    logger.error("Read-only postflight result was rejected.");
    writeReport("FAIL - postflight malformed", [
      "The transaction returned success, but the final query did not return the exact expected result shape.",
    ]);
    writeAudit("postflight_failed", base, {
      receipt_digest: receipt.digest,
      reason_code: "postflight_result_rejected",
    });
    return EXIT.POSTFLIGHT_FAILED;
  }

  if (postflightClassification.status !== "verify_only") {
    logger.error("Postflight could not prove the exact ledger row and complete schema contract.");
    writeReport("FAIL - postflight contract mismatch", [
      "The transaction returned success, but the exact filename-derived ledger row or one of the schema/access checks is missing.",
      "Do not report the signup outage fixed until the protected state is investigated and this postflight passes.",
    ]);
    writeAudit("postflight_contract_failed", base, {
      ledger_state: postflightClassification.status,
      receipt_digest: receipt.digest,
      schema_effect_live: schemaEffectLive(postflightResult),
      prerequisites_live: prerequisitesLive(postflightResult),
      reason_code: "postflight_contract_failed",
    });
    return EXIT.POSTFLIGHT_CONTRACT_FAILED;
  }

  logger.log("Signup-acquisition forward repair applied atomically and verified.");
  writeReport("PASS - applied and verified", [
    "The exact reviewed migration and its filename-derived ledger row committed in one transaction.",
    "The read-only postflight verified the table, RLS, exact source allowlist, four function contracts, client access fences, and exact ledger row.",
  ]);
  writeAudit("applied_verified", base, {
    ledger_state: "verify_only",
    receipt_digest: receipt.digest,
    schema_effect_live: true,
    prerequisites_live: true,
  });
  return EXIT.OK;
}

const isDirectInvocation =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectInvocation) {
  process.exitCode = runSignupAcquisitionForwardRepair();
}
