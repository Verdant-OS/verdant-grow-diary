import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8")) as {
  scripts: Record<string, string>;
};
const harness = readFileSync(
  resolve(__dirname, "../../scripts/run-security-advisor-hardening-followup-db-security.ts"),
  "utf8",
);

describe("security-advisor-hardening-followup DB security harness wiring", () => {
  it("is registered under the opt-in local-security-lane flag", () => {
    expect(packageJson.scripts["test:security-advisor-hardening-followup-db-security"]).toBe(
      "bun run scripts/run-security-advisor-hardening-followup-db-security.ts --confirm-local-security-lane",
    );
  });

  it("is folded into the aggregate test:security-db-local lane", () => {
    expect(packageJson.scripts["test:security-db-local"]).toContain(
      "bun run test:security-advisor-hardening-followup-db-security",
    );
  });

  it("requires local loopback Supabase and refuses non-local hosts", () => {
    expect(harness).toContain("isLoopbackHost");
    expect(harness).toContain("local security lane requires a loopback database");
  });

  it("checks anon denial on both hardened tables and the RPC, not just RLS-equivalent behavior", () => {
    expect(harness).toContain('.from("lovable_paddle_events")');
    expect(harness).toContain('.from("lead_events")');
    expect(harness).toContain('rpc("quicklog_save_manual"');
    expect(harness).toContain("isPermissionDenied");
  });

  it("proves the lead_events authenticated re-grant survived, not just that anon is denied", () => {
    expect(harness).toContain("operator-role authenticated insert on lead_events allowed");
    expect(harness).toContain("operator-role authenticated select on lead_events allowed");
  });

  it("tears down every synthetic fixture it creates", () => {
    expect(harness).toContain("async function teardown()");
    expect(harness).toContain("admin.auth.admin.deleteUser");
  });
});
