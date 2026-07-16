import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const HARNESS = readFileSync(
  resolve(process.cwd(), "scripts/run-subscriber-interest-rls-harness.ts"),
  "utf8",
);

describe("subscriber-interest RLS harness cleanup", () => {
  it("deletes and verifies the trigger-created profile before deleting the auth user", () => {
    const profileDelete = HARNESS.indexOf('.from("profiles")\n        .delete()');
    const profileVerify = HARNESS.indexOf('.from("profiles")\n          .select("user_id")');
    const authDelete = HARNESS.indexOf("admin.auth.admin.deleteUser(authUserId)");

    expect(profileDelete).toBeGreaterThan(-1);
    expect(profileVerify).toBeGreaterThan(profileDelete);
    expect(authDelete).toBeGreaterThan(profileVerify);
    expect(HARNESS).toContain('.eq("user_id", authUserId)');
    expect(HARNESS).not.toContain('.eq("id", authUserId)');
    expect(HARNESS).toContain("synthetic profile remains");
  });

  it("fails the runtime harness when profile or auth teardown is incomplete", () => {
    expect(HARNESS).toContain("profile delete:");
    expect(HARNESS).toContain("profile cleanup verification:");
    expect(HARNESS).toContain("auth user delete:");
    expect(HARNESS).toContain("throw new Error(`teardown failed:");
  });
});
