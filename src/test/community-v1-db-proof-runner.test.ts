import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, basename } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  COMMUNITY_V1_REQUIRED_CASES,
  runCommunityFixtureSql,
} from "../../scripts/security/community-v1-db-proof.mjs";

const sqlCommand = vi.fn();
const runner = resolve("scripts/security/run-community-v1-db-security.mjs");
const roots: string[] = [];
const TOTAL = COMMUNITY_V1_REQUIRED_CASES.length;
beforeEach(() => {
  sqlCommand.mockReset();
});
function fixture(result: object | null, code = 0) {
  const root = mkdtempSync(join(tmpdir(), "verdant-community-runner-"));
  roots.push(root);
  mkdirSync(join(root, "node_modules/vitest"), { recursive: true });
  writeFileSync(
    join(root, "node_modules/vitest/vitest.mjs"),
    `
    import { writeFileSync } from 'node:fs';
    const report = process.argv.find(arg => arg.startsWith('--outputFile='))?.slice(13);
    const body = ${JSON.stringify(result === null ? null : JSON.stringify(result))};
    if (report && body !== null) writeFileSync(report, body);
    console.log('STUB_EXECUTED');
    process.exit(${code});
  `,
  );
  return root;
}
type Case = { title: string; fullName: string; status: string; failureMessages?: string[] };
const report = (status: "passed" | "failed" = "passed") => {
  const assertionResults: Case[] = COMMUNITY_V1_REQUIRED_CASES.map((id) => ({
    title: `${id} case`,
    fullName: `community v1 authority (local DB) ${id} case`,
    status,
  }));
  return {
    success: status === "passed",
    numTotalTests: TOTAL,
    numPassedTests: status === "passed" ? TOTAL : 0,
    numFailedTests: status === "failed" ? TOTAL : 0,
    numPendingTests: 0,
    numTodoTests: 0,
    testResults: [{ assertionResults }],
  };
};
function run(root: string, env: Record<string, string | undefined> = {}, args: string[] = []) {
  return spawnSync(process.execPath, [runner, ...args], {
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
      !basename(absolute).startsWith("verdant-community-runner-")
    )
      throw new Error("Unexpected fixture path");
    rmSync(absolute, { recursive: true, force: true });
  }
});

describe("community v1 proof case list", () => {
  it("names the 37 runtime cases of the packet's §8 matrix, each once", () => {
    expect(TOTAL).toBe(37);
    expect(new Set(COMMUNITY_V1_REQUIRED_CASES).size).toBe(37);
    expect(COMMUNITY_V1_REQUIRED_CASES[0]).toBe("T-ISO-01");
    expect(COMMUNITY_V1_REQUIRED_CASES[36]).toBe("T-KS-01");
    expect(Object.isFrozen(COMMUNITY_V1_REQUIRED_CASES)).toBe(true);
  });
});

describe("community v1 proof runner refuses false receipts", () => {
  it.each([
    { SUPABASE_URL: "https://remote.example.invalid" },
    { SUPABASE_URL: "http://127.0.0.1:54321/?apikey=x" },
    { SUPABASE_DB_URL: "postgresql://postgres:fake@remote.example.invalid/postgres" },
    {
      SUPABASE_DB_URL: "postgresql://postgres:fake@127.0.0.1/postgres?host=remote.example.invalid",
    },
    { SUPABASE_DB_URL: "" },
    { SUPABASE_SERVICE_ROLE_KEY: "" },
    { SUPABASE_SERVICE_ROLE_KEY: "fake-anon" },
  ])("blocks unsafe or absent prerequisites before executing tests: %j", (env) => {
    const result = run(fixture(report()), env);
    expect(result.status).toBe(2);
    expect(result.stdout).not.toContain("STUB_EXECUTED");
    expect(result.stderr).toContain("BLOCKED");
    expect(result.stderr).not.toContain("fake-service");
  });
  it("accepts 37 executed passing cases with exit 0", () => {
    const result = run(fixture(report()));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Community V1 DB proof: 37 passed, 0 failed, 0 skipped");
  });
  it("reports the RED receipt: every case executed and failed exits 1", () => {
    const result = run(fixture(report("failed"), 1));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Community V1 DB proof: 0 passed, 37 failed, 0 skipped");
  });
  it("never exits 0 when a case failed, even if the test process exited 0", () => {
    const failing = report();
    failing.testResults[0].assertionResults[5].status = "failed";
    expect(run(fixture(failing)).status).toBe(1);
  });
  it.each([
    "skipped-case",
    "pending-count",
    "todo-count",
    "missing-id",
    "duplicate-id",
    "extra-case",
    "wrong-total",
    "prefix-only",
    "empty",
  ])("blocks an incomplete %s report", (kind) => {
    const bad = report("failed");
    const cases = bad.testResults[0].assertionResults;
    if (kind === "skipped-case") cases[2].status = "skipped";
    if (kind === "pending-count") bad.numPendingTests = 1;
    if (kind === "todo-count") bad.numTodoTests = 1;
    if (kind === "missing-id") cases[3].title = "unrelated case";
    if (kind === "duplicate-id") cases[4] = { ...cases[3] };
    if (kind === "extra-case") {
      cases.push({ title: "T-ISO-01 again", fullName: "x", status: "failed" });
      bad.numTotalTests = TOTAL + 1;
    }
    if (kind === "wrong-total") bad.numTotalTests = TOTAL - 1;
    if (kind === "prefix-only") cases[0].title = "T-ISO-010 lookalike";
    if (kind === "empty") bad.testResults = [];
    const result = run(fixture(bad, 1));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("BLOCKED");
  });
  it("blocks when the test process wrote no report", () => {
    expect(run(fixture(null, 1)).status).toBe(2);
  });
});

describe("community v1 RED receipt mode", () => {
  const FUNCTION_MARKER =
    "Error: COMMUNITY_OBJECT_MISSING function community_profile_upsert PGRST202\n    at rpc (file.ts:1:1)";
  const red = (message = FUNCTION_MARKER) => {
    const result = report("failed");
    for (const item of result.testResults[0].assertionResults) item.failureMessages = [message];
    return result;
  };
  const redRun = (result: object, code = 1) => run(fixture(result, code), {}, ["--expect-red"]);

  it("confirms RED with exit 0 when every case failed on a missing community object", () => {
    const result = redRun(red());
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Community V1 RED receipt");
  });
  it("accepts a missing community relation marker", () => {
    expect(
      redRun(red("Error: COMMUNITY_OBJECT_MISSING relation community_profiles PGRST205")).status,
    ).toBe(0);
  });
  it.each([
    [
      "an assertion diff quoting a code (Codex P1)",
      "AssertionError: expected ':PGRST205' to end with ':42501'",
    ],
    [
      "a marker quoted inside an assertion",
      "AssertionError: expected 'COMMUNITY_OBJECT_MISSING relation community_profiles PGRST205' to be null",
    ],
    ["a non-community relation", "Error: COMMUNITY_OBJECT_MISSING relation profiles PGRST205"],
    ["a bare missing-relation code", "Error: relation does not exist 42P01"],
    [
      "a community RPC failing on a base dependency",
      "Error: RPC_ERROR community_profile_upsert 42P01",
    ],
    [
      "a marker on a later line only",
      "Error: failed to create fixture user\nCOMMUNITY_OBJECT_MISSING function community_x PGRST202",
    ],
  ])("blocks RED on %s", (_label, message) => {
    const result = red();
    result.testResults[0].assertionResults[4].failureMessages = [message];
    const blocked = redRun(result);
    expect(blocked.status).toBe(2);
    expect(blocked.stderr).toContain("BLOCKED");
  });
  it("blocks RED when any case passed", () => {
    const result = red();
    result.testResults[0].assertionResults[0].status = "passed";
    expect(redRun(result).status).toBe(2);
  });
  it("blocks RED on an incomplete receipt", () => {
    const result = red();
    result.numPendingTests = 1;
    expect(redRun(result).status).toBe(2);
  });
  it.each([0, 2])(
    "blocks RED when Vitest exits %i instead of its failing exit (Codex P1)",
    (code) => {
      expect(redRun(red(), code).status).toBe(2);
    },
  );
});

describe("community v1 fixture SQL stays local and private", () => {
  const env = {
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_ANON_KEY: "fake-anon",
    SUPABASE_SERVICE_ROLE_KEY: "fake-service",
    SUPABASE_DB_URL: "postgresql://postgres:fake-password@127.0.0.1:54322/postgres",
    PGHOSTADDR: "remote.example.invalid",
    PGSERVICE: "remote-service",
    PGSERVICEFILE: "/private/service.conf",
    PGOPTIONS: "untrusted options",
  };
  it("passes SQL on stdin, keeps credentials off argv, and overrides inherited routing", () => {
    runCommunityFixtureSql("SELECT 1;", env, sqlCommand);
    const [command, args, options] = sqlCommand.mock.calls[0];
    expect(command).toBe("psql");
    expect(args).toEqual(["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-f", "-"]);
    expect(args.join(" ")).not.toContain("fake-password");
    expect(options.input).toBe("SELECT 1;");
    expect(options.env.PGHOST).toBe("127.0.0.1");
    expect(options.env.PGHOSTADDR).toBeUndefined();
    expect(options.env).not.toHaveProperty("PGSERVICE");
    expect(options.env).not.toHaveProperty("PGSERVICEFILE");
    expect(options.env.PGPORT).toBe("54322");
    expect(options.env.PGOPTIONS).toBe("-c statement_timeout=10000");
    expect(options.timeout).toBe(15000);
  });
  it("refuses a database host override before any SQL process", () => {
    expect(() =>
      runCommunityFixtureSql(
        "SELECT 1;",
        { ...env, SUPABASE_DB_URL: env.SUPABASE_DB_URL + "?host=remote.example.invalid" },
        sqlCommand,
      ),
    ).toThrow(/BLOCKED/);
    expect(sqlCommand).not.toHaveBeenCalled();
  });
  it("sanitizes command failure instead of exposing SQL or credentials", () => {
    sqlCommand.mockImplementation(() => {
      throw new Error("fake-password private SQL");
    });
    expect(() => runCommunityFixtureSql("SELECT 1;", env, sqlCommand)).toThrow(
      "BLOCKED: community v1 local SQL fixture command failed.",
    );
  });
});
