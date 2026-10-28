import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import CommunityV1RunErrorsReporter, {
  COMMUNITY_V1_REQUIRED_CASES,
  COMMUNITY_V1_RUN_ERRORS_ENV,
  requireLocalCommunityEnvironment,
  requireRedCommunityProof,
} from "../../scripts/security/community-v1-db-proof.mjs";

const TOTAL = COMMUNITY_V1_REQUIRED_CASES.length;

function redReport(message: string) {
  const assertionResults = COMMUNITY_V1_REQUIRED_CASES.map((id) => ({
    title: `${id} case`,
    fullName: `community v1 authority (local DB) ${id} case`,
    status: "failed" as const,
    failureMessages: [message],
  }));
  return {
    success: false,
    numTotalTests: TOTAL,
    numPassedTests: 0,
    numFailedTests: TOTAL,
    numPendingTests: 0,
    numTodoTests: 0,
    testResults: [{ assertionResults }],
  };
}

describe("community v1 proof guard helpers", () => {
  it("accepts IPv6 loopback for the local API URL", () => {
    const env = {
      SUPABASE_URL: "http://[::1]:54321",
      SUPABASE_ANON_KEY: "fake-anon",
      SUPABASE_SERVICE_ROLE_KEY: "fake-service",
      SUPABASE_DB_URL: "postgresql://postgres:fake@127.0.0.1:54322/postgres",
    };
    expect(requireLocalCommunityEnvironment(env).api.hostname).toBe("[::1]");
  });

  it("accepts a RED marker without an Error: prefix on the first line", () => {
    expect(() =>
      requireRedCommunityProof(
        redReport("COMMUNITY_OBJECT_MISSING function community_profile_upsert PGRST202"),
      ),
    ).not.toThrow();
  });
});

describe("community v1 run-errors reporter env gate", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("writes nothing when COMMUNITY_V1_RUN_ERRORS_FILE is unset", () => {
    const dir = mkdtempSync(join(tmpdir(), "verdant-community-reporter-guard-"));
    dirs.push(dir);
    const out = join(dir, "run-errors.json");
    const previous = process.env[COMMUNITY_V1_RUN_ERRORS_ENV];
    delete process.env[COMMUNITY_V1_RUN_ERRORS_ENV];
    try {
      new CommunityV1RunErrorsReporter().onTestRunEnd([], []);
      expect(existsSync(out)).toBe(false);
    } finally {
      if (previous === undefined) delete process.env[COMMUNITY_V1_RUN_ERRORS_ENV];
      else process.env[COMMUNITY_V1_RUN_ERRORS_ENV] = previous;
    }
  });
});
