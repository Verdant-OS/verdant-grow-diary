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
 * Exit codes (distinct per failure mode so CI can branch on the specific
 * cause instead of parsing log text):
 *   0  = all required migrations applied in target env
 *   1  = one or more required migrations not applied (deploy would regress)
 *   2  = malformed filename in REQUIRED_MONEY_MIGRATIONS (prefix extraction
 *        failed) — a config regression in the required-migrations manifest;
 *        block the deploy and fix the manifest, do NOT touch the target DB
 *   3  = no database connection configured (SUPABASE_DB_URL / PG* env unset)
 *   4  = psql binary not invocable on the runner
 *   5  = migration-tracker query failed (psql returned non-zero) — target
 *        state is unknown; treat as blocking
 *
 * Any non-zero exit MUST be treated as "do not deploy". Codes 2-5 also mean
 * "the guard did not actually verify anything" — never interpret them as a
 * soft pass.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  REQUIRED_MONEY_MIGRATIONS,
  migrationVersion,
} from "./required-money-migrations.mjs";

const EXIT = Object.freeze({
  OK: 0,
  MISSING_MIGRATIONS: 1,
  MALFORMED_FILENAME: 2,
  NO_DB_CONNECTION: 3,
  PSQL_NOT_INVOCABLE: 4,
  TRACKER_QUERY_FAILED: 5,
});


const TARGET_ENV = process.env.TARGET_ENV ?? "unspecified";
const DB_URL = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? "";
const HAS_PG_ENV = Boolean(process.env.PGHOST);
const REPORT_PATH = process.env.REPORT_PATH ?? "";
const AUDIT_PATH = process.env.AUDIT_PATH ?? "";
const DIFF_PATH =
  process.env.DIFF_PATH ??
  (REPORT_PATH ? REPORT_PATH.replace(/\.[^./]+$/, "") + ".diff.txt" : "");

/**
 * Persist a plain-text, side-by-side "expected vs actual" prefix diff to
 * DIFF_PATH (defaults to `<REPORT_PATH>.diff.txt`) whenever the guard
 * fails. Intended for humans reading a CI artifact: no markdown, no
 * escaping, just the two sets of 14-digit prefixes and their delta so an
 * on-call can eyeball drift without opening the DB.
 *
 * Also mirrored to stderr so the failure log itself carries the diff.
 */
function writeDiff(kind, { expectedRows, appliedVersions }) {
  const expectedSet = new Set(expectedRows.map((r) => r.version).filter(Boolean));
  const appliedSet = new Set(appliedVersions);
  const missing = [...expectedSet].filter((v) => !appliedSet.has(v)).sort();
  const unexpected = [...appliedSet].filter((v) => !expectedSet.has(v)).sort();
  const common = [...expectedSet].filter((v) => appliedSet.has(v)).sort();

  const width = 16;
  const pad = (s) => String(s).padEnd(width, " ");
  const lines = [
    `Money-critical migration prefix diff — target env: ${TARGET_ENV}`,
    `Failure mode: ${kind}`,
    `Generated:    ${new Date().toISOString()}`,
    "",
    `Expected: ${expectedSet.size}    Applied (in required set): ${common.length}    Missing: ${missing.length}    Unexpected: ${unexpected.length}`,
    "",
    `${pad("EXPECTED")}  ${pad("ACTUAL")}  STATUS`,
    `${pad("-".repeat(14))}  ${pad("-".repeat(14))}  ------`,
  ];

  // Row per required file: expected prefix on the left, matching applied
  // prefix on the right (blank if not found), plus a status marker.
  for (const row of expectedRows) {
    if (!row.version) {
      lines.push(`${pad(row.file)}  ${pad("")}  MALFORMED`);
      continue;
    }
    const hit = appliedSet.has(row.version);
    lines.push(
      `${pad(row.version)}  ${pad(hit ? row.version : "")}  ${hit ? "OK" : "MISSING"}    ${row.file}`,
    );
  }

  if (unexpected.length > 0) {
    lines.push("");
    lines.push("Applied prefixes NOT in the required-migrations manifest");
    lines.push("(informational only — not a failure, but worth an eyeball):");
    for (const v of unexpected) {
      lines.push(`${pad("")}  ${pad(v)}  UNEXPECTED`);
    }
  }

  const body = lines.join("\n") + "\n";

  // Mirror to stderr so the failing log surfaces the diff even if the
  // artifact upload step is skipped or truncated.
  console.error("\n----- expected-vs-actual prefix diff -----");
  console.error(body);
  console.error("----- end diff -----\n");

  if (!DIFF_PATH) return;
  try {
    mkdirSync(dirname(DIFF_PATH), { recursive: true });
    writeFileSync(DIFF_PATH, body);
  } catch (err) {
    console.error(`(warning) failed to write diff to ${DIFF_PATH}: ${err.message}`);
  }
}


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
    outcome, // "verified" | "missing_migrations" | "malformed_filename" | "psql_not_invocable" | "tracker_query_failed" | "no_db_connection"
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

// -----------------------------------------------------------------------
// Pre-flight #1: validate every REQUIRED_MONEY_MIGRATIONS filename BEFORE
// we touch the network. A malformed prefix means the required-migrations
// manifest itself is broken — the target DB is not at fault, and querying
// it can only mask the real bug. Fail loudly with a distinct exit code so
// CI can distinguish "manifest bug" from "DB out of date".
// -----------------------------------------------------------------------
const expected = [];
const malformed = [];
for (const file of REQUIRED_MONEY_MIGRATIONS) {
  try {
    expected.push({ file, version: migrationVersion(file) });
  } catch (err) {
    malformed.push({ file, reason: err instanceof Error ? err.message : String(err) });
  }
}

if (malformed.length > 0) {
  console.error(
    `✗ REQUIRED_MONEY_MIGRATIONS contains ${malformed.length} filename(s) whose`,
  );
  console.error(
    "  14-digit migrationVersion() prefix could not be extracted:",
  );
  for (const m of malformed) {
    console.error(`    ${m.file}   (${m.reason})`);
  }
  console.error(
    "\n  Fix scripts/required-money-migrations.mjs so every entry matches\n" +
      "  /^\\d{14}_.+\\.sql$/. Do NOT deploy — the guard did not run.",
  );
  writeReport(
    `${malformed.length} required migration filename(s) have a malformed 14-digit prefix`,
    [
      "The required-migrations manifest lists filename(s) whose leading 14-digit",
      "timestamp prefix could not be extracted. The deploy guard did NOT query the",
      "target database — this is a manifest bug, not a database drift.",
      "",
      "| File | Reason |",
      "| --- | --- |",
      ...malformed.map(
        (m) => `| \`supabase/migrations/${m.file}\` | \`${m.reason}\` |`,
      ),
      "",
      "**Next step:** correct `scripts/required-money-migrations.mjs` so every",
      "entry matches `/^\\d{14}_.+\\.sql$/`, then re-run this workflow.",
    ],
  );
  writeAudit("malformed_filename", {
    note: `${malformed.length} filename(s) failed migrationVersion() extraction.`,
    expected: malformed.map((m) => ({ file: m.file, version: null, applied: false, reason: m.reason })),
  });
  writeDiff("malformed_filename", {
    expectedRows: [
      ...expected.map((e) => ({ ...e, applied: false })),
      ...malformed.map((m) => ({ file: m.file, version: null, applied: false })),
    ],
    appliedVersions: [],
  });
  process.exit(EXIT.MALFORMED_FILENAME);
}

// -----------------------------------------------------------------------
// Pre-flight #2: require a database connection. A missing connection is a
// distinct failure mode from a broken manifest and from a psql tooling
// gap — CI needs to react differently to each (fix a secret vs fix the
// runner image vs fix a source file).
// -----------------------------------------------------------------------
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
  writeDiff("no_db_connection", {
    expectedRows: expected.map((e) => ({ ...e, applied: false })),
    appliedVersions: [],
  });
  process.exit(EXIT.NO_DB_CONNECTION);
}

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
  writeAudit("psql_not_invocable", { note: "psql binary not invocable on runner." });
  process.exit(EXIT.PSQL_NOT_INVOCABLE);
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
  process.exit(EXIT.TRACKER_QUERY_FAILED);
}

const applied = new Set(
  result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean),
);

const missing = expected.filter((e) => !applied.has(e.version));

const expectedWithApplied = expected.map((e) => ({
  ...e,
  applied: applied.has(e.version),
}));

if (missing.length > 0) {
  console.error(
    `✗ Money-critical migrations NOT applied in target env (${TARGET_ENV}):`,
  );
  console.error(
    `  ${missing.length} of ${expected.length} required migration(s) missing from`,
  );
  console.error(
    "  supabase_migrations.schema_migrations. Each row: <expected version>  <file>",
  );
  for (const m of missing) {
    console.error(`    ${m.version}  supabase/migrations/${m.file}`);
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
  writeDiff("missing_migrations", {
    expectedRows: expectedWithApplied,
    appliedVersions: [...applied],
  });
  writeAudit("missing_migrations", { expected: expectedWithApplied });
  process.exit(EXIT.MISSING_MIGRATIONS);
}


console.log(
  `✓ All ${expected.length} money-critical migrations applied in target env (${TARGET_ENV}).`,
);
writeAudit("verified", { expected: expectedWithApplied });
process.exit(EXIT.OK);

