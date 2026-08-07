#!/usr/bin/env node
/**
 * Read-only migration-history verifier for the candidate-number maintenance
 * pair (20260806230020, 20260806230021).
 *
 * This exists because of an observed failure mode: an apply mechanism can
 * make the SCHEMA effect of a migration land correctly (the fixed trigger
 * body, the validated constraint) while recording the applied SQL under a
 * DIFFERENT, freshly generated version string in
 * supabase_migrations.schema_migrations instead of the repository's own
 * filename-derived version. Checking only the schema effect misses that
 * silently; a future gate asserting the exact expected version string would
 * report the migration as missing even though its effect is live.
 *
 * This script checks BOTH, and reports them as two distinct facts rather
 * than collapsing them into one verdict — "schema effect" and "exact ledger
 * version" are different claims and can diverge independently.
 *
 * Mirrors scripts/assert-required-core-migrations-applied.mjs's identity-proof
 * and sanitized-artifact conventions.
 *
 * Required env: TARGET_ENV (sandbox|production), SUPABASE_DB_URL (ambient
 * DATABASE_URL and PG* are ignored). Optional: REPORT_PATH, AUDIT_PATH.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertSupabaseDatabaseTargetIdentity,
  databaseTargetForEnvironment,
  sanitizeSupabaseDatabaseUrlForPsql,
  SupabaseDatabaseTargetIdentityError,
} from "./lib/supabaseDatabaseTargetIdentity.mjs";

export const EXPECTED_MIGRATIONS = Object.freeze([
  Object.freeze({
    version: "20260806230020",
    name: "candidate_number_maintenance_paths",
    file: "20260806230020_candidate_number_maintenance_paths.sql",
  }),
  Object.freeze({
    version: "20260806230021",
    name: "candidate_number_membership_validate",
    file: "20260806230021_candidate_number_membership_validate.sql",
  }),
]);

export const EXIT = Object.freeze({
  OK: 0,
  VERSION_MISSING_FROM_LEDGER: 1,
  SCHEMA_EFFECT_MISSING: 2,
  MALFORMED_RESULT: 3,
  NO_DB_CONNECTION: 4,
  PSQL_NOT_INVOCABLE: 5,
  QUERY_FAILED: 6,
  TARGET_IDENTITY_INVALID: 7,
});

// Checks the exact literal version strings AND, independently, the schema
// effect (guard function markers + validated constraint). Never treats one
// as a proxy for the other.
export const VERIFY_SQL = `
select jsonb_build_object(
  'ledger_versions', coalesce((
    select jsonb_agg(version order by version)
    from supabase_migrations.schema_migrations
    where version in ('20260806230020', '20260806230021')
  ), '[]'::jsonb),
  'guard_has_fix', coalesce((
    select pg_get_functiondef(p.oid) ilike '%v_caller_set_num%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'plants_candidate_number_guard'
  ), false),
  'constraint_present', exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'plants_candidate_number_requires_hunt_chk'
      and conrelid = 'public.plants'::regclass
  ),
  'constraint_validated', coalesce((
    select convalidated from pg_catalog.pg_constraint
    where conname = 'plants_candidate_number_requires_hunt_chk'
      and conrelid = 'public.plants'::regclass
  ), false)
)::text;
`;

function writeTextFile(path, contents, logger) {
  if (!path) return;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  } catch {
    logger.error("Warning: could not write a migration-history verifier artifact.");
  }
}

export function buildPsqlEnvironment(sourceEnv, databaseUrl, targetEnv) {
  const childEnv = {};
  const pathValue = sourceEnv.PATH ?? sourceEnv.Path;
  if (typeof pathValue === "string") childEnv.PATH = pathValue;
  for (const key of [
    "HOME",
    "USERPROFILE",
    "SystemRoot",
    "SYSTEMROOT",
    "WINDIR",
    "TEMP",
    "TMP",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
  ]) {
    if (typeof sourceEnv[key] === "string") childEnv[key] = sourceEnv[key];
  }
  const connection = sanitizeSupabaseDatabaseUrlForPsql(databaseUrl, targetEnv);
  childEnv.PGDATABASE = connection.databaseUrl;
  childEnv.PGSSLMODE = connection.sslMode;
  return childEnv;
}

export function parseVerifyStdout(stdout) {
  const lines = String(stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== 1) {
    throw new Error(`verify_row_count:${lines.length}`);
  }
  const parsed = JSON.parse(lines[0]);
  if (
    !Array.isArray(parsed.ledger_versions) ||
    typeof parsed.guard_has_fix !== "boolean" ||
    typeof parsed.constraint_present !== "boolean" ||
    typeof parsed.constraint_validated !== "boolean"
  ) {
    throw new Error("verify_result_shape");
  }
  return parsed;
}

/**
 * Classify the two facts independently: which expected versions are
 * literally in the ledger, and whether the schema effect is actually live.
 */
export function classifyHistory(result) {
  const ledgerSet = new Set(result.ledger_versions);
  const missingVersions = EXPECTED_MIGRATIONS.filter((m) => !ledgerSet.has(m.version)).map(
    (m) => m.version,
  );
  const schemaEffectLive =
    result.guard_has_fix && result.constraint_present && result.constraint_validated;

  return Object.freeze({
    missingVersions,
    allVersionsPresent: missingVersions.length === 0,
    schemaEffectLive,
    guardHasFix: result.guard_has_fix,
    constraintPresent: result.constraint_present,
    constraintValidated: result.constraint_validated,
  });
}

function createArtifactWriters({ targetEnv, reportPath, auditPath, logger, now }) {
  const writeAudit = (outcome, classification, note = "") => {
    if (!auditPath) return;
    writeTextFile(
      auditPath,
      `${JSON.stringify(
        {
          schema_version: 1,
          tool: "verify-candidate-number-migration-history",
          target_env: targetEnv,
          checked_at: now().toISOString(),
          outcome,
          expected_versions: EXPECTED_MIGRATIONS.map((m) => m.version),
          missing_versions: classification?.missingVersions ?? null,
          schema_effect_live: classification?.schemaEffectLive ?? null,
          guard_has_fix: classification?.guardHasFix ?? null,
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
        `### Candidate-number migration-history verifier - ${safeTarget}`,
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

export function runVerifyCandidateNumberMigrationHistory({
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
    writeReport("FAILED - database connection missing", [
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
    writeReport("FAILED - database identity rejected", [
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
    result = spawnImpl("psql", ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", VERIFY_SQL], {
      encoding: "utf8",
      env: childEnv,
    });
  } catch {
    result = { error: new Error("psql invocation failed") };
  }

  if (result.error) {
    logger.error("psql is not invocable on this runner. No history verdict was reached.");
    writeReport("FAILED - psql unavailable", ["Install `postgresql-client` and re-run."]);
    writeAudit("psql_not_invocable", null, "psql could not be invoked.");
    return EXIT.PSQL_NOT_INVOCABLE;
  }
  if (result.status !== 0) {
    logger.error(
      `psql exited ${String(result.status)} while running the history query; stderr was suppressed.`,
    );
    writeReport("FAILED - history query failed", [
      "The ledger and schema state remain unknown. Raw psql stderr was suppressed.",
      `psql exit status: ${String(result.status)}.`,
    ]);
    writeAudit("query_failed", null, `psql returned a non-zero status (${String(result.status)}).`);
    return EXIT.QUERY_FAILED;
  }

  let parsed;
  try {
    parsed = parseVerifyStdout(result.stdout);
  } catch (error) {
    logger.error(`History result could not be parsed (${error.message}).`);
    writeReport("FAILED - malformed history result", [
      "The history query did not return the expected shape.",
    ]);
    writeAudit("malformed_result", null, "History query returned an unexpected shape.");
    return EXIT.MALFORMED_RESULT;
  }

  const classification = classifyHistory(parsed);

  if (!classification.schemaEffectLive) {
    logger.error("The candidate-number maintenance fix is NOT live in the database.");
    logger.error(
      `  guard_has_fix=${classification.guardHasFix} constraint_present=${classification.constraintPresent} constraint_validated=${classification.constraintValidated}`,
    );
    writeReport("FAILED - schema effect not live", [
      "| Fact | Value |",
      "| --- | --- |",
      `| Guard function has the fix | ${classification.guardHasFix} |`,
      `| Constraint present | ${classification.constraintPresent} |`,
      `| Constraint validated | ${classification.constraintValidated} |`,
      "",
      "Apply the migrations before re-checking.",
    ]);
    writeAudit("schema_effect_missing", classification);
    return EXIT.SCHEMA_EFFECT_MISSING;
  }

  if (!classification.allVersionsPresent) {
    logger.error(
      `Schema effect is live, but ${classification.missingVersions.length} expected version string(s) are absent from supabase_migrations.schema_migrations:`,
    );
    for (const version of classification.missingVersions) {
      logger.error(`  ${version}`);
    }
    logger.error(
      "This means the apply path recorded the change under a DIFFERENT version (or not at all) rather than the repository's own filename-derived version. Re-apply via scripts/apply-candidate-number-maintenance-migrations.mjs to record the exact expected ledger rows.",
    );
    writeReport(`FAILED - ${classification.missingVersions.length} exact version(s) missing`, [
      "The schema effect (guard fix + validated constraint) IS live, but the migration ledger does not record the exact expected version string(s):",
      "",
      ...classification.missingVersions.map((v) => `- \`${v}\``),
      "",
      "This is the signature of an apply path that ran the SQL under a different, freshly generated version instead of the repository's own filename-derived version. Re-apply via `scripts/apply-candidate-number-maintenance-migrations.mjs`, which records the exact expected ledger rows.",
    ]);
    writeAudit("version_missing_from_ledger", classification);
    return EXIT.VERSION_MISSING_FROM_LEDGER;
  }

  logger.log(
    "Both expected migration versions are present in the ledger and the schema effect is live.",
  );
  writeReport("PASSED", [
    "Both `20260806230020` and `20260806230021` are present in `supabase_migrations.schema_migrations`, and the schema effect (guard fix + validated constraint) is live.",
  ]);
  writeAudit("verified", classification);
  return EXIT.OK;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = runVerifyCandidateNumberMigrationHistory();
}
