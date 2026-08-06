/**
 * Static contract pin for:
 *   supabase/migrations/20260805090000_security_advisor_hardening_followup.sql
 *
 * This migration closes three live Security Advisor gaps (lovable_paddle_events,
 * lead_events, and a re-affirmed quicklog_save_manual EXECUTE revoke) and sets
 * the schema's default ACL so future functions/tables aren't born anon-open.
 * Pins the reviewed shape so an edit can't silently regress it:
 *
 *   - lovable_paddle_events / lead_events / quicklog_save_manual REVOKEs all
 *     name PUBLIC as well as anon (a REVOKE naming only anon leaves PUBLIC's
 *     grant in effect, and every role inherits PUBLIC)
 *   - lead_events keeps its authenticated SELECT/INSERT re-grant
 *   - ALTER DEFAULT PRIVILEGES covers FUNCTIONS and TABLES, from PUBLIC and
 *     anon, both as the invoking role and explicitly FOR ROLE postgres
 *   - the postcondition DO block enumerates every quicklog_save_manual
 *     overload (not just the 12-arg signature) and fails the transaction
 *     (RAISE EXCEPTION) rather than warning
 *   - quicklog_save_manual is never DROPped or CREATE OR REPLACEd (grant-only)
 *
 * If the reviewed SQL needs to change, update it and this pin together.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MIGRATION_PATH = "supabase/migrations/20260805090000_security_advisor_hardening_followup.sql";
const abs = resolve(ROOT, MIGRATION_PATH);
const raw = existsSync(abs) ? readFileSync(abs, "utf8") : "";
// Strip SQL line comments so pins target executable statements only.
const executable = raw
  .replace(/\r\n?/g, "\n")
  .replace(/^\s*--.*$/gm, "")
  .trim();

const QLM_ARGS =
  "text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb, text, text";

describe("security-advisor-hardening-followup migration contract", () => {
  it("exists in supabase/migrations/", () => {
    expect(existsSync(abs)).toBe(true);
  });

  it("is additive to quicklog_save_manual: no DROP or CREATE OR REPLACE", () => {
    expect(executable).not.toMatch(/DROP\s+FUNCTION\s+public\.quicklog_save_manual/i);
    expect(executable).not.toMatch(
      /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.quicklog_save_manual/i,
    );
  });

  it("revokes lovable_paddle_events from PUBLIC, anon, and authenticated", () => {
    expect(executable).toMatch(
      /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.lovable_paddle_events\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/i,
    );
  });

  it("narrows lead_events: revoke-all-then-regrant, from PUBLIC not just anon", () => {
    expect(executable).toMatch(
      /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.lead_events\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/i,
    );
    expect(executable).toMatch(
      /GRANT\s+SELECT\s*,\s*INSERT\s+ON\s+TABLE\s+public\.lead_events\s+TO\s+authenticated/i,
    );
    expect(executable).not.toMatch(
      /GRANT\s+[\s\S]*?ON\s+TABLE\s+public\.lead_events\s+TO\s+(anon|PUBLIC)\b/i,
    );
  });

  it("sets default privileges on FUNCTIONS and TABLES from PUBLIC and anon", () => {
    expect(executable).toMatch(
      /ALTER\s+DEFAULT\s+PRIVILEGES\s+IN\s+SCHEMA\s+public\s+REVOKE\s+ALL\s+ON\s+FUNCTIONS\s+FROM\s+PUBLIC\s*,\s*anon/i,
    );
    expect(executable).toMatch(
      /ALTER\s+DEFAULT\s+PRIVILEGES\s+IN\s+SCHEMA\s+public\s+REVOKE\s+ALL\s+ON\s+TABLES\s+FROM\s+PUBLIC\s*,\s*anon/i,
    );
  });

  it("also asserts default privileges FOR ROLE postgres explicitly", () => {
    expect(executable).toMatch(
      /ALTER\s+DEFAULT\s+PRIVILEGES\s+FOR\s+ROLE\s+postgres\s+IN\s+SCHEMA\s+public\s+REVOKE\s+ALL\s+ON\s+FUNCTIONS\s+FROM\s+PUBLIC\s*,\s*anon/i,
    );
    expect(executable).toMatch(
      /ALTER\s+DEFAULT\s+PRIVILEGES\s+FOR\s+ROLE\s+postgres\s+IN\s+SCHEMA\s+public\s+REVOKE\s+ALL\s+ON\s+TABLES\s+FROM\s+PUBLIC\s*,\s*anon/i,
    );
  });

  it("revokes quicklog_save_manual EXECUTE from PUBLIC and anon, not just anon", () => {
    const revokeMatches = executable.match(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.quicklog_save_manual\s*\(([\s\S]*?)\)/gi,
    );
    expect(revokeMatches, "expected at least one REVOKE EXECUTE").toBeTruthy();
    for (const stmt of revokeMatches ?? []) {
      expect(stmt).toContain(QLM_ARGS);
    }
    expect(executable).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.quicklog_save_manual[\s\S]*?FROM\s+PUBLIC\s*,\s*anon/i,
    );
  });

  it("preserves quicklog_save_manual EXECUTE for authenticated and service_role", () => {
    expect(executable).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.quicklog_save_manual[\s\S]*?TO\s+authenticated/i,
    );
    expect(executable).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.quicklog_save_manual[\s\S]*?TO\s+service_role/i,
    );
    expect(executable).not.toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.quicklog_save_manual[\s\S]*?TO\s+(anon|PUBLIC)\b/i,
    );
  });

  it("iterates every quicklog_save_manual overload in the postcondition", () => {
    expect(executable).toMatch(/DO\s*\$\$/i);
    expect(executable).toMatch(
      /FROM\s+pg_proc\s+p[\s\S]*?p\.proname\s*=\s*'quicklog_save_manual'/i,
    );
    expect(executable).toMatch(/FOR\s+bad\s+IN[\s\S]*?LOOP/i);
  });

  it("postcondition hard-fails (RAISE EXCEPTION) rather than warns (RAISE NOTICE)", () => {
    expect(executable).not.toMatch(/RAISE\s+NOTICE/i);
    expect(executable).toMatch(/IF\s+bad\.anon_exec\s+THEN[\s\S]*?RAISE\s+EXCEPTION/i);
    expect(executable).toMatch(/IF\s+NOT\s+bad\.auth_exec\s+THEN[\s\S]*?RAISE\s+EXCEPTION/i);
    expect(executable).toMatch(/IF\s+NOT\s+bad\.svc_exec\s+THEN[\s\S]*?RAISE\s+EXCEPTION/i);
  });

  it("refuses to leave a hole if quicklog_save_manual disappears entirely", () => {
    expect(executable).toMatch(
      /overload_count\s*=\s*0[\s\S]*?RAISE\s+EXCEPTION\s+'quicklog_save_manual missing/i,
    );
  });

  it("verifies lovable_paddle_events and lead_events via has_table_privilege", () => {
    expect(executable).toMatch(
      /has_table_privilege\(\s*'anon'\s*,\s*'public\.lovable_paddle_events'/i,
    );
    expect(executable).toMatch(/has_table_privilege\(\s*'anon'\s*,\s*'public\.lead_events'/i);
    expect(executable).toMatch(
      /has_table_privilege\(\s*'authenticated'\s*,\s*'public\.lead_events'\s*,\s*'SELECT'\s*\)/i,
    );
  });

  it("proves the default-privilege change end-to-end with a disposable object", () => {
    expect(executable).toMatch(/CREATE\s+FUNCTION\s+public\.__default_privilege_selftest_fn/i);
    expect(executable).toMatch(/DROP\s+FUNCTION\s+public\.__default_privilege_selftest_fn/i);
    expect(executable).toMatch(/CREATE\s+TABLE\s+public\.__default_privilege_selftest_tbl/i);
    expect(executable).toMatch(/DROP\s+TABLE\s+public\.__default_privilege_selftest_tbl/i);
  });

  it("wraps changes in a single transaction and reloads PostgREST", () => {
    expect(executable).toMatch(/^\s*BEGIN\s*;/m);
    expect(executable).toMatch(/COMMIT\s*;/);
    expect(executable).toMatch(/NOTIFY\s+pgrst\s*,\s*'reload schema'/i);
  });

  it("does not misattribute the drift to a bare CREATE OR REPLACE FUNCTION", () => {
    // The corrected prose must credit DROP+CREATE / new-overload creation as
    // the mechanism that reacquires schema defaults, not a bare
    // CREATE OR REPLACE FUNCTION on an unchanged signature (which preserves
    // existing ACLs and does NOT reacquire defaults).
    expect(raw).toMatch(/DROP FUNCTION.*\+.*CREATE FUNCTION/i);
    expect(raw).toMatch(/preserves the\s*\n?--\s*function's existing owner and ACL/i);
  });
});
