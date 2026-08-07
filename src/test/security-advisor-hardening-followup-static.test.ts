/**
 * Static contract pin for:
 *   supabase/migrations/20260807003500_security_advisor_hardening_followup_correction.sql
 *
 * This is a CORRECTION migration for
 * supabase/migrations/20260805090000_security_advisor_hardening_followup.sql,
 * which is already published (merged to verdant-grow-diary via PR #767) and
 * therefore append-only -- it cannot be edited, only restored byte-for-byte
 * (see .github/workflows/published-migration-integrity.yml). That published
 * file contains a same-transaction self-test (create a throwaway function,
 * assert it's not anon-executable) that RAISE EXCEPTIONs on every real apply
 * attempt (confirmed against a fresh local Supabase stack, 2026-08-06), which
 * rolls back the ENTIRE migration transaction -- including the real fixes
 * (lovable_paddle_events, lead_events, quicklog_save_manual). This migration
 * re-does all of it, standalone and idempotent, without the broken self-test.
 *
 * Pins the reviewed shape so an edit can't silently regress it:
 *
 *   - lovable_paddle_events / lead_events / quicklog_save_manual REVOKEs all
 *     name PUBLIC as well as anon (a REVOKE naming only anon leaves PUBLIC's
 *     grant in effect, and every role inherits PUBLIC)
 *   - lead_events keeps its authenticated SELECT/INSERT re-grant
 *   - ALTER DEFAULT PRIVILEGES covers FUNCTIONS ONLY (not TABLES -- founder
 *     decision 2026-08-06 to avoid silently changing how every future
 *     Lovable-authored table works), from PUBLIC and anon, both as the
 *     invoking role and explicitly FOR ROLE postgres
 *   - no same-transaction disposable-object self-test: that's exactly what
 *     broke the published migration this corrects
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
const MIGRATION_PATH =
  "supabase/migrations/20260807003500_security_advisor_hardening_followup_correction.sql";
const PUBLISHED_MIGRATION_PATH =
  "supabase/migrations/20260805090000_security_advisor_hardening_followup.sql";
const abs = resolve(ROOT, MIGRATION_PATH);
const raw = existsSync(abs) ? readFileSync(abs, "utf8") : "";
// Strip SQL line comments so pins target executable statements only.
const executable = raw
  .replace(/\r\n?/g, "\n")
  .replace(/^\s*--.*$/gm, "")
  .trim();

const QLM_ARGS =
  "text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb, text, text";

describe("security-advisor-hardening-followup-correction migration contract", () => {
  it("exists in supabase/migrations/ as a NEW file (not an edit of the published one)", () => {
    expect(existsSync(abs)).toBe(true);
    expect(MIGRATION_PATH).not.toBe(PUBLISHED_MIGRATION_PATH);
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

  it("sets default privileges on FUNCTIONS (only) from PUBLIC and anon", () => {
    expect(executable).toMatch(
      /ALTER\s+DEFAULT\s+PRIVILEGES\s+IN\s+SCHEMA\s+public\s+REVOKE\s+ALL\s+ON\s+FUNCTIONS\s+FROM\s+PUBLIC\s*,\s*anon/i,
    );
    // TABLES is intentionally excluded -- see this file's header comment.
    expect(executable).not.toMatch(
      /ALTER\s+DEFAULT\s+PRIVILEGES[\s\S]*?REVOKE\s+ALL\s+ON\s+TABLES/i,
    );
  });

  it("also asserts default privileges FOR ROLE postgres explicitly", () => {
    expect(executable).toMatch(
      /ALTER\s+DEFAULT\s+PRIVILEGES\s+FOR\s+ROLE\s+postgres\s+IN\s+SCHEMA\s+public\s+REVOKE\s+ALL\s+ON\s+FUNCTIONS\s+FROM\s+PUBLIC\s*,\s*anon/i,
    );
  });

  it("revokes quicklog_save_manual EXECUTE from PUBLIC and anon across EVERY overload", () => {
    // The grants are applied dynamically (EXECUTE format(...) over every
    // discovered overload) rather than as one static 12-arg signature.
    // A static single-signature REVOKE would leave a stray overload
    // anon-executable, which the postcondition loop then raises on --
    // rolling back the whole transaction exactly like 20260805090000 did.
    // So pin the dynamic discovery, not a literal argument list.
    expect(executable).toMatch(/FROM\s+pg_proc\s+p[\s\S]*?proname\s*=\s*'quicklog_save_manual'/i);
    expect(executable).toMatch(/p\.oid::regprocedure/i);
    expect(executable).toMatch(
      /format\(\s*'REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+%s\s+FROM\s+PUBLIC\s*,\s*anon'/i,
    );
  });

  it("preserves quicklog_save_manual EXECUTE for authenticated and service_role", () => {
    expect(executable).toMatch(
      /format\(\s*'GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+%s\s+TO\s+authenticated'/i,
    );
    expect(executable).toMatch(
      /format\(\s*'GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+%s\s+TO\s+service_role'/i,
    );
    expect(executable).not.toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+[\s\S]*?TO\s+(anon|PUBLIC)\b/i,
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

  it("does not hard-fail on an unverified same-transaction self-test", () => {
    // The published migration this corrects created/dropped a disposable
    // function+table inside its postcondition DO block to prove the
    // default-privilege change end-to-end. It failed against the local
    // Supabase CI stack (a freshly created function was still anon-
    // executable there for reasons this repo hasn't root-caused), which
    // rolled back the ENTIRE published migration -- exactly why this
    // correction exists. The explicit per-object REVOKEs are what's
    // actually proven, and this migration must never reintroduce it.
    expect(executable).not.toMatch(/__default_privilege_selftest/i);
  });

  it("wraps changes in a single transaction and reloads PostgREST", () => {
    expect(executable).toMatch(/^\s*BEGIN\s*;/m);
    expect(executable).toMatch(/COMMIT\s*;/);
    expect(executable).toMatch(/NOTIFY\s+pgrst\s*,\s*'reload schema'/i);
  });

  it("references the published migration it corrects, and explains why append-only forced a new file", () => {
    expect(raw).toContain(PUBLISHED_MIGRATION_PATH.split("/").pop() as string);
    expect(raw).toMatch(/append-only/i);
  });
});
