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

// ── LEDGER MATCHING — read this before touching the comparison ─────────────
//
// A migration file `<ts>_<slug>.sql` can be recorded in
// supabase_migrations.schema_migrations under EITHER of two conventions, and
// this repository contains both:
//
//   Lovable-generated   version = <ts + ~2s>   name = "<ts>_<slug>"   (the stem)
//   Hand-authored       version = <ts>         name = "<slug>"
//
// Matching on `version` alone therefore reports an APPLIED Lovable migration
// as unapplied. Measured 2026-08-15: 157 of 268 files carry the Lovable
// UUID-suffixed convention, so a version-only diff is mostly false drift. The
// worked example from the runbook: 20260721194325_f96507e6-… sits in the
// ledger as version 20260721194327.
//
// DO NOT "fix" this with a tolerance window on the version. This repository
// contains 20260806230020_candidate_number_maintenance_paths and
// 20260806230021_candidate_number_membership_validate, ONE SECOND apart: a
// window would see the ledger's ...21 and report the genuinely unapplied
// ...20 as applied. That is the worse error of the two, and it is the exact
// shape of the blind spot that let the 2026-08-05 outage run for six days.
// Match by name, with no window at all.
//
// Contract: docs/signup-attribution-outage-operator-runbook.md, "Ledger
// hazard — read before applying".

/**
 * Field separator for the two-column read. ASCII US (0x1F) cannot occur in a
 * migration version or name.
 *
 * Written as an escape, never as a literal control character. A raw 0x1F in
 * source survives editors, linters and patch round-trips only by luck, and a
 * silent drop would make the separator "" -- indexOf("") is 0, so every row
 * would parse as an empty version and the probe would call the whole
 * repository unapplied. parseLedgerRows also rejects an empty separator.
 */
export const FIELD_SEP = "\u001f";

export const LEDGER_QUERY =
  "SELECT version, coalesce(name, '') AS name FROM supabase_migrations.schema_migrations ORDER BY version;";

/**
 * One record per migration file: the filename timestamp, the full stem, and
 * the slug after it. `slug` is "" for a bare `<ts>.sql` with no suffix, and an
 * empty slug must never match — see matchLedger.
 */
export function repoRecords(dir = MIGRATIONS_DIR) {
  if (!existsSync(dir)) bail(`missing ${dir}`);
  const out = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".sql")) continue;
    const stem = file.slice(0, -".sql".length);
    const m = /^(\d{14})/.exec(stem);
    if (!m) continue;
    out.push({ ts: m[1], stem, slug: stem.slice(15), file });
  }
  // Stable sort with an explicit comparator: two files may share a timestamp,
  // and the old Map keyed by version silently dropped one of them.
  return out.sort((a, b) => (a.stem < b.stem ? -1 : a.stem > b.stem ? 1 : 0));
}

/** Parse the two-column psql output into version and name sets. */
export function parseLedgerRows(raw, sep = FIELD_SEP) {
  // Guard the degenerate separator rather than producing a confident wrong
  // answer: indexOf("") is 0, so every version would parse as "" and the probe
  // would report all 268 migrations unapplied — a catastrophic false DRIFT
  // that looks exactly like a real one.
  if (typeof sep !== "string" || sep.length === 0) {
    throw new TypeError("parseLedgerRows: field separator must be a non-empty string");
  }
  const versions = new Set();
  const names = new Set();
  const malformed = [];
  for (const line of String(raw ?? "").split("\n")) {
    if (!line.trim()) continue;
    // indexOf, not split: a name is taken verbatim from the first separator
    // onward, so a separator inside it could never shift the parse.
    const i = line.indexOf(sep);
    if (i === -1) {
      // Every genuine row contains exactly one separator. A line without one
      // is NOT a ledger row, and must never be silently treated as a version:
      // if -F were dropped or a ~/.psqlrc banner reached stdout, swallowing
      // these would turn a fully-applied ledger into a repository-wide false
      // DRIFT that looks exactly like a real one. Collect and let the caller
      // fail loudly.
      malformed.push(line.slice(0, 80));
      continue;
    }
    const version = line.slice(0, i).trim();
    const name = line.slice(i + sep.length).trim();
    if (version) versions.add(version);
    if (name) names.add(name);
  }
  return { versions, names, malformed };
}

/**
 * Name-bound match, no tolerance window. A file is applied when the ledger
 * holds its stem (Lovable), its slug (hand-authored), or its exact version.
 */
export function matchLedger(records, ledger) {
  const versions = ledger?.versions ?? new Set();
  const names = ledger?.names ?? new Set();
  const matchedBy = { stem: 0, slug: 0, version: 0 };
  const unapplied = [];

  // A fallback key is only safe when it identifies exactly ONE file. Two files
  // sharing a timestamp, or sharing a slug, make that key ambiguous: a single
  // ledger row would mark BOTH applied, so a genuinely unapplied migration
  // would be reported applied. That is the dangerous direction — the same
  // class of error as a tolerance window. Where a key is ambiguous the file
  // must match on its stem, which is unique by construction (it is the
  // filename).
  const tally = (key) => {
    const counts = new Map();
    for (const r of records) counts.set(r[key], (counts.get(r[key]) ?? 0) + 1);
    return counts;
  };
  const tsCount = tally("ts");
  const slugCount = tally("slug");
  const ambiguous = { timestamps: 0, slugs: 0 };

  for (const r of records) {
    // Stem first — it is the most specific of the three.
    if (r.stem && names.has(r.stem)) {
      matchedBy.stem += 1;
    } else if (r.slug && slugCount.get(r.slug) === 1 && names.has(r.slug)) {
      // `r.slug &&` matters: a bare `<ts>.sql` has slug "", and a NULL ledger
      // name arrives as "". Without this guard those two would match and a
      // genuinely unapplied migration would be reported applied.
      matchedBy.slug += 1;
    } else if (tsCount.get(r.ts) === 1 && versions.has(r.ts)) {
      matchedBy.version += 1;
    } else {
      if (r.slug && slugCount.get(r.slug) > 1 && names.has(r.slug)) ambiguous.slugs += 1;
      if (tsCount.get(r.ts) > 1 && versions.has(r.ts)) ambiguous.timestamps += 1;
      unapplied.push(r);
    }
  }

  const maxApplied = [...versions].sort().at(-1) ?? null;
  // A gap is strictly worse than a tail: the runner moved PAST something that
  // never ran, so the schema is in a state nobody authored.
  const gaps = new Set(
    maxApplied ? unapplied.filter((r) => r.ts < maxApplied).map((r) => r.ts) : [],
  );
  return { unapplied, matchedBy, maxApplied, gaps, ambiguous };
}

/** Applied ledger rows, read-only, one SELECT. */
function readLedger(url) {
  let raw;
  try {
    // -X is load-bearing, not tidiness: psql reads ~/.psqlrc AFTER parsing
    // command-line options, so a \pset there would override -F/-A and its
    // banners would land on stdout. Either would corrupt the parse below into
    // a repository-wide false DRIFT.
    raw = execFileSync("psql", [url, "-X", "-tA", "-F", FIELD_SEP, "-c", LEDGER_QUERY], {
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
    // Before the generic "does not exist": a missing `name` column is a
    // different fault with a different fix, and it would silently disable
    // name-bound matching if it fell through to a vaguer message.
    if (/column .* does not exist/i.test(stderr)) {
      bail(
        "supabase_migrations.schema_migrations has no `name` column — name-bound matching is impossible on this Postgres",
        stderr.trim().slice(0, 300),
      );
    }
    if (/does not exist/i.test(stderr)) {
      bail(
        "supabase_migrations.schema_migrations not found — check the schema name for this Postgres",
        stderr.trim().slice(0, 300),
      );
    }
    // The most likely real-world failure once the connection works: a
    // read-only investigation on 2026-08-15 hit exactly this for both roles it
    // had. It must not fall through to a vague "query failed".
    if (/permission denied/i.test(stderr)) {
      bail(
        "permission denied reading supabase_migrations.schema_migrations",
        "the connected role cannot read the migration ledger, so nothing was verified. " +
          stderr.trim().slice(0, 200),
      );
    }
    bail("psql query failed", (stderr || String(error)).trim().slice(0, 300));
  }
  const ledger = parseLedgerRows(raw);
  if (ledger.malformed.length > 0) {
    bail(
      "unparseable ledger output — refusing to report drift from it",
      `${ledger.malformed.length} line(s) had no field separator, so psql did not emit the ` +
        `expected two columns (is -F/-A being overridden, or did something else write to ` +
        `stdout?). First: ${JSON.stringify(ledger.malformed[0])}`,
    );
  }
  return ledger;
}

/** Days between a YYYYMMDDHHMMSS version stamp and now. Time is injectable for tests. */
export function ageInDays(version, now = Date.now()) {
  const y = +version.slice(0, 4);
  const mo = +version.slice(4, 6);
  const d = +version.slice(6, 8);
  const stamp = Date.UTC(y, mo - 1, d);
  if (!Number.isFinite(stamp)) return null;
  return Math.floor((now - stamp) / 86_400_000);
}

function main() {
  if (!dbUrl) {
    bail(
      "no database URL",
      "set SUPABASE_DB_URL (or pass --url). Refusing to report 'current' without checking.",
    );
  }

  // Full-set diff, not max-version: a runner that skips a failure and
  // continues leaves a GAP in the middle, which a max comparison misses
  // entirely.
  const records = repoRecords();
  const { unapplied, matchedBy, maxApplied, gaps, ambiguous } = matchLedger(
    records,
    readLedger(dbUrl),
  );
  const newestRepo = records.map((r) => r.ts).sort().at(-1) ?? null;
  // Count flagged ENTRIES, not distinct timestamps: two files can share a
  // timestamp, so the Set's size would under-report the lines marked GAP.
  const gapCount = unapplied.filter((r) => gaps.has(r.ts)).length;

  if (asJson) {
    say(
      JSON.stringify(
        {
          status: unapplied.length === 0 ? "current" : "drift",
          newest_repo_version: newestRepo,
          max_applied_version: maxApplied,
          // Evidence that name-bound matching is actually doing work. If
          // `stem` is 0 on a repo with Lovable migrations, matching has
          // silently regressed to version-only and the unapplied list below is
          // inflated with false drift.
          applied_match_breakdown: matchedBy,
          // Non-zero means a fallback key was ambiguous and was refused, so
          // these entries may be applied but cannot be proven so from the
          // ledger. Investigate rather than assume drift.
          ambiguous_matches_refused: ambiguous,
          unapplied_count: unapplied.length,
          unapplied: unapplied.map((r) => ({
            version: r.ts,
            file: r.file,
            age_days: ageInDays(r.ts),
            is_gap: gaps.has(r.ts),
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
  say(`  matched by:       stem ${matchedBy.stem}, slug ${matchedBy.slug}, version ${matchedBy.version}`);
  say(`  unapplied:        ${unapplied.length}`);

  if (unapplied.length === 0) {
    say("\nOK — every repo migration is recorded applied.");
    process.exit(0);
  }

  const oldest = unapplied[0].ts;
  const age = ageInDays(oldest);
  say(
    `\nDRIFT — ${unapplied.length} migration(s) not applied.` +
      (age !== null ? ` Oldest pending is ${age} day(s) old.` : ""),
  );
  say("\n  Unapplied:");
  for (const r of unapplied) {
    say(`    ${r.ts}  ${r.file}${gaps.has(r.ts) ? "   <-- GAP" : ""}`);
  }

  if (gapCount > 0) {
    say(`\n  ${gapCount} of these are GAPS (older than the newest applied version).`);
    say("  The runner moved past them, so the live schema is in a state nobody authored.");
  } else {
    say("\n  These form a contiguous tail — consistent with the runner having STOPPED");
    say(`  at ${oldest}. If that migration fails on every apply, everything behind it`);
    say("  is frozen until it is fixed or skipped.");
  }
  process.exit(1);
}

// Running main() is the DEFAULT. Skipping it requires an explicit opt-out that
// only the test suite sets.
//
// The obvious idiom -- `import.meta.url === pathToFileURL(process.argv[1]).href`
// -- is actively DANGEROUS here. Node resolves an ESM entry point through
// realpath when computing import.meta.url but leaves process.argv[1]
// unresolved, so one symlink anywhere in the invocation path makes the two
// differ. main() would then never run, the process would exit 0 having emitted
// nothing, and the scheduled workflow reports exit 0 as "Production is
// current". A probe that silently checks nothing while reporting success is
// the exact six-day-invisible-outage failure this script exists to prevent.
//
// Default-run inverts the risk. A mistake in this guard now makes main() run
// when it should not -- loud, immediate, and harmless under a test runner --
// instead of silently not running in production.
const SKIP_MAIN_ENV = "PROBE_MIGRATION_DRIFT_SKIP_MAIN";

if (process.env[SKIP_MAIN_ENV] !== "1") {
  try {
    main();
  } catch (error) {
    // An uncaught throw would print a raw stack straight to stderr, routing
    // around every redaction above -- and the scheduled workflow reads that
    // stderr file into the tracking issue body when the JSON one is empty. Any
    // throw site holding the connection string would have published it.
    bail("unexpected failure", String((error && error.stack) || error));
  }
}
