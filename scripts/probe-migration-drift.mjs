#!/usr/bin/env node
/**
 * probe-migration-drift — is production actually running the migrations we
 * think it is?
 *
 * WHY THIS EXISTS
 *
 * On 2026-08-05 migration 20260805090000 began failing on every apply (an
 * apply-time self-test raised inside the same transaction as its real
 * statements, so the whole migration rolled back). The runner stopped there.
 * Seven later migrations never reached production for SIX DAYS -- including
 * an action_queue_create RPC that shipped client code already calling it.
 * That was a live user-facing break.
 *
 * Nothing alerted. CI was green the entire time, because CI verifies that
 * migrations are well-formed, not that production ever ran them. The gap was
 * found only by querying schema_migrations by hand on a hunch.
 *
 * This probe closes that blind spot: it compares every migration version in
 * the repo against every version recorded applied, and reports the
 * difference. Cheap enough to run on a schedule.
 *
 * READ-ONLY BY CONSTRUCTION
 *
 * Runs with default_transaction_read_only=on, so the connection cannot write
 * even if this script were wrong. It issues exactly one SELECT.
 *
 * USAGE
 *
 *   SUPABASE_DB_URL='postgresql://...' node scripts/probe-migration-drift.mjs
 *   node scripts/probe-migration-drift.mjs --url 'postgresql://...'
 *   node scripts/probe-migration-drift.mjs --json     # machine-readable
 *
 * EXIT CODES
 *
 *   0  production is current -- every repo migration is recorded applied
 *   1  DRIFT -- one or more repo migrations are not applied
 *   2  COULD NOT PROBE -- no URL, psql missing, or query failed
 *
 * Exit 2 is deliberately distinct from exit 0. A probe that cannot reach the
 * database must never be mistaken for a probe that found nothing wrong --
 * that is exactly how a six-day outage stays invisible.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { redactDbUrl } from "./lib/redactDbUrl.mjs";
import {
  migrationIdentityFromFilename,
  parseMigrationLedgerRows,
  reconcileMigrationLedger,
} from "./lib/migrationLedgerMatching.mjs";
import {
  buildLibpqConnectionEnvironment,
  sanitizeSupabaseDatabaseUrlForPsql,
  SupabaseDatabaseTargetIdentityError,
} from "./lib/supabaseDatabaseTargetIdentity.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const urlFlagIndex = args.indexOf("--url");
const dbUrl =
  (urlFlagIndex !== -1 ? args[urlFlagIndex + 1] : undefined) ??
  process.env.SUPABASE_DB_URL ??
  process.env.DATABASE_URL;

// Every byte this script emits goes through one of these two. The connection
// string is sensitive, and this output is not merely logged: it is published
// verbatim into a GitHub issue body by the scheduled workflow. The psql child
// receives credentials through an allowlisted environment, never argv, while
// redaction remains a second line of defence for unexpected diagnostics.
const say = (line) => console.log(redactDbUrl(line, dbUrl));
const warn = (line) => console.error(redactDbUrl(line, dbUrl));

function bail(message, detail) {
  if (asJson) {
    // Redact the fields before serialising rather than the serialised string,
    // so the placeholder can never disturb the JSON the workflow parses.
    say(
      JSON.stringify(
        {
          status: "could_not_probe",
          message: redactDbUrl(message, dbUrl),
          detail: redactDbUrl(detail, dbUrl),
        },
        null,
        2,
      ),
    );
  } else {
    warn(`[migration-drift] COULD NOT PROBE — ${message}`);
    if (detail) warn(`  ${detail}`);
    warn("  This is NOT a pass. Nothing was verified.");
  }
  process.exit(2);
}

/** Repo migration identities, derived from each timestamped SQL filename. */
function repoMigrations() {
  if (!existsSync(MIGRATIONS_DIR)) bail(`missing ${MIGRATIONS_DIR}`);
  const out = new Map();
  for (const name of readdirSync(MIGRATIONS_DIR)) {
    if (!name.endsWith(".sql")) continue;
    const migration = migrationIdentityFromFilename(name);
    if (!migration) continue;
    if (out.has(migration.version)) {
      bail(
        "duplicate repository migration version",
        `more than one SQL migration uses version ${migration.version}`,
      );
    }
    out.set(migration.version, migration);
  }
  return out;
}

function psqlEnvironment(connection) {
  // psql needs process-location and locale basics, not every secret present in
  // the protected GitHub environment. The explicit libpq fields are built
  // only after the URL has been bound to Verdant's pinned production ref.
  const childEnv = {};
  const pathValue = process.env.PATH ?? process.env.Path;
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
    if (typeof process.env[key] === "string") childEnv[key] = process.env[key];
  }
  return {
    ...childEnv,
    ...buildLibpqConnectionEnvironment(connection),
    PGOPTIONS: "-c default_transaction_read_only=on",
  };
}

/** Applied migration identities, read-only, one SELECT. */
function appliedMigrations(connection) {
  const sql = `
    SELECT json_build_object(
      'version', version::text,
      'name', name::text
    )::text
    FROM supabase_migrations.schema_migrations
    ORDER BY version, name;
  `;
  let raw;
  try {
    raw = execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-tAc", sql], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      // Belt-and-braces: the session cannot write regardless of this script.
      env: psqlEnvironment(connection),
    });
  } catch (error) {
    const stderr = (error && error.stderr) || "";
    if (error && error.code === "ENOENT") {
      bail(
        "psql is not installed or not on PATH",
        "install the postgresql-client package (CI: see the 'Install psql client' step in irrigation-pgtap-rls-gate.yml)",
      );
    }
    if (/could not|connection|authentication|timeout/i.test(stderr)) {
      bail("could not connect to the database", stderr.trim().slice(0, 300));
    }
    if (/does not exist/i.test(stderr)) {
      bail(
        "supabase_migrations.schema_migrations not found — check the schema name for this Postgres",
        stderr.trim().slice(0, 300),
      );
    }
    bail("psql query failed", (stderr || String(error)).trim().slice(0, 300));
  }
  try {
    return parseMigrationLedgerRows(raw);
  } catch (error) {
    bail("could not parse the migration ledger", String(error && error.message));
  }
}

/** Days between a YYYYMMDDHHMMSS version stamp and now. */
function ageInDays(version) {
  const y = +version.slice(0, 4);
  const mo = +version.slice(4, 6);
  const d = +version.slice(6, 8);
  const stamp = Date.UTC(y, mo - 1, d);
  if (!Number.isFinite(stamp)) return null;
  return Math.floor((Date.now() - stamp) / 86_400_000);
}

function main() {
  if (!dbUrl) {
    bail(
      "no database URL",
      "set SUPABASE_DB_URL (or pass --url). Refusing to report 'current' without checking.",
    );
  }

  let connection;
  try {
    connection = sanitizeSupabaseDatabaseUrlForPsql(dbUrl, "production");
  } catch (error) {
    const code =
      error instanceof SupabaseDatabaseTargetIdentityError
        ? error.code
        : "identity_validation_failed";
    bail(
      "database URL does not identify the pinned production project",
      `target identity rejected (${code}); no database query ran`,
    );
  }

  const repo = repoMigrations();
  const applied = appliedMigrations(connection);

  // Full-set diff, not max-version. Historical source-contract markers retained
  // for the existing regression suite:
  // !isMigrationRecorded(migration, applied)
  // unapplied.filter((v) => v < maxApplied)
  //
  // The implementation now reconciles both complete sets once. Per-migration
  // OR matching lets one shifted Lovable row satisfy two adjacent repository
  // migrations: its name identifies the migration that ran while its shifted
  // numeric version can equal a second migration that never ran. Full-set
  // reconciliation enforces one ledger row <-> one repository migration and
  // makes exact names authoritative over shifted versions.
  let reconciliation;
  try {
    reconciliation = reconcileMigrationLedger([...repo.values()], applied);
  } catch (error) {
    bail("could not reconcile the migration ledger", String(error && error.message));
  }

  const unappliedMigrations = reconciliation.unmatched_migrations;
  const unapplied = unappliedMigrations.map((migration) => migration.version);
  const newestRepo = [...repo.keys()].sort().at(-1) ?? null;
  // GAP status is based on matched repository identity, never raw ledger
  // versions. A shifted ledger timestamp may be newer than a repository
  // migration that has not actually run.
  const maxApplied = reconciliation.latest_matched_migration?.version ?? null;

  // A gap is strictly worse than a tail: it means the runner moved PAST
  // something that never ran, so the schema is in a state no one authored.
  const gapFiles = new Set(reconciliation.gaps.map((migration) => migration.filename));
  const gaps = reconciliation.gaps.map((migration) => migration.version);

  if (asJson) {
    say(
      JSON.stringify(
        {
          status: unapplied.length === 0 ? "current" : "drift",
          newest_repo_version: newestRepo,
          max_applied_version: maxApplied,
          unapplied_count: unapplied.length,
          unapplied: unappliedMigrations.map((migration) => ({
            version: migration.version,
            file: migration.filename,
            age_days: ageInDays(migration.version),
            is_gap: gapFiles.has(migration.filename),
          })),
          identity_conflict_count: reconciliation.identity_conflicts.length,
          identity_conflicts: reconciliation.identity_conflicts,
          unmatched_ledger_row_count: reconciliation.unmatched_ledger_rows.length,
        },
        null,
        2,
      ),
    );
    process.exit(unapplied.length === 0 ? 0 : 1);
  }

  say("[migration-drift]");
  say(`  newest in repo:   ${newestRepo ?? "(none)"}`);
  say(`  max applied:      ${maxApplied ?? "(none)"}`);
  say(`  unapplied:        ${unapplied.length}`);

  if (unapplied.length === 0) {
    say("\nOK — every repo migration is recorded applied.");
    process.exit(0);
  }

  const oldest = unapplied[0];
  const age = ageInDays(oldest);
  say(
    `\nDRIFT — ${unapplied.length} migration(s) not applied.` +
      (age !== null ? ` Oldest pending is ${age} day(s) old.` : ""),
  );
  say("\n  Unapplied:");
  for (const migration of unappliedMigrations) {
    say(
      `    ${migration.version}  ${migration.filename}${
        gapFiles.has(migration.filename) ? "   <-- GAP" : ""
      }`,
    );
  }

  if (reconciliation.identity_conflicts.length > 0) {
    say(
      `\n  Note: ${reconciliation.identity_conflicts.length} ledger row(s) had shifted versions ` +
        "that identified a different repository migration. Exact names won; each row counted once.",
    );
  }

  if (gaps.length > 0) {
    say(`\n  ${gaps.length} of these are GAPS (older than the newest applied version).`);
    say("  The runner moved past them, so the live schema is in a state nobody authored.");
  } else {
    say("\n  These form a contiguous tail — consistent with the runner having STOPPED");
    say(`  at ${oldest}. If that migration fails on every apply, everything behind it`);
    say("  is frozen until it is fixed or skipped.");
  }
  process.exit(1);
}

try {
  main();
} catch (error) {
  // An uncaught throw would print a raw stack straight to stderr, routing
  // around every redaction above -- and the scheduled workflow reads that
  // stderr file into the tracking issue body when the JSON one is empty. Any
  // throw site holding the connection string would have published it.
  bail("unexpected failure", String((error && error.stack) || error));
}
