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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const urlFlagIndex = args.indexOf("--url");
const dbUrl =
  (urlFlagIndex !== -1 ? args[urlFlagIndex + 1] : undefined) ??
  process.env.SUPABASE_DB_URL ??
  process.env.SUPABASE_DB_URL_LIVE ??
  process.env.DATABASE_URL;

// Every byte this script emits goes through one of these two. The connection
// string is an argv element of the psql child, so a failure diagnostic can
// quote it back at us -- and this output is not merely logged, it is published
// verbatim into a GitHub issue body by the scheduled workflow.
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

/** Repo migration versions, from the leading timestamp of each filename. */
function repoVersions() {
  if (!existsSync(MIGRATIONS_DIR)) bail(`missing ${MIGRATIONS_DIR}`);
  const out = new Map();
  for (const name of readdirSync(MIGRATIONS_DIR)) {
    if (!name.endsWith(".sql")) continue;
    const m = /^(\d{14})/.exec(name);
    if (!m) continue;
    out.set(m[1], name);
  }
  return out;
}

/** Applied versions, read-only, one SELECT. */
function appliedVersions(url) {
  const sql = "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;";
  let raw;
  try {
    raw = execFileSync("psql", [url, "-tAc", sql], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      // Belt-and-braces: the session cannot write regardless of this script.
      env: { ...process.env, PGOPTIONS: "-c default_transaction_read_only=on" },
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
  return new Set(
    raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  );
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

  const repo = repoVersions();
  const applied = appliedVersions(dbUrl);

  // Full-set diff, not max-version: a runner that skips a failure and
  // continues leaves a GAP in the middle, which a max comparison misses
  // entirely.
  const unapplied = [...repo.keys()].filter((v) => !applied.has(v)).sort();
  const newestRepo = [...repo.keys()].sort().at(-1) ?? null;
  const maxApplied = [...applied].sort().at(-1) ?? null;

  // A gap is strictly worse than a tail: it means the runner moved PAST
  // something that never ran, so the schema is in a state no one authored.
  const gaps = maxApplied ? unapplied.filter((v) => v < maxApplied) : [];

  if (asJson) {
    say(
      JSON.stringify(
        {
          status: unapplied.length === 0 ? "current" : "drift",
          newest_repo_version: newestRepo,
          max_applied_version: maxApplied,
          unapplied_count: unapplied.length,
          unapplied: unapplied.map((v) => ({
            version: v,
            file: repo.get(v),
            age_days: ageInDays(v),
            is_gap: gaps.includes(v),
          })),
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
  for (const v of unapplied) {
    say(`    ${v}  ${repo.get(v)}${gaps.includes(v) ? "   <-- GAP" : ""}`);
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
