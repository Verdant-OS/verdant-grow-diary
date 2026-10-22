import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  COMMUNITY_V1_REQUIRED_CASES,
  requireCleanCommunityRun,
  requireExecutedCommunityProof,
  requireLocalCommunityEnvironment,
  requireRedCommunityProof,
} from "../../scripts/security/community-v1-db-proof.mjs";

const TOTAL = COMMUNITY_V1_REQUIRED_CASES.length;
const integrationAuthorityPath = resolve(
  "src/test/integration/community-v1-authority.integration.test.ts",
);

describe("community v1 §8 matrix wiring", () => {
  it("lists the integration authority it() titles in packet table order", () => {
    const source = readFileSync(integrationAuthorityPath, "utf8");
    const wired = [...source.matchAll(/^\s*it\("(T-[A-Z]+-\d+)\s/gm)].map((match) => match[1]);
    expect(wired).toEqual([...COMMUNITY_V1_REQUIRED_CASES]);
    expect(wired).toHaveLength(TOTAL);
  });
});

describe("requireLocalCommunityEnvironment", () => {
  const valid = {
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    SUPABASE_DB_URL: "postgresql://postgres:secret@127.0.0.1:54322/postgres",
  };

  it.each([
    ["localhost API", { ...valid, SUPABASE_URL: "http://localhost:54321" }],
    [
      "[::1] database",
      { ...valid, SUPABASE_DB_URL: "postgresql://postgres:secret@[::1]:54322/postgres" },
    ],
    ["trailing slash API pathname", { ...valid, SUPABASE_URL: "http://127.0.0.1:54321/" }],
  ])("accepts %s", (_label, env) => {
    expect(requireLocalCommunityEnvironment(env)).toEqual({
      api: expect.any(URL),
      database: expect.any(URL),
    });
  });

  it.each([
    ["API credentials in the URL", { ...valid, SUPABASE_URL: "http://user:pass@127.0.0.1:54321" }],
    [
      "database without a password",
      { ...valid, SUPABASE_DB_URL: "postgresql://postgres@127.0.0.1/postgres" },
    ],
    [
      "database pathname with extra segments",
      { ...valid, SUPABASE_DB_URL: "postgresql://u:p@127.0.0.1:5432/a/b" },
    ],
    ["non-loopback API host", { ...valid, SUPABASE_URL: "http://10.0.0.1:54321" }],
  ])("rejects %s", (_label, env) => {
    expect(() => requireLocalCommunityEnvironment(env)).toThrow(/BLOCKED/);
  });
});

describe("community v1 proof receipt helpers", () => {
  const missingObjectLine =
    "Error: COMMUNITY_OBJECT_MISSING function community_profile_upsert PGRST202";
  const executedReport = (status: "passed" | "failed") => ({
    numPendingTests: 0,
    numTodoTests: 0,
    numTotalTests: TOTAL,
    testResults: [
      {
        assertionResults: COMMUNITY_V1_REQUIRED_CASES.map((id) => ({
          title: `${id} case`,
          status,
          failureMessages: status === "failed" ? [missingObjectLine] : undefined,
        })),
      },
    ],
  });

  it("requireExecutedCommunityProof counts passes without judging RED vs GREEN", () => {
    expect(requireExecutedCommunityProof(executedReport("passed"))).toEqual({
      passed: 37,
      failed: 0,
    });
    expect(requireExecutedCommunityProof(executedReport("failed"))).toEqual({
      passed: 0,
      failed: 37,
    });
  });

  it("requireRedCommunityProof accepts a complete missing-object failure set", () => {
    expect(() => requireRedCommunityProof(executedReport("failed"))).not.toThrow();
  });

  it("requireCleanCommunityRun rejects hook noise the JSON report can hide", () => {
    const report = executedReport("failed");
    expect(() =>
      requireCleanCommunityRun({ moduleErrors: 0, suiteErrors: 0, unhandledErrors: 0 }, report),
    ).not.toThrow();
    expect(() =>
      requireCleanCommunityRun({ moduleErrors: 0, suiteErrors: 1, unhandledErrors: 0 }, report),
    ).toThrow(/BLOCKED/);
    (report.testResults[0] as { message?: string }).message = "afterAll failed";
    expect(() =>
      requireCleanCommunityRun({ moduleErrors: 0, suiteErrors: 0, unhandledErrors: 0 }, report),
    ).toThrow(/BLOCKED/);
  });
});

describe("community v1 catalog SQL proof", () => {
  const catalogPath = resolve("supabase/tests/community_v1_permissions.sql");

  it("declares all five T-CAT catalog cases for the manual workflow", () => {
    const source = readFileSync(catalogPath, "utf8");
    for (let index = 1; index <= 5; index += 1) {
      expect(source).toContain(`T-CAT-0${index}`);
    }
    expect(source).toMatch(/community_profiles.*community_feature_state/s);
  });
});
