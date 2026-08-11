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
  SUPABASE_DATABASE_TARGETS,
  SupabaseDatabaseTargetIdentityError,
} from "./lib/supabaseDatabaseTargetIdentity.mjs";
import { buildPsqlEnvironment as buildSharedPsqlEnvironment } from "./lib/candidateNumberToolRuntime.mjs";
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
  RESUME_PREFIX_PREFLIGHT_FAILED: 13,
  RESUME_PREFIX_SCHEMA_DRIFT: 14,
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
 * SQL for exactly ONE migration step: guard against a concurrent collision
 * on THIS version/name, run this one file's body exactly as validated, then
 * explicitly insert this row's OWN filename-derived version and name. This
 * is what prevents a freshly generated duplicate timestamp — nothing else
 * writes to supabase_migrations.schema_migrations in this script.
 *
 * Deliberately ONE MIGRATION PER CALL, not both bundled together — proven
 * necessary, not stylistic. 20260806230020 adds
 * plants_candidate_number_requires_hunt_chk NOT VALID (a brief ACCESS
 * EXCLUSIVE lock) and 20260806230021 VALIDATEs it (a full-table scan under
 * only SHARE UPDATE EXCLUSIVE) specifically so that scan does not run while
 * the stronger lock is held. Postgres holds ACCESS EXCLUSIVE for the
 * REMAINDER OF THE TRANSACTION regardless of which statement is
 * "currently running" — verified empirically: a concurrent SELECT against
 * the table blocked for the full duration of a held-open transaction, not
 * just the ALTER TABLE statement. Bundling both files into one
 * --single-transaction call would silently re-hold that lock through the
 * VALIDATE scan, defeating the whole reason these are two files. The
 * caller (runApplyCandidateNumberMaintenanceMigrations) must invoke this
 * once per migration, as two separate --single-transaction psql
 * invocations, so the first migration's transaction commits — releasing
 * its lock — before the second one's transaction begins.
 *
 * The atomicity and the legality of SET LOCAL / LOCK TABLE below come from
 * the CALLER, not from any BEGIN/COMMIT text in this string: runPsqlFile
 * invokes psql with --single-transaction, which wraps the whole file in an
 * implicit BEGIN/COMMIT. Without that flag psql defaults to autocommit and
 * LOCK TABLE errors immediately ("can only be used in transaction
 * blocks") — also verified empirically. Do not "fix" that by adding a
 * literal BEGIN/COMMIT here; it would conflict with --single-transaction's
 * own wrapping.
 */
export function buildApplyStepSql(migration) {
  const expected = PINNED_MIGRATIONS.find((m) => m.version === migration?.version);
  if (
    !expected ||
    migration.version !== expected.version ||
    migration.name !== expected.name ||
    migration.sha256 !== expected.sha256 ||
    typeof migration.text !== "string"
  ) {
    throw new Error(`validated_migration_step:${migration?.version}`);
  }

  const { version, name, sha256: hash, file, text } = migration;
  const ledgerValue =
    `(${sqlLiteral(version)}, ${sqlLiteral(name)}, ` +
    `array[${sqlLiteral(`-- applied verbatim by protected GitHub workflow; sha256=${hash}`)}]::text[])`;
  const body = `\n-- BEGIN EXACT PINNED FILE: ${file}\n${text}-- END EXACT PINNED FILE: ${file}\n`;

  return [
    "\\set ON_ERROR_STOP on",
    "set local lock_timeout = '4s';",
    "lock table supabase_migrations.schema_migrations in share row exclusive mode;",
    "",
    "do $candidate_number_apply_guard$",
    "declare",
    "  v_collision_count integer;",
    "begin",
    "  select count(*)",
    "    into v_collision_count",
    "  from supabase_migrations.schema_migrations sm",
    `  where sm.version = ${sqlLiteral(version)} or sm.name = ${sqlLiteral(name)};`,
    "",
    "  if v_collision_count <> 0 then",
    "    raise exception using",
    "      errcode = '55000',",
    "      message = 'candidate-number migration apply refused a concurrent ledger collision';",
    "  end if;",
    "end",
    "$candidate_number_apply_guard$;",
    body,
    "insert into supabase_migrations.schema_migrations (version, name, statements)",
    `values ${ledgerValue};`,
    "",
  ].join("\n");
}

/**
 * Classify the ledger for exactly PINNED_MIGRATIONS.length targets:
 * "apply" (all absent), "verify_only" (both present with an exact
 * version+name match), or "collision"/"mixed" (anything else, including a
 * partial match or a version/name claimed by different content).
 */
/**
 * Classify the ledger per-migration, in PINNED_MIGRATIONS' own dependency
 * order (20260806230021's VALIDATE CONSTRAINT requires
 * 20260806230020's ADD CONSTRAINT to already exist — the pair is ordered,
 * not independent).
 *
 * Because each migration now commits in its OWN transaction
 * (buildApplyStepSql / the two-phase apply fix), a step-2 failure after
 * step 1 already committed — e.g. hitting the 4s lock_timeout — is an
 * EXPECTED, safe-to-resume outcome, not just a corruption signal. This
 * classifier distinguishes that specific shape — an exact-match PREFIX
 * followed by an absent SUFFIX, and nothing else — from every other
 * partial state, which remains a genuine anomaly (e.g. step 2 present
 * while step 1 is absent is structurally impossible under normal
 * operation, since step 2 cannot validate a constraint step 1 never
 * added) and still refuses outright.
 *
 * status: "apply" (all absent) | "verify_only" (all exact) |
 * "resume" (exact prefix, absent suffix — apply pendingIndexes only) |
 * "collision" | "mixed" | "invalid" (refuse; nothing is safely inferable).
 */
export function classifyTargetLedger(targets) {
  if (!Array.isArray(targets) || targets.length !== PINNED_MIGRATIONS.length) {
    return { status: "invalid", reason: "target_count" };
  }

  const perMigration = [];
  for (const expected of PINNED_MIGRATIONS) {
    const row = targets.find((candidate) => candidate?.version === expected.version);
    if (!row || !Array.isArray(row.matches)) {
      return { status: "invalid", reason: `target_missing:${expected.version}` };
    }
    if (row.matches.length === 0) {
      perMigration.push("absent");
      continue;
    }
    if (
      row.matches.length === 1 &&
      row.matches[0]?.version === expected.version &&
      row.matches[0]?.name === expected.name
    ) {
      perMigration.push("exact");
      continue;
    }
    return { status: "collision", reason: `target_collision:${expected.version}` };
  }

  if (perMigration.every((s) => s === "absent")) {
    return { status: "apply", pendingIndexes: perMigration.map((_, i) => i) };
  }
  if (perMigration.every((s) => s === "exact")) {
    return { status: "verify_only", pendingIndexes: [] };
  }

  const firstAbsent = perMigration.indexOf("absent");
  const isCleanOrderedPrefix =
    firstAbsent !== -1 &&
    perMigration.slice(0, firstAbsent).every((s) => s === "exact") &&
    perMigration.slice(firstAbsent).every((s) => s === "absent");
  if (isCleanOrderedPrefix) {
    return {
      status: "resume",
      pendingIndexes: perMigration.flatMap((s, i) => (s === "absent" ? [i] : [])),
    };
  }

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

// This script only ever targets production (enforced by the confirmation
// gate below), so the shared helper's targetEnv is always the literal
// "production" here.
const buildPsqlEnvironment = (sourceEnv, databaseUrl) =>
  buildSharedPsqlEnvironment(sourceEnv, databaseUrl, "production");

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

// --single-transaction is load-bearing, not cosmetic: buildApplySql's SET
// LOCAL and LOCK TABLE statements are only legal inside a transaction block,
// and psql's default is autocommit (each top-level statement its own
// implicit transaction) unless this flag wraps the whole file in one
// BEGIN/COMMIT. Without it psql rejects LOCK TABLE immediately ("LOCK TABLE
// can only be used in transaction blocks") before any SQL runs — fail-safe,
// but the apply would never succeed. Verified empirically against a
// throwaway Postgres: with the flag, the ledger-guard DO block, both
// migration bodies, and the final ledger insert commit atomically; a
// mid-batch failure rolls back everything already applied in that run.
function runPsqlFile({ path, childEnv, spawnImpl }) {
  let result;
  try {
    result = spawnImpl(
      "psql",
      ["-X", "-q", "-v", "ON_ERROR_STOP=1", "--single-transaction", "--file", path],
      {
        encoding: "utf8",
        env: childEnv,
      },
    );
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
  if (membershipClassification.outcome === PREFLIGHT_OUTCOME.MALFORMED_RESULT) {
    // classifyPreflightResult's blocksApply is true here too — an unknown
    // preflight state must never fall through to the ledger query and a
    // possible apply, the same fail-closed discipline the standalone
    // preflight script already applies to this exact outcome.
    logger.error("Membership preflight result failed shape validation.");
    writeReport("BLOCKED - membership preflight malformed", [
      "The preflight query returned syntactically valid but unexpectedly shaped data. No migration SQL was submitted.",
    ]);
    writeAudit("membership_preflight_failed", { ...auditBase, note: "malformed_result" });
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
    // The one safe partial state — an exact-match prefix followed by an
    // absent suffix, matching PINNED_MIGRATIONS' own dependency order — is
    // handled separately as ledger.status === "resume", below. Reaching
    // here means the partial state does NOT match that shape: e.g. step 2
    // present while step 1 is absent, which cannot happen from a normal
    // partial apply since step 2 depends on step 1. That is a genuine
    // anomaly, not an expected retry, and still refuses outright.
    logger.error(`Production ledger state is not safely actionable (${ledger.status}).`);
    writeReport("BLOCKED - migration ledger drift", [
      "The ledger state does not match either a clean unapplied state or a clean resumable partial apply (an exact-match prefix followed by an absent suffix). A version/name may be claimed by different content, or the migrations are present out of their dependency order. Nothing was written.",
    ]);
    writeAudit("ledger_drift", { ...auditBase, ledgerState: ledger.status, note: ledger.reason });
    return EXIT.LEDGER_DRIFT;
  }

  if (ledger.status === "apply" || ledger.status === "resume") {
    // Each migration is its own --single-transaction psql invocation, run
    // SEQUENTIALLY — never bundled into one call. 20260806230020's ACCESS
    // EXCLUSIVE lock (from ADD CONSTRAINT NOT VALID) must be released at
    // ITS OWN commit before 20260806230021's VALIDATE CONSTRAINT scan
    // begins; verified empirically that Postgres holds that lock for the
    // remainder of whatever transaction it started in, not just the
    // statement. A failure on step 2 after step 1 already committed is a
    // real, reportable partial-apply state, not the "nothing happened"
    // rollback a single combined transaction would have guaranteed — the
    // report below says so explicitly so an operator investigates the
    // actual ledger state rather than assuming an all-or-nothing outcome.
    //
    // Only ledger.pendingIndexes are applied — for "resume" that is the
    // absent SUFFIX after an already-committed exact-match prefix (e.g. a
    // prior run's step 2 failed on the 4s lock_timeout after step 1
    // committed fine); classifyTargetLedger already proved that prefix is
    // clean before returning "resume", so skipping it here is not a
    // collision risk.
    if (ledger.status === "resume") {
      logger.log(
        `Resuming a partial prior apply: ${PINNED_MIGRATIONS.length - ledger.pendingIndexes.length} migration(s) already committed, applying the remaining ${ledger.pendingIndexes.length}.`,
      );

      // The ledger row for the committed prefix being exact only proves a
      // row was written under the right version/name — it says nothing
      // about whether the schema object that row is supposed to describe
      // is still intact. If the guard function or constraint drifted after
      // that commit (e.g. a same-named constraint re-added as `CHECK
      // (true)` outside this tooling), submitting only the remaining
      // suffix would run a bare `VALIDATE CONSTRAINT` against whatever now
      // carries that name — trivially "validating" a no-op check and
      // recording a second exact ledger row on top of it. That produces
      // the exact dead end this preflight exists to prevent: postflight
      // then fails with both rows present, which classifyTargetLedger
      // reads as "verify_only" — a state this script cannot repair (see
      // buildSchemaRepairGuidance). So verify the prefix's schema effect
      // BEFORE submitting any SQL, not after. Do not check
      // constraint_validated here — the prefix migration only creates the
      // constraint NOT VALID; validation is exactly what the pending
      // suffix is about to do.
      const resumePrefixPreflight = runPsqlQuery({ sql: HISTORY_VERIFY_SQL, childEnv, spawnImpl });
      if (!resumePrefixPreflight.ok) {
        logger.error("Read-only resume-prefix schema preflight did not complete.");
        writeReport("BLOCKED - resume prefix schema preflight failed", [
          "No migration SQL was submitted. Inspect database connectivity.",
        ]);
        writeAudit("resume_prefix_preflight_failed", {
          ...auditBase,
          ledgerState: ledger.status,
          note: resumePrefixPreflight.kind,
        });
        return resumePrefixPreflight.kind === "not_invocable"
          ? EXIT.PSQL_NOT_INVOCABLE
          : EXIT.RESUME_PREFIX_PREFLIGHT_FAILED;
      }
      let resumePrefixHistory;
      try {
        resumePrefixHistory = classifyHistory(parseVerifyStdout(resumePrefixPreflight.stdout));
      } catch (error) {
        const reason = error instanceof Error ? error.message : "resume_prefix_parse_failed";
        logger.error(`Resume-prefix schema result could not be parsed (${reason}).`);
        writeReport("BLOCKED - resume prefix schema malformed", [
          "The prefix-schema query did not return the expected shape. No migration SQL was submitted.",
        ]);
        writeAudit("resume_prefix_preflight_failed", { ...auditBase, ledgerState: ledger.status, note: reason });
        return EXIT.RESUME_PREFIX_PREFLIGHT_FAILED;
      }
      if (!(resumePrefixHistory.guardFunctionMatches && resumePrefixHistory.constraintDefMatches)) {
        logger.error(
          "The already-committed prefix migration's schema effect no longer matches its pinned definition.",
        );
        logger.error(
          "Refusing to submit the remaining suffix: it would only VALIDATE whatever now carries that constraint's name, not repair it.",
        );
        writeReport("BLOCKED - resume prefix schema drift", [
          "| Fact | Value |",
          "| --- | --- |",
          `| Guard function matches pinned fingerprint | ${resumePrefixHistory.guardFunctionMatches} |`,
          `| Constraint definition matches pinned text | ${resumePrefixHistory.constraintDefMatches} |`,
          "",
          "The ledger row for the already-committed migration is exact, but its actual schema effect has drifted from the pinned definition — most likely a manual `ALTER`/`DROP` outside this tooling after the prior partial apply committed. No migration SQL was submitted. Resuming here would run only the remaining `VALIDATE CONSTRAINT` step, which would validate whatever object now carries that name rather than repair it. Restore the schema object by hand (re-run the first migration's body directly), or delete its stale ledger row so this script treats it as fully unapplied and re-applies both migrations from scratch, then re-dispatch.",
        ]);
        writeAudit("resume_prefix_schema_drift", {
          ...auditBase,
          ledgerState: ledger.status,
          ...resumePrefixHistory,
        });
        return EXIT.RESUME_PREFIX_SCHEMA_DRIFT;
      }
    }
    for (const stepIndex of ledger.pendingIndexes) {
      const migration = validatedMigrations[stepIndex];
      const temporaryRoot = mkdtempSync(
        join(env.RUNNER_TEMP || env.TEMP || env.TMP || tmpdir(), "verdant-candidate-number-apply-"),
      );
      const applyPath = join(temporaryRoot, `apply-${migration.version}.sql`);
      try {
        writeFileSync(applyPath, buildApplyStepSql(migration), { encoding: "utf8", mode: 0o600 });
        const applyResult = runPsqlFile({ path: applyPath, childEnv, spawnImpl });
        if (!applyResult.ok) {
          const isFirstPendingStep = stepIndex === ledger.pendingIndexes[0];
          const priorlyCommitted = PINNED_MIGRATIONS.length - ledger.pendingIndexes.length;
          logger.error(
            `Migration ${migration.version} failed and was rolled back` +
              (isFirstPendingStep && priorlyCommitted === 0
                ? "; no earlier step ran."
                : "; earlier step(s) already committed."),
          );
          writeReport(`FAIL - ${migration.version} rolled back`, [
            `psql returned a failure while applying ${migration.version} in its own transaction.`,
            isFirstPendingStep && priorlyCommitted === 0
              ? "No earlier migration in this run committed."
              : `Earlier migration(s) (from this run, an earlier run, or both) already committed and are NOT rolled back. Check the exact ledger state with scripts/verify-candidate-number-migration-history.mjs before retrying — re-dispatching will resume from the remaining suffix automatically.`,
          ]);
          writeAudit("apply_failed", {
            ...auditBase,
            ledgerState: ledger.status,
            failedVersion: migration.version,
            stepIndex,
            note: applyResult.kind,
          });
          return applyResult.kind === "not_invocable" ? EXIT.PSQL_NOT_INVOCABLE : EXIT.APPLY_FAILED;
        }
      } finally {
        rmSync(temporaryRoot, { recursive: true, force: true });
      }
    }
  }

  // Postflight reuses the standalone history verifier's own SQL and
  // classifier, so the apply script's final check and the on-demand
  // verifier can never silently drift apart.
  const postflight = runPsqlQuery({ sql: HISTORY_VERIFY_SQL, childEnv, spawnImpl });
  if (!postflight.ok) {
    logger.error("Postflight verification did not complete.");
    writeReport("FAIL - postflight unavailable", [
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
    writeReport("FAIL - postflight malformed", ["The postflight query did not return the expected shape."]);
    writeAudit("postflight_failed", { ...auditBase, ledgerState: ledger.status, note: reason });
    return EXIT.POSTFLIGHT_FAILED;
  }
  if (!history.allVersionsPresent || !history.schemaEffectLive) {
    logger.error("Postflight contract verification failed.");
    writeReport("FAIL - postflight contract mismatch", [
      `Missing exact versions: ${history.missingVersions.join(", ") || "(none)"}.`,
      `Mismatched ledger rows (right version, wrong name, or vice versa): ${history.mismatchedVersions.join(", ") || "(none)"}.`,
      `Schema effect live: ${history.schemaEffectLive}.`,
    ]);
    writeAudit("postflight_contract_failed", { ...auditBase, ledgerState: ledger.status, ...history });
    return EXIT.POSTFLIGHT_CONTRACT_FAILED;
  }

  const outcome =
    ledger.status === "verify_only"
      ? "already_applied_verified"
      : ledger.status === "resume"
        ? "resumed_verified"
        : "applied_verified";
  logger.log(
    ledger.status === "verify_only"
      ? "Candidate-number migrations were already applied and are verified."
      : ledger.status === "resume"
        ? "Resumed a partial prior apply and both migrations are now verified."
        : "Candidate-number migrations applied and verified.",
  );
  writeReport("PASS", [
    ledger.status === "verify_only"
      ? "Both exact target ledger rows already existed; no persistent write was attempted."
      : ledger.status === "resume"
        ? `${PINNED_MIGRATIONS.length - ledger.pendingIndexes.length} migration(s) were already committed from a prior run; this run applied only the remaining ${ledger.pendingIndexes.length}, each in its own separate transaction.`
        : "Each migration committed in its own separate transaction (deliberately not bundled — see buildApplyStepSql), each recording its own filename-derived ledger row.",
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
