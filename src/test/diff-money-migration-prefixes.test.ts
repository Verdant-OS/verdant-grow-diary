/**
 * Unit / integration coverage for scripts/diff-money-migration-prefixes.mjs.
 *
 * The script has top-level side effects (reads argv/env, spawns psql, calls
 * process.exit), so we exercise it as a child process rather than importing
 * it. `psql` is stubbed via a tiny shell script on a per-test PATH so we can
 * script stdout/exit for the DB query deterministically and offline.
 *
 * Documented exit codes (see README):
 *   0 = OK / no drift
 *   1 = drift (required prefix missing in target DB)
 *   2 = tooling / connection failure (state unknown)
 *
 * `--expected` mode exits 1 on malformed manifest, 0 otherwise, and never
 * touches the DB or psql.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  REQUIRED_MONEY_MIGRATIONS,
  migrationVersion,
} from "../../scripts/required-money-migrations.mjs";

const SCRIPT = resolve(
  __dirname,
  "..",
  "..",
  "scripts",
  "diff-money-migration-prefixes.mjs",
);

interface StubPsql {
  stdout?: string;
  stderr?: string;
  exit?: number;
}

let shimDir: string;

/** Write a shell shim named `psql` that echoes fixed output and exits with a fixed code. */
function installPsqlShim(stub: StubPsql): void {
  const stdoutPath = join(shimDir, "psql.stdout");
  const stderrPath = join(shimDir, "psql.stderr");
  writeFileSync(stdoutPath, stub.stdout ?? "");
  writeFileSync(stderrPath, stub.stderr ?? "");
  const body =
    `#!/usr/bin/env bash\n` +
    `cat ${JSON.stringify(stdoutPath)}\n` +
    `cat ${JSON.stringify(stderrPath)} 1>&2\n` +
    `exit ${stub.exit ?? 0}\n`;
  const path = join(shimDir, "psql");
  writeFileSync(path, body, { encoding: "utf8" });
  chmodSync(path, 0o755);
}

interface RunOptions {
  args?: string[];
  env?: Record<string, string | undefined>;
  /** When true, do not include shimDir on PATH (simulates psql-missing). */
  omitShim?: boolean;
}

function runScript(opts: RunOptions = {}) {
  // Keep the real system PATH so `bash` (used by the shim) resolves, but
  // prepend shimDir so our `psql` wins over any real one. When omitShim is
  // true, we drop shimDir entirely — the real `psql` may or may not exist,
  // so tests that rely on "psql not invocable" use a bogus PATH.
  const basePath = opts.omitShim ? "/nonexistent-empty-path" : `${shimDir}:/usr/bin:/bin`;
  const env: Record<string, string> = {
    PATH: basePath,
    HOME: process.env.HOME ?? "/root",
  };
  for (const [k, v] of Object.entries(opts.env ?? {})) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  // Use the current node binary directly so tests don't depend on `node`
  // being resolvable through the trimmed PATH above.
  return spawnSync(process.execPath, [SCRIPT, ...(opts.args ?? [])], {
    encoding: "utf8",
    env,
  });
}

beforeEach(() => {
  shimDir = mkdtempSync(join(tmpdir(), "diff-money-shim-"));
});

afterEach(() => {
  rmSync(shimDir, { recursive: true, force: true });
});

describe("diff-money-migration-prefixes.mjs — --expected mode", () => {
  it("prints every required prefix in text mode and exits 0", () => {
    const r = runScript({ args: ["--expected"], omitShim: true });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(
      `Expected required-money-migration prefixes (${REQUIRED_MONEY_MIGRATIONS.length}):`,
    );
    for (const file of REQUIRED_MONEY_MIGRATIONS) {
      expect(r.stdout).toContain(migrationVersion(file));
      expect(r.stdout).toContain(file);
    }
  });

  it("emits parseable JSON with expected+malformed keys and exits 0", () => {
    const r = runScript({ args: ["--expected", "--json"], omitShim: true });
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.expected).toHaveLength(REQUIRED_MONEY_MIGRATIONS.length);
    expect(parsed.malformed).toEqual([]);
    expect(parsed.expected[0]).toEqual({
      file: REQUIRED_MONEY_MIGRATIONS[0],
      version: migrationVersion(REQUIRED_MONEY_MIGRATIONS[0]),
    });
    expect(parsed.target_env).toBe("unspecified");
  });

  it("propagates TARGET_ENV through --json output", () => {
    const r = runScript({
      args: ["--expected", "--json"],
      env: { TARGET_ENV: "sandbox" },
      omitShim: true,
    });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).target_env).toBe("sandbox");
  });

  it("never invokes psql in --expected mode (works with empty PATH)", () => {
    const r = runScript({ args: ["--expected"], omitShim: true });
    expect(r.status).toBe(0);
    expect(r.stderr).toBe("");
  });
});

describe("diff-money-migration-prefixes.mjs — DB diff mode (exit 0)", () => {
  it("exits 0 when every required prefix is present in psql output", () => {
    const allApplied = REQUIRED_MONEY_MIGRATIONS.map(migrationVersion).join("\n");
    installPsqlShim({ stdout: `${allApplied}\n`, exit: 0 });
    const r = runScript({ env: { SUPABASE_DB_URL: "postgres://stub" } });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(
      `✓ All ${REQUIRED_MONEY_MIGRATIONS.length} required migrations applied`,
    );
    expect(r.stdout).not.toContain("MISSING");
  });

  it("--json OK path has missing_count=0 and empty missing[]", () => {
    const allApplied = REQUIRED_MONEY_MIGRATIONS.map(migrationVersion).join("\n");
    installPsqlShim({ stdout: `${allApplied}\n`, exit: 0 });
    const r = runScript({
      args: ["--json"],
      env: { SUPABASE_DB_URL: "postgres://stub", TARGET_ENV: "live" },
    });
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.target_env).toBe("live");
    expect(parsed.expected_count).toBe(REQUIRED_MONEY_MIGRATIONS.length);
    expect(parsed.missing_count).toBe(0);
    expect(parsed.missing).toEqual([]);
    expect(parsed.rows.every((row: { applied: boolean }) => row.applied)).toBe(true);
  });
});

describe("diff-money-migration-prefixes.mjs — DB diff mode (exit 1, drift)", () => {
  it("exits 1 and reports MISSING rows when a required prefix is absent", () => {
    // Omit the last required prefix from the psql output → drift.
    const partial = REQUIRED_MONEY_MIGRATIONS.slice(0, -1)
      .map(migrationVersion)
      .join("\n");
    installPsqlShim({ stdout: `${partial}\n`, exit: 0 });
    const r = runScript({ env: { SUPABASE_DB_URL: "postgres://stub" } });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("MISSING");
    expect(r.stdout).toContain("Do NOT deploy");
    const missingFile =
      REQUIRED_MONEY_MIGRATIONS[REQUIRED_MONEY_MIGRATIONS.length - 1];
    expect(r.stdout).toContain(missingFile);
  });

  it("--json drift path reports missing entries and non-zero missing_count", () => {
    const missingFile =
      REQUIRED_MONEY_MIGRATIONS[REQUIRED_MONEY_MIGRATIONS.length - 1];
    const missingVersion = migrationVersion(missingFile);
    const partial = REQUIRED_MONEY_MIGRATIONS.slice(0, -1)
      .map(migrationVersion)
      .join("\n");
    installPsqlShim({ stdout: `${partial}\n`, exit: 0 });
    const r = runScript({
      args: ["--json"],
      env: { SUPABASE_DB_URL: "postgres://stub" },
    });
    expect(r.status).toBe(1);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.missing_count).toBe(1);
    expect(parsed.missing).toEqual([
      { file: missingFile, version: missingVersion },
    ]);
    expect(parsed.applied_count).toBe(REQUIRED_MONEY_MIGRATIONS.length - 1);
  });

  it("tolerates blank lines and whitespace in psql output", () => {
    const noisy =
      "\n  " +
      REQUIRED_MONEY_MIGRATIONS.map(migrationVersion).join("\n  ") +
      "\n\n";
    installPsqlShim({ stdout: noisy, exit: 0 });
    const r = runScript({ env: { SUPABASE_DB_URL: "postgres://stub" } });
    expect(r.status).toBe(0);
  });
});

describe("diff-money-migration-prefixes.mjs — DB diff mode (exit 2, tooling)", () => {
  it("exits 2 when no DB URL and no PG* env vars are set", () => {
    const r = runScript({});
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("No database connection configured");
  });

  it("exits 2 when psql is not on PATH", () => {
    // DB URL is set, but shim is not on PATH → spawnSync surfaces ENOENT.
    const r = runScript({
      omitShim: true,
      env: { SUPABASE_DB_URL: "postgres://stub" },
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("psql not invocable");
  });

  it("exits 2 when psql exits non-zero (tracker query failed)", () => {
    installPsqlShim({
      stdout: "",
      stderr: "ERROR: relation supabase_migrations.schema_migrations does not exist\n",
      exit: 1,
    });
    const r = runScript({ env: { SUPABASE_DB_URL: "postgres://stub" } });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("psql exited 1");
    expect(r.stderr).toContain("schema_migrations does not exist");
  });

  it("accepts PGHOST as a substitute for SUPABASE_DB_URL", () => {
    const allApplied = REQUIRED_MONEY_MIGRATIONS.map(migrationVersion).join("\n");
    installPsqlShim({ stdout: `${allApplied}\n`, exit: 0 });
    const r = runScript({ env: { PGHOST: "stub-host" } });
    // Should NOT exit 2 for missing DB — should reach psql (the shim) and OK.
    expect(r.status).toBe(0);
  });
});

describe("diff-money-migration-prefixes.mjs — --sarif output", () => {
  const SARIF_SCHEMA =
    "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/Schemata/sarif-schema-2.1.0.json";

  it("emits an empty-results SARIF log to stdout when all migrations are applied", () => {
    const allApplied = REQUIRED_MONEY_MIGRATIONS.map(migrationVersion).join("\n");
    installPsqlShim({ stdout: `${allApplied}\n`, exit: 0 });
    const r = runScript({
      args: ["--sarif"],
      env: { SUPABASE_DB_URL: "postgres://stub", TARGET_ENV: "live" },
    });
    expect(r.status).toBe(0);
    const sarif = JSON.parse(r.stdout);
    expect(sarif.$schema).toBe(SARIF_SCHEMA);
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs).toHaveLength(1);
    const run = sarif.runs[0];
    expect(run.tool.driver.name).toBe("diff-money-migration-prefixes");
    expect(run.results).toEqual([]);
    expect(run.invocations[0].executionSuccessful).toBe(true);
    expect(run.invocations[0].properties.targetEnv).toBe("live");
    // The rules catalog is still shipped so consumers can render descriptions.
    const ruleIds = run.tool.driver.rules.map((rule: { id: string }) => rule.id);
    expect(ruleIds).toEqual(
      expect.arrayContaining([
        "money-migration-drift",
        "money-migration-malformed",
        "money-migration-tooling",
      ]),
    );
  });

  it("emits one drift result per missing prefix and exits 1", () => {
    const missingFile =
      REQUIRED_MONEY_MIGRATIONS[REQUIRED_MONEY_MIGRATIONS.length - 1];
    const missingVersion = migrationVersion(missingFile);
    const partial = REQUIRED_MONEY_MIGRATIONS.slice(0, -1)
      .map(migrationVersion)
      .join("\n");
    installPsqlShim({ stdout: `${partial}\n`, exit: 0 });
    const r = runScript({
      args: ["--sarif"],
      env: { SUPABASE_DB_URL: "postgres://stub", TARGET_ENV: "sandbox" },
    });
    expect(r.status).toBe(1);
    const sarif = JSON.parse(r.stdout);
    const run = sarif.runs[0];
    expect(run.invocations[0].executionSuccessful).toBe(false);
    expect(run.results).toHaveLength(1);
    const finding = run.results[0];
    expect(finding.ruleId).toBe("money-migration-drift");
    expect(finding.level).toBe("error");
    expect(finding.message.text).toContain(missingFile);
    expect(finding.message.text).toContain(missingVersion);
    expect(finding.message.text).toContain("sandbox");
    expect(finding.locations[0].physicalLocation.artifactLocation.uri).toBe(
      `supabase/migrations/${missingFile}`,
    );
    expect(finding.partialFingerprints).toEqual({
      migrationVersion: missingVersion,
      targetEnv: "sandbox",
    });
  });

  it("writes SARIF to --sarif-out=PATH (creating parent dirs) and keeps text diff on stdout", () => {
    const partial = REQUIRED_MONEY_MIGRATIONS.slice(0, -1)
      .map(migrationVersion)
      .join("\n");
    installPsqlShim({ stdout: `${partial}\n`, exit: 0 });
    const outFile = join(shimDir, "nested", "reports", "diff.sarif");
    const r = runScript({
      args: ["--sarif", `--sarif-out=${outFile}`],
      env: { SUPABASE_DB_URL: "postgres://stub" },
    });
    expect(r.status).toBe(1);
    // SARIF went to the file, not stdout.
    expect(existsSync(outFile)).toBe(true);
    const sarif = JSON.parse(readFileSync(outFile, "utf8"));
    expect(sarif.$schema).toBe(SARIF_SCHEMA);
    expect(sarif.runs[0].results).toHaveLength(1);
    // Human-readable diff is still printed for the CI log.
    expect(r.stdout).toContain("MISSING");
    expect(r.stdout).toContain("Do NOT deploy");
    expect(r.stdout).not.toContain(SARIF_SCHEMA);
  });

  it("records a tooling-failure result when no DB URL is configured", () => {
    const outFile = join(shimDir, "tooling.sarif");
    const r = runScript({
      args: ["--sarif", `--sarif-out=${outFile}`],
    });
    expect(r.status).toBe(2);
    const sarif = JSON.parse(readFileSync(outFile, "utf8"));
    expect(sarif.runs[0].results).toHaveLength(1);
    const finding = sarif.runs[0].results[0];
    expect(finding.ruleId).toBe("money-migration-tooling");
    expect(finding.level).toBe("error");
    expect(finding.message.text).toContain("No database connection");
  });

  it("records a tooling-failure result when psql exits non-zero", () => {
    installPsqlShim({
      stderr: "ERROR: relation does not exist\n",
      exit: 1,
    });
    const outFile = join(shimDir, "psql-failed.sarif");
    const r = runScript({
      args: ["--sarif", `--sarif-out=${outFile}`],
      env: { SUPABASE_DB_URL: "postgres://stub" },
    });
    expect(r.status).toBe(2);
    const sarif = JSON.parse(readFileSync(outFile, "utf8"));
    expect(sarif.runs[0].results).toHaveLength(1);
    expect(sarif.runs[0].results[0].ruleId).toBe("money-migration-tooling");
    expect(sarif.runs[0].results[0].message.text).toContain("psql exited 1");
  });
});

describe("diff-money-migration-prefixes.mjs — --github-annotations", () => {
  it("emits ::error:: workflow commands on stderr for each missing prefix", () => {
    const missingFile =
      REQUIRED_MONEY_MIGRATIONS[REQUIRED_MONEY_MIGRATIONS.length - 1];
    const missingVersion = migrationVersion(missingFile);
    const partial = REQUIRED_MONEY_MIGRATIONS.slice(0, -1)
      .map(migrationVersion)
      .join("\n");
    installPsqlShim({ stdout: `${partial}\n`, exit: 0 });
    const r = runScript({
      args: ["--github-annotations"],
      env: { SUPABASE_DB_URL: "postgres://stub", TARGET_ENV: "live" },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(
      `::error file=supabase/migrations/${missingFile},line=1,title=Money migration drift::`,
    );
    expect(r.stderr).toContain(missingVersion);
    expect(r.stderr).toContain("live");
  });

  it("emits a tooling-failure annotation when the DB is unreachable", () => {
    const r = runScript({ args: ["--github-annotations"] });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(
      "::error file=scripts/required-money-migrations.mjs,line=1,title=Money migration applied-check tooling failure::",
    );
  });

  it("emits no ::error:: commands when the target is drift-free", () => {
    const allApplied = REQUIRED_MONEY_MIGRATIONS.map(migrationVersion).join("\n");
    installPsqlShim({ stdout: `${allApplied}\n`, exit: 0 });
    const r = runScript({
      args: ["--github-annotations"],
      env: { SUPABASE_DB_URL: "postgres://stub" },
    });
    expect(r.status).toBe(0);
    expect(r.stderr).not.toContain("::error");
  });
});

