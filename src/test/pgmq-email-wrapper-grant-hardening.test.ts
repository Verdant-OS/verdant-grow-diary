/**
 * Static contract pin for pgmq email wrapper EXECUTE grant hardening:
 *   supabase/migrations/20260815054529_restrict_pgmq_email_wrappers_to_service_role.sql
 *
 * These SECURITY DEFINER wrappers expose PostgREST RPC endpoints into pgmq.
 * The trust boundary is EXECUTE grants: service_role only, never anon/authenticated,
 * and never via PUBLIC inheritance.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MIGRATION = resolve(
  ROOT,
  "supabase/migrations/20260815054529_restrict_pgmq_email_wrappers_to_service_role.sql",
);

const WRAPPERS = [
  "enqueue_email(text, jsonb)",
  "read_email_batch(text, integer, integer)",
  "delete_email(text, bigint)",
  "move_to_dlq(text, text, bigint, jsonb)",
] as const;

describe("pgmq email wrapper grant hardening migration", () => {
  const raw = existsSync(MIGRATION) ? readFileSync(MIGRATION, "utf8") : "";
  const executable = raw
    .replace(/\r\n?/g, "\n")
    .replace(/^\s*--.*$/gm, "")
    .trim();

  it("migration file exists", () => {
    expect(existsSync(MIGRATION)).toBe(true);
  });

  it("is additive: no CREATE OR REPLACE / DROP of the wrapper functions", () => {
    for (const fn of WRAPPERS) {
      const name = fn.split("(")[0];
      expect(executable).not.toMatch(
        new RegExp(`DROP\\s+FUNCTION\\s+public\\.${name}`, "i"),
      );
      expect(executable).not.toMatch(
        new RegExp(`CREATE\\s+(OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${name}`, "i"),
      );
    }
  });

  it("revokes EXECUTE from PUBLIC, anon, and authenticated on every wrapper", () => {
    for (const sig of WRAPPERS) {
      expect(executable).toMatch(
        new RegExp(
          `REVOKE\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${sig.replace(/[()]/g, "\\$&")}[\\s\\S]*?FROM\\s+PUBLIC\\s*,\\s*anon\\s*,\\s*authenticated`,
          "i",
        ),
      );
    }
  });

  it("re-affirms EXECUTE for service_role on every wrapper", () => {
    for (const sig of WRAPPERS) {
      expect(executable).toMatch(
        new RegExp(
          `GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${sig.replace(/[()]/g, "\\$&")}[\\s\\S]*?TO\\s+service_role`,
          "i",
        ),
      );
    }
  });

  it("postcondition uses has_function_privilege and fails closed", () => {
    expect(executable).toMatch(/has_function_privilege\(\s*'anon'/i);
    expect(executable).toMatch(/has_function_privilege\(\s*'authenticated'/i);
    expect(executable).toMatch(/has_function_privilege\(\s*'service_role'/i);
    expect(executable).toMatch(/RAISE\s+EXCEPTION/i);
    for (const name of ["enqueue_email", "read_email_batch", "delete_email", "move_to_dlq"]) {
      expect(executable).toContain(name);
    }
  });

  it("documents PUBLIC-inheritance rollback in header comments", () => {
    expect(raw).toMatch(/inherited EXECUTE via PUBLIC/i);
    expect(raw).toMatch(/Rollback/i);
  });
});
