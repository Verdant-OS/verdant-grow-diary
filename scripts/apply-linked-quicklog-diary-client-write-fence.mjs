#!/usr/bin/env node
/**
 * Fail-closed production delivery for one self-transactional linked diary migration:
 * 20260927094000_linked_quicklog_diary_client_write_fence. This is
 * deliberately not a generic runner.
 *
 * The migration owns its BEGIN/COMMIT, so it is submitted byte-for-byte in a
 * plain psql --file invocation. Only after a read-only canonical postflight is
 * the collision-guarded Supabase migration-ledger row inserted in a separate,
 * short transaction. An interrupted run is recoverable from the exact
 * canonical-schema/absent-ledger state without replaying the migration.
 *
 * The migration adds two restrictive authenticated policies and one invoker
 * trigger/function to public.diary_entries. It rewrites no existing row.
 * Before delivery the lane checks the diary table, owner policies, target
 * object absence, migration ledger, and protected runner identity.
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
  ACCEPTED_LEDGER_NAMES as CATALOG_LEDGER_NAMES,
  BOOLEAN_KEYS,
  CATALOG_STATE_QUERY_SQL,
  INTEGER_KEYS,
  LEDGER_STATEMENT_MARKERS as CATALOG_LEDGER_MARKERS,
  PREFLIGHT_SQL,
  PREREQUISITE_KEYS,
  RESULT_KEYS,
} from "./lib/linkedQuicklogDiaryDeliveryCatalog.mjs";
import {
  assertSupabaseDatabaseTargetIdentity,
  SUPABASE_DATABASE_TARGETS,
} from "./lib/supabaseDatabaseTargetIdentity.mjs";

export { findUnsafeSqlReason };

export const PRODUCTION_PROJECT_REF = SUPABASE_DATABASE_TARGETS.production.projectRef;
export const APPLY_CONFIRMATION = "APPLY LINKED QUICKLOG DIARY CLIENT WRITE FENCE";
export const EXPECTED_REPOSITORY = "Verdant-OS/verdant-grow-diary";
export const EXPECTED_WORKFLOW_PATH =
  ".github/workflows/apply-linked-quicklog-diary-client-write-fence.yml";
export const TOOL_NAME = "apply-linked-quicklog-diary-client-write-fence";

// This digest is intentionally immutable once reviewed. The migration is
// introduced by #1741; once merged its bytes can never change, and a mismatch
// means the checkout is not the reviewed file.
export const PINNED_MIGRATION = Object.freeze({
  version: "20260927094000",
  name: "linked_quicklog_diary_client_write_fence",
  file: "20260927094000_linked_quicklog_diary_client_write_fence.sql",
  sha256: "DB09A0C9CDA6C1A1933E9C1DA919B45E1288030DD866C51529A02B9C434C8F7F",
});

export const ACCEPTED_LEDGER_NAMES = Object.freeze([
  PINNED_MIGRATION.name,
  `${PINNED_MIGRATION.version}_${PINNED_MIGRATION.name}`,
]);

export const LEDGER_STATEMENT_MARKERS = Object.freeze([
  `-- applied verbatim by protected GitHub workflow; sha256=${PINNED_MIGRATION.sha256}`,
  "-- protected wrapper; self-transactional-migration=true;ledger-recovery=v1",
]);

// pg_proc.prosrc is the exact PL/pgSQL body delimited by the migration's
// dollar quotes. The pinned source file supplies the digest, not user input.
export const GUARD_FUNCTION_FINGERPRINT = Object.freeze({
  bytes: 825,
  md5: "1dab5dbef54ce73134be90fe59d340de",
});
export const DIARY_TABLE = "public.diary_entries";
export const GUARD_FUNCTION_SIGNATURE = "public.guard_linked_quicklog_diary_client_update()";
export const GUARD_TRIGGER_NAME = "guard_linked_quicklog_diary_client_update_trg";
export const INSERT_POLICY_NAME = "Linked Quick Log diary requires server insert";
export const DELETE_POLICY_NAME = "Linked Quick Log diary requires revision for delete";
export const REQUIRED_OWNER_POLICIES = Object.freeze([
  ["Users insert own entries", "INSERT"],
  ["Users update own entries", "UPDATE"],
  ["Users delete own entries", "DELETE"],
]);
if (
  JSON.stringify(ACCEPTED_LEDGER_NAMES) !== JSON.stringify(CATALOG_LEDGER_NAMES) ||
  JSON.stringify(LEDGER_STATEMENT_MARKERS) !== JSON.stringify(CATALOG_LEDGER_MARKERS)
) {
  throw new Error("linked_diary_catalog_pin_mismatch");
}
export { CATALOG_STATE_QUERY_SQL, PREFLIGHT_SQL, RESULT_KEYS };

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
      "### Linked Quick Log diary client-write fence delivery",
      "",
      "**Status:** BLOCKED - solo-founder authorization rejected",
      "",
      `Reason code: ${reasonCode}`,
      "No database process was started. No untrusted authorization value is included.",
      "",
    ].join("\n"),
    logger,
    "Linked diary delivery report",
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
    "Linked diary delivery audit",
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

/** No target policy, function overload or trigger exists. */
function targetAbsent(result) {
  return (
    result.insert_policy_count === 0 &&
    result.delete_policy_count === 0 &&
    result.guard_function_overload_count === 0 &&
    result.guard_trigger_count === 0
  );
}

/** Every delivered target object matches the pinned migration. */
function targetCanonical(result) {
  return (
    result.insert_policy_count === 1 &&
    result.insert_policy_contract === true &&
    result.delete_policy_count === 1 &&
    result.delete_policy_contract === true &&
    result.guard_function_overload_count === 1 &&
    result.guard_function_contract === true &&
    result.guard_function_source_contract === true &&
    result.guard_trigger_count === 1 &&
    result.guard_trigger_contract === true
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
    ...PREREQUISITE_KEYS,
    "insert_policy_contract",
    "delete_policy_contract",
    "guard_function_contract",
    "guard_function_source_contract",
    "guard_trigger_contract",
  ];
  return [
    "\\set ON_ERROR_STOP on",
    "begin;",
    "set local lock_timeout = '8s';",
    "set local statement_timeout = '30s';",
    "set local search_path = pg_catalog, public, pg_temp;",
    "select pg_advisory_xact_lock(20260927, 94000);",
    "lock table supabase_migrations.schema_migrations in share row exclusive mode;",
    "do $linked_diary_ledger_guard$",
    "declare",
    "  v_state json;",
    "begin",
    "  execute $catalog_state$",
    CATALOG_STATE_QUERY_SQL,
    "  $catalog_state$ into v_state;",
    "  if coalesce((v_state->>'ledger_exact_count')::integer,-1) <> 0",
    "     or coalesce((v_state->>'ledger_conflict_count')::integer,-1) <> 0",
    ...requireTrue.map((key) => `     or not coalesce((v_state->>'${key}')::boolean,false)`),
    "     or coalesce((v_state->>'insert_policy_count')::integer,-1) <> 1",
    "     or coalesce((v_state->>'delete_policy_count')::integer,-1) <> 1",
    "     or coalesce((v_state->>'guard_function_overload_count')::integer,-1) <> 1",
    "     or coalesce((v_state->>'guard_trigger_count')::integer,-1) <> 1 then",
    "    raise exception using errcode='55000', message='linked diary fence ledger collision or canonical contract drift';",
    "  end if;",
    "end",
    "$linked_diary_ledger_guard$;",
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

// The pinned migration opens its own transaction and takes locks on
// public.diary_entries (CREATE POLICY / CREATE TRIGGER). Session-level bounds,
// set before the file runs, make a conflicting transaction fail APPLY instead
// of leaving it waiting; the migration bytes stay unchanged. The ledger insert
// sets its own transaction-local bounds.
export const MIGRATION_APPLY_SESSION_SETTINGS = Object.freeze([
  "set lock_timeout = '8s'",
  "set statement_timeout = '60s'",
]);

function runPlainFile({ path, childEnv, spawnImpl, failureKind, sessionSettings = [] }) {
  let result;
  try {
    const settings = sessionSettings.flatMap((statement) => ["-c", statement]);
    result = spawnImpl("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", ...settings, "--file", path], {
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
        "### Linked Quick Log diary client-write fence delivery",
        "",
        `**Status:** ${status}`,
        "",
        ...lines,
        "",
        "No connection string, password, database row, raw query output, raw database error, or CA material is included.",
        "",
      ].join("\n"),
      logger,
      "Linked diary delivery report",
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
      "Linked diary delivery audit",
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
      "Linked diary PREFLIGHT receipt",
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

export function runLinkedQuicklogDiaryClientWriteFence({
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
    logger.error("Linked diary delivery inputs were rejected before database access.");
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
    logger.error("Read-only linked diary preflight did not complete.");
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
      logger.log("Linked Quick Log diary client-write fence is already applied and verified.");
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
        ? "Linked diary PREFLIGHT is SAFE_TO_APPLY."
        : "Linked diary PREFLIGHT found recoverable schema_live_ledger_absent.",
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
    logger.log("Linked Quick Log diary client-write fence is already applied and verified.");
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
      sessionSettings: MIGRATION_APPLY_SESSION_SETTINGS,
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
  if (canonicalClassification.status !== "schema_live_ledger_absent") {
    writeReport("FAIL - canonical postflight contract mismatch", ["No ledger row was inserted."]);
    writeAudit("postflight_contract_failed", base, { receipt_digest: receipt.digest });
    return EXIT.POSTFLIGHT_CONTRACT_FAILED;
  }

  const temporaryRoot = mkdtempSync(
    join(env.RUNNER_TEMP || env.TEMP || env.TMP || tmpdir(), "verdant-linked-diary-ledger-"),
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

  logger.log("Linked Quick Log diary client-write fence and ledger state are verified.");
  writeReport("PASS - applied_verified", [
    "The exact self-transactional migration committed without an application write freeze.",
    "The two restrictive policies, invoker trigger/function and ledger were verified.",
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
if (isDirectInvocation) process.exitCode = runLinkedQuicklogDiaryClientWriteFence();
