import { describe, expect, it } from "vitest";
import {
  coreTargetEnvironmentForMoney,
  sanitizeMoneyDatabaseUrlForPsql,
} from "../../scripts/lib/moneyDatabaseTargetIdentity.mjs";

const SANDBOX_REF = "bzatgtgjvuojpoxcknaa";
const PRODUCTION_REF = "knkwiiywfkbqznbxwqfh";
const PASSWORD = "money/secret?# sentinel";
const SHARED_HOST = "aws-0-us-east-1.pooler.supabase.com";

function sharedUrl(username: string, port = 5432): string {
  return (
    `postgresql://${username}:${encodeURIComponent(PASSWORD)}@${SHARED_HOST}:${port}/postgres` +
    "?host=attacker.invalid&user=attacker&sslmode=require&sslmode=verify-full"
  );
}

function directUrl(ref: string): string {
  return `postgresql://postgres:${encodeURIComponent(PASSWORD)}@db.${ref}.supabase.co:5432/postgres?sslmode=require`;
}

describe("money database target identity", () => {
  it.each([
    ["sandbox", "sandbox"],
    ["live", "production"],
    ["unspecified", null],
  ] as const)("maps %s to the canonical core target", (moneyTarget, expected) => {
    expect(coreTargetEnvironmentForMoney(moneyTarget)).toBe(expected);
  });

  it.each(["prod", "production", "Sandbox", "live ", ""])(
    "rejects unknown protected target label %j",
    (targetEnv) => {
      expect(() => coreTargetEnvironmentForMoney(targetEnv)).toThrow(
        /exactly sandbox, live, or unspecified/i,
      );
    },
  );

  it.each([
    {
      label: "wrong-project username",
      targetEnv: "sandbox",
      username: `postgres.${PRODUCTION_REF}`,
      port: 5432,
      expectedRef: SANDBOX_REF,
      expectedConnectionMode: "shared-supavisor-session",
    },
    {
      label: "custom role",
      targetEnv: "sandbox",
      username: "readonly",
      port: 6543,
      expectedRef: SANDBOX_REF,
      expectedConnectionMode: "shared-supavisor-transaction",
    },
    {
      label: "placeholder suffix",
      targetEnv: "live",
      username: "postgres.%5BPROJECT_REF%5D",
      port: 5432,
      expectedRef: PRODUCTION_REF,
      expectedConnectionMode: "shared-supavisor-session",
    },
  ])("binds $label to the pinned $targetEnv project", (testCase) => {
    const source = sharedUrl(testCase.username, testCase.port);
    const result = sanitizeMoneyDatabaseUrlForPsql(source, testCase.targetEnv);
    const canonical = new URL(result.databaseUrl);

    expect(result.targetBound).toBe(true);
    expect(result.connectionMode).toBe(testCase.expectedConnectionMode);
    expect(result.sslMode).toBe("verify-full");
    expect(canonical.username).toBe(`postgres.${testCase.expectedRef}`);
    expect(canonical.password).toBe(encodeURIComponent(PASSWORD));
    expect(canonical.hostname).toBe(SHARED_HOST);
    expect(canonical.port).toBe(String(testCase.port));
    expect(canonical.pathname).toBe("/postgres");
    expect(canonical.search).toBe("");
    expect(result.databaseUrl).not.toContain("attacker.invalid");
  });

  it("preserves the documented unspecified local CLI mode", () => {
    const source = "postgresql://local-user:local-password@127.0.0.1:54322/postgres";
    expect(sanitizeMoneyDatabaseUrlForPsql(source, "unspecified")).toEqual({
      databaseUrl: source,
      sslMode: null,
      targetBound: false,
    });
  });

  it("rejects a direct production URL under the sandbox label", () => {
    expect(() => sanitizeMoneyDatabaseUrlForPsql(directUrl(PRODUCTION_REF), "sandbox")).toThrow(
      /pinned sandbox project/i,
    );
  });

  it.each([
    `postgresql://postgres.${SANDBOX_REF}:${PASSWORD}@attacker.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres.${SANDBOX_REF}:${PASSWORD}@${SHARED_HOST}:6432/postgres`,
    `postgresql://post%ZZgres:${PASSWORD}@${SHARED_HOST}:5432/postgres`,
  ])("rejects malformed or unsupported protected URL %#", (databaseUrl) => {
    expect(() => sanitizeMoneyDatabaseUrlForPsql(databaseUrl, "sandbox")).toThrow();
  });
});
