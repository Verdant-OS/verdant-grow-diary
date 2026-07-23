/**
 * Static contract pin for the unapplied ACL remediation:
 *   supabase/contract-migrations/quicklog_save_manual_revoke_anon_execute.sql
 *
 * The remediation lives in the audit lane (`supabase/contract-migrations/`)
 * and is intentionally NOT under `supabase/migrations/`, so the auto-apply
 * lane never picks it up. This test pins the reviewed SQL shape so a copy
 * into a real `supabase migration new` file preserves the exact contract:
 *
 *   - additive only (no CREATE OR REPLACE / DROP of the function)
 *   - targets the exact 11-argument overload signature
 *   - revokes EXECUTE from PUBLIC and anon
 *   - preserves EXECUTE for authenticated and service_role
 *   - postcondition loop covers EVERY overload of quicklog_save_manual and
 *     fails the transaction if anon still has EXECUTE or authenticated /
 *     service_role lose EXECUTE
 *   - only modifies quicklog_save_manual (no other object)
 *
 * If the reviewed SQL needs to change, update it and this pin together.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const CONTRACT_PATH =
  "supabase/contract-migrations/quicklog_save_manual_revoke_anon_execute.sql";
const abs = resolve(ROOT, CONTRACT_PATH);
const raw = existsSync(abs) ? readFileSync(abs, "utf8") : "";
// Strip SQL line comments so pins target executable statements only.
const executable = raw.replace(/^\s*--.*$/gm, "").trim();

const OVERLOAD_ARGS =
  "text, uuid, text, numeric, text, numeric, numeric, numeric,\n  timestamptz, jsonb, text";

describe("quicklog_save_manual revoke-anon-execute contract migration", () => {
  it("exists in the audit-lane directory (never under supabase/migrations/)", () => {
    expect(existsSync(abs)).toBe(true);
    const productionMigrations = existsSync(resolve(ROOT, "supabase/migrations"))
      ? readdirSync(resolve(ROOT, "supabase/migrations"))
      : [];
    for (const name of productionMigrations) {
      expect(
        name,
        `contract-migration must not be copied verbatim into supabase/migrations/ (${name})`,
      ).not.toContain("quicklog_save_manual_revoke_anon_execute");
    }
  });

  it("is additive: no DROP or CREATE OR REPLACE of the function", () => {
    expect(executable).not.toMatch(/DROP\s+FUNCTION\s+public\.quicklog_save_manual/i);
    expect(executable).not.toMatch(
      /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.quicklog_save_manual/i,
    );
  });

  it("targets the exact reviewed 11-argument overload signature", () => {
    // Every REVOKE/GRANT statement in the file must name the same overload.
    const revokeMatches = executable.match(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.quicklog_save_manual\s*\(([\s\S]*?)\)/gi,
    );
    const grantMatches = executable.match(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.quicklog_save_manual\s*\(([\s\S]*?)\)/gi,
    );
    expect(revokeMatches, "expected at least one REVOKE EXECUTE").toBeTruthy();
    expect(grantMatches, "expected at least one GRANT EXECUTE").toBeTruthy();
    for (const stmt of [...(revokeMatches ?? []), ...(grantMatches ?? [])]) {
      expect(stmt).toContain(OVERLOAD_ARGS);
    }
  });

  it("revokes EXECUTE from PUBLIC and anon", () => {
    expect(executable).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.quicklog_save_manual[\s\S]*?FROM\s+PUBLIC\s*,\s*anon/i,
    );
  });

  it("preserves EXECUTE for authenticated and service_role", () => {
    expect(executable).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.quicklog_save_manual[\s\S]*?TO\s+authenticated/i,
    );
    expect(executable).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.quicklog_save_manual[\s\S]*?TO\s+service_role/i,
    );
    // Must never re-grant to anon or PUBLIC.
    expect(executable).not.toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.quicklog_save_manual[\s\S]*?TO\s+(anon|PUBLIC)\b/i,
    );
  });

  it("iterates every overload in the postcondition (not just the reviewed signature)", () => {
    // The DO $$ ... $$ block must FOR-LOOP over pg_proc rows named
    // quicklog_save_manual in the public schema, so a stray overload cannot
    // silently retain anon EXECUTE.
    expect(executable).toMatch(/DO\s*\$\$/i);
    expect(executable).toMatch(/FROM\s+pg_proc\s+p[\s\S]*?p\.proname\s*=\s*'quicklog_save_manual'/i);
    expect(executable).toMatch(/FOR\s+bad\s+IN[\s\S]*?LOOP/i);
  });

  it("postcondition asserts every overload: anon=false, authenticated=true, service_role=true", () => {
    expect(executable).toMatch(/has_function_privilege\(\s*'anon'\s*,\s*p\.oid\s*,\s*'EXECUTE'\s*\)/i);
    expect(executable).toMatch(
      /has_function_privilege\(\s*'authenticated'\s*,\s*p\.oid\s*,\s*'EXECUTE'\s*\)/i,
    );
    expect(executable).toMatch(
      /has_function_privilege\(\s*'service_role'\s*,\s*p\.oid\s*,\s*'EXECUTE'\s*\)/i,
    );
    expect(executable).toMatch(/IF\s+bad\.anon_exec\s+THEN[\s\S]*?RAISE\s+EXCEPTION/i);
    expect(executable).toMatch(/IF\s+NOT\s+bad\.auth_exec\s+THEN[\s\S]*?RAISE\s+EXCEPTION/i);
    expect(executable).toMatch(/IF\s+NOT\s+bad\.svc_exec\s+THEN[\s\S]*?RAISE\s+EXCEPTION/i);
  });

  it("refuses to leave a hole if the function disappears", () => {
    expect(executable).toMatch(
      /overload_count\s*=\s*0[\s\S]*?RAISE\s+EXCEPTION\s+'quicklog_save_manual missing/i,
    );
  });

  it("wraps changes in a single transaction and reloads PostgREST", () => {
    expect(executable).toMatch(/^\s*BEGIN\s*;/m);
    expect(executable).toMatch(/COMMIT\s*;/);
    expect(executable).toMatch(/NOTIFY\s+pgrst\s*,\s*'reload schema'/i);
  });

  it("only touches quicklog_save_manual (no other object modified)", () => {
    // Split into statements and require every REVOKE/GRANT/ALTER/CREATE/DROP
    // to name quicklog_save_manual. NOTIFY pgrst is the only allowed non-DDL.
    const stmts = executable
      .split(/;\s*/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of stmts) {
      if (!/^(REVOKE|GRANT|ALTER|CREATE|DROP)\b/i.test(stmt)) continue;
      expect(
        stmt,
        `unexpected DDL/DCL touches something other than quicklog_save_manual`,
      ).toMatch(/quicklog_save_manual/i);
    }
  });

});
