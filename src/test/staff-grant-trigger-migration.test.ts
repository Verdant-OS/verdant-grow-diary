import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Static guard for the staff-grant trigger migration.
 *
 * The trigger MUST:
 *   - only grant staff when email_confirmed_at IS NOT NULL
 *   - only match the exact allow-list emails (matt@verdantgrowdiary.com,
 *     cheekhimself@gmail.com), case-insensitively via lower()
 *   - be wired for both INSERT and email-confirmation UPDATE
 *
 * Runtime behavior is verified separately by
 * scripts/run-staff-grant-trigger-harness.ts.
 */
const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const TRIGGER_FN = "grant_staff_role_for_verified_allowlist";

function loadTriggerMigration(): string {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  const matches = files
    .map((f) => ({ f, sql: readFileSync(path.join(MIGRATIONS_DIR, f), "utf8") }))
    .filter((x) => x.sql.includes(TRIGGER_FN));
  if (matches.length === 0) throw new Error(`no migration defines ${TRIGGER_FN}`);
  // Use the latest migration that defines the function.
  matches.sort((a, b) => a.f.localeCompare(b.f));
  return matches[matches.length - 1].sql;
}

describe("staff-grant trigger migration", () => {
  const sql = loadTriggerMigration();

  it("defines the SECURITY DEFINER function", () => {
    expect(sql).toMatch(
      new RegExp(`CREATE OR REPLACE FUNCTION\\s+public\\.${TRIGGER_FN}`, "i"),
    );
    expect(sql).toMatch(/SECURITY DEFINER/i);
    expect(sql).toMatch(/SET search_path\s*=\s*public/i);
  });

  it("gates on email_confirmed_at IS NOT NULL", () => {
    expect(sql).toMatch(/email_confirmed_at\s+IS\s+NULL/i);
    // The gate returns early on unconfirmed users.
    expect(sql).toMatch(/IF\s+NEW\.email_confirmed_at\s+IS\s+NULL[\s\S]*RETURN\s+NEW/i);
  });

  it("matches ONLY the exact allow-list emails, case-insensitively", () => {
    expect(sql).toMatch(/lower\s*\(\s*NEW\.email\s*\)/i);
    expect(sql).toContain("'matt@verdantgrowdiary.com'");
    expect(sql).toContain("'cheekhimself@gmail.com'");
    // No wildcard/like/regex/domain-only matches sneaking in.
    expect(sql).not.toMatch(/NEW\.email\s+LIKE/i);
    // Domain-only match (e.g. right-hand side of `LIKE '%@verdantgrowdiary.com'`) forbidden.
    expect(sql).not.toMatch(/'%@verdantgrowdiary\.com'/i);
    expect(sql).not.toMatch(/split_part\s*\(\s*NEW\.email/i);
  });

  it("inserts the staff role with ON CONFLICT DO NOTHING", () => {
    expect(sql).toMatch(/INSERT INTO\s+public\.user_roles/i);
    expect(sql).toMatch(/'staff'::public\.app_role/i);
    expect(sql).toMatch(/ON CONFLICT\s*\(\s*user_id\s*,\s*role\s*\)\s*DO NOTHING/i);
  });

  it("wires the trigger for INSERT on auth.users", () => {
    expect(sql).toMatch(
      /CREATE TRIGGER\s+on_auth_user_created_grant_staff[\s\S]*AFTER INSERT ON auth\.users[\s\S]*EXECUTE FUNCTION\s+public\.grant_staff_role_for_verified_allowlist/i,
    );
  });

  it("wires the trigger for email confirmation UPDATE on auth.users", () => {
    expect(sql).toMatch(
      /CREATE TRIGGER\s+on_auth_user_confirmed_grant_staff[\s\S]*AFTER UPDATE OF email_confirmed_at ON auth\.users/i,
    );
    // Only fire when transitioning NULL -> NOT NULL.
    expect(sql).toMatch(
      /WHEN\s*\(\s*OLD\.email_confirmed_at\s+IS\s+NULL\s+AND\s+NEW\.email_confirmed_at\s+IS\s+NOT\s+NULL\s*\)/i,
    );
  });

  it("backfill is scoped to confirmed + exact allow-list", () => {
    // Backfill query must include both the confirmation gate and the exact emails.
    expect(sql).toMatch(/email_confirmed_at\s+IS\s+NOT\s+NULL/i);
    const backfillSection = sql.slice(sql.indexOf("INSERT INTO public.user_roles"));
    expect(backfillSection).toContain("'matt@verdantgrowdiary.com'");
    expect(backfillSection).toContain("'cheekhimself@gmail.com'");
  });
});
