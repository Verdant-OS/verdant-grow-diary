import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, basename } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runProfileFixtureSql } from "../../scripts/security/profiles-db-proof.mjs";

const sqlCommand = vi.fn();
const runner = resolve("scripts/security/run-profiles-db-security.mjs");
const roots: string[] = [];
beforeEach(() => {
  sqlCommand.mockReset();
});
function fixture(result: object, code = 0) {
  const root = mkdtempSync(join(tmpdir(), "verdant-profile-runner-"));
  roots.push(root);
  mkdirSync(join(root, "node_modules/vitest"), { recursive: true });
  writeFileSync(
    join(root, "node_modules/vitest/vitest.mjs"),
    `
    import { writeFileSync } from 'node:fs';
    const report = process.argv.find(arg => arg.startsWith('--outputFile='))?.slice(13);
    if (report) writeFileSync(report, ${JSON.stringify(JSON.stringify(result))});
    console.log('STUB_EXECUTED');
    process.exit(${code});
  `,
  );
  return root;
}
const validReport = () => ({
  success: true,
  numTotalTests: 16,
  numPassedTests: 16,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 0,
  testResults: [
    {
      assertionResults: Array.from({ length: 16 }, (_, index) => ({
        fullName:
          index === 0
            ? "profiles gamification write protection (local DB) J: RPC-triggered gamification update is blocked by trigger"
            : index === 1
              ? "profiles gamification write protection (local DB) J1/J2/J3: RPC single-field gamification updates are each blocked"
              : `case ${index}`,
        status: "passed",
      })),
    },
  ],
});
function run(root: string, env: Record<string, string | undefined> = {}) {
  return spawnSync(process.execPath, [runner], {
    cwd: root,
    encoding: "utf8",
    timeout: 20_000,
    windowsHide: true,
    env: {
      ...process.env,
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_ANON_KEY: "fake-anon",
      SUPABASE_SERVICE_ROLE_KEY: "fake-service",
      SUPABASE_DB_URL: "postgresql://postgres:fake@127.0.0.1:54322/postgres",
      ...env,
    },
  });
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    const absolute = realpathSync(root);
    if (
      dirname(absolute) !== realpathSync(tmpdir()) ||
      !basename(absolute).startsWith("verdant-profile-runner-")
    )
      throw new Error("Unexpected fixture path");
    rmSync(absolute, { recursive: true, force: true });
  }
});
describe("profile proof runner refuses false acceptance", () => {
  it.each([
    { SUPABASE_URL: "https://remote.example.invalid" },
    { SUPABASE_DB_URL: "postgresql://postgres:fake@remote.example.invalid/postgres" },
    {
      SUPABASE_DB_URL: "postgresql://postgres:fake@127.0.0.1/postgres?host=remote.example.invalid",
    },
    { SUPABASE_DB_URL: "" },
    { SUPABASE_SERVICE_ROLE_KEY: "" },
  ])("blocks unsafe or absent prerequisites before executing tests: %j", (env) => {
    const result = run(fixture(validReport()), env);
    expect(result.status).toBe(2);
    expect(result.stdout).not.toContain("STUB_EXECUTED");
    expect(result.stderr).toContain("BLOCKED");
    expect(result.stderr).not.toContain("fake-service");
  });
  it("accepts sixteen executed passing cases including both RPC cases", () => {
    expect(run(fixture(validReport())).status).toBe(0);
  });
  it.each([
    "skipped",
    "missing-rpc",
    "empty",
    "unsuccessful",
    "duplicate",
    "failed-case",
    "wrong-count",
  ])("rejects an exit-zero %s report", (kind) => {
    const report = validReport();
    if (kind === "skipped") report.numPendingTests = 2;
    if (kind === "missing-rpc")
      report.testResults[0].assertionResults[0].fullName = "unrelated case";
    if (kind === "empty") report.testResults = [];
    if (kind === "unsuccessful") report.success = false;
    if (kind === "duplicate")
      report.testResults[0].assertionResults[3] = report.testResults[0].assertionResults[2];
    if (kind === "failed-case") report.testResults[0].assertionResults[2].status = "failed";
    if (kind === "wrong-count") report.numTotalTests = 15;
    expect(run(fixture(report)).status).not.toBe(0);
  });
  it("preserves a failing test process exit", () => {
    expect(run(fixture(validReport(), 1)).status).toBe(1);
  });
});

describe("profile fixture SQL stays local and private", () => {
  const env = {
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_ANON_KEY: "fake-anon",
    SUPABASE_SERVICE_ROLE_KEY: "fake-service",
    SUPABASE_DB_URL: "postgresql://postgres:fake-password@127.0.0.1:54322/postgres",
    PGHOSTADDR: "remote.example.invalid",
    PGOPTIONS: "untrusted options",
  };
  it("passes SQL on stdin, keeps credentials off argv, and overrides inherited routing", () => {
    runProfileFixtureSql("SELECT 1;", env, sqlCommand);
    const [command, args, options] = sqlCommand.mock.calls[0];
    expect(command).toBe("psql");
    expect(args).toEqual(["-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", "-"]);
    expect(options.input).toBe("SELECT 1;");
    expect(options.env.PGHOST).toBe("127.0.0.1");
    expect(options.env.PGHOSTADDR).toBe("");
    expect(options.env.PGPORT).toBe("54322");
    expect(options.env.PGOPTIONS).toBe("-c statement_timeout=10000");
    expect(options.timeout).toBe(15000);
    expect(options.windowsHide).toBe(true);
  });
  it("refuses a database host override before any SQL process", () => {
    expect(() =>
      runProfileFixtureSql(
        "SELECT 1;",
        {
          ...env,
          SUPABASE_DB_URL: env.SUPABASE_DB_URL + "?host=remote.example.invalid",
        },
        sqlCommand,
      ),
    ).toThrow(/BLOCKED/);
    expect(sqlCommand).not.toHaveBeenCalled();
  });
  it("sanitizes command failure instead of exposing SQL or credentials", () => {
    sqlCommand.mockImplementation(() => {
      throw new Error("fake-password private SQL");
    });
    expect(() => runProfileFixtureSql("SELECT 1;", env, sqlCommand)).toThrow(
      "BLOCKED: profiles local SQL fixture command failed.",
    );
  });
});
