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
  LEDGER_VERSION_MISMATCH: 8,
});

// Checks the exact literal version strings AND, independently, the schema
// effect (guard function markers + validated constraint). Never treats one
// as a proxy for the other.
// Requires BOTH version AND name to match for a row to count as the exact
// expected migration — matching the apply script's own collision
// discipline (classifyTargetLedger treats a version/name mismatch as a
// collision, never as "present"). Checking version alone would let a row
// with the right version but a DIFFERENT name (a genuine ledger anomaly)
// read as "applied", exactly the false-positive the apply preflight
// already guards against on the write path.
export const VERIFY_SQL = `
select jsonb_build_object(
  'migrations', (
    select jsonb_agg(
      jsonb_build_object(
        'version', expected.version,
        'exact_match', exists (
          select 1 from supabase_migrations.schema_migrations sm
          where sm.version = expected.version and sm.name = expected.name
        ),
        'mismatch', exists (
          select 1 from supabase_migrations.schema_migrations sm
          where (sm.version = expected.version or sm.name = expected.name)
            and not (sm.version = expected.version and sm.name = expected.name)
        )
      )
      order by expected.version
    )
    from (values
      ('20260806230020', 'candidate_number_maintenance_paths'),
      ('20260806230021', 'candidate_number_membership_validate')
    ) as expected(version, name)
  ),
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

const TOOL_NAME = "verify-candidate-number-migration-history";
const writeTextFile = (path, contents, logger) =>
  writeToolArtifact(path, contents, logger, TOOL_NAME);

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
    !Array.isArray(parsed.migrations) ||
    parsed.migrations.length !== EXPECTED_MIGRATIONS.length ||
    !parsed.migrations.every(
      (m) =>
        typeof m?.version === "string" &&
        typeof m?.exact_match === "boolean" &&
        typeof m?.mismatch === "boolean",
    ) ||
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
  const byVersion = new Map(result.migrations.map((m) => [m.version, m]));
  const missingVersions = [];
  const mismatchedVersions = [];
  for (const expected of EXPECTED_MIGRATIONS) {
    const row = byVersion.get(expected.version);
    if (row?.mismatch) {
      // A row exists claiming this version or this name, but not both —
      // e.g. the right version under a different name. This is a ledger
      // anomaly, never "applied": the same signal the apply script's own
      // collision guard would refuse to write over.
      mismatchedVersions.push(expected.version);
    } else if (!row?.exact_match) {
      missingVersions.push(expected.version);
    }
  }
  const schemaEffectLive =
    result.guard_has_fix && result.constraint_present && result.constraint_validated;

  return Object.freeze({
    missingVersions,
    mismatchedVersions,
    allVersionsPresent: missingVersions.length === 0 && mismatchedVersions.length === 0,
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
          tool: TOOL_NAME,
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

  // Checked BEFORE "missing": a mismatched row (right version, wrong name,
  // or vice versa) is a ledger anomaly that needs investigation, never a
  // "just apply it" situation — applying again would hit the apply
  // script's own collision guard, or worse, produce an ambiguous ledger if
  // that guard were ever bypassed.
  if (classification.mismatchedVersions.length > 0) {
    logger.error(
      `Schema effect is live, but ${classification.mismatchedVersions.length} expected version(s) are claimed by a MISMATCHED ledger row (right version, wrong name, or vice versa):`,
    );
    for (const version of classification.mismatchedVersions) {
      logger.error(`  ${version}`);
    }
    logger.error(
      "This is a ledger anomaly, not a missing apply — investigate supabase_migrations.schema_migrations by hand before doing anything else. Do not re-apply; the apply script's own collision guard would refuse it for the same reason.",
    );
    writeReport(`FAILED - ${classification.mismatchedVersions.length} mismatched ledger row(s)`, [
      "The schema effect (guard fix + validated constraint) IS live, but at least one expected version is claimed by a row whose version/name pair does not match exactly:",
      "",
      ...classification.mismatchedVersions.map((v) => `- \`${v}\``),
      "",
      "This is a ledger anomaly, not a missing apply. Investigate `supabase_migrations.schema_migrations` directly before taking any action — do not re-apply.",
    ]);
    writeAudit("ledger_version_mismatch", classification);
    return EXIT.LEDGER_VERSION_MISMATCH;
  }

  if (!classification.allVersionsPresent) {
    logger.error(
      `Schema effect is live, but ${classification.missingVersions.length} expected version string(s) are absent from supabase_migrations.schema_migrations:`,
    );
    for (const version of classification.missingVersions) {
      logger.error(`  ${version}`);
    }
    logger.error(
      "This means the apply path recorded the change under a DIFFERENT version (or not at all) rather than the repository's own filename-derived version.",
    );
    // scripts/apply-candidate-number-maintenance-migrations.mjs is
    // deliberately production-only (its own confirmation gate rejects any
    // other TARGET_ENV) — pointing a sandbox failure at it would always
    // fail again. Report the honest gap rather than a repair step that
    // cannot work for this target.
    const repairLine =
      targetEnv === "production"
        ? "Re-apply via `scripts/apply-candidate-number-maintenance-migrations.mjs`, which records the exact expected ledger rows."
        : "This PR ships no automated sandbox repair path — the apply script is intentionally production-only and will refuse any other TARGET_ENV. Record the exact ledger rows manually against the sandbox database, or extend the apply script with its own sandbox confirmation gate before dispatching it here.";
    logger.error(repairLine);
    writeReport(`FAILED - ${classification.missingVersions.length} exact version(s) missing`, [
      "The schema effect (guard fix + validated constraint) IS live, but the migration ledger does not record the exact expected version string(s):",
      "",
      ...classification.missingVersions.map((v) => `- \`${v}\``),
      "",
      "This is the signature of an apply path that ran the SQL under a different, freshly generated version instead of the repository's own filename-derived version.",
      "",
      repairLine,
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
