#!/usr/bin/env node
/**
 * Read-only deploy gate for Verdant's required core schema.
 *
 * Security properties:
 * - the selected environment is mapped to a pinned Supabase project ref;
 * - the URL identity is proven before psql is invoked;
 * - ambient PG* and DATABASE_URL fallbacks are ignored;
 * - the connection URL is provided to libpq through child-process
 *   PGDATABASE, never through argv;
 * - raw psql stderr and connection strings are never printed or persisted;
 * - only ordinary and partitioned public relations satisfy a requirement.
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
import { manifestForScope, schemaKey } from "./required-core-migrations.mjs";

export const EXIT = Object.freeze({
  OK: 0,
  MISSING_COLUMNS: 1,
  MALFORMED_MANIFEST: 2,
  NO_DB_CONNECTION: 3,
  PSQL_NOT_INVOCABLE: 4,
  SCHEMA_QUERY_FAILED: 5,
  TARGET_IDENTITY_INVALID: 6,
});

function writeTextFile(path, contents, logger) {
  if (!path) return;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  } catch {
    logger.error("Warning: could not write a core-schema gate artifact.");
  }
}

function buildExpected(manifest) {
  const expected = [];
  const malformed = [];
  for (const entry of manifest) {
    try {
      expected.push({
        key: schemaKey(entry),
        table: entry.table,
        column: entry.column,
        migration: entry.migration,
        present: null,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Malformed manifest entry.";
      malformed.push({
        entry: `${entry?.table ?? "(missing)"}.${entry?.column ?? "(missing)"}`,
        reason,
      });
      expected.push({
        key: null,
        table: entry?.table ?? null,
        column: entry?.column ?? null,
        migration: entry?.migration ?? null,
        present: null,
        malformed: true,
        reason,
      });
    }
  }
  return { expected, malformed };
}

export function buildPsqlEnvironment(sourceEnv, databaseUrl, targetEnv) {
  // psql needs process-location/locale basics, not the runner's full secret
  // environment. An allowlist also keeps unrelated protected-environment
  // secrets out of the child.
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
    if (typeof sourceEnv[key] === "string") {
      childEnv[key] = sourceEnv[key];
    }
  }
  const connection = sanitizeSupabaseDatabaseUrlForPsql(databaseUrl, targetEnv);
  childEnv.PGDATABASE = connection.databaseUrl;
  // Never trust ambient PGSSLMODE. Query-free Dashboard URLs default to
  // require, while an explicit verify-ca/verify-full request is preserved.
  childEnv.PGSSLMODE = connection.sslMode;
  return childEnv;
}

function createArtifactWriters({ targetEnv, reportPath, auditPath, expected, logger, now }) {
  const writeAudit = (outcome, note = "") => {
    if (!auditPath) return;
    const observed = expected.filter((entry) => entry.present !== null);
    const payload = {
      schema_version: 1,
      tool: "assert-required-core-migrations-applied",
      target_env: targetEnv,
      checked_at: now().toISOString(),
      outcome,
      schema_verified: outcome === "verified" || outcome === "missing_columns",
      expected_count: expected.length,
      present_count: observed.filter((entry) => entry.present === true).length,
      missing_count: observed.filter((entry) => entry.present === false).length,
      expected,
      ...(note ? { note } : {}),
    };
    writeTextFile(auditPath, `${JSON.stringify(payload, null, 2)}\n`, logger);
  };

  const writeReport = (status, lines) => {
    if (!reportPath) return;
    const safeTarget = targetEnv === "sandbox" ? "SANDBOX" : "PRODUCTION";
    writeTextFile(
      reportPath,
      [
        `### Core-schema deploy guard - ${safeTarget}`,
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

export function runRequiredCoreMigrationsApplied({
  env = process.env,
  spawnImpl = spawnSync,
  logger = console,
  now = () => new Date(),
} = {}) {
  const targetEnv = env.TARGET_ENV ?? "";
  const databaseUrl = env.SUPABASE_DB_URL ?? "";
  const reportPath = env.REPORT_PATH ?? "";
  const auditPath = env.AUDIT_PATH ?? "";

  let manifest;
  try {
    manifest = manifestForScope(env.MANIFEST_SCOPE);
  } catch {
    logger.error("Core-schema manifest scope is invalid.");
    return EXIT.MALFORMED_MANIFEST;
  }

  const { expected, malformed } = buildExpected(manifest);
  const { writeAudit, writeReport } = createArtifactWriters({
    targetEnv,
    reportPath,
    auditPath,
    expected,
    logger,
    now,
  });

  if (malformed.length > 0) {
    logger.error(`Core-schema manifest contains ${malformed.length} malformed identifier(s).`);
    for (const item of malformed) {
      logger.error(`  ${item.entry}: ${item.reason}`);
    }
    writeReport("FAILED - malformed manifest", [
      "The manifest contains invalid Postgres identifiers. No database query ran.",
    ]);
    writeAudit("malformed_manifest", "Manifest validation failed before psql.");
    return EXIT.MALFORMED_MANIFEST;
  }

  try {
    databaseTargetForEnvironment(targetEnv);
  } catch {
    logger.error("TARGET_ENV must be exactly sandbox or production.");
    writeAudit("target_identity_invalid", "Unknown or missing target environment.");
    return EXIT.TARGET_IDENTITY_INVALID;
  }

  if (!databaseUrl) {
    logger.error("SUPABASE_DB_URL is required; ambient DATABASE_URL and PG* are ignored.");
    writeReport("FAILED - database connection missing", [
      "The protected environment did not provide `SUPABASE_DB_URL`.",
      "No database query ran.",
    ]);
    writeAudit("no_db_connection", "SUPABASE_DB_URL was not configured.");
    return EXIT.NO_DB_CONNECTION;
  }

  let identity;
  try {
    identity = assertSupabaseDatabaseTargetIdentity({
      targetEnv,
      databaseUrl,
    });
  } catch (error) {
    const code =
      error instanceof SupabaseDatabaseTargetIdentityError
        ? error.code
        : "identity_validation_failed";
    logger.error(`Database target identity rejected (${code}).`);
    writeReport("FAILED - database identity rejected", [
      "The configured URL does not prove that it targets the pinned Verdant project.",
      "No database query ran. Correct the protected environment secret; do not apply migrations.",
    ]);
    writeAudit("target_identity_invalid", `Identity validation failed: ${code}.`);
    return EXIT.TARGET_IDENTITY_INVALID;
  }

  logger.log(`Database identity verified for ${targetEnv} (${identity.connectionMode}).`);

  const keyList = expected.map((entry) => `'${entry.key}'`).join(",");
  const tableList = [...new Set(expected.map((entry) => entry.table))]
    .map((table) => `'${table}'`)
    .join(",");

  // Only real and partitioned tables qualify. Views, materialized views,
  // foreign tables, indexes, and sequences must never satisfy a core contract.
  const relationKinds = "'r','p'";
  const sql =
    "SELECT c.relname || '.' || a.attname " +
    "FROM pg_catalog.pg_attribute a " +
    "JOIN pg_catalog.pg_class c ON c.oid = a.attrelid " +
    "JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace " +
    `WHERE n.nspname = 'public' AND c.relkind IN (${relationKinds}) ` +
    "AND a.attnum > 0 AND NOT a.attisdropped " +
    `AND c.relname || '.' || a.attname IN (${keyList});`;
  const diagnosticSql =
    "SELECT c.relname FROM pg_catalog.pg_class c " +
    "JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace " +
    `WHERE n.nspname = 'public' AND c.relkind IN (${relationKinds}) ` +
    `AND c.relname IN (${tableList});`;

  const psqlArgs = ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql];
  const childEnv = buildPsqlEnvironment(env, databaseUrl, targetEnv);

  let result;
  try {
    result = spawnImpl("psql", psqlArgs, {
      encoding: "utf8",
      env: childEnv,
    });
  } catch {
    result = { error: new Error("psql invocation failed") };
  }

  if (result.error) {
    logger.error("psql is not invocable on this runner. No schema verdict was reached.");
    writeReport("FAILED - psql unavailable", ["Install `postgresql-client` and re-run the gate."]);
    writeAudit("psql_not_invocable", "psql could not be invoked.");
    return EXIT.PSQL_NOT_INVOCABLE;
  }
  if (result.status !== 0) {
    // Never print result.stderr: libpq errors and hostile test shims can echo
    // the full connection URI, including its password.
    logger.error(
      `psql exited ${String(result.status)} while reading pg_catalog; stderr was suppressed.`,
    );
    // The exit STATUS is a small integer with no credential content, so it is
    // safe to publish while stderr stays suppressed. Without it this failure
    // is undiagnosable: psql also exits non-zero when it cannot connect at
    // all, which is indistinguishable from a rejected query in the report.
    // libpq/psql convention: 1 = psql's own fatal error, 2 = connection could
    // not be established or the session was lost, 3 = script error under
    // ON_ERROR_STOP.
    const psqlStatus = String(result.status);
    const statusHint =
      result.status === 2
        ? "psql status 2 means the CONNECTION failed — the query never ran. Check the target's host/port reachability from the runner (GitHub-hosted runners are IPv4-only; a direct db.<ref>.supabase.co host may require the pooler host instead) before suspecting schema drift."
        : result.status === 3
          ? "psql status 3 means the SQL was rejected under ON_ERROR_STOP — the connection itself succeeded."
          : "psql reported its own fatal error before a verdict was reached.";
    writeReport("FAILED - schema query failed", [
      "The target schema remains unknown. Raw psql stderr was suppressed to protect credentials.",
      `psql exit status: ${psqlStatus}.`,
      statusHint,
    ]);
    writeAudit(
      "schema_query_failed",
      `psql returned a non-zero status (${psqlStatus}).`,
    );
    return EXIT.SCHEMA_QUERY_FAILED;
  }

  const present = new Set(
    String(result.stdout ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );
  for (const entry of expected) entry.present = present.has(entry.key);
  const missing = expected.filter((entry) => entry.present === false);

  if (missing.length > 0) {
    let tablesPresent = null;
    try {
      const diagnostic = spawnImpl(
        "psql",
        ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", diagnosticSql],
        { encoding: "utf8", env: childEnv },
      );
      if (!diagnostic.error && diagnostic.status === 0) {
        tablesPresent = String(diagnostic.stdout ?? "")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
      }
    } catch {
      tablesPresent = null;
    }

    const requiredTables = [...new Set(expected.map((entry) => entry.table))];
    const tablesAbsent =
      tablesPresent === null
        ? null
        : requiredTables.filter((table) => !tablesPresent.includes(table));

    logger.error(
      `${missing.length} of ${expected.length} required ${env.MANIFEST_SCOPE === "advisory" ? "advisory" : "core"} column(s) are missing.`,
    );
    for (const entry of missing) {
      logger.error(`  ${entry.key} <- supabase/migrations/${entry.migration}`);
    }

    writeReport(`FAILED - ${missing.length} required column(s) missing`, [
      "| Column | Supplied by |",
      "| --- | --- |",
      ...missing.map(
        (entry) => `| \`${entry.key}\` | \`supabase/migrations/${entry.migration}\` |`,
      ),
      "",
      tablesAbsent === null
        ? "The table-presence diagnostic did not complete."
        : `Required tables absent: ${tablesAbsent.join(", ") || "(none)"}.`,
    ]);
    writeAudit(
      "missing_columns",
      tablesAbsent === null
        ? "Table-presence diagnostic unavailable."
        : `Required tables absent: ${tablesAbsent.join(", ") || "(none)"}.`,
    );
    return EXIT.MISSING_COLUMNS;
  }

  logger.log(
    `All ${expected.length} required ${env.MANIFEST_SCOPE === "advisory" ? "advisory" : "core"} columns are present in ${targetEnv}.`,
  );
  writeReport("PASSED", [
    `All ${expected.length} required columns are present.`,
    `Connection mode: \`${identity.connectionMode}\`.`,
  ]);
  writeAudit("verified");
  return EXIT.OK;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = runRequiredCoreMigrationsApplied();
}
