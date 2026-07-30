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
 *   # Local-only compatibility: set TARGET_ENV=unspecified and use PG* vars
 *   # instead of a URL. Protected sandbox/live checks require a URL.
 *
 *   # Protected labels pin and sanitize the database target before psql:
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
 *   6  = protected database target identity rejected before psql was invoked
 *   7  = a protected GitHub-hosted runner requires a Shared Supavisor URL
 *
 * Any non-zero exit MUST be treated as "do not deploy". Codes 2-7 also mean
 * "the guard did not actually verify anything" — never interpret them as a
 * soft pass.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  coreTargetEnvironmentForMoney,
  sanitizeMoneyDatabaseUrlForPsql,
} from "./lib/moneyDatabaseTargetIdentity.mjs";
import { isSharedSupavisorConnectionMode } from "./lib/supabaseDatabaseTargetIdentity.mjs";
import { REQUIRED_MONEY_MIGRATIONS, migrationVersion } from "./required-money-migrations.mjs";

const EXIT = Object.freeze({
  OK: 0,
  MISSING_MIGRATIONS: 1,
  MALFORMED_FILENAME: 2,
  NO_DB_CONNECTION: 3,
  PSQL_NOT_INVOCABLE: 4,
  TRACKER_QUERY_FAILED: 5,
  TARGET_IDENTITY_REJECTED: 6,
  SHARED_SUPAVISOR_REQUIRED: 7,
});

const TARGET_ENV = process.env.TARGET_ENV ?? "unspecified";
const DB_URL = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? "";
const HAS_PG_ENV = Boolean(process.env.PGHOST);
const REPORT_PATH = process.env.REPORT_PATH ?? "";
const AUDIT_PATH = process.env.AUDIT_PATH ?? "";
const DIFF_PATH =
  process.env.DIFF_PATH ?? (REPORT_PATH ? REPORT_PATH.replace(/\.[^./]+$/, "") + ".diff.txt" : "");

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

  // For failure modes where the DB was never successfully queried, the
  // "actual" column is not truly empty — it is UNKNOWN. Say so explicitly
  // so the artifact isn't misread as "DB confirmed empty".
  const actualUnknown =
    kind === "no_db_connection" ||
    kind === "psql_not_invocable" ||
    kind === "tracker_query_failed" ||
    kind === "target_identity_rejected" ||
    kind === "shared_supavisor_required" ||
    kind === "malformed_filename";
  const unknownMarker = "?? UNKNOWN ??";

  const width = 16;
  const pad = (s) => String(s).padEnd(width, " ");
  const lines = [
    `Money-critical migration prefix diff — target env: ${TARGET_ENV}`,
    `Failure mode: ${kind}`,
    `Generated:    ${new Date().toISOString()}`,
    "",
    actualUnknown
      ? `Expected: ${expectedSet.size}    Applied: UNKNOWN (guard did not complete a tracker query)`
      : `Expected: ${expectedSet.size}    Applied (in required set): ${common.length}    Missing: ${missing.length}    Unexpected: ${unexpected.length}`,
    "",
    `${pad("EXPECTED")}  ${pad("ACTUAL")}  STATUS`,
    `${pad("-".repeat(14))}  ${pad("-".repeat(14))}  ------`,
  ];

  // Row per required file: expected prefix on the left, matching applied
  // prefix on the right (blank if not found, or "?? UNKNOWN ??" when the
  // DB was never queried), plus a status marker.
  for (const row of expectedRows) {
    if (!row.version) {
      lines.push(`${pad(row.file)}  ${pad("")}  MALFORMED`);
      continue;
    }
    if (actualUnknown) {
      lines.push(`${pad(row.version)}  ${pad(unknownMarker)}  UNKNOWN   ${row.file}`);
      continue;
    }
    const hit = appliedSet.has(row.version);
    lines.push(
      `${pad(row.version)}  ${pad(hit ? row.version : "")}  ${hit ? "OK" : "MISSING"}    ${row.file}`,
    );
  }

  if (!actualUnknown && unexpected.length > 0) {
    lines.push("");
    lines.push("Applied prefixes NOT in the required-migrations manifest");
    lines.push("(informational only — not a failure, but worth an eyeball):");
    for (const v of unexpected) {
      lines.push(`${pad("")}  ${pad(v)}  UNEXPECTED`);
    }
  }

  if (actualUnknown) {
    lines.push("");
    lines.push("NOTE: the ACTUAL column is UNKNOWN because the guard exited before it");
    lines.push("could successfully read supabase_migrations.schema_migrations. Do NOT");
    lines.push("interpret blank/UNKNOWN rows as 'not applied' — the DB state was never");
    lines.push("observed. Fix the failure mode above, then re-run the guard.");
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
    outcome, // "verified" | "missing_migrations" | "malformed_filename" | "psql_not_invocable" | "tracker_query_failed" | "target_identity_rejected" | "shared_supavisor_required" | "no_db_connection"
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
  console.error(`✗ REQUIRED_MONEY_MIGRATIONS contains ${malformed.length} filename(s) whose`);
  console.error("  14-digit migrationVersion() prefix could not be extracted:");
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
      ...malformed.map((m) => `| \`supabase/migrations/${m.file}\` | \`${m.reason}\` |`),
      "",
      "**Next step:** correct `scripts/required-money-migrations.mjs` so every",
      "entry matches `/^\\d{14}_.+\\.sql$/`, then re-run this workflow.",
    ],
  );
  writeAudit("malformed_filename", {
    note: `${malformed.length} filename(s) failed migrationVersion() extraction.`,
    expected: malformed.map((m) => ({
      file: m.file,
      version: null,
      applied: false,
      reason: m.reason,
    })),
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

function failTargetIdentity(reason) {
  console.error(`✗ Database target identity rejected (${reason}).`);
  console.error("  psql was not invoked. Do NOT deploy.");
  writeReport("Protected database target identity rejected", [
    "The configured connection could not be safely bound to the selected Verdant environment.",
    "`psql` was not invoked and the target migration state remains unknown.",
    "",
    `Sanitized reason code: \`${reason}\``,
  ]);
  writeAudit("target_identity_rejected", {
    note: `Database target identity rejected (${reason}); psql was not invoked.`,
  });
  writeDiff("target_identity_rejected", {
    expectedRows: expected.map((entry) => ({ ...entry, applied: false })),
    appliedVersions: [],
  });
  process.exit(EXIT.TARGET_IDENTITY_REJECTED);
}

function failSharedSupavisorRequired(connectionMode) {
  console.error("✗ Protected GitHub runner requires a Shared Supavisor pooler URL.");
  console.error(`  Configured connection mode: ${connectionMode}. psql was not invoked.`);
  console.error(
    "  Copy the Shared Pooler connection string from Supabase Dashboard → Connect. Do NOT deploy.",
  );
  writeReport("Shared Supavisor pooler URL required", [
    "This protected GitHub-hosted runner requires a Shared Supavisor pooler URL.",
    `Configured connection mode: \`${connectionMode}\`.`,
    "Copy the Shared Pooler connection string from Supabase Dashboard → Connect, then replace the protected environment secret.",
    "`psql` was not invoked and the target migration state remains unknown.",
  ]);
  writeAudit("shared_supavisor_required", {
    note: `Connection mode ${connectionMode} was rejected before psql.`,
  });
  writeDiff("shared_supavisor_required", {
    expectedRows: expected.map((entry) => ({ ...entry, applied: false })),
    appliedVersions: [],
  });
  process.exit(EXIT.SHARED_SUPAVISOR_REQUIRED);
}

// -----------------------------------------------------------------------
// Pre-flight #2: require a database connection. A missing connection is a
// distinct failure mode from a broken manifest and from a psql tooling
// gap — CI needs to react differently to each (fix a secret vs fix the
// runner image vs fix a source file).
// -----------------------------------------------------------------------
let coreTargetEnv;
try {
  coreTargetEnv = coreTargetEnvironmentForMoney(TARGET_ENV);
} catch {
  failTargetIdentity("invalid_target_environment");
}
if (coreTargetEnv !== null && !DB_URL) {
  failTargetIdentity("missing_protected_database_url");
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
  writeDiff("no_db_connection", {
    expectedRows: expected.map((e) => ({ ...e, applied: false })),
    appliedVersions: [],
  });
  process.exit(EXIT.NO_DB_CONNECTION);
}

const versionList = expected.map((e) => `'${e.version}'`).join(",");

const sql = `SELECT version FROM supabase_migrations.schema_migrations WHERE version IN (${versionList});`;

const args = ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql];
const psqlEnv = { ...process.env };
if (DB_URL) {
  let sanitized;
  try {
    sanitized = sanitizeMoneyDatabaseUrlForPsql(DB_URL, TARGET_ENV);
  } catch (error) {
    const reason =
      error && typeof error === "object" && typeof error.code === "string"
        ? error.code
        : "invalid_target_environment";
    failTargetIdentity(reason);
  }

  if (
    process.env.REQUIRE_SHARED_SUPAVISOR === "true" &&
    sanitized.targetBound &&
    !isSharedSupavisorConnectionMode(sanitized.connectionMode)
  ) {
    failSharedSupavisorRequired(sanitized.connectionMode);
  }

  // Keep credentials out of the process argument list. libpq accepts a
  // connection URI through PGDATABASE, so psql receives the same connection
  // without exposing it through process listings or command traces. URL mode
  // is authoritative: scrub every ambient libpq/Supabase connection input so
  // a runner-level PGHOSTADDR, PGPASSFILE, service, or URL alias cannot alter
  // which database is queried.
  for (const key of Object.keys(psqlEnv)) {
    const normalizedKey = key.toUpperCase();
    if (
      normalizedKey.startsWith("PG") ||
      normalizedKey === "DATABASE_URL" ||
      normalizedKey.startsWith("SUPABASE_")
    ) {
      delete psqlEnv[key];
    }
  }
  psqlEnv.PGDATABASE = sanitized.databaseUrl;
  if (sanitized.sslMode) psqlEnv.PGSSLMODE = sanitized.sslMode;
}

const result = spawnSync("psql", args, {
  encoding: "utf8",
  env: psqlEnv,
});

if (result.error) {
  console.error(`✗ Failed to invoke psql: ${result.error.message}`);
  console.error("  Install postgresql-client and retry. Do NOT deploy.");
  writeReport("psql not available on runner", [
    "The deploy guard could not query the migration tracker: `psql` was not invocable.",
    "Install `postgresql-client` on the runner and re-run the workflow.",
  ]);
  writeAudit("psql_not_invocable", { note: "psql binary not invocable on runner." });
  writeDiff("psql_not_invocable", {
    expectedRows: expected.map((e) => ({ ...e, applied: false })),
    appliedVersions: [],
  });
  process.exit(EXIT.PSQL_NOT_INVOCABLE);
}
if (result.status !== 0) {
  console.error(`✗ psql exited ${result.status} while querying migration tracker.`);
  console.error(
    "  Raw psql diagnostics were withheld because they may contain connection details.",
  );
  console.error("  Do NOT deploy — target migration state is unknown.");
  writeReport("Migration tracker query failed", [
    "`psql` returned a non-zero exit code while reading `supabase_migrations.schema_migrations`.",
    "The target database's migration state is unknown; treat as blocking.",
    "",
    "Raw `psql` stderr is intentionally not emitted or stored because it may contain",
    "connection details.",
  ]);
  writeAudit("tracker_query_failed", {
    note: `psql exited ${result.status} querying supabase_migrations.schema_migrations.`,
  });
  writeDiff("tracker_query_failed", {
    expectedRows: expected.map((e) => ({ ...e, applied: false })),
    appliedVersions: [],
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
  console.error(`✗ Money-critical migrations NOT applied in target env (${TARGET_ENV}):`);
  console.error(`  ${missing.length} of ${expected.length} required migration(s) missing from`);
  console.error("  supabase_migrations.schema_migrations. Each row: <expected version>  <file>");
  for (const m of missing) {
    console.error(`    ${m.version}  supabase/migrations/${m.file}`);
  }
  console.error(
    "\nDo NOT deploy. Apply the missing migration(s) via the Supabase CLI\n" +
      "against this environment, re-run this check, and only then continue.",
  );
  writeReport(`${missing.length} of ${expected.length} required migration(s) not applied`, [
    `The following money-critical migrations are present on the trusted repository branch but have NOT been applied to the \`${TARGET_ENV}\` database:`,
    "",
    "| Version | File |",
    "| --- | --- |",
    ...missing.map((m) => `| \`${m.version}\` | \`supabase/migrations/${m.file}\` |`),
    "",
    "**Next step:** apply the missing migration(s) via the Supabase CLI against this",
    "environment, then re-run this workflow. Do not deploy until the guard turns green.",
  ]);
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
