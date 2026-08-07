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

// Captured empirically from a throwaway Postgres 17 instance after applying
// both pinned migration files, in order, to a clean baseline schema:
// pg_get_constraintdef's rendering is deterministic for a given catalog
// entry, and md5(pg_get_functiondef(...)) fingerprints the guard function's
// actual logic rather than just a name or a marker substring inside it.
// Both pins exist so a later DDL change that keeps the same object names
// (and even keeps an old marker string somewhere in a comment or unrelated
// variable) but swaps in different logic — e.g. `ALTER TABLE ... DROP
// CONSTRAINT plants_candidate_number_requires_hunt_chk; ALTER TABLE ... ADD
// CONSTRAINT plants_candidate_number_requires_hunt_chk CHECK (true);` —
// is classified as NOT live instead of silently passing. Verified against a
// real Postgres instance that this exact drift (same name, `CHECK (true)`
// body) produces a different pg_get_constraintdef string.
export const EXPECTED_GUARD_FUNCTION_MD5 = "f80bd729ca8721780c01c4740cd3a7d6";
export const EXPECTED_CONSTRAINT_DEF =
  "CHECK (((candidate_number IS NULL) OR (pheno_hunt_id IS NOT NULL)))";

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
  'guard_functiondef_md5', (
    select md5(pg_get_functiondef(p.oid))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'plants_candidate_number_guard'
  ),
  'constraint_def', (
    select pg_get_constraintdef(oid)
    from pg_catalog.pg_constraint
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
    (parsed.guard_functiondef_md5 !== null && typeof parsed.guard_functiondef_md5 !== "string") ||
    (parsed.constraint_def !== null && typeof parsed.constraint_def !== "string") ||
    typeof parsed.constraint_validated !== "boolean"
  ) {
    throw new Error("verify_result_shape");
  }
  return parsed;
}

/**
 * Classify the two facts independently: which expected versions are
 * literally in the ledger, and whether the schema effect is actually live.
 *
 * "Live" requires the guard function's full body and the constraint's full
 * expression to match pinned canonical values (EXPECTED_GUARD_FUNCTION_MD5 /
 * EXPECTED_CONSTRAINT_DEF), not just that an object with the right name
 * exists. A same-named object with different logic — e.g. the constraint
 * redefined as `CHECK (true)` — has to fail this check, since it no longer
 * enforces the invariant even though a name/marker-substring check would
 * have called it live.
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
  const guardFunctionMatches = result.guard_functiondef_md5 === EXPECTED_GUARD_FUNCTION_MD5;
  const constraintDefMatches = result.constraint_def === EXPECTED_CONSTRAINT_DEF;
  const schemaEffectLive =
    guardFunctionMatches && constraintDefMatches && result.constraint_validated;

  return Object.freeze({
    missingVersions,
    mismatchedVersions,
    allVersionsPresent: missingVersions.length === 0 && mismatchedVersions.length === 0,
    schemaEffectLive,
    guardFunctionMatches,
    constraintDefMatches,
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
          guard_function_matches: classification?.guardFunctionMatches ?? null,
          constraint_def_matches: classification?.constraintDefMatches ?? null,
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

// Predicts, without dispatching it, what
// scripts/apply-candidate-number-maintenance-migrations.mjs's own
// classifyTargetLedger would do against this exact per-migration state, so
// remediation text never recommends an action that tool would actually
// refuse or silently skip. Only meaningful once mismatchedVersions is known
// to be empty (a mismatch is handled by its own branch before this runs).
export function describeApplyBehavior(classification) {
  const [first, second] = EXPECTED_MIGRATIONS.map((m) => m.version);
  const firstMissing = classification.missingVersions.includes(first);
  const secondMissing = classification.missingVersions.includes(second);
  if (!firstMissing && !secondMissing) return "verify_only";
  if (firstMissing && secondMissing) return "apply";
  if (!firstMissing && secondMissing) return "resume";
  // firstMissing && !secondMissing: the later migration is recorded while
  // the earlier one is not — an order the apply script's own write path
  // never produces (it always applies in dependency order), so its ledger
  // classifier treats this as drift and refuses to run.
  return "reverse_gap_drift";
}

export function buildSchemaRepairGuidance({ targetEnv, classification }) {
  // scripts/apply-candidate-number-maintenance-migrations.mjs is
  // deliberately production-only (its own confirmation gate rejects any
  // other TARGET_ENV) — pointing a sandbox failure at it would always fail
  // again. Report the honest gap rather than a repair step that cannot
  // work for this target.
  if (targetEnv !== "production") {
    return "This PR ships no automated sandbox repair path — the apply script is intentionally production-only and will refuse any other TARGET_ENV. Record or restore the exact ledger rows and schema objects manually against the sandbox database, or extend the apply script with its own sandbox confirmation gate before dispatching it here.";
  }
  const behavior = describeApplyBehavior(classification);
  switch (behavior) {
    case "apply":
      return "Re-apply via `scripts/apply-candidate-number-maintenance-migrations.mjs`, which records the exact expected ledger rows.";
    case "resume":
      return "Re-apply via `scripts/apply-candidate-number-maintenance-migrations.mjs` — it will detect the clean partial state and resume from the remaining migration.";
    case "verify_only":
      return (
        "Both exact ledger rows already exist, so `scripts/apply-candidate-number-maintenance-migrations.mjs` " +
        'will classify this as already applied (`"verify_only"`), skip re-running any SQL, and simply fail ' +
        "postflight again — there is no automated repair path for this state today. The schema must have " +
        "drifted after a legitimate apply (for example, a manual `ALTER`/`DROP` outside this tooling). Restore " +
        "it by hand: re-run the affected migration file's body directly, or delete the stale ledger row(s) so " +
        "the apply script treats the migration(s) as unapplied again."
      );
    case "reverse_gap_drift":
    default:
      return (
        `The ledger shows \`${EXPECTED_MIGRATIONS[1].version}\` recorded while \`${EXPECTED_MIGRATIONS[0].version}\` ` +
        "is absent — an order the apply script's own write path never produces on its own. " +
        "`scripts/apply-candidate-number-maintenance-migrations.mjs` will refuse to run against this state " +
        "(its ledger classifier treats it as drift, not a resumable gap). Investigate " +
        "`supabase_migrations.schema_migrations` by hand before taking any action."
      );
  }
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
    result = spawnImpl("psql", ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", VERIFY_SQL], {
      encoding: "utf8",
      env: childEnv,
    });
  } catch {
    result = { error: new Error("psql invocation failed") };
  }

  if (result.error) {
    logger.error("psql is not invocable on this runner. No history verdict was reached.");
    writeReport("BLOCKED - psql unavailable", ["Install `postgresql-client` and re-run."]);
    writeAudit("psql_not_invocable", null, "psql could not be invoked.");
    return EXIT.PSQL_NOT_INVOCABLE;
  }
  if (result.status !== 0) {
    logger.error(
      `psql exited ${String(result.status)} while running the history query; stderr was suppressed.`,
    );
    writeReport("BLOCKED - history query failed", [
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
    writeReport("BLOCKED - malformed history result", [
      "The history query did not return the expected shape.",
    ]);
    writeAudit("malformed_result", null, "History query returned an unexpected shape.");
    return EXIT.MALFORMED_RESULT;
  }

  const classification = classifyHistory(parsed);

  // Checked FIRST, before the schema-effect check below: a mismatched row
  // (right version, wrong name, or vice versa) is a ledger anomaly that
  // needs investigation regardless of whether the schema effect happens to
  // be live. Checking schema-effect first would silently drop this signal
  // whenever the schema effect was ALSO not live — a compound failure
  // reported as if it were only the simpler one.
  if (classification.mismatchedVersions.length > 0) {
    logger.error(
      `${classification.mismatchedVersions.length} expected version(s) are claimed by a MISMATCHED ledger row (right version, wrong name, or vice versa):`,
    );
    for (const version of classification.mismatchedVersions) {
      logger.error(`  ${version}`);
    }
    logger.error(`  schema effect live: ${classification.schemaEffectLive}`);
    logger.error(
      "This is a ledger anomaly, not a missing apply — investigate supabase_migrations.schema_migrations by hand before doing anything else. Do not re-apply; the apply script's own collision guard would refuse it for the same reason.",
    );
    writeReport(`FAIL - ${classification.mismatchedVersions.length} mismatched ledger row(s)`, [
      `The schema effect (guard fingerprint + constraint definition + validated) is ${classification.schemaEffectLive ? "" : "NOT "}live, but at least one expected version is claimed by a row whose version/name pair does not match exactly:`,
      "",
      ...classification.mismatchedVersions.map((v) => `- \`${v}\``),
      "",
      "This is a ledger anomaly, not a missing apply. Investigate `supabase_migrations.schema_migrations` directly before taking any action — do not re-apply.",
    ]);
    writeAudit("ledger_version_mismatch", classification);
    return EXIT.LEDGER_VERSION_MISMATCH;
  }

  if (!classification.schemaEffectLive) {
    logger.error("The candidate-number maintenance fix is NOT live in the database.");
    logger.error(
      `  guard_function_matches=${classification.guardFunctionMatches} constraint_def_matches=${classification.constraintDefMatches} constraint_validated=${classification.constraintValidated}`,
    );
    const repairLine = buildSchemaRepairGuidance({ targetEnv, classification });
    logger.error(repairLine);
    writeReport("FAIL - schema effect not live", [
      "| Fact | Value |",
      "| --- | --- |",
      `| Guard function matches pinned fingerprint | ${classification.guardFunctionMatches} |`,
      `| Constraint definition matches pinned text | ${classification.constraintDefMatches} |`,
      `| Constraint validated | ${classification.constraintValidated} |`,
      "",
      repairLine,
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
      "This means the apply path recorded the change under a DIFFERENT version (or not at all) rather than the repository's own filename-derived version.",
    );
    const repairLine = buildSchemaRepairGuidance({ targetEnv, classification });
    logger.error(repairLine);
    writeReport(`FAIL - ${classification.missingVersions.length} exact version(s) missing`, [
      "The schema effect (guard fingerprint + constraint definition + validated) IS live, but the migration ledger does not record the exact expected version string(s):",
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
  writeReport("PASS", [
    "Both `20260806230020` and `20260806230021` are present in `supabase_migrations.schema_migrations`, and the schema effect (guard fingerprint + constraint definition + validated) is live.",
  ]);
  writeAudit("verified", classification);
  return EXIT.OK;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = runVerifyCandidateNumberMigrationHistory();
}
