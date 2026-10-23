import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import CommunityV1RunErrorsReporter, {
  COMMUNITY_OBJECT_MISSING_LINE,
  COMMUNITY_V1_REQUIRED_CASES,
  COMMUNITY_V1_RUN_ERRORS_ENV,
  requireCleanCommunityRun,
  requireExecutedCommunityProof,
  requireLocalCommunityEnvironment,
  requireRedCommunityProof,
} from "../../scripts/security/community-v1-db-proof.mjs";

const BASE_ENV = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "fake-anon",
  SUPABASE_SERVICE_ROLE_KEY: "fake-service",
  SUPABASE_DB_URL: "postgresql://postgres:secret@127.0.0.1:54322/postgres",
};

function passReport() {
  const assertionResults = COMMUNITY_V1_REQUIRED_CASES.map((id) => ({
    title: `${id} case`,
    fullName: `community v1 authority (local DB) ${id} case`,
    status: "passed" as const,
  }));
  const total = COMMUNITY_V1_REQUIRED_CASES.length;
  return {
    success: true,
    numTotalTests: total,
    numPassedTests: total,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    testResults: [{ assertionResults }],
  };
}

describe("requireLocalCommunityEnvironment", () => {
  it("accepts loopback API and database URLs with distinct keys", () => {
    const parsed = requireLocalCommunityEnvironment(BASE_ENV);
    expect(parsed.api.hostname).toBe("127.0.0.1");
    expect(parsed.database.hostname).toBe("127.0.0.1");
  });

  it("accepts IPv6 loopback hostnames", () => {
    expect(
      requireLocalCommunityEnvironment({
        ...BASE_ENV,
        SUPABASE_URL: "http://[::1]:54321",
        SUPABASE_DB_URL: "postgresql://postgres:secret@[::1]:54322/postgres",
      }).api.hostname,
    ).toBe("[::1]");
  });

  it.each([
    ["https API", { SUPABASE_URL: "https://127.0.0.1:54321" }],
    ["remote API host", { SUPABASE_URL: "http://remote.example.invalid:54321" }],
    ["API credentials in URL", { SUPABASE_URL: "http://user:pass@127.0.0.1:54321" }],
    ["API query string", { SUPABASE_URL: "http://127.0.0.1:54321/?debug=1" }],
    [
      "non-postgres database protocol",
      { SUPABASE_DB_URL: "mysql://postgres:secret@127.0.0.1/postgres" },
    ],
    [
      "database without password",
      { SUPABASE_DB_URL: "postgresql://postgres@127.0.0.1:54322/postgres" },
    ],
    [
      "database path outside allowlist",
      { SUPABASE_DB_URL: "postgresql://postgres:secret@127.0.0.1:54322/bad/name" },
    ],
    ["empty anon key", { SUPABASE_ANON_KEY: "" }],
    ["matching anon and service keys", { SUPABASE_SERVICE_ROLE_KEY: "fake-anon" }],
  ])("blocks unsafe env: %s", (_label, override) => {
    expect(() => requireLocalCommunityEnvironment({ ...BASE_ENV, ...override })).toThrow(/BLOCKED/);
  });
});

describe("requireExecutedCommunityProof", () => {
  it("returns pass and fail counts for a complete report", () => {
    const report = passReport();
    report.testResults[0].assertionResults[0].status = "failed";
    report.numPassedTests = COMMUNITY_V1_REQUIRED_CASES.length - 1;
    report.numFailedTests = 1;
    expect(requireExecutedCommunityProof(report)).toEqual({
      passed: COMMUNITY_V1_REQUIRED_CASES.length - 1,
      failed: 1,
    });
  });
});

describe("requireRedCommunityProof marker line", () => {
  it("accepts the structured marker with or without an Error prefix", () => {
    const lines = [
      "COMMUNITY_OBJECT_MISSING function community_profile_upsert PGRST202",
      "Error: COMMUNITY_OBJECT_MISSING relation community_profiles PGRST205",
    ];
    for (const line of lines) {
      expect(COMMUNITY_OBJECT_MISSING_LINE.test(line)).toBe(true);
    }
  });

  it("requires every case to fail on the marker alone", () => {
    const report = passReport();
    for (const item of report.testResults[0].assertionResults) {
      item.status = "failed";
      item.failureMessages = [
        "COMMUNITY_OBJECT_MISSING function community_profile_upsert PGRST202",
      ];
    }
    expect(() => requireRedCommunityProof(report)).not.toThrow();
  });
});

describe("requireCleanCommunityRun", () => {
  it("rejects partial run-error records", () => {
    expect(() =>
      requireCleanCommunityRun({ moduleErrors: 0, suiteErrors: 0 }, passReport()),
    ).toThrow(/BLOCKED/);
  });
});

describe("CommunityV1RunErrorsReporter", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("does not write a file when the env path is unset", () => {
    const dir = mkdtempSync(join(tmpdir(), "verdant-community-reporter-noop-"));
    dirs.push(dir);
    const out = join(dir, "run-errors.json");
    const previous = process.env[COMMUNITY_V1_RUN_ERRORS_ENV];
    delete process.env[COMMUNITY_V1_RUN_ERRORS_ENV];
    try {
      new CommunityV1RunErrorsReporter().onTestRunEnd([], []);
    } finally {
      if (previous === undefined) delete process.env[COMMUNITY_V1_RUN_ERRORS_ENV];
      else process.env[COMMUNITY_V1_RUN_ERRORS_ENV] = previous;
    }
    expect(existsSync(out)).toBe(false);
  });

  it("writes only numeric counts, never error text", () => {
    const dir = mkdtempSync(join(tmpdir(), "verdant-community-reporter-text-"));
    dirs.push(dir);
    const out = join(dir, "run-errors.json");
    const previous = process.env[COMMUNITY_V1_RUN_ERRORS_ENV];
    process.env[COMMUNITY_V1_RUN_ERRORS_ENV] = out;
    try {
      new CommunityV1RunErrorsReporter().onTestRunEnd(
        [
          {
            errors: () => [new Error("secret module message")],
            children: { allSuites: () => [{ errors: () => [new Error("secret suite")] }] },
          },
        ] as never,
        [new Error("secret unhandled")] as never,
      );
    } finally {
      if (previous === undefined) delete process.env[COMMUNITY_V1_RUN_ERRORS_ENV];
      else process.env[COMMUNITY_V1_RUN_ERRORS_ENV] = previous;
    }
    const body = readFileSync(out, "utf8");
    expect(body).toBe('{"moduleErrors":1,"suiteErrors":1,"unhandledErrors":1}');
    expect(body).not.toMatch(/secret/);
  });
});
