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
import {
  REQUIRED_MONEY_MIGRATIONS,
  migrationVersion,
} from "./required-money-migrations.mjs";

const TARGET_ENV = process.env.TARGET_ENV ?? "unspecified";
const DB_URL = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? "";
const HAS_PG_ENV = Boolean(process.env.PGHOST);

if (!DB_URL && !HAS_PG_ENV) {
  console.error(
    "✗ No database connection configured.\n" +
      "  Set SUPABASE_DB_URL (or DATABASE_URL), or the PG* env vars, before running.\n" +
      "  This check must NOT be skipped silently — deploys assume it ran.",
  );
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
  process.exit(2);
}
if (result.status !== 0) {
  console.error(`✗ psql exited ${result.status} while querying migration tracker.`);
  if (result.stderr) console.error(result.stderr.trim());
  console.error("  Do NOT deploy — target migration state is unknown.");
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
  process.exit(1);
}

console.log(
  `✓ All ${expected.length} money-critical migrations applied in target env (${TARGET_ENV}).`,
);
