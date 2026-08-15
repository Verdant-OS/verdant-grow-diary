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
    expect(executable).not.toMatch(/DROP\s+FUNCTION\s+public\.enqueue_email/i);
    expect(executable).not.toMatch(/DROP\s+FUNCTION\s+public\.read_email_batch/i);
    expect(executable).not.toMatch(/DROP\s+FUNCTION\s+public\.delete_email/i);
    expect(executable).not.toMatch(/DROP\s+FUNCTION\s+public\.move_to_dlq/i);
    expect(executable).not.toMatch(
      /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.enqueue_email/i,
    );
    expect(executable).not.toMatch(
      /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.read_email_batch/i,
    );
    expect(executable).not.toMatch(
      /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.delete_email/i,
    );
    expect(executable).not.toMatch(
      /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.move_to_dlq/i,
    );
  });

  it("revokes EXECUTE from PUBLIC, anon, and authenticated on every wrapper", () => {
    expect(executable).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.enqueue_email\s*\(\s*text\s*,\s*jsonb\s*\)\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/i,
    );
    expect(executable).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.read_email_batch\s*\(\s*text\s*,\s*integer\s*,\s*integer\s*\)\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/i,
    );
    expect(executable).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.delete_email\s*\(\s*text\s*,\s*bigint\s*\)\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/i,
    );
    expect(executable).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.move_to_dlq\s*\(\s*text\s*,\s*text\s*,\s*bigint\s*,\s*jsonb\s*\)\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/i,
    );
  });

  it("re-affirms EXECUTE for service_role on every wrapper", () => {
    expect(executable).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.enqueue_email\s*\(\s*text\s*,\s*jsonb\s*\)\s+TO\s+service_role/i,
    );
    expect(executable).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.read_email_batch\s*\(\s*text\s*,\s*integer\s*,\s*integer\s*\)\s+TO\s+service_role/i,
    );
    expect(executable).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.delete_email\s*\(\s*text\s*,\s*bigint\s*\)\s+TO\s+service_role/i,
    );
    expect(executable).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.move_to_dlq\s*\(\s*text\s*,\s*text\s*,\s*bigint\s*,\s*jsonb\s*\)\s+TO\s+service_role/i,
    );
  });

  it("postcondition uses has_function_privilege and fails closed", () => {
    expect(executable).toMatch(/has_function_privilege\(\s*'anon'/i);
    expect(executable).toMatch(/has_function_privilege\(\s*'authenticated'/i);
    expect(executable).toMatch(/has_function_privilege\(\s*'service_role'/i);
    expect(executable).toMatch(/RAISE\s+EXCEPTION/i);
    expect(executable).toContain("enqueue_email");
    expect(executable).toContain("read_email_batch");
    expect(executable).toContain("delete_email");
    expect(executable).toContain("move_to_dlq");
  });

  it("documents PUBLIC-inheritance rollback in header comments", () => {
    expect(raw).toMatch(/inherited EXECUTE via PUBLIC/i);
    expect(raw).toMatch(/Rollback/i);
  });
});
