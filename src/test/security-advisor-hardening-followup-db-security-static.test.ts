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
    // Deliberately re-opens the hole ON THE OBJECT THIS MIGRATION CHANGES.
    // Probing a different object (an earlier draft used lead_events, whose
    // grants belong to 20260807003500) makes the close step unsatisfiable.
    expect(harness).toContain("function grantAnonQuicklogExecute(");
    expect(harness).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+%s\s+TO\s+anon/i);
    // ...re-applies ONLY the migration under test...
    expect(harness).toContain("20260807150000_quicklog_save_manual_all_overloads.sql");
    expect(harness).toContain("psqlFile(");
    // ...and asserts the deny transition is caused by that file.
    expect(harness).toContain("deny transition caused by THIS file");
  });

  it("probes the privilege directly rather than invoking the RPC", () => {
    // Calling quicklog_save_manual to answer a grant question would run real
    // business logic as a side effect of a privilege check.
    expect(harness).toContain("function anonHasQuicklogExecute(");
    expect(harness).toContain("has_function_privilege('anon', p.oid, 'EXECUTE')");
  });

  it("re-creates the hole via PUBLIC, the path the production regression travels", () => {
    // Postgres grants EXECUTE on new functions to PUBLIC by default and anon
    // inherits through it. A negative control that granted only anon directly
    // would be satisfied by a migration revoking anon but omitting PUBLIC --
    // leaving a real default-ACL overload anonymously executable.
    expect(harness).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+%s\s+TO\s+PUBLIC/i);
    expect(harness).toContain("function publicHasQuicklogExecute(");
  });

  it("reads the PUBLIC ACL by grantee OID 0, never by resolving 'public' as a role", () => {
    // PUBLIC is a pseudo-role and has no pg_roles row, so name resolution
    // errors rather than answering the question.
    expect(harness).toContain("aclexplode(");
    expect(harness).toMatch(/a\.grantee\s*=\s*0/);
    expect(harness).not.toContain("has_function_privilege('public'");
  });

  it("treats a NULL proacl as the built-in default (PUBLIC holds EXECUTE)", () => {
    // A function that never had an explicit GRANT/REVOKE has proacl = NULL,
    // which means the default ACL — and for functions that INCLUDES PUBLIC
    // EXECUTE. Reading bare proacl would report the hole closed on exactly
    // the freshly-created-overload case this migration defends against.
    expect(harness).toContain("acldefault('f', p.proowner)");
    expect(harness).toMatch(/COALESCE\(\s*p\.proacl/i);
  });

  it("asserts the migration revokes PUBLIC too, not just anon", () => {
    expect(harness).toContain(
      "negative control re-creates the PUBLIC privilege path, not just a direct anon grant",
    );
    expect(harness).toContain("migration revokes PUBLIC too, not just anon");
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
    expect(harness).toMatch(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+%s\s+FROM\s+PUBLIC,\s*anon/i);
  });
});
