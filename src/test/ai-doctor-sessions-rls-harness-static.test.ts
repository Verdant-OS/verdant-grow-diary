import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const HARNESS = readFileSync(
  resolve(ROOT, "scripts/run-ai-doctor-sessions-rls-harness.ts"),
  "utf8",
);
const PACKAGE = readFileSync(resolve(ROOT, "package.json"), "utf8");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/security-db-local.yml"), "utf8");

describe("AI Doctor sessions runtime RLS harness contract", () => {
  it("defaults to no-op and refuses production even with remote acknowledgement", () => {
    expect(HARNESS).toContain('const CONFIRM_ENV = "AI_DOCTOR_SESSIONS_RLS_HARNESS"');
    expect(HARNESS).toContain('process.env[CONFIRM_ENV] !== "1"');
    expect(HARNESS).toContain(
      'const REMOTE_CONFIRM_ENV = "AI_DOCTOR_SESSIONS_RLS_HARNESS_ALLOW_REMOTE"',
    );
    expect(HARNESS).toContain(
      'const EXPECTED_REMOTE_REF_ENV = "AI_DOCTOR_SESSIONS_RLS_HARNESS_EXPECTED_PROJECT_REF"',
    );
    expect(HARNESS).toContain('const LOCAL_LANE_FLAG = "--confirm-local-security-lane"');
    expect(HARNESS).toContain('process.env[REMOTE_CONFIRM_ENV] === "1"');
    expect(HARNESS).toContain('const PRODUCTION_PROJECT_REF = "knkwiiywfkbqznbxwqfh"');
    expect(HARNESS).toContain('hostname.toLowerCase().replace(/\\.$/, "")');
    expect(HARNESS).toContain("refusing Verdant production database");
    expect(HARNESS.indexOf("refusing Verdant production database")).toBeLessThan(
      HARNESS.indexOf('process.env[REMOTE_CONFIRM_ENV] === "1"'),
    );
    expect(HARNESS).toContain("expectedRemoteRef !== PRODUCTION_PROJECT_REF");
    expect(HARNESS).toContain("hostname === expectedRemoteHost");
    expect(HARNESS).toContain("local security lane requires a loopback database");
  });

  it("recognizes every supported local Supabase hostname", () => {
    expect(HARNESS).toContain('hostname === "localhost"');
    expect(HARNESS).toContain('hostname === "127.0.0.1"');
    expect(HARNESS).toContain('hostname === "[::1]"');
    expect(HARNESS).toContain('hostname === "::1"');
  });

  it("uses two real authenticated owners and an anonymous client", () => {
    expect(HARNESS).toContain("createUser(emailA, passwordA)");
    expect(HARNESS).toContain("createUser(emailB, passwordB)");
    expect(HARNESS).toContain("signedInClient(emailA, passwordA)");
    expect(HARNESS).toContain("signedInClient(emailB, passwordB)");
    expect(HARNESS).toContain("const anonymous = createClient(SUPABASE_URL, ANON_KEY");
    expect(HARNESS).toContain('seedScopes(uidA, "A")');
    expect(HARNESS).toContain('seedScopes(uidB, "B")');
  });

  it("proves owner access, cross-user isolation, and every scoped insert fence", () => {
    expect(HARNESS).toContain("owner inserts a fully owned session with explicit user_id");
    expect(HARNESS).toContain("auth.uid default records the signed-in owner");
    expect(HARNESS).toContain("owner listing contains only that owner's sessions");
    expect(HARNESS).toContain("another owner cannot read a known foreign session");
    expect(HARNESS).toContain("foreign ${field} filter does not reveal another owner's sessions");
    expect(HARNESS).toContain("owner cannot forge another user's user_id");
    expect(HARNESS).toContain("owner cannot reference another user's grow");
    expect(HARNESS).toContain("owner cannot reference another user's tent");
    expect(HARNESS).toContain("owner cannot reference another user's plant");
    expect(HARNESS).toContain('return error?.code === "42501"');
    expect(HARNESS).toContain("function isDeniedOrNoRows(");
  });

  it("requires authoritative readback after every rejected mutation", () => {
    expect(HARNESS).toContain("async function assertRejectedInsert(");
    expect(HARNESS).toContain("const { data: stored, error: readError } = await readSession");
    expect(HARNESS).toContain('["owner", ownerA]');
    expect(HARNESS).toContain('["another user", ownerB]');
    expect(HARNESS).toContain("${actor} cannot update persisted history");
    expect(HARNESS).toContain("${actor} cannot delete persisted history");
    expect(HARNESS).toContain(
      'actor === "owner" ? isDenied(error) : isDeniedOrNoRows(error, data)',
    );
    expect(HARNESS).toContain("anonymous SELECT cannot read persisted history");
    expect(HARNESS).toContain("anonymous INSERT cannot create persisted history");
    expect(HARNESS).toContain("anonymous UPDATE cannot alter persisted history");
    expect(HARNESS).toContain("anonymous DELETE cannot remove persisted history");
    expect(HARNESS).toContain("isIntactSession(protectedRow");
    expect(HARNESS).toContain("isDeniedOrNoRows(error, data)");
    expect(HARNESS).not.toContain("data?.length === 0)\n      check(");
  });

  it("cleans fixtures in dependency order and fails visibly on cleanup errors", () => {
    const cleanupOrder = [
      'admin.from("ai_doctor_sessions").delete()',
      'admin.from("plants").delete()',
      'admin.from("tents").delete()',
      'admin.from("grows").delete()',
      'admin.from("profiles").delete()',
      "admin.auth.admin.deleteUser(userId)",
    ];
    for (const operation of cleanupOrder) {
      expect(HARNESS.indexOf(operation)).toBeGreaterThanOrEqual(0);
    }
    for (let index = 1; index < cleanupOrder.length; index += 1) {
      expect(HARNESS.indexOf(cleanupOrder[index - 1])).toBeLessThan(
        HARNESS.indexOf(cleanupOrder[index]),
      );
    }
    expect(HARNESS).toContain("cleanupFailures");
    expect(HARNESS).toContain("cleanup failures for");
    expect(HARNESS).not.toContain("deleteUser(userId).catch");
  });

  it("is exposed through an opt-in package command and the local DB workflow", () => {
    expect(PACKAGE).toContain('"test:ai-doctor-sessions-rls"');
    expect(PACKAGE).toContain('"test:ai-doctor-sessions-rls:local-lane"');
    expect(PACKAGE).toContain("bun run test:ai-doctor-sessions-rls:local-lane");
    expect(WORKFLOW).toContain('AI_DOCTOR_SESSIONS_RLS_HARNESS: "1"');
    expect(WORKFLOW).toContain("bun run test:ai-doctor-sessions-rls");
  });
});
