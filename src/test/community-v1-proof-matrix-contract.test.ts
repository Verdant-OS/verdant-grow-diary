/**
 * Pins the Community V1 proof matrix across the runner list, integration suite,
 * and catalog SQL so a drift in one artifact fails CI before a false receipt.
 *
 * @source-scan-justified: Vitest case titles and SQL catalog text have no import
 * surface; the runner case list is imported and asserted against parsed peers.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { COMMUNITY_V1_REQUIRED_CASES } from "../../scripts/security/community-v1-db-proof.mjs";

const integrationPath = resolve("src/test/integration/community-v1-authority.integration.test.ts");
const catalogSqlPath = resolve("supabase/tests/community_v1_permissions.sql");

function runtimeCaseIdsFromIntegration(source: string): string[] {
  const matches = [...source.matchAll(/\bit\("((T-[A-Z]+-\d{2})[^"]*)"/g)];
  return matches.map((m) => m[2]);
}

function tableNamesFromIntegration(source: string): string[] {
  const block = source.match(/const TABLES:[\s\S]*?=\s*\[([\s\S]*?)\];/);
  expect(block, "TABLES constant").toBeTruthy();
  return [...block![1].matchAll(/\["(community_[a-z_]+)"/g)].map((m) => m[1]);
}

function tableNamesFromCatalogSql(source: string): string[] {
  const block = source.match(/FOREACH tbl IN ARRAY ARRAY\[([\s\S]*?)\]\s*LOOP[\s\S]*?T-CAT-01/);
  expect(block, "T-CAT-01 table array").toBeTruthy();
  return [...block![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe("community v1 proof matrix contract", () => {
  const integration = readFileSync(integrationPath, "utf8");
  const catalogSql = readFileSync(catalogSqlPath, "utf8");

  it("keeps integration runtime titles aligned with COMMUNITY_V1_REQUIRED_CASES", () => {
    const fromIntegration = runtimeCaseIdsFromIntegration(integration);
    expect(fromIntegration).toEqual([...COMMUNITY_V1_REQUIRED_CASES]);
    expect(new Set(fromIntegration).size).toBe(COMMUNITY_V1_REQUIRED_CASES.length);
  });

  it("lists the same 13 community tables in the integration suite and catalog SQL", () => {
    const integrationTables = tableNamesFromIntegration(integration);
    const catalogTables = tableNamesFromCatalogSql(catalogSql);
    expect(integrationTables).toHaveLength(13);
    expect(catalogTables).toHaveLength(13);
    expect(integrationTables).toEqual(catalogTables);
  });

  it("declares six catalog success notices for the green workflow grep", () => {
    const notices = [...catalogSql.matchAll(/RAISE NOTICE '✓ (T-CAT-0[1-6][^']*)'/g)].map(
      (m) => m[1],
    );
    expect(notices).toHaveLength(6);
    expect(notices.map((line) => line.slice(0, 8))).toEqual([
      "T-CAT-01",
      "T-CAT-02",
      "T-CAT-03",
      "T-CAT-04",
      "T-CAT-05",
      "T-CAT-06",
    ]);
  });
});
