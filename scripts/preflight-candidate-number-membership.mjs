#!/usr/bin/env node
/**
 * Read-only preflight for the candidate-number membership constraint
 * (plants_candidate_number_requires_hunt_chk, migration 20260806230021).
 *
 * Detects orphan public.plants rows (candidate_number set, pheno_hunt_id
 * null) or the constraint's current presence/validation state, and prints
 * the exact remediation command before any migration is attempted — so an
 * operator resolves it deliberately instead of discovering it from a failed
 * migration transaction.
 *
 * This mirrors scripts/assert-required-core-migrations-applied.mjs's
 * identity-proof and sanitized-artifact conventions. It runs standalone or
 * as the first step of scripts/apply-candidate-number-maintenance-migrations.mjs.
 *
 * Required env: TARGET_ENV (sandbox|production), SUPABASE_DB_URL (ambient
 * DATABASE_URL and PG* are ignored). Optional: REPORT_PATH, AUDIT_PATH.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertSupabaseDatabaseTargetIdentity,
  databaseTargetForEnvironment,
  SupabaseDatabaseTargetIdentityError,
} from "./lib/supabaseDatabaseTargetIdentity.mjs";
import {
  buildPsqlEnvironment,
  writeTextFile as writeToolArtifact,
} from "./lib/candidateNumberToolRuntime.mjs";
import {
  classifyPreflightResult,
  parsePreflightStdout,
  PREFLIGHT_OUTCOME,
  PREFLIGHT_SQL,
} from "./lib/candidateNumberMembershipPreflight.mjs";

export const EXIT = Object.freeze({
  OK: 0,
  ORPHANS_BLOCK_APPLY: 1,
  MALFORMED_RESULT: 2,
  NO_DB_CONNECTION: 3,
  PSQL_NOT_INVOCABLE: 4,
  QUERY_FAILED: 5,
  TARGET_IDENTITY_INVALID: 6,
});

const TOOL_NAME = "preflight-candidate-number-membership";
const writeTextFile = (path, contents, logger) =>
  writeToolArtifact(path, contents, logger, TOOL_NAME);

function createArtifactWriters({ targetEnv, reportPath, auditPath, logger, now }) {
  const writeAudit = (outcome, classification, note = "") => {
    if (!auditPath) return;
    writeTextFile(
      auditPath,
      `${JSON.stringify(
        {
          schema_version: 1,
          tool: TOOL_NAME,
          target_env: targetEnv,
          checked_at: now().toISOString(),
          outcome,
          orphan_count: classification?.orphanCount ?? null,
          constraint_present: classification?.constraintPresent ?? null,
          constraint_validated: classification?.constraintValidated ?? null,
          ...(note ? { note } : {}),
        },
        null,
        2,
      )}\n`,
      logger,
    );
  };

  const writeReport = (status, lines) => {
    if (!reportPath) return;
    const safeTarget = targetEnv === "sandbox" ? "SANDBOX" : "PRODUCTION";
    writeTextFile(
      reportPath,
      [
        `### Candidate-number membership preflight - ${safeTarget}`,
        "",
        `**Status:** ${status}`,
        "",
        ...lines,
        "",
      ].join("\n"),
      logger,
    );
  };

  return { writeAudit, writeReport };
}

export function runCandidateNumberMembershipPreflight({
  env = process.env,
  spawnImpl = spawnSync,
  logger = console,
  now = () => new Date(),
} = {}) {
  const targetEnv = env.TARGET_ENV ?? "";
  const databaseUrl = env.SUPABASE_DB_URL ?? "";
  const reportPath = env.REPORT_PATH ?? "";
  const auditPath = env.AUDIT_PATH ?? "";

  const { writeAudit, writeReport } = createArtifactWriters({
    targetEnv,
    reportPath,
    auditPath,
    logger,
    now,
  });

  try {
    databaseTargetForEnvironment(targetEnv);
  } catch {
    logger.error("TARGET_ENV must be exactly sandbox or production.");
    writeAudit("target_identity_invalid", null, "Unknown or missing target environment.");
    return EXIT.TARGET_IDENTITY_INVALID;
  }

  if (!databaseUrl) {
    logger.error("SUPABASE_DB_URL is required; ambient DATABASE_URL and PG* are ignored.");
    writeReport("BLOCKED - database connection missing", [
      "The protected environment did not provide `SUPABASE_DB_URL`.",
      "No database query ran.",
    ]);
    writeAudit("no_db_connection", null, "SUPABASE_DB_URL was not configured.");
    return EXIT.NO_DB_CONNECTION;
  }

  let identity;
  try {
    identity = assertSupabaseDatabaseTargetIdentity({ targetEnv, databaseUrl });
  } catch (error) {
    const code =
      error instanceof SupabaseDatabaseTargetIdentityError
        ? error.code
        : "identity_validation_failed";
    logger.error(`Database target identity rejected (${code}).`);
    writeReport("BLOCKED - database identity rejected", [
      "The configured URL does not prove that it targets the pinned Verdant project.",
      "No database query ran.",
    ]);
    writeAudit("target_identity_invalid", null, `Identity validation failed: ${code}.`);
    return EXIT.TARGET_IDENTITY_INVALID;
  }

  logger.log(`Database identity verified for ${targetEnv} (${identity.connectionMode}).`);

  const childEnv = buildPsqlEnvironment(env, databaseUrl, targetEnv);
  let result;
  try {
    result = spawnImpl("psql", ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", PREFLIGHT_SQL], {
      encoding: "utf8",
      env: childEnv,
    });
  } catch {
    result = { error: new Error("psql invocation failed") };
  }

  if (result.error) {
    logger.error("psql is not invocable on this runner. No preflight verdict was reached.");
    writeReport("BLOCKED - psql unavailable", ["Install `postgresql-client` and re-run."]);
    writeAudit("psql_not_invocable", null, "psql could not be invoked.");
    return EXIT.PSQL_NOT_INVOCABLE;
  }
  if (result.status !== 0) {
    logger.error(
      `psql exited ${String(result.status)} while running the preflight query; stderr was suppressed.`,
    );
    writeReport("BLOCKED - preflight query failed", [
      "The preflight state remains unknown. Raw psql stderr was suppressed to protect credentials.",
      `psql exit status: ${String(result.status)}.`,
    ]);
    writeAudit("query_failed", null, `psql returned a non-zero status (${String(result.status)}).`);
    return EXIT.QUERY_FAILED;
  }

  let row;
  try {
    row = parsePreflightStdout(result.stdout);
  } catch (error) {
    logger.error(`Preflight result could not be parsed (${error.message}).`);
    writeReport("BLOCKED - malformed preflight result", [
      "The preflight query did not return exactly one well-formed JSON row.",
    ]);
    writeAudit("malformed_result", null, "Preflight query returned an unexpected shape.");
    return EXIT.MALFORMED_RESULT;
  }

  const classification = classifyPreflightResult(row);

  if (classification.outcome === PREFLIGHT_OUTCOME.MALFORMED_RESULT) {
    logger.error("Preflight result failed shape validation.");
    writeReport("BLOCKED - malformed preflight result", [
      "The preflight query row did not have the expected fields/types.",
    ]);
    writeAudit("malformed_result", classification);
    return EXIT.MALFORMED_RESULT;
  }

  if (classification.outcome === PREFLIGHT_OUTCOME.ORPHANS_BLOCK_APPLY) {
    logger.error(
      `${classification.orphanCount} plants row(s) carry a candidate_number with no pheno_hunt_id.`,
    );
    logger.error("Run this exact command before applying the migration:");
    logger.error(`  ${classification.cleanupCommand}`);
    writeReport(`BLOCKED - ${classification.orphanCount} orphan row(s) found`, [
      "The membership constraint cannot be validated until these rows are cleared.",
      "",
      "Run this exact command first:",
      "```sql",
      classification.cleanupCommand,
      "```",
    ]);
    writeAudit("orphans_block_apply", classification);
    return EXIT.ORPHANS_BLOCK_APPLY;
  }

  const already = classification.outcome === PREFLIGHT_OUTCOME.CLEAN_ALREADY_APPLIED;
  logger.log(
    already
      ? "No orphan rows; plants_candidate_number_requires_hunt_chk is already present and validated."
      : "No orphan rows; safe to apply plants_candidate_number_requires_hunt_chk.",
  );
  writeReport("PASSED", [
    already
      ? "The constraint is already present and validated. No orphan rows exist."
      : "No orphan rows exist. The migration is safe to apply.",
  ]);
  writeAudit(classification.outcome, classification);
  return EXIT.OK;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = runCandidateNumberMembershipPreflight();
}
