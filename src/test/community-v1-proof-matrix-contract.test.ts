import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  COMMUNITY_V1_REQUIRED_CASES,
  requireLocalCommunityEnvironment,
} from "../../scripts/security/community-v1-db-proof.mjs";

const integrationPath = resolve("src/test/integration/community-v1-authority.integration.test.ts");
const catalogSqlPath = resolve("supabase/tests/community_v1_permissions.sql");
const workflowPath = resolve(".github/workflows/community-v1-db-proof.yml");

const CATALOG_CASES = Object.freeze([
  "T-CAT-01",
  "T-CAT-02",
  "T-CAT-03",
  "T-CAT-04",
  "T-CAT-05",
  "T-CAT-06",
]);

/** Matches workflow green path: grep -c '✓ T-CAT-0' … && [ "$passed" -eq 6 ] */
const CATALOG_NOTICE_SUBSTRING = "✓ T-CAT-0";

function runtimeCaseIdsInIntegration(source: string): string[] {
  const matches = source.matchAll(/\bit\s*\(\s*["'](T-[A-Z]+-\d+)\s/g);
  return [...matches].map((match) => match[1]);
}

function catalogTablesInSql(source: string): string[] {
  const block = source.match(/T-CAT-01:[\s\S]*?FOREACH tbl IN ARRAY ARRAY\[([\s\S]*?)\]\s*LOOP/);
  if (!block) throw new Error("T-CAT-01 table list not found in catalog SQL");
  return [...block[1].matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
}

function integrationTableNames(source: string): string[] {
  const block = source.match(/const TABLES:[\s\S]*?=\s*\[([\s\S]*?)\];/);
  if (!block) throw new Error("TABLES constant not found in integration suite");
  return [...block[1].matchAll(/\["([a-z_]+)",/g)].map((match) => match[1]);
}

describe("community v1 local environment gate", () => {
  const base = {
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_ANON_KEY: "fake-anon",
    SUPABASE_SERVICE_ROLE_KEY: "fake-service",
    SUPABASE_DB_URL: "postgresql://postgres:secret@127.0.0.1:54322/postgres",
  };

  it("accepts loopback API and database URLs with distinct keys", () => {
    expect(requireLocalCommunityEnvironment(base).api.hostname).toBe("127.0.0.1");
    expect(
      requireLocalCommunityEnvironment({ ...base, SUPABASE_URL: "http://localhost:54321" }).api
        .hostname,
    ).toBe("localhost");
    expect(
      requireLocalCommunityEnvironment({ ...base, SUPABASE_URL: "http://[::1]:54321" }).api
        .hostname,
    ).toBe("[::1]");
  });

  it.each([
    { SUPABASE_URL: "https://127.0.0.1:54321" },
    { SUPABASE_URL: "http://127.0.0.1:54321/extra" },
    { SUPABASE_URL: "http://user:pass@127.0.0.1:54321" },
    { SUPABASE_DB_URL: "postgresql://postgres:secret@127.0.0.1:54322/postgres?sslmode=require" },
    { SUPABASE_DB_URL: "postgresql://postgres@127.0.0.1:54322/postgres" },
    { SUPABASE_ANON_KEY: "fake-service", SUPABASE_SERVICE_ROLE_KEY: "fake-service" },
  ])("rejects unsafe local configuration %j", (override) => {
    expect(() => requireLocalCommunityEnvironment({ ...base, ...override })).toThrow(/BLOCKED/);
  });
});

describe("community v1 proof matrix contracts", () => {
  const integration = readFileSync(integrationPath, "utf8");
  const catalogSql = readFileSync(catalogSqlPath, "utf8");
  const workflow = readFileSync(workflowPath, "utf8");

  it("lists the same 37 runtime case IDs the runner enforces", () => {
    expect(COMMUNITY_V1_REQUIRED_CASES.length).toBe(37);
    expect(runtimeCaseIdsInIntegration(integration).sort()).toEqual(
      [...COMMUNITY_V1_REQUIRED_CASES].sort(),
    );
  });

  it("names each runtime case exactly once in the integration suite", () => {
    const ids = runtimeCaseIdsInIntegration(integration);
    expect(ids.length).toBe(COMMUNITY_V1_REQUIRED_CASES.length);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of COMMUNITY_V1_REQUIRED_CASES) {
      expect(ids.filter((item) => item === id)).toEqual([id]);
    }
  });

  it("pins six catalog cases with notices the workflow can count", () => {
    for (const id of CATALOG_CASES) {
      expect(catalogSql).toContain(`-- ${id}:`);
      const notice = new RegExp(`RAISE NOTICE '${CATALOG_NOTICE_SUBSTRING}${id.slice(-1)}`);
      expect(catalogSql).toMatch(notice);
    }
    expect(
      [...catalogSql.matchAll(new RegExp(CATALOG_NOTICE_SUBSTRING, "g"))].length,
    ).toBeGreaterThanOrEqual(CATALOG_CASES.length);
    expect(workflow).toContain("grep -c '✓ T-CAT-0'");
    expect(workflow).toContain('[ "$passed" -eq 6 ]');
  });

  it("keeps the catalog table inventory aligned with the integration direct-access list", () => {
    const fromSql = catalogTablesInSql(catalogSql).sort();
    const fromIntegration = integrationTableNames(integration).sort();
    expect(fromSql).toEqual(fromIntegration);
    expect(fromSql.length).toBe(13);
  });
});
