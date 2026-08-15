import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { PGMQ_EMAIL_WRAPPER_GRANT_MIGRATIONS } from "../lib/pgmqEmailWrapperGrantRules";

const packageJson = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8")) as {
  scripts: Record<string, string>;
};
const harness = readFileSync(
  resolve(__dirname, "../../scripts/run-pgmq-email-wrapper-grants-db-security.ts"),
  "utf8",
);
const privilegeMatrix = readFileSync(
  resolve(__dirname, "../../scripts/run-privilege-matrix-preflight.ts"),
  "utf8",
);

describe("pgmq email wrapper grants DB security harness wiring", () => {
  it("is registered under the opt-in local-security-lane flag", () => {
    expect(packageJson.scripts["test:pgmq-email-wrapper-grants-db-security"]).toBe(
      "bun run scripts/run-pgmq-email-wrapper-grants-db-security.ts --confirm-local-security-lane",
    );
  });

  it("is folded into the aggregate test:security-db-local lane", () => {
    expect(packageJson.scripts["test:security-db-local"]).toContain(
      "bun run test:pgmq-email-wrapper-grants-db-security",
    );
  });

  it("requires local loopback Supabase and refuses non-local hosts", () => {
    expect(harness).toContain("isLoopbackHost");
    expect(harness).toContain("local security lane requires loopback SUPABASE_DB_URL");
  });

  it("imports the resolved grant contract rather than duplicating function names", () => {
    expect(harness).toContain('from "../src/lib/pgmqEmailWrapperGrantRules"');
    expect(harness).toContain("PGMQ_EMAIL_WRAPPER_FUNCTIONS");
    expect(harness).toContain("TRIGGER_DEFINER_FUNCTIONS");
    expect(privilegeMatrix).toContain('from "../src/lib/pgmqEmailWrapperGrantRules"');
  });

  it("proves causation across all three files, including the recorded no-op", () => {
    expect(harness).toContain("PGMQ_EMAIL_WRAPPER_GRANT_MIGRATIONS.wrappers");
    expect(harness).toContain("PGMQ_EMAIL_WRAPPER_GRANT_MIGRATIONS.triggerNoop");
    expect(harness).toContain("PGMQ_EMAIL_WRAPPER_GRANT_MIGRATIONS.publicRevoke");
    expect(harness).toContain("is a no-op against PUBLIC");
    expect(harness).toContain("psqlFile(");
    expect(PGMQ_EMAIL_WRAPPER_GRANT_MIGRATIONS.wrappers).toContain("20260815054529");
    expect(PGMQ_EMAIL_WRAPPER_GRANT_MIGRATIONS.triggerNoop).toContain("20260815054605");
    expect(PGMQ_EMAIL_WRAPPER_GRANT_MIGRATIONS.publicRevoke).toContain("20260815054645");
  });

  it("re-creates the hole via PUBLIC, the path the production regression travels", () => {
    expect(harness).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+%s\s+TO\s+PUBLIC/i);
    expect(harness).toContain("function publicHasExecute(");
    expect(harness).toContain("a.grantee = 0");
    expect(harness).toContain("acldefault('f', p.proowner)");
    expect(harness).not.toContain("has_function_privilege('public'");
  });

  it("never mutates grants against a non-loopback database", () => {
    expect(harness).toContain("function dbUrlOrSkip()");
    expect(harness).toMatch(/isLoopbackHost\(host\)\s*\?\s*dbUrl\s*:\s*null/);
  });

  it("restores the intended grant posture even when an assertion fails", () => {
    expect(harness).toContain("} finally {");
    expect(harness).toContain("restoreIntendedGrants");
  });

  it("probes privilege directly rather than invoking the RPCs", () => {
    expect(harness).toContain("has_function_privilege(");
    expect(harness).not.toMatch(/\.rpc\(/);
  });

  it("matches published #989 trigger posture: no service-role EXECUTE after restore", () => {
    expect(harness).toContain("grant_staff_role_for_verified_allowlist");
    expect(harness).toContain("forbids service-role EXECUTE on trigger definers");
    expect(harness).toMatch(
      /REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role/,
    );
  });
});
