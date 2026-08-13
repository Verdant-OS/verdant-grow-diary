#!/usr/bin/env node
/**
 * Read-only production/sandbox verifier for the service-only AI-credit spend
 * and refund contract. It checks migration history and current catalog/body
 * state separately; a migration tracker row is never treated as effect proof.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  AI_CREDIT_SERVICE_CONTRACT_MIGRATION,
  AI_CREDIT_SERVICE_SIGNATURES,
  blockedAiCreditServiceContractReport,
  evaluateAiCreditServiceContractObservation,
} from "./lib/aiCreditServiceContractEffect.mjs";
import {
  coreTargetEnvironmentForMoney,
  sanitizeMoneyDatabaseUrlForPsql,
} from "./lib/moneyDatabaseTargetIdentity.mjs";
import { buildLibpqConnectionEnvironment } from "./lib/supabaseDatabaseTargetIdentity.mjs";

const EXIT = Object.freeze({
  VERIFIED: 0,
  MIGRATION_MISSING: 1,
  CONTRACT_INEFFECTIVE: 2,
  NO_DB_CONNECTION: 3,
  PSQL_NOT_INVOCABLE: 4,
  QUERY_FAILED: 5,
  TARGET_IDENTITY_REJECTED: 6,
  OBSERVATION_UNREADABLE: 7,
});

const TARGET_ENV = process.env.TARGET_ENV ?? "unspecified";
const DB_URL = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? "";
const HAS_PG_ENV = Boolean(process.env.PGHOST);
const AUDIT_PATH = process.env.AUDIT_PATH ?? "";
const REPORT_PATH = process.env.REPORT_PATH ?? "";

function persist(path, body) {
  if (!path) return;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
  } catch (error) {
    console.error(`(warning) could not write verification artifact: ${error.message}`);
  }
}

function writeAudit(report) {
  persist(AUDIT_PATH, JSON.stringify(report, null, 2) + "\n");
}

function statusText(value) {
  return value === null ? "BLOCKED" : value ? "PASS" : "FAIL";
}

function reportMarkdown(report) {
  const statuses = report.statuses;
  const failed = report.functions.flatMap((fn) =>
    fn.failed_checks.map((check) => `- \`${fn.signature}\`: \`${check.id}\``),
  );
  failed.push(
    ...report.result_sidecar.failed_checks.map((check) => `- result sidecar: \`${check.id}\``),
  );
  return [
    `### AI-credit service contract effect — ${String(report.target_env).toUpperCase()}`,
    "",
    `- migration_applied: **${statusText(statuses.migration_applied)}**`,
    `- contract_effective: **${statusText(statuses.contract_effective)}**`,
    `- definition_drift_detected: **${
      statuses.definition_drift_detected === null
        ? "BLOCKED"
        : statuses.definition_drift_detected
          ? "FAIL — drift detected"
          : "PASS — no drift detected"
    }**`,
    `- verification_blocked: **${statuses.verification_blocked ? "BLOCKED" : "PASS"}**`,
    "",
    ...(report.blocked_reason ? [`Blocked reason: \`${report.blocked_reason}\``, ""] : []),
    ...(failed.length ? ["Failed contract checks:", "", ...failed, ""] : []),
    "This is a read-only catalog/body inspection. It does not invoke either money function.",
    "Raw function definitions and database connection material are not persisted.",
    "",
  ].join("\n");
}

function finish(report, exitCode, message) {
  writeAudit(report);
  persist(REPORT_PATH, reportMarkdown(report));
  if (message) console.error(message);
  console.log(
    JSON.stringify({
      migration_applied: report.statuses.migration_applied,
      contract_effective: report.statuses.contract_effective,
      definition_drift_detected: report.statuses.definition_drift_detected,
      verification_blocked: report.statuses.verification_blocked,
    }),
  );
  process.exit(exitCode);
}

function blocked(reason, exitCode, message) {
  finish(blockedAiCreditServiceContractReport(TARGET_ENV, reason), exitCode, message);
}

let coreTargetEnv;
try {
  coreTargetEnv = coreTargetEnvironmentForMoney(TARGET_ENV);
} catch {
  blocked(
    "invalid_target_environment",
    EXIT.TARGET_IDENTITY_REJECTED,
    "✗ Database target identity rejected. psql was not invoked.",
  );
}

if (coreTargetEnv !== null && !DB_URL) {
  blocked(
    "missing_protected_database_url",
    EXIT.TARGET_IDENTITY_REJECTED,
    "✗ Protected verification requires its pinned database URL. psql was not invoked.",
  );
}
if (!DB_URL && !HAS_PG_ENV) {
  blocked(
    "no_db_connection",
    EXIT.NO_DB_CONNECTION,
    "✗ No database connection configured; contract effect was not measured.",
  );
}

const spend = AI_CREDIT_SERVICE_SIGNATURES.spend;
const refund = AI_CREDIT_SERVICE_SIGNATURES.refund;
const sql = `
WITH target(signature) AS (
  VALUES ('${spend}'::text), ('${refund}'::text)
), resolved AS (
  SELECT signature, to_regprocedure(signature) AS oid
  FROM target
), function_rows AS (
  SELECT
    r.signature,
    r.oid,
    CASE WHEN r.oid IS NULL THEN 0 ELSE 1 END AS exact_match_count,
    CASE WHEN r.oid IS NULL THEN NULL ELSE oidvectortypes(proc.proargtypes) END AS identity_arguments,
    CASE WHEN r.oid IS NULL THEN NULL ELSE pg_get_function_result(r.oid) END AS result_type,
    CASE WHEN r.oid IS NULL THEN NULL ELSE lang.lanname END AS language,
    CASE WHEN r.oid IS NULL THEN NULL ELSE proc.prosecdef END AS security_definer,
    CASE WHEN r.oid IS NULL THEN NULL ELSE proc.proconfig END AS proconfig,
    CASE WHEN r.oid IS NULL THEN NULL ELSE has_function_privilege('service_role', r.oid, 'EXECUTE') END AS service_role_execute,
    CASE WHEN r.oid IS NULL THEN NULL ELSE has_function_privilege('authenticated', r.oid, 'EXECUTE') END AS authenticated_execute,
    CASE WHEN r.oid IS NULL THEN NULL ELSE has_function_privilege('anon', r.oid, 'EXECUTE') END AS anon_execute,
    CASE WHEN r.oid IS NULL THEN NULL ELSE pg_get_functiondef(r.oid) END AS definition
  FROM resolved r
  LEFT JOIN pg_proc proc ON proc.oid = r.oid
  LEFT JOIN pg_language lang ON lang.oid = proc.prolang
), sidecar AS (
  SELECT jsonb_build_object(
    'exists', to_regclass('public.ai_credit_spend_results') IS NOT NULL,
    'service_role_select', CASE WHEN to_regclass('public.ai_credit_spend_results') IS NULL THEN NULL ELSE has_table_privilege('service_role', 'public.ai_credit_spend_results', 'SELECT') END,
    'service_role_insert', CASE WHEN to_regclass('public.ai_credit_spend_results') IS NULL THEN NULL ELSE has_table_privilege('service_role', 'public.ai_credit_spend_results', 'INSERT') END,
    'service_role_update', CASE WHEN to_regclass('public.ai_credit_spend_results') IS NULL THEN NULL ELSE has_table_privilege('service_role', 'public.ai_credit_spend_results', 'UPDATE') END,
    'service_role_delete', CASE WHEN to_regclass('public.ai_credit_spend_results') IS NULL THEN NULL ELSE has_table_privilege('service_role', 'public.ai_credit_spend_results', 'DELETE') END,
    'authenticated_select', CASE WHEN to_regclass('public.ai_credit_spend_results') IS NULL THEN NULL ELSE has_table_privilege('authenticated', 'public.ai_credit_spend_results', 'SELECT') END,
    'authenticated_insert', CASE WHEN to_regclass('public.ai_credit_spend_results') IS NULL THEN NULL ELSE has_table_privilege('authenticated', 'public.ai_credit_spend_results', 'INSERT') END,
    'authenticated_update', CASE WHEN to_regclass('public.ai_credit_spend_results') IS NULL THEN NULL ELSE has_table_privilege('authenticated', 'public.ai_credit_spend_results', 'UPDATE') END,
    'authenticated_delete', CASE WHEN to_regclass('public.ai_credit_spend_results') IS NULL THEN NULL ELSE has_table_privilege('authenticated', 'public.ai_credit_spend_results', 'DELETE') END,
    'anon_select', CASE WHEN to_regclass('public.ai_credit_spend_results') IS NULL THEN NULL ELSE has_table_privilege('anon', 'public.ai_credit_spend_results', 'SELECT') END,
    'anon_insert', CASE WHEN to_regclass('public.ai_credit_spend_results') IS NULL THEN NULL ELSE has_table_privilege('anon', 'public.ai_credit_spend_results', 'INSERT') END,
    'anon_update', CASE WHEN to_regclass('public.ai_credit_spend_results') IS NULL THEN NULL ELSE has_table_privilege('anon', 'public.ai_credit_spend_results', 'UPDATE') END,
    'anon_delete', CASE WHEN to_regclass('public.ai_credit_spend_results') IS NULL THEN NULL ELSE has_table_privilege('anon', 'public.ai_credit_spend_results', 'DELETE') END
  ) AS value
)
SELECT jsonb_build_object(
  'target_env', '${TARGET_ENV.replaceAll("'", "''")}',
  'migration_applied', EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '${AI_CREDIT_SERVICE_CONTRACT_MIGRATION.version}'
  ),
  'functions', COALESCE((
    SELECT jsonb_agg(to_jsonb(function_rows) - 'oid' ORDER BY signature)
    FROM function_rows
  ), '[]'::jsonb),
  'result_sidecar', (SELECT value FROM sidecar)
);`;

const psqlEnv = { ...process.env };
if (DB_URL) {
  let sanitized;
  try {
    sanitized = sanitizeMoneyDatabaseUrlForPsql(DB_URL, TARGET_ENV);
  } catch (error) {
    const reason =
      error && typeof error === "object" && typeof error.code === "string"
        ? error.code
        : "target_identity_rejected";
    blocked(
      reason,
      EXIT.TARGET_IDENTITY_REJECTED,
      "✗ Database target identity rejected. psql was not invoked.",
    );
  }
  for (const key of Object.keys(psqlEnv)) {
    const normalized = key.toUpperCase();
    if (
      normalized.startsWith("PG") ||
      normalized === "DATABASE_URL" ||
      normalized.startsWith("SUPABASE_")
    ) {
      delete psqlEnv[key];
    }
  }
  Object.assign(psqlEnv, buildLibpqConnectionEnvironment(sanitized));
  const requestedConnectTimeout = Number(process.env.PGCONNECT_TIMEOUT ?? 15);
  psqlEnv.PGCONNECT_TIMEOUT = String(
    Number.isInteger(requestedConnectTimeout) &&
      requestedConnectTimeout >= 1 &&
      requestedConnectTimeout <= 60
      ? requestedConnectTimeout
      : 15,
  );
}

const result = spawnSync("psql", ["-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], {
  encoding: "utf8",
  env: psqlEnv,
  maxBuffer: 2 * 1024 * 1024,
  timeout: 90_000,
});

if (result.error) {
  if (result.error.code === "ENOENT") {
    blocked(
      "psql_not_invocable",
      EXIT.PSQL_NOT_INVOCABLE,
      "✗ psql was not invocable; contract effect was not measured.",
    );
  }
  blocked(
    result.error.code === "ETIMEDOUT" ? "catalog_query_timeout" : "catalog_query_failed",
    EXIT.QUERY_FAILED,
    "✗ The read-only catalog query did not complete. Raw diagnostics were withheld.",
  );
}
if (result.status !== 0) {
  blocked(
    "catalog_query_failed",
    EXIT.QUERY_FAILED,
    `✗ Read-only catalog query failed with psql status ${result.status}. Raw diagnostics were withheld.`,
  );
}

let observation;
try {
  const payload = result.stdout.trim();
  if (!payload) throw new Error("empty query result");
  observation = JSON.parse(payload);
} catch {
  blocked(
    "observation_unreadable",
    EXIT.OBSERVATION_UNREADABLE,
    "✗ The catalog query returned no readable JSON observation.",
  );
}

let report;
try {
  report = evaluateAiCreditServiceContractObservation(observation);
} catch {
  blocked(
    "observation_unreadable",
    EXIT.OBSERVATION_UNREADABLE,
    "✗ The catalog observation was incomplete or malformed.",
  );
}

if (report.statuses.verification_blocked) {
  finish(
    report,
    EXIT.OBSERVATION_UNREADABLE,
    "✗ At least one exact function definition was unreadable; effect remains blocked.",
  );
}
if (report.statuses.contract_effective === false) {
  finish(report, EXIT.CONTRACT_INEFFECTIVE, "✗ AI-credit service contract is not in effect.");
}
if (report.statuses.migration_applied === false) {
  finish(
    report,
    EXIT.MIGRATION_MISSING,
    "✗ Forward-reassert migration is not recorded as applied.",
  );
}

console.error(
  "✓ Forward-reassert migration is applied and its service contract remains effective.",
);
finish(report, EXIT.VERIFIED);
