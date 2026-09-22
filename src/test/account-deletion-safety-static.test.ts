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
  it.each([
    { status: 409, errorCode: null, expected: DELETE_ACCOUNT_BILLING_FAILURE },
    {
      status: 500,
      errorCode: "billing_cancellation_failed",
      expected: DELETE_ACCOUNT_BILLING_FAILURE,
    },
    { status: 500, errorCode: "storage_cleanup_failed", expected: DELETE_ACCOUNT_GENERIC_FAILURE },
    { status: 500, errorCode: "session_revoke_failed", expected: DELETE_ACCOUNT_GENERIC_FAILURE },
    { status: 500, errorCode: "delete_failed", expected: DELETE_ACCOUNT_GENERIC_FAILURE },
    {
      status: null,
      errorCode: "billing_cancellation_failed",
      expected: DELETE_ACCOUNT_BILLING_FAILURE,
    },
  ])(
    "maps deleteAccountFailureMessage(status=$status, errorCode=$errorCode) to the correct copy",
    ({ status, errorCode, expected }) => {
      expect(deleteAccountFailureMessage(status, errorCode)).toBe(expected);
    },
  );

  it("maps billing workflow failures to HTTP 409 and other failures to HTTP 500", () => {
    expect(EDGE).toMatch(
      /result\.error === ["']billing_cancellation_failed["']\s*\?\s*409\s*:\s*500/,
    );
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
    // Whitespace-tolerant: prettier may wrap this sentence across JSX lines.
    expect(SETTINGS).toMatch(/Any recurring Paddle subscription is\s+canceled/);
    expect(SETTINGS).toContain("Deletion does not automatically");
    expect(SETTINGS).toContain("issue a refund");
    expect(SETTINGS).toContain("Cancel billing and delete");
    expect(SETTINGS).not.toContain(
      "deletion does not automatically\n              cancel Paddle billing",
    );
  });
});
