#!/usr/bin/env node
/**
 * Guard: refuse to deploy if any money-critical migration is missing from
 * the TARGET environment's Postgres migration tracker.
 *
 * Companion to scripts/assert-required-money-migrations.mjs (file presence).
 * That script proves the migration exists on disk. This script proves it
 * has actually been applied to the target database — the two failure modes
 * are independent:
 *
 *   - File present, not applied  → deploy will regress live behavior.
 *   - File missing, applied      → history was rewritten; audit before deploy.
 *
 * Supabase CLI records applied migrations in
 * `supabase_migrations.schema_migrations`, keyed by the leading 14-digit
 * timestamp prefix of the filename. We compare the expected version list
 * (derived from REQUIRED_MONEY_MIGRATIONS) against what the DB reports.
 *
 * Usage:
 *   SUPABASE_DB_URL=postgres://... node scripts/assert-required-money-migrations-applied.mjs
 *   # Or set PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGPORT and omit the URL.
 *
 *   # Explicit environment label for log clarity (no behavior change):
 *   TARGET_ENV=live node scripts/assert-required-money-migrations-applied.mjs
 *
 * Requires `psql` on PATH. CI installs it via `postgresql-client`.
 *
 * Read-only: issues a single SELECT. No writes, no schema changes.
 *
 * Exit codes: 0 = all applied, 1 = one or more missing, 2 = connection /
 * tooling failure (treat as blocking — do NOT deploy on unknown state).
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  REQUIRED_MONEY_MIGRATIONS,
  migrationVersion,
} from "./required-money-migrations.mjs";

const TARGET_ENV = process.env.TARGET_ENV ?? "unspecified";
const DB_URL = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? "";
const HAS_PG_ENV = Boolean(process.env.PGHOST);
const REPORT_PATH = process.env.REPORT_PATH ?? "";
const AUDIT_PATH = process.env.AUDIT_PATH ?? "";

/**
 * Persist a machine-readable audit trail of exactly which required money
 * migrations were checked against which target env, and their applied
 * state. Uploaded as a CI artifact so an auditor can later prove *what*
 * this guard actually verified for a given commit — not just that it
 * "passed".
 *
 * Safe to write on every run (success and failure). Contains no secrets:
 * only the target env label, filenames, version prefixes, applied booleans,
 * and outcome — all derivable from the public repo.
 */
function writeAudit(outcome, extra = {}) {
  if (!AUDIT_PATH) return;
  const payload = {
    schema_version: 1,
    tool: "assert-required-money-migrations-applied",
    target_env: TARGET_ENV,
    checked_at: new Date().toISOString(),
    outcome, // "verified" | "missing_migrations" | "connection_error" | "tracker_query_failed" | "no_db_connection"
    expected_count: extra.expected?.length ?? 0,
    applied_count: extra.expected?.filter((e) => e.applied).length ?? 0,
    missing_count: extra.expected?.filter((e) => !e.applied).length ?? 0,
    expected: extra.expected ?? [],
    ...(extra.note ? { note: extra.note } : {}),
  };
  try {
    mkdirSync(dirname(AUDIT_PATH), { recursive: true });
    writeFileSync(AUDIT_PATH, JSON.stringify(payload, null, 2) + "\n");
  } catch (err) {
    console.error(`(warning) failed to write audit to ${AUDIT_PATH}: ${err.message}`);
  }
}

/**
 * Persist a human-readable failure report for downstream consumers (CI PR
 * comment, workflow summary, local review). Never contains secrets — only
 * the target env label, filenames, and version prefixes already public in
 * the repo.
 */
function writeReport(kind, bodyLines) {
  if (!REPORT_PATH) return;
  const md = [
    `### Money-critical migration deploy guard — ${TARGET_ENV.toUpperCase()}`,
    "",
    `**Status:** ❌ ${kind}`,
    "",
    ...bodyLines,
    "",
    "_Do NOT deploy until this check passes._",
    "",
  ].join("\n");
  try {
    mkdirSync(dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, md);
  } catch (err) {
    console.error(`(warning) failed to write report to ${REPORT_PATH}: ${err.message}`);
  }
}

if (!DB_URL && !HAS_PG_ENV) {
  const msg =
    "No database connection configured.\n" +
    "Set SUPABASE_DB_URL (or DATABASE_URL), or the PG* env vars, before running.\n" +
    "This check must NOT be skipped silently — deploys assume it ran.";
  console.error(`✗ ${msg}`);
  writeReport("No database connection configured", [
    "The deploy guard could not run because no database connection was configured.",
    "Configure the appropriate `SUPABASE_DB_URL_*` secret and re-run the workflow.",
  ]);
  writeAudit("no_db_connection", { note: "No SUPABASE_DB_URL / PGHOST env." });
  process.exit(2);
}

const expected = REQUIRED_MONEY_MIGRATIONS.map((f) => ({
  file: f,
  version: migrationVersion(f),
}));
const versionList = expected.map((e) => `'${e.version}'`).join(",");

const sql = `SELECT version FROM supabase_migrations.schema_migrations WHERE version IN (${versionList});`;

const args = ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql];
if (DB_URL) args.unshift(DB_URL);

const result = spawnSync("psql", args, {
  encoding: "utf8",
  env: process.env,
});

if (result.error) {
  console.error(`✗ Failed to invoke psql: ${result.error.message}`);
  console.error("  Install postgresql-client and retry. Do NOT deploy.");
  writeReport("psql not available on runner", [
    "The deploy guard could not query the migration tracker: `psql` was not invocable.",
    "Install `postgresql-client` on the runner and re-run the workflow.",
  ]);
  writeAudit("connection_error", { note: "psql binary not invocable on runner." });
  process.exit(2);
}
if (result.status !== 0) {
  console.error(`✗ psql exited ${result.status} while querying migration tracker.`);
  if (result.stderr) console.error(result.stderr.trim());
  console.error("  Do NOT deploy — target migration state is unknown.");
  writeReport("Migration tracker query failed", [
    "`psql` returned a non-zero exit code while reading `supabase_migrations.schema_migrations`.",
    "The target database's migration state is unknown; treat as blocking.",
    "",
    "See the workflow log for the full `psql` error output (stderr is not mirrored here to avoid",
    "leaking connection details).",
  ]);
  writeAudit("tracker_query_failed", {
    note: `psql exited ${result.status} querying supabase_migrations.schema_migrations.`,
  });
  process.exit(2);
}

const applied = new Set(
  result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean),
);

const missing = expected.filter((e) => !applied.has(e.version));

if (missing.length > 0) {
  console.error(
    `✗ Money-critical migrations NOT applied in target env (${TARGET_ENV}):`,
  );
  for (const m of missing) {
    console.error(`    ${m.version}  ${m.file}`);
  }
  console.error(
    "\nDo NOT deploy. Apply the missing migration(s) via the Supabase CLI\n" +
      "against this environment, re-run this check, and only then continue.",
  );
  writeReport(
    `${missing.length} of ${expected.length} required migration(s) not applied`,
    [
      `The following money-critical migrations are present on \`main\` but have NOT been applied to the \`${TARGET_ENV}\` database:`,
      "",
      "| Version | File |",
      "| --- | --- |",
      ...missing.map((m) => `| \`${m.version}\` | \`supabase/migrations/${m.file}\` |`),
      "",
      "**Next step:** apply the missing migration(s) via the Supabase CLI against this",
      "environment, then re-run this workflow. Do not deploy until the guard turns green.",
    ],
  );
  process.exit(1);
}

console.log(
  `✓ All ${expected.length} money-critical migrations applied in target env (${TARGET_ENV}).`,
);
