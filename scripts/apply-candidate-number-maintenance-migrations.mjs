#!/usr/bin/env node
/**
 * Manual, fail-closed production runner for the candidate-number
 * maintenance-paths pair (20260806230020, 20260806230021).
 *
 * Built after an observed gap: a prior apply via Lovable's own mechanism
 * made the SCHEMA EFFECT land correctly, but recorded it in
 * supabase_migrations.schema_migrations under two freshly generated
 * timestamps instead of these files' own filename-derived versions. This
 * script is the disciplined alternative for future re-applies: it reads the
 * exact repository files (byte-pinned), refuses if a caller-owned orphan
 * row would fail the new constraint (this is the item-3 preflight, and it
 * always runs before any migration SQL is submitted), and inserts the exact
 * expected version/name rows into the ledger itself — raw psql execution
 * does not go through Supabase's own tracker, so nothing else will.
 *
 * This does not, and cannot, control what a future Lovable "apply" click
 * does internally — that mechanism is external to this repository. This
 * script is the alternative path for when exact ledger versions matter.
 *
 * Not a generic migration runner: it only reads these two files, only
 * accepts their reviewed LF byte hashes, and only connects to the pinned
 * production Supabase project.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  assertSupabaseDatabaseTargetIdentity,
  sanitizeSupabaseDatabaseUrlForPsql,
  SUPABASE_DATABASE_TARGETS,
  SupabaseDatabaseTargetIdentityError,
} from "./lib/supabaseDatabaseTargetIdentity.mjs";
import { findUnsafeSqlReason } from "./apply-pinned-production-migrations.mjs";
import {
  classifyPreflightResult,
  parsePreflightStdout,
  PREFLIGHT_OUTCOME,
  PREFLIGHT_SQL as MEMBERSHIP_PREFLIGHT_SQL,
} from "./lib/candidateNumberMembershipPreflight.mjs";
import {
  classifyHistory,
  parseVerifyStdout,
  VERIFY_SQL as HISTORY_VERIFY_SQL,
} from "./verify-candidate-number-migration-history.mjs";

export const PRODUCTION_PROJECT_REF = SUPABASE_DATABASE_TARGETS.production.projectRef;
export const APPLY_CONFIRMATION = "APPLY CANDIDATE NUMBER MAINTENANCE MIGRATIONS";

export const PINNED_MIGRATIONS = Object.freeze([
  Object.freeze({
    version: "20260806230020",
    name: "candidate_number_maintenance_paths",
    file: "20260806230020_candidate_number_maintenance_paths.sql",
    sha256: "5B87576F852BD6C8EE71850188AFF3059252929611021FDF03484919A40423C2",
  }),
  Object.freeze({
    version: "20260806230021",
    name: "candidate_number_membership_validate",
    file: "20260806230021_candidate_number_membership_validate.sql",
    sha256: "D2E28898FD6F50A14A1023669BF59F9011871844714CDE1482073130CAE70C27",
  }),
]);

export const EXIT = Object.freeze({
  OK: 0,
  INPUT_REJECTED: 1,
  NO_DATABASE_URL: 2,
  TARGET_REJECTED: 3,
  FILE_REJECTED: 4,
  PSQL_NOT_INVOCABLE: 5,
  MEMBERSHIP_PREFLIGHT_FAILED: 6,
  ORPHANS_BLOCK_APPLY: 7,
  LEDGER_QUERY_FAILED: 8,
  LEDGER_DRIFT: 9,
  APPLY_FAILED: 10,
  POSTFLIGHT_FAILED: 11,
  POSTFLIGHT_CONTRACT_FAILED: 12,
});

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsRoot = resolve(repoRoot, "supabase", "migrations");

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex").toUpperCase();
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

/** Validate exact Git-blob-compatible bytes against the pinned hashes above. */
export function validatePinnedMigrationFiles({ root = migrationsRoot, readFile = readFileSync } = {}) {
  return PINNED_MIGRATIONS.map((migration) => {
    const path = resolve(root, migration.file);
    const raw = readFile(path);
    const text = raw.toString("utf8");
    const observedHash = sha256(raw);

    if (observedHash !== migration.sha256) {
      throw new Error(`hash_mismatch:${migration.version}`);
    }
    if (text.includes("\r")) {
      throw new Error(`crlf_not_allowed:${migration.version}`);
    }
    if (!text.endsWith("\n")) {
      throw new Error(`final_newline_missing:${migration.version}`);
    }
    const unsafeReason = findUnsafeSqlReason(text);
    if (unsafeReason) {
      throw new Error(`${unsafeReason}:${migration.version}`);
    }

    return Object.freeze({ ...migration, path, text });
  });
}

/**
 * One transaction: lock the ledger table, guard against a concurrent
 * collision, run both file bodies exactly as validated, then explicitly
 * insert each row's OWN filename-derived version and name. This is what
 * prevents a freshly generated duplicate timestamp — nothing else writes
 * to supabase_migrations.schema_migrations in this script.
 */
export function buildApplySql(validatedMigrations) {
  if (
    !Array.isArray(validatedMigrations) ||
    validatedMigrations.length !== PINNED_MIGRATIONS.length
  ) {
    throw new Error("validated_migration_count");
  }
  for (let index = 0; index < PINNED_MIGRATIONS.length; index++) {
    const expected = PINNED_MIGRATIONS[index];
    const observed = validatedMigrations[index];
    if (
      observed.version !== expected.version ||
      observed.name !== expected.name ||
      observed.sha256 !== expected.sha256 ||
      typeof observed.text !== "string"
    ) {
      throw new Error(`validated_migration_order:${expected.version}`);
    }
  }

  const collisionValues = PINNED_MIGRATIONS.map(
    ({ version, name }) => `(${sqlLiteral(version)}, ${sqlLiteral(name)})`,
  ).join(",\n      ");
  const ledgerValues = PINNED_MIGRATIONS.map(
    ({ version, name, sha256: hash }) =>
      `(${sqlLiteral(version)}, ${sqlLiteral(name)}, ` +
      `array[${sqlLiteral(`-- applied verbatim by protected GitHub workflow; sha256=${hash}`)}]::text[])`,
  ).join(",\n  ");

  const bodies = validatedMigrations
    .map(
      ({ file, text }) =>
        `\n-- BEGIN EXACT PINNED FILE: ${file}\n${text}-- END EXACT PINNED FILE: ${file}\n`,
    )
    .join("");

  return [
    "\\set ON_ERROR_STOP on",
    "set local lock_timeout = '4s';",
    "lock table supabase_migrations.schema_migrations in share row exclusive mode;",
    "",
    "do $candidate_number_apply_guard$",
    "declare",
    "  v_collision_count integer;",
    "begin",
    "  with expected(version, name) as (",
    "    values",
    `      ${collisionValues}`,
    "  )",
    "  select count(*)",
    "    into v_collision_count",
    "  from expected e",
    "  join supabase_migrations.schema_migrations sm",
    "    on sm.version = e.version or sm.name = e.name;",
    "",
    "  if v_collision_count <> 0 then",
    "    raise exception using",
    "      errcode = '55000',",
    "      message = 'candidate-number migration apply refused a concurrent ledger collision';",
    "  end if;",
    "end",
    "$candidate_number_apply_guard$;",
    bodies,
    "insert into supabase_migrations.schema_migrations (version, name, statements)",
    "values",
    `  ${ledgerValues};`,
    "",
  ].join("\n");
}

/**
 * Classify the ledger for exactly PINNED_MIGRATIONS.length targets:
 * "apply" (all absent), "verify_only" (both present with an exact
 * version+name match), or "collision"/"mixed" (anything else, including a
 * partial match or a version/name claimed by different content).
 */
export function classifyTargetLedger(targets) {
  if (!Array.isArray(targets) || targets.length !== PINNED_MIGRATIONS.length) {
    return { status: "invalid", reason: "target_count" };
  }

  let absent = 0;
  let exact = 0;
  for (const expected of PINNED_MIGRATIONS) {
    const row = targets.find((candidate) => candidate?.version === expected.version);
    if (!row || !Array.isArray(row.matches)) {
      return { status: "invalid", reason: `target_missing:${expected.version}` };
    }
    if (row.matches.length === 0) {
      absent++;
      continue;
    }
    if (
      row.matches.length === 1 &&
      row.matches[0]?.version === expected.version &&
      row.matches[0]?.name === expected.name
    ) {
      exact++;
      continue;
    }
    return { status: "collision", reason: `target_collision:${expected.version}` };
  }

  if (absent === PINNED_MIGRATIONS.length) return { status: "apply" };
  if (exact === PINNED_MIGRATIONS.length) return { status: "verify_only" };
  return { status: "mixed", reason: "partial_target_application" };
}

const TARGET_VALUES_SQL = PINNED_MIGRATIONS.map(
  ({ version, name }) => `(${sqlLiteral(version)}, ${sqlLiteral(name)})`,
).join(",");

export const LEDGER_QUERY_SQL = `
with expected(version, name) as (
  values ${TARGET_VALUES_SQL}
)
select jsonb_agg(
  jsonb_build_object(
    'version', e.version,
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object('version', sm.version, 'name', sm.name) order by sm.version)
      from supabase_migrations.schema_migrations sm
      where sm.version = e.version or sm.name = e.name
    ), '[]'::jsonb)
  )
  order by e.version
)::text
from expected e;
`;

function buildPsqlEnvironment(sourceEnv, databaseUrl) {
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
  const connection = sanitizeSupabaseDatabaseUrlForPsql(databaseUrl, "production");
  childEnv.PGDATABASE = connection.databaseUrl;
  childEnv.PGSSLMODE = connection.sslMode;
  return childEnv;
}

function runPsqlQuery({ sql, childEnv, spawnImpl }) {
  let result;
  try {
    result = spawnImpl("psql", ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql], {
      encoding: "utf8",
      env: childEnv,
    });
  } catch {
    return { ok: false, kind: "not_invocable" };
  }
  if (result.error) return { ok: false, kind: "not_invocable" };
  if (result.status !== 0) return { ok: false, kind: "query_failed" };
  return { ok: true, stdout: result.stdout };
}

function runPsqlFile({ path, childEnv, spawnImpl }) {
  let result;
  try {
    result = spawnImpl("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-f", path], {
      encoding: "utf8",
      env: childEnv,
    });
  } catch {
    return { ok: false, kind: "not_invocable" };
  }
  if (result.error) return { ok: false, kind: "not_invocable" };
  if (result.status !== 0) return { ok: false, kind: "query_failed" };
  return { ok: true };
}

function writeSafeFile(path, contents, logger) {
  if (!path) return;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents, "utf8");
  } catch {
    logger.error("Could not write a sanitized migration-runner artifact.");
  }
}

function makeArtifactWriters({ reportPath, auditPath, now, logger }) {
  const writeReport = (status, lines) => {
    writeSafeFile(
      reportPath,
      [
        "### Candidate-number maintenance migration apply",
        "",
        `**Status:** ${status}`,
        "",
        ...lines,
        "",
        "No connection string, password, query result rows, or raw database error is included.",
        "",
      ].join("\n"),
      logger,
    );
  };
  const writeAudit = (outcome, extra = {}) => {
    writeSafeFile(
      auditPath,
      `${JSON.stringify(
        {
          schema_version: 1,
          tool: "apply-candidate-number-maintenance-migrations",
          target_env: "production",
          project_ref: PRODUCTION_PROJECT_REF,
          checked_at: now().toISOString(),
          outcome,
          migration_versions: PINNED_MIGRATIONS.map(({ version }) => version),
          ...extra,
        },
        null,
        2,
      )}\n`,
      logger,
    );
  };
  return { writeReport, writeAudit };
}

export function runApplyCandidateNumberMaintenanceMigrations({
  env = process.env,
  spawnImpl = spawnSync,
  readFile = readFileSync,
  logger = console,
  now = () => new Date(),
} = {}) {
  const expectedHeadSha = String(env.EXPECTED_HEAD_SHA ?? "").trim();
  const observedHeadSha = String(env.GITHUB_SHA ?? "").trim();
  const reportPath = env.REPORT_PATH ?? "";
  const auditPath = env.AUDIT_PATH ?? "";
  const { writeReport, writeAudit } = makeArtifactWriters({ reportPath, auditPath, now, logger });
  const auditBase = { expectedHeadSha, observedHeadSha };

  if (
    env.TARGET_ENV !== "production" ||
    env.CONFIRM_PROJECT_REF !== PRODUCTION_PROJECT_REF ||
    env.CONFIRM_APPLY !== APPLY_CONFIRMATION ||
    !/^[0-9a-f]{40}$/.test(expectedHeadSha) ||
    expectedHeadSha !== observedHeadSha
  ) {
    logger.error("Candidate-number apply inputs were rejected before database access.");
    writeReport("BLOCKED - confirmation rejected", [
      "The target ref, confirmation phrase, or expected commit did not match the checked-out deploy commit.",
    ]);
    writeAudit("input_rejected", auditBase);
    return EXIT.INPUT_REJECTED;
  }

  const databaseUrl = env.SUPABASE_DB_URL ?? "";
  if (!databaseUrl) {
    logger.error("The protected production database URL is not configured.");
    writeReport("BLOCKED - database secret missing", [
      "Configure the environment-scoped production database URL before dispatching this workflow.",
    ]);
    writeAudit("no_database_url", auditBase);
    return EXIT.NO_DATABASE_URL;
  }

  let childEnv;
  try {
    assertSupabaseDatabaseTargetIdentity({ targetEnv: "production", databaseUrl });
    childEnv = buildPsqlEnvironment(env, databaseUrl);
  } catch (error) {
    const reason =
      error instanceof SupabaseDatabaseTargetIdentityError ? error.code : "identity_validation_failed";
    logger.error(`Production database identity was rejected (${reason}).`);
    writeReport("BLOCKED - target identity rejected", [
      "The protected URL did not prove the pinned Verdant production project.",
    ]);
    writeAudit("target_rejected", { ...auditBase, note: reason });
    return EXIT.TARGET_REJECTED;
  }

  let validatedMigrations;
  try {
    validatedMigrations = validatePinnedMigrationFiles({ readFile });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "file_validation_failed";
    logger.error(`Pinned migration file validation failed (${reason}).`);
    writeReport("BLOCKED - migration artifact rejected", [
      "At least one migration path, byte hash, newline rule, order, or transaction-safety fence failed.",
    ]);
    writeAudit("file_rejected", { ...auditBase, note: reason });
    return EXIT.FILE_REJECTED;
  }

  // Item-3 preflight: this ALWAYS runs before any migration SQL is
  // submitted. An orphan row aborts the whole apply with the exact
  // remediation command; nothing is written.
  const membershipPreflight = runPsqlQuery({ sql: MEMBERSHIP_PREFLIGHT_SQL, childEnv, spawnImpl });
  if (!membershipPreflight.ok) {
    logger.error("Read-only membership preflight did not complete.");
    writeReport("BLOCKED - membership preflight failed", [
      "No migration SQL was submitted. Inspect database connectivity.",
    ]);
    writeAudit("membership_preflight_failed", { ...auditBase, note: membershipPreflight.kind });
    return membershipPreflight.kind === "not_invocable"
      ? EXIT.PSQL_NOT_INVOCABLE
      : EXIT.MEMBERSHIP_PREFLIGHT_FAILED;
  }
  let membershipClassification;
  try {
    membershipClassification = classifyPreflightResult(parsePreflightStdout(membershipPreflight.stdout));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "membership_preflight_parse_failed";
    logger.error(`Membership preflight result could not be parsed (${reason}).`);
    writeReport("BLOCKED - membership preflight malformed", [
      "The preflight query did not return the expected shape. No migration SQL was submitted.",
    ]);
    writeAudit("membership_preflight_failed", { ...auditBase, note: reason });
    return EXIT.MEMBERSHIP_PREFLIGHT_FAILED;
  }
  if (membershipClassification.outcome === PREFLIGHT_OUTCOME.ORPHANS_BLOCK_APPLY) {
    logger.error(
      `${membershipClassification.orphanCount} plants row(s) carry a candidate_number with no pheno_hunt_id.`,
    );
    logger.error("Run this exact command before re-dispatching:");
    logger.error(`  ${membershipClassification.cleanupCommand}`);
    writeReport(`BLOCKED - ${membershipClassification.orphanCount} orphan row(s) found`, [
      "No migration SQL was submitted. Run this exact command first, then re-dispatch:",
      "```sql",
      membershipClassification.cleanupCommand,
      "```",
    ]);
    writeAudit("orphans_block_apply", { ...auditBase, ...membershipClassification });
    return EXIT.ORPHANS_BLOCK_APPLY;
  }

  const ledgerQuery = runPsqlQuery({ sql: LEDGER_QUERY_SQL, childEnv, spawnImpl });
  if (!ledgerQuery.ok) {
    logger.error("Read-only ledger preflight did not complete.");
    writeReport("BLOCKED - ledger preflight failed", [
      "No migration SQL was submitted. Inspect database connectivity.",
    ]);
    writeAudit("ledger_query_failed", { ...auditBase, note: ledgerQuery.kind });
    return ledgerQuery.kind === "not_invocable" ? EXIT.PSQL_NOT_INVOCABLE : EXIT.LEDGER_QUERY_FAILED;
  }

  let ledger;
  try {
    const lines = String(ledgerQuery.stdout ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length !== 1) throw new Error(`ledger_row_count:${lines.length}`);
    ledger = classifyTargetLedger(JSON.parse(lines[0]));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "ledger_parse_failed";
    logger.error(`Ledger preflight result could not be parsed (${reason}).`);
    writeReport("BLOCKED - ledger preflight malformed", [
      "The ledger query did not return the expected shape. No migration SQL was submitted.",
    ]);
    writeAudit("ledger_query_failed", { ...auditBase, note: reason });
    return EXIT.LEDGER_QUERY_FAILED;
  }

  if (ledger.status === "collision" || ledger.status === "mixed" || ledger.status === "invalid") {
    logger.error(`Production ledger state is not safely actionable (${ledger.status}).`);
    writeReport("BLOCKED - migration ledger drift", [
      "The two pinned versions were partially applied, or a version/name is already claimed by different content. Nothing was written.",
    ]);
    writeAudit("ledger_drift", { ...auditBase, ledgerState: ledger.status, note: ledger.reason });
    return EXIT.LEDGER_DRIFT;
  }

  if (ledger.status === "apply") {
    const temporaryRoot = mkdtempSync(
      join(env.RUNNER_TEMP || env.TEMP || env.TMP || tmpdir(), "verdant-candidate-number-apply-"),
    );
    const applyPath = join(temporaryRoot, "apply.sql");
    try {
      writeFileSync(applyPath, buildApplySql(validatedMigrations), { encoding: "utf8", mode: 0o600 });
      const applyResult = runPsqlFile({ path: applyPath, childEnv, spawnImpl });
      if (!applyResult.ok) {
        logger.error("The candidate-number transaction failed and was rolled back.");
        writeReport("FAILED - transaction rolled back", [
          "psql returned a failure while running the exact single transaction. No partial success is accepted.",
        ]);
        writeAudit("apply_failed", { ...auditBase, ledgerState: ledger.status, note: applyResult.kind });
        return applyResult.kind === "not_invocable" ? EXIT.PSQL_NOT_INVOCABLE : EXIT.APPLY_FAILED;
      }
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }

  // Postflight reuses the standalone history verifier's own SQL and
  // classifier, so the apply script's final check and the on-demand
  // verifier can never silently drift apart.
  const postflight = runPsqlQuery({ sql: HISTORY_VERIFY_SQL, childEnv, spawnImpl });
  if (!postflight.ok) {
    logger.error("Postflight verification did not complete.");
    writeReport("FAILED - postflight unavailable", [
      "The workflow cannot prove the final production contract. Treat the deployment as unverified.",
    ]);
    writeAudit("postflight_failed", { ...auditBase, ledgerState: ledger.status, note: postflight.kind });
    return EXIT.POSTFLIGHT_FAILED;
  }
  let history;
  try {
    history = classifyHistory(parseVerifyStdout(postflight.stdout));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "postflight_parse_failed";
    logger.error(`Postflight result could not be parsed (${reason}).`);
    writeReport("FAILED - postflight malformed", ["The postflight query did not return the expected shape."]);
    writeAudit("postflight_failed", { ...auditBase, ledgerState: ledger.status, note: reason });
    return EXIT.POSTFLIGHT_FAILED;
  }
  if (!history.allVersionsPresent || !history.schemaEffectLive) {
    logger.error("Postflight contract verification failed.");
    writeReport("FAILED - postflight contract mismatch", [
      `Missing exact versions: ${history.missingVersions.join(", ") || "(none)"}.`,
      `Schema effect live: ${history.schemaEffectLive}.`,
    ]);
    writeAudit("postflight_contract_failed", { ...auditBase, ledgerState: ledger.status, ...history });
    return EXIT.POSTFLIGHT_CONTRACT_FAILED;
  }

  const outcome = ledger.status === "verify_only" ? "already_applied_verified" : "applied_verified";
  logger.log(
    ledger.status === "verify_only"
      ? "Candidate-number migrations were already applied and are verified."
      : "Candidate-number migrations applied and verified.",
  );
  writeReport("PASS", [
    ledger.status === "verify_only"
      ? "Both exact target ledger rows already existed; no persistent write was attempted."
      : "Both migrations committed in one transaction and their own ledger rows were recorded.",
    "Both expected version strings are present in the ledger, and the guard fix + validated constraint are live.",
  ]);
  writeAudit(outcome, { ...auditBase, ledgerState: ledger.status });
  return EXIT.OK;
}

const isDirectInvocation =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectInvocation) {
  process.exitCode = runApplyCandidateNumberMaintenanceMigrations();
}
