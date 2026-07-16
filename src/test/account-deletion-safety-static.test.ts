import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DELETE_ACCOUNT_BILLING_FAILURE,
  DELETE_ACCOUNT_GENERIC_FAILURE,
  deleteAccountFailureMessage,
} from "@/lib/accountDeletion";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const EDGE = read("supabase/functions/delete-account/index.ts");
const SETTINGS = read("src/pages/Settings.tsx");

describe("account deletion billing and data safety", () => {
  it("maps provider cancellation failure to an honest, actionable message", () => {
    expect(deleteAccountFailureMessage(409, null)).toBe(DELETE_ACCOUNT_BILLING_FAILURE);
    expect(deleteAccountFailureMessage(500, "billing_cancellation_failed")).toBe(
      DELETE_ACCOUNT_BILLING_FAILURE,
    );
    expect(deleteAccountFailureMessage(500, "delete_failed")).toBe(DELETE_ACCOUNT_GENERIC_FAILURE);
  });

  it("uses the verified JWT for global session revocation, not the user id", () => {
    expect(EDGE).toMatch(/admin\.auth\.admin\.signOut\(jwt, ["']global["']\)/);
    expect(EDGE).not.toMatch(/admin\.auth\.admin\.signOut\(uid/);
  });

  it("cancels Paddle immediately and cleans Storage before Auth deletion", () => {
    expect(EDGE).toMatch(/effectiveFrom:\s*["']immediately["']/);
    expect(EDGE).toContain('.from("billing_subscriptions")');
    expect(EDGE).toContain("compileAccountSubscriptions");
    expect(EDGE).toContain("cleanupOwnedStorage(admin.storage, userId)");
    expect(EDGE.indexOf("executeAccountDeletion")).toBeLessThan(
      EDGE.indexOf("return json(200, { ok: true })"),
    );
  });

  it("makes the destructive UI disclose immediate cancellation and refund behavior", () => {
    expect(SETTINGS).toContain("Any recurring Paddle subscription is canceled");
    expect(SETTINGS).toContain("Deletion does not automatically");
    expect(SETTINGS).toContain("issue a refund");
    expect(SETTINGS).toContain("Cancel billing and delete");
    expect(SETTINGS).not.toContain(
      "deletion does not automatically\n              cancel Paddle billing",
    );
  });
});
