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

  // Copilot review on PR #808: the end-state assertions above are ALSO
  // satisfied by supabase/seed.sql, which independently performs the same
  // REVOKE/GRANT after migrations run -- so they passed whether or not the
  // migration under test executed. These pin the causation phase that
  // closes that hole.
  it("proves causation, not just end state: re-opens the hole and re-applies the migration", () => {
    expect(harness).toContain("async function checkMigrationCausesTheTransition()");
    // Deliberately re-opens the hole...
    expect(harness).toMatch(/GRANT\s+SELECT\s+ON\s+TABLE\s+public\.lead_events\s+TO\s+anon/i);
    // ...re-applies ONLY the migration under test...
    expect(harness).toContain("20260807150000_quicklog_save_manual_all_overloads.sql");
    expect(harness).toContain("psqlFile(");
    // ...and asserts the deny transition is caused by that file.
    expect(harness).toContain("deny transition caused by THIS file");
  });

  it("includes a negative control so the probe cannot pass vacuously", () => {
    // If the probe cannot SEE a genuinely open hole, every other assertion
    // in this harness is unfalsifiable.
    expect(harness).toContain("negative control: probe detects the anon hole");
  });

  it("never mutates grants against a non-loopback database", () => {
    expect(harness).toContain("function dbUrlOrSkip()");
    expect(harness).toMatch(/isLoopbackHost\(host\)\s*\?\s*dbUrl\s*:\s*null/);
  });

  it("reports a missing causation prerequisite as a FAILURE, never a silent skip", () => {
    // A soft skip here would restore exactly the vacuity this phase exists
    // to remove.
    expect(harness).toContain("causation proof ran (needs loopback SUPABASE_DB_URL + psql)");
    expect(harness).toContain("causation NOT proven");
  });

  it("restores the intended grant posture even when an assertion fails", () => {
    expect(harness).toContain("} finally {");
    expect(harness).toMatch(
      /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.lead_events\s+FROM\s+PUBLIC,\s*anon/i,
    );
  });
});
