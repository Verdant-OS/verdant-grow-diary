/**
 * Static invariant: refund-retire RPC atomically flips BOTH the founder
 * subscription row AND the founders row, and is service-role only.
 *
 * If a future refactor updates only one, or grants EXECUTE to
 * anon/authenticated, the invariant is broken and this test fails.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");
const REVOKE_MIGRATION = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .reverse()
  .map((f) => readFileSync(resolve(MIGRATIONS_DIR, f), "utf8"))
  .find((sql) =>
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.revoke_lovable_founder_lifetime_by_transaction\s*\(/i.test(sql),
  );

describe("revoke_lovable_founder_lifetime_by_transaction — refund-retire invariant", () => {
  it("migration exists", () => {
    expect(REVOKE_MIGRATION).toBeTruthy();
  });

  it("cancels the subscription row (revokes Pro-level access)", () => {
    expect(REVOKE_MIGRATION!).toMatch(
      /UPDATE\s+public\.subscriptions[\s\S]*?SET[\s\S]*?status\s*=\s*'canceled'/i,
    );
  });

  it("marks the founders row refunded (seat stays consumed, number preserved)", () => {
    expect(REVOKE_MIGRATION!).toMatch(
      /UPDATE\s+public\.founders[\s\S]*?SET[\s\S]*?status\s*=\s*'refunded'/i,
    );
  });

  it("uses the allocator subscription reference and live environment to find the founder", () => {
    expect(REVOKE_MIGRATION!).toMatch(
      /f\.paddle_subscription_ref\s*=\s*v_pseudo_sub_id/i,
    );
    expect(REVOKE_MIGRATION!).toMatch(/WHERE\s+p_environment\s*=\s*\x27live\x27/i);
  });

  it("is SECURITY DEFINER with pinned search_path", () => {
    expect(REVOKE_MIGRATION!).toMatch(/SECURITY\s+DEFINER/i);
    expect(REVOKE_MIGRATION!).toMatch(/SET\s+search_path\s*=\s*public/i);
  });

  it("revokes EXECUTE from anon/authenticated and grants only to service_role", () => {
    expect(REVOKE_MIGRATION!).toMatch(
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.revoke_lovable_founder_lifetime_by_transaction[\s\S]*?FROM[\s\S]*?anon[\s\S]*?authenticated/i,
    );
    expect(REVOKE_MIGRATION!).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.revoke_lovable_founder_lifetime_by_transaction[\s\S]*?TO\s+service_role/i,
    );
  });

  it("does NOT delete the founders row (seat must stay consumed)", () => {
    expect(REVOKE_MIGRATION!).not.toMatch(/DELETE\s+FROM\s+public\.founders/i);
  });

  it("does NOT reset founder_number (number is immutable per Turn A trigger)", () => {
    expect(REVOKE_MIGRATION!).not.toMatch(/UPDATE\s+public\.founders[\s\S]*?founder_number\s*=/i);
  });
});
