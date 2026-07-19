import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const MIGRATION = readFileSync(
  resolve(
    ROOT,
    "supabase/migrations/20260719035000_add_ai_doctor_sessions_user_delete_cascade.sql",
  ),
  "utf8",
);
const HARNESS = readFileSync(
  resolve(ROOT, "scripts/run-ai-doctor-sessions-rls-harness.ts"),
  "utf8",
);

describe("AI Doctor session account-deletion integrity", () => {
  it("fails closed on existing orphans before adding the cascade constraint", () => {
    expect(MIGRATION).toContain("FROM public.ai_doctor_sessions AS session_row");
    expect(MIGRATION).toContain("WHERE NOT EXISTS (");
    expect(MIGRATION).toContain("FROM auth.users AS auth_user");
    expect(MIGRATION).toContain("auth_user.id = session_row.user_id");
    expect(MIGRATION).toContain("IF orphan_count > 0 THEN");
    expect(MIGRATION).toContain("ai_doctor_sessions contains orphaned user rows");
    expect(MIGRATION).toContain("Resolve retention with an explicit operator decision");
    expect(MIGRATION.indexOf("IF orphan_count > 0 THEN")).toBeLessThan(
      MIGRATION.indexOf("ADD CONSTRAINT ai_doctor_sessions_user_id_fkey"),
    );
  });

  it("adds and fully validates the auth-user cascade without cleanup DML", () => {
    expect(MIGRATION).toMatch(
      /ADD CONSTRAINT ai_doctor_sessions_user_id_fkey\s+FOREIGN KEY \(user_id\)\s+REFERENCES auth\.users\(id\)\s+ON DELETE CASCADE\s+NOT VALID;/,
    );
    expect(MIGRATION).toContain("VALIDATE CONSTRAINT ai_doctor_sessions_user_id_fkey;");
    expect(MIGRATION.toLowerCase()).not.toMatch(/\bdelete\s+from\b/);
    expect(MIGRATION.toLowerCase()).not.toMatch(/\bupdate\s+public\./);
    expect(MIGRATION.toLowerCase()).not.toContain("create policy");
    expect(MIGRATION.toLowerCase()).not.toContain("grant ");
    expect(MIGRATION.toLowerCase()).not.toContain("revoke ");
  });

  it("runtime-proves cascade isolation and rejects nonexistent owners", () => {
    expect(HARNESS).toContain("createUser(emailCascade, passwordCascade)");
    expect(HARNESS).toContain("signedInClient(emailCascade, passwordCascade)");
    expect(HARNESS).toContain("dedicated owner inserts a scope-null session for cascade proof");
    expect(HARNESS).toContain("admin.auth.admin.deleteUser(cascadeUserId)");
    expect(HARNESS).toContain("deleting an auth user cascades only that user's AI Doctor session");
    expect(HARNESS).toContain("auth-user cascade leaves another owner's session intact");
    expect(HARNESS).toContain("auth-user constraint rejects a nonexistent AI Doctor session owner");
    expect(HARNESS).toContain('error?.code === "23503"');
    expect(HARNESS).toContain("!readError && !rejectedSession");

    const cascadeAssertion = HARNESS.indexOf(
      "deleting an auth user cascades only that user's AI Doctor session",
    );
    const fallbackCleanup = HARNESS.indexOf(
      'admin.from("ai_doctor_sessions").delete().in("user_id", userIds)',
    );
    expect(cascadeAssertion).toBeGreaterThanOrEqual(0);
    expect(fallbackCleanup).toBeGreaterThan(cascadeAssertion);
    expect(HARNESS).toContain("[uidA, uidB, cascadeFixtureUserId]");
    expect(HARNESS).toContain("[uidA, uidB, uidCascade]");
    expect(HARNESS).toContain("for (const userId of authUserIds)");
  });
});
