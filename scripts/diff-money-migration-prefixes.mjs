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
 *   node scripts/diff-money-migration-prefixes.mjs --sarif                     # SARIF v2.1.0 to stdout
 *   node scripts/diff-money-migration-prefixes.mjs --sarif --sarif-out=file    # SARIF to file (text diff still on stdout)
 *   node scripts/diff-money-migration-prefixes.mjs --github-annotations        # ::error:: workflow commands
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
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  REQUIRED_MONEY_MIGRATIONS,
  migrationVersion,
} from "./required-money-migrations.mjs";

const rawArgs = process.argv.slice(2);
const flags = new Set(rawArgs.filter((a) => !a.includes("=")));
const kvArgs = new Map(
  rawArgs
    .filter((a) => a.includes("="))
    .map((a) => {
      const idx = a.indexOf("=");
      return [a.slice(0, idx), a.slice(idx + 1)];
    }),
);
const asJson = flags.has("--json");
const expectedOnly = flags.has("--expected");
const asSarif = flags.has("--sarif");
const sarifOut = kvArgs.get("--sarif-out") ?? null;
const emitGhAnnotations = flags.has("--github-annotations");
const TARGET_ENV = process.env.TARGET_ENV ?? "unspecified";
const DB_URL = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? "";
const HAS_PG_ENV = Boolean(process.env.PGHOST);

const MIGRATION_DIR = "supabase/migrations";
const MANIFEST_URI = "scripts/required-money-migrations.mjs";

const expected = [];
const malformed = [];
for (const file of REQUIRED_MONEY_MIGRATIONS) {
  try {
    expected.push({ file, version: migrationVersion(file) });
  } catch (err) {
    malformed.push({
      file,
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Build a SARIF 2.1.0 log describing the current run.
 * @param {{missing: Array<{file: string, version: string}>, malformed: Array<{file: string, reason: string}>, toolingError: string | null}} state
 */
function buildSarif(state) {
  const rules = [
    {
      id: "money-migration-drift",
      name: "MoneyMigrationDrift",
      shortDescription: {
        text: "Required money-critical migration not applied in target DB.",
      },
      fullDescription: {
        text:
          "The 14-digit prefix for this required migration is absent from " +
          "supabase_migrations.schema_migrations in the target environment. " +
          "Deploying money-adjacent code without this migration risks silent " +
          "credit / referral / entitlement regressions.",
      },
      defaultConfiguration: { level: "error" },
      helpUri:
        "https://github.com/verdant/verdant-grow-diary#money-migration-applied-check",
    },
    {
      id: "money-migration-malformed",
      name: "MoneyMigrationMalformed",
      shortDescription: {
        text: "Required-money-migration filename has no 14-digit prefix.",
      },
      fullDescription: {
        text:
          "REQUIRED_MONEY_MIGRATIONS in scripts/required-money-migrations.mjs " +
          "must list files whose basenames begin with a 14-digit timestamp.",
      },
      defaultConfiguration: { level: "error" },
    },
    {
      id: "money-migration-tooling",
      name: "MoneyMigrationToolingFailure",
      shortDescription: {
        text: "Applied-check could not reach the target DB (state unknown).",
      },
      fullDescription: {
        text:
          "SUPABASE_DB_URL / DATABASE_URL / PG* env vars were not set, `psql` " +
          "was not on PATH, or the tracker query failed. Treat as blocking: " +
          "the target's migration state is unknown.",
      },
      defaultConfiguration: { level: "error" },
    },
  ];

  const results = [];

  for (const m of state.missing) {
    results.push({
      ruleId: "money-migration-drift",
      level: "error",
      message: {
        text:
          `Required money migration ${m.file} (prefix ${m.version}) is not ` +
          `applied in ${TARGET_ENV}. Do NOT deploy.`,
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: `${MIGRATION_DIR}/${m.file}`,
              uriBaseId: "SRCROOT",
            },
            region: { startLine: 1 },
          },
        },
      ],
      partialFingerprints: {
        migrationVersion: m.version,
        targetEnv: TARGET_ENV,
      },
    });
  }

  for (const m of state.malformed) {
    results.push({
      ruleId: "money-migration-malformed",
      level: "error",
      message: {
        text: `Required-money-migration filename ${m.file} has no 14-digit prefix: ${m.reason}`,
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: MANIFEST_URI, uriBaseId: "SRCROOT" },
            region: { startLine: 1 },
          },
        },
      ],
      partialFingerprints: { manifestEntry: m.file },
    });
  }

  if (state.toolingError) {
    results.push({
      ruleId: "money-migration-tooling",
      level: "error",
      message: { text: state.toolingError },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: MANIFEST_URI, uriBaseId: "SRCROOT" },
            region: { startLine: 1 },
          },
        },
      ],
      partialFingerprints: {
        toolingFailure: state.toolingError.slice(0, 64),
        targetEnv: TARGET_ENV,
      },
    });
  }

  return {
    $schema:
      "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "diff-money-migration-prefixes",
            informationUri:
              "https://github.com/verdant/verdant-grow-diary/blob/main/scripts/diff-money-migration-prefixes.mjs",
            rules,
          },
        },
        invocations: [
          {
            executionSuccessful: results.length === 0,
            properties: { targetEnv: TARGET_ENV },
          },
        ],
        results,
      },
    ],
  };
}

/** @param {ReturnType<typeof buildSarif>} sarif */
function emitSarif(sarif) {
  const payload = JSON.stringify(sarif, null, 2) + "\n";
  if (sarifOut) {
    mkdirSync(dirname(sarifOut), { recursive: true });
    writeFileSync(sarifOut, payload, "utf8");
  } else {
    process.stdout.write(payload);
  }
}

/**
 * Emit GitHub Actions workflow commands so failures show up as file-annotated
 * errors in the PR "Files changed" tab even without SARIF ingestion.
 * See https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions
 */
function emitGithubAnnotations(state) {
  for (const m of state.missing) {
    const file = `${MIGRATION_DIR}/${m.file}`;
    const msg =
      `Required money migration not applied in ${TARGET_ENV}: prefix ${m.version}`;
    process.stderr.write(
      `::error file=${file},line=1,title=Money migration drift::${msg}\n`,
    );
  }
  for (const m of state.malformed) {
    process.stderr.write(
      `::error file=${MANIFEST_URI},line=1,title=Malformed money-migration filename::${m.file}: ${m.reason}\n`,
    );
  }
  if (state.toolingError) {
    process.stderr.write(
      `::error file=${MANIFEST_URI},line=1,title=Money migration applied-check tooling failure::${state.toolingError}\n`,
    );
  }
}

/**
 * Finalize a run: optionally emit SARIF / GH annotations, then exit.
 * @param {number} code
 * @param {{missing?: Array, malformed?: Array, toolingError?: string | null}} state
 */
function finish(code, state) {
  const normalized = {
    missing: state.missing ?? [],
    malformed: state.malformed ?? [],
    toolingError: state.toolingError ?? null,
  };
  if (asSarif) emitSarif(buildSarif(normalized));
  if (emitGhAnnotations) emitGithubAnnotations(normalized);
  process.exit(code);
}

if (expectedOnly) {
  if (asJson) {
    process.stdout.write(
      JSON.stringify({ target_env: TARGET_ENV, expected, malformed }, null, 2) +
        "\n",
    );
  } else if (!asSarif) {
    console.log(`Expected required-money-migration prefixes (${expected.length}):`);
    for (const e of expected) console.log(`  ${e.version}  ${e.file}`);
    if (malformed.length) {
      console.log(`\nMalformed filenames (${malformed.length}):`);
      for (const m of malformed) console.log(`  ${m.file}  (${m.reason})`);
    }
  }
  finish(malformed.length > 0 ? 1 : 0, { malformed });
}

if (malformed.length > 0) {
  console.error(`✗ Manifest bug: ${malformed.length} filename(s) have no 14-digit prefix:`);
  for (const m of malformed) console.error(`    ${m.file}  (${m.reason})`);
  console.error("Fix scripts/required-money-migrations.mjs before comparing against a DB.");
  finish(2, { malformed });
}

if (!DB_URL && !HAS_PG_ENV) {
  const msg =
    "No database connection configured. Set SUPABASE_DB_URL, DATABASE_URL, " +
    "or the PG* env vars, or re-run with --expected to skip the DB check.";
  console.error(`✗ ${msg}`);
  finish(2, { toolingError: msg });
}

const versionList = expected.map((e) => `'${e.version}'`).join(",");
const sql =
  `SELECT version FROM supabase_migrations.schema_migrations ` +
  `WHERE version IN (${versionList}) ORDER BY version;`;
const psqlArgs = ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql];
if (DB_URL) psqlArgs.unshift(DB_URL);

const result = spawnSync("psql", psqlArgs, { encoding: "utf8", env: process.env });
if (result.error) {
  const msg = `psql not invocable: ${result.error.message}`;
  console.error(`✗ ${msg}`);
  finish(2, { toolingError: msg });
}
if (result.status !== 0) {
  const msg = `psql exited ${result.status} querying supabase_migrations.schema_migrations`;
  console.error(`✗ ${msg}`);
  if (result.stderr) console.error(result.stderr.trim());
  finish(2, { toolingError: msg });
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
} else if (!asSarif || sarifOut) {
  // Text diff goes to stdout in normal mode, and also when SARIF is being
  // written to a file (so the terminal still shows something useful).
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

finish(missing.length > 0 ? 1 : 0, {
  missing: missing.map((r) => ({ file: r.file, version: r.version })),
});
