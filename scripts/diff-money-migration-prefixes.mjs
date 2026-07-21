#!/usr/bin/env node
/**
 * One-shot CLI: dump the extractor's expected 14-digit prefixes (from
 * REQUIRED_MONEY_MIGRATIONS) and compare them against
 * `supabase_migrations.schema_migrations` in the target database.
 *
 * This is the interactive companion to
 * `assert-required-money-migrations-applied.mjs`. That script exits
 * non-zero and writes a CI report; this one prints a compact, human-
 * readable diff to stdout so a maintainer can eyeball drift locally
 * without running the full CI workflow.
 *
 * Usage:
 *   SUPABASE_DB_URL=postgres://... node scripts/diff-money-migration-prefixes.mjs
 *   TARGET_ENV=sandbox node scripts/diff-money-migration-prefixes.mjs
 *   node scripts/diff-money-migration-prefixes.mjs --json      # machine-readable
 *   node scripts/diff-money-migration-prefixes.mjs --expected  # print required list only, skip DB
 *
 * Read-only: one SELECT, no writes. Requires `psql` on PATH unless
 * `--expected` is passed.
 *
 * Exit codes:
 *   0 = no drift (every required prefix is applied)
 *   1 = drift detected (missing prefixes in target env)
 *   2 = tooling / connection failure (state unknown — do not deploy)
 */
import { spawnSync } from "node:child_process";
import {
  REQUIRED_MONEY_MIGRATIONS,
  migrationVersion,
} from "./required-money-migrations.mjs";

const args = new Set(process.argv.slice(2));
const asJson = args.has("--json");
const expectedOnly = args.has("--expected");
const TARGET_ENV = process.env.TARGET_ENV ?? "unspecified";
const DB_URL = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? "";
const HAS_PG_ENV = Boolean(process.env.PGHOST);

const expected = [];
const malformed = [];
for (const file of REQUIRED_MONEY_MIGRATIONS) {
  try {
    expected.push({ file, version: migrationVersion(file) });
  } catch (err) {
    malformed.push({ file, reason: err instanceof Error ? err.message : String(err) });
  }
}

if (expectedOnly) {
  if (asJson) {
    process.stdout.write(JSON.stringify({ target_env: TARGET_ENV, expected, malformed }, null, 2) + "\n");
  } else {
    console.log(`Expected required-money-migration prefixes (${expected.length}):`);
    for (const e of expected) console.log(`  ${e.version}  ${e.file}`);
    if (malformed.length) {
      console.log(`\nMalformed filenames (${malformed.length}):`);
      for (const m of malformed) console.log(`  ${m.file}  (${m.reason})`);
    }
  }
  process.exit(malformed.length > 0 ? 1 : 0);
}

if (malformed.length > 0) {
  console.error(`✗ Manifest bug: ${malformed.length} filename(s) have no 14-digit prefix:`);
  for (const m of malformed) console.error(`    ${m.file}  (${m.reason})`);
  console.error("Fix scripts/required-money-migrations.mjs before comparing against a DB.");
  process.exit(2);
}

if (!DB_URL && !HAS_PG_ENV) {
  console.error(
    "✗ No database connection configured. Set SUPABASE_DB_URL, DATABASE_URL,\n" +
      "  or the PG* env vars, or re-run with --expected to skip the DB check.",
  );
  process.exit(2);
}

const versionList = expected.map((e) => `'${e.version}'`).join(",");
const sql =
  `SELECT version FROM supabase_migrations.schema_migrations ` +
  `WHERE version IN (${versionList}) ORDER BY version;`;
const psqlArgs = ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql];
if (DB_URL) psqlArgs.unshift(DB_URL);

const result = spawnSync("psql", psqlArgs, { encoding: "utf8", env: process.env });
if (result.error) {
  console.error(`✗ psql not invocable: ${result.error.message}`);
  process.exit(2);
}
if (result.status !== 0) {
  console.error(`✗ psql exited ${result.status} querying supabase_migrations.schema_migrations`);
  if (result.stderr) console.error(result.stderr.trim());
  process.exit(2);
}

const applied = new Set(
  result.stdout.split("\n").map((l) => l.trim()).filter(Boolean),
);
const rows = expected.map((e) => ({ ...e, applied: applied.has(e.version) }));
const missing = rows.filter((r) => !r.applied);

if (asJson) {
  process.stdout.write(
    JSON.stringify(
      {
        target_env: TARGET_ENV,
        expected_count: expected.length,
        applied_count: rows.length - missing.length,
        missing_count: missing.length,
        rows,
        missing: missing.map((r) => ({ file: r.file, version: r.version })),
      },
      null,
      2,
    ) + "\n",
  );
} else {
  const pad = (s) => String(s).padEnd(16, " ");
  console.log(`Prefix diff — target env: ${TARGET_ENV}`);
  console.log(
    `Expected: ${expected.length}   Applied: ${rows.length - missing.length}   Missing: ${missing.length}`,
  );
  console.log("");
  console.log(`${pad("EXPECTED")}  ${pad("ACTUAL")}  STATUS   FILE`);
  console.log(`${pad("-".repeat(14))}  ${pad("-".repeat(14))}  -------  ----`);
  for (const r of rows) {
    console.log(
      `${pad(r.version)}  ${pad(r.applied ? r.version : "")}  ${r.applied ? "OK     " : "MISSING"}  ${r.file}`,
    );
  }
  if (missing.length > 0) {
    console.log(
      `\n✗ ${missing.length} required migration(s) not applied in ${TARGET_ENV}. Do NOT deploy.`,
    );
  } else {
    console.log(`\n✓ All ${expected.length} required migrations applied in ${TARGET_ENV}.`);
  }
}

process.exit(missing.length > 0 ? 1 : 0);
