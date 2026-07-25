#!/usr/bin/env node
/**
 * Guard: refuse to deploy if the TARGET environment's database is missing any
 * column the core product loop requires.
 *
 * Sibling of scripts/assert-required-money-migrations-applied.mjs. That one
 * guards credit/referral/entitlement schema; this one guards the schema plant,
 * grow, tent, and Quick Log flows write on every request.
 *
 * Why this exists (the bug that motivated it):
 *   `plants.plant_type` was added in-repo on 2026-07-22 but never applied to
 *   prod. CreatePlantDialog sends `plant_type` in every insert payload, so
 *   every plant creation failed with PGRST204 "Could not find the
 *   'plant_type' column of 'plants' in the schema cache". The dialog returns
 *   early on error, so the visible symptom was "clicking Create plant does
 *   nothing" — a P0 that sat live for days because nothing compared the
 *   schema the app requires against the schema prod actually had.
 *
 * This asserts COLUMN EXISTENCE via information_schema, not migration
 * versions in `supabase_migrations.schema_migrations`. See the header of
 * scripts/required-core-migrations.mjs for why: duplicate migrations that
 * supply the same column, and schema created outside the Supabase CLI, both
 * make a version check fail against a perfectly correct database. Column
 * existence is also the exact condition the app fails on, so a green result
 * here means "the app will work", not "a particular file was recorded".
 *
 * Companion check: scripts/assert-required-core-migrations.mjs asserts the
 * migration files exist on disk. Those are independent failure modes —
 * a file can be present but unapplied, or applied but since deleted.
 *
 * Usage:
 *   SUPABASE_DB_URL=postgres://... node scripts/assert-required-core-migrations-applied.mjs
 *   # Or set PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGPORT and omit the URL.
 *
 *   # Explicit environment label for log clarity (no behavior change):
 *   TARGET_ENV=live node scripts/assert-required-core-migrations-applied.mjs
 *
 * Requires `psql` on PATH. CI installs it via `postgresql-client`.
 *
 * Read-only: issues a single SELECT against information_schema. No writes,
 * no schema changes.
 *
 * Exit codes (distinct per failure mode so CI can branch on the specific
 * cause instead of parsing log text):
 *   0  = every required column present in target env
 *   1  = one or more required columns missing (core flows would break)
 *   2  = malformed identifier in the manifest — a config regression; block
 *        the deploy and fix the manifest, do NOT touch the target DB
 *   3  = no database connection configured (SUPABASE_DB_URL / PG* env unset)
 *   4  = psql binary not invocable on the runner
 *   5  = schema query failed (psql returned non-zero) — target state is
 *        unknown; treat as blocking
 *
 * Any non-zero exit MUST be treated as "do not deploy". Codes 2-5 also mean
 * "the guard did not actually verify anything" — never interpret them as a
 * soft pass. In particular exit 3 is NOT "nothing to check": it means the
 * gate is unconfigured, which is exactly the state that let the original P0
 * ship.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  REQUIRED_CORE_SCHEMA,
  schemaKey,
} from "./required-core-migrations.mjs";

const EXIT = Object.freeze({
  OK: 0,
  MISSING_COLUMNS: 1,
  MALFORMED_MANIFEST: 2,
  NO_DB_CONNECTION: 3,
  PSQL_NOT_INVOCABLE: 4,
  SCHEMA_QUERY_FAILED: 5,
});

const TARGET_ENV = process.env.TARGET_ENV ?? "unspecified";
const DB_URL = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? "";
const HAS_PG_ENV = Boolean(process.env.PGHOST);
const REPORT_PATH = process.env.REPORT_PATH ?? "";
const AUDIT_PATH = process.env.AUDIT_PATH ?? "";

/**
 * Machine-readable audit trail of exactly which columns were checked against
 * which target env, and whether each was present. Uploaded as a CI artifact
 * so an auditor can later prove *what* this guard verified for a given
 * commit — not merely that it "passed".
 *
 * Safe to write on every run (success and failure). Contains no secrets:
 * only the env label, table/column names, migration filenames, booleans, and
 * outcome — all derivable from the public repo. Notably it never echoes
 * SUPABASE_DB_URL or psql stderr, both of which can carry credentials.
 *
 * `expected` is passed on EVERY path, including the ones that never reached
 * the database. On those, each entry carries `present: null` (unknown, not
 * false) so the artifact can never be misread as "the guard checked and
 * found these missing" when it in fact checked nothing.
 */
function writeAudit(outcome, { expected = [], note } = {}) {
  if (!AUDIT_PATH) return;
  const verified = expected.filter((e) => e.present !== null);
  const payload = {
    schema_version: 1,
    tool: "assert-required-core-migrations-applied",
    target_env: TARGET_ENV,
    checked_at: new Date().toISOString(),
    outcome,
    // True only when the DB was actually queried and a verdict reached.
    // Consumers should treat `false` as "no information about the schema".
    schema_verified: outcome === "verified" || outcome === "missing_columns",
    expected_count: expected.length,
    present_count: verified.filter((e) => e.present === true).length,
    missing_count: verified.filter((e) => e.present === false).length,
    expected,
    ...(note ? { note } : {}),
  };
  try {
    mkdirSync(dirname(AUDIT_PATH), { recursive: true });
    writeFileSync(AUDIT_PATH, JSON.stringify(payload, null, 2) + "\n");
  } catch (err) {
    console.error(`(warning) failed to write audit to ${AUDIT_PATH}: ${err.message}`);
  }
}

/**
 * Human-readable failure report for downstream consumers (CI PR comment,
 * workflow summary, local review). Never contains secrets — only the env
 * label, identifiers, and filenames already public in the repo.
 */
function writeReport(kind, bodyLines) {
  if (!REPORT_PATH) return;
  const md = [
    `### Core-schema deploy guard — ${TARGET_ENV.toUpperCase()}`,
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

// -----------------------------------------------------------------------
// Pre-flight #1: validate every manifest identifier BEFORE touching the
// network. A malformed identifier means the manifest itself is broken — the
// target DB is not at fault, and querying it can only mask the real bug.
// This also guarantees nothing unvalidated is ever interpolated into SQL.
// -----------------------------------------------------------------------
// `expected` mirrors the manifest one-for-one — malformed entries included,
// flagged rather than dropped. An audit artifact that silently omits the
// broken entry would report a 4-requirement manifest when 5 were declared,
// hiding the very entry that blocked the deploy from machine consumers.
const expected = [];
const malformed = [];
for (const entry of REQUIRED_CORE_SCHEMA) {
  try {
    expected.push({
      key: schemaKey(entry),
      table: entry.table,
      column: entry.column,
      migration: entry.migration,
      present: null,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const label = `${entry?.table}.${entry?.column}`;
    malformed.push({ entry: label, reason });
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

if (malformed.length > 0) {
  console.error(
    `✗ The core-schema manifest contains ${malformed.length} malformed identifier(s):`,
  );
  for (const m of malformed) console.error(`    ${m.entry}   (${m.reason})`);
  console.error(
    "\n  Fix scripts/required-core-migrations.mjs so every table/column matches\n" +
      "  /^[a-z_][a-z0-9_]*$/. Do NOT deploy — the guard did not run.",
  );
  writeReport(`${malformed.length} malformed identifier(s) in the core-schema manifest`, [
    "The manifest lists table/column identifiers that are not valid Postgres names.",
    "The guard did NOT query the target database — this is a manifest bug, not drift.",
    "",
    "| Entry | Reason |",
    "| --- | --- |",
    ...malformed.map((m) => `| \`${m.entry}\` | \`${m.reason}\` |`),
    "",
    "**Next step:** correct `scripts/required-core-migrations.mjs`, then re-run.",
  ]);
  writeAudit("malformed_manifest", {
    expected,
    note: `${malformed.length} manifest entr(ies) failed identifier validation: ${malformed
      .map((m) => m.entry)
      .join(", ")}`,
  });
  process.exit(EXIT.MALFORMED_MANIFEST);
}

// -----------------------------------------------------------------------
// Pre-flight #2: require a database connection. Distinct from a broken
// manifest and from a psql tooling gap — CI reacts differently to each
// (fix a secret vs fix the runner image vs fix a source file).
//
// This must NEVER soft-pass. "We couldn't check" and "we checked and it's
// fine" are opposite states, and conflating them is precisely how the
// motivating P0 reached production.
// -----------------------------------------------------------------------
if (!DB_URL && !HAS_PG_ENV) {
  console.error(
    "✗ No database connection configured.\n" +
      "  Set SUPABASE_DB_URL (or DATABASE_URL), or the PG* env vars, before running.\n" +
      "  This check must NOT be skipped silently — deploys assume it ran.",
  );
  writeReport("No database connection configured", [
    "The deploy guard could not run because no database connection was configured.",
    "Configure the appropriate `SUPABASE_DB_URL_*` secret and re-run the workflow.",
    "",
    "This is a hard failure by design: an unverified core schema is the exact",
    "condition that allowed `plants.plant_type` to be missing in production while",
    "every plant-creation attempt failed with PGRST204.",
  ]);
  writeAudit("no_db_connection", {
    expected,
    note: "No SUPABASE_DB_URL / PGHOST env — schema state was never observed.",
  });
  process.exit(EXIT.NO_DB_CONNECTION);
}

// Every key is validated against /^[a-z_][a-z0-9_]*$/ above, so this
// interpolation cannot carry a quote or comment sequence.
const keyList = expected.map((e) => `'${e.key}'`).join(",");
const sql =
  "SELECT table_name || '.' || column_name FROM information_schema.columns " +
  `WHERE table_schema = 'public' AND table_name || '.' || column_name IN (${keyList});`;

const args = ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql];
if (DB_URL) args.unshift(DB_URL);

const result = spawnSync("psql", args, { encoding: "utf8", env: process.env });

if (result.error) {
  console.error(`✗ Failed to invoke psql: ${result.error.message}`);
  console.error("  Install postgresql-client and retry. Do NOT deploy.");
  writeReport("psql not available on runner", [
    "The deploy guard could not query the schema: `psql` was not invocable.",
    "Install `postgresql-client` on the runner and re-run the workflow.",
  ]);
  writeAudit("psql_not_invocable", {
    expected,
    note: "psql binary not invocable on runner — schema state was never observed.",
  });
  process.exit(EXIT.PSQL_NOT_INVOCABLE);
}

if (result.status !== 0) {
  console.error(`✗ psql exited ${result.status} while querying information_schema.`);
  // stderr can embed the connection string on some failure modes; keep it out
  // of the PR-visible report and let the access-controlled workflow log carry it.
  if (result.stderr) console.error(result.stderr.trim());
  console.error("  Do NOT deploy — target schema state is unknown.");
  writeReport("Schema query failed", [
    "`psql` returned a non-zero exit code while reading `information_schema.columns`.",
    "The target database's schema state is unknown; treat as blocking.",
    "",
    "See the workflow log for the full `psql` error output (stderr is not mirrored here",
    "to avoid leaking connection details).",
  ]);
  writeAudit("schema_query_failed", {
    expected,
    note: `psql exited ${result.status} querying information_schema — schema state was never observed.`,
  });
  process.exit(EXIT.SCHEMA_QUERY_FAILED);
}

const present = new Set(
  result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean),
);

for (const e of expected) e.present = present.has(e.key);
const missing = expected.filter((e) => !e.present);

if (missing.length > 0) {
  console.error(`✗ Core schema INCOMPLETE in target env (${TARGET_ENV}):`);
  console.error(
    `  ${missing.length} of ${expected.length} required column(s) missing from the database.`,
  );
  console.error("  Each row: <table.column>  <migration that supplies it>");
  for (const m of missing) {
    console.error(`    ${m.key}  supabase/migrations/${m.migration}`);
  }
  console.error(
    "\nDo NOT deploy. Core product flows will fail at runtime with PGRST204 /\n" +
      "42703 against this database. Apply the migration(s) above via the Supabase\n" +
      "CLI against this environment, re-run this check, then continue.",
  );
  writeReport(`${missing.length} of ${expected.length} required core column(s) missing`, [
    `The following columns are required by core product flows but are absent from the \`${TARGET_ENV}\` database:`,
    "",
    "| Column | Supplied by | What breaks |",
    "| --- | --- | --- |",
    ...missing.map(
      (m) =>
        `| \`${m.key}\` | \`supabase/migrations/${m.migration}\` | ${
          REQUIRED_CORE_SCHEMA.find((e) => e.table === m.table && e.column === m.column)
            ?.reason ?? ""
        } |`,
    ),
    "",
    "While any one is missing, the corresponding flow fails at runtime with",
    "`PGRST204` / `42703` — typically presenting to the grower as a button that",
    "silently does nothing.",
    "",
    "**Next step:** apply the listed migration(s) via the Supabase CLI against this",
    "environment, then re-run this workflow. Do not deploy until the guard is green.",
  ]);
  writeAudit("missing_columns", { expected });
  process.exit(EXIT.MISSING_COLUMNS);
}

console.log(
  `✓ All ${expected.length} required core columns present in target env (${TARGET_ENV}).`,
);
writeAudit("verified", { expected });
process.exit(EXIT.OK);
