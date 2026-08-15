/**
 * Static pins for the 2026-08-15 pgmq / trigger-definer EXECUTE hardening.
 *
 * The resolved grant matrix lives in pgmqEmailWrapperGrantRules.ts and is
 * asserted there by import. This file pins the SQL shape so a later edit
 * cannot silently drop the PUBLIC revoke (the named-role-only revoke is a
 * documented no-op — see 20260815054605).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  PGMQ_EMAIL_WRAPPER_FUNCTIONS,
  PGMQ_EMAIL_WRAPPER_GRANT_MIGRATIONS,
  TRIGGER_DEFINER_FUNCTIONS,
} from "../lib/pgmqEmailWrapperGrantRules";

const ROOT = resolve(__dirname, "../..");

function loadSql(relPath: string): { raw: string; executable: string } {
  const abs = resolve(ROOT, relPath);
  const raw = existsSync(abs) ? readFileSync(abs, "utf8") : "";
  const executable = raw.replace(/\r\n?/g, "\n").replace(/^\s*--.*$/gm, "").trim();
  return { raw, executable };
}

const wrappers = loadSql(PGMQ_EMAIL_WRAPPER_GRANT_MIGRATIONS.wrappers);
const triggerNoop = loadSql(PGMQ_EMAIL_WRAPPER_GRANT_MIGRATIONS.triggerNoop);
const publicRevoke = loadSql(PGMQ_EMAIL_WRAPPER_GRANT_MIGRATIONS.publicRevoke);

describe("pgmq email wrapper grant migrations", () => {
  it("all three additive files exist (not edits of published history)", () => {
    expect(existsSync(resolve(ROOT, PGMQ_EMAIL_WRAPPER_GRANT_MIGRATIONS.wrappers))).toBe(true);
    expect(existsSync(resolve(ROOT, PGMQ_EMAIL_WRAPPER_GRANT_MIGRATIONS.triggerNoop))).toBe(true);
    expect(existsSync(resolve(ROOT, PGMQ_EMAIL_WRAPPER_GRANT_MIGRATIONS.publicRevoke))).toBe(true);
  });

  it("wrapper migration revokes PUBLIC, anon, and authenticated — not named roles only", () => {
    expect(wrappers.executable).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+%s\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/i,
    );
    for (const name of PGMQ_EMAIL_WRAPPER_FUNCTIONS) {
      expect(wrappers.executable).toContain(`'${name}'`);
    }
  });

  it("wrapper migration re-grants the service role so the email worker is not locked out", () => {
    expect(wrappers.executable).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+%s\s+TO\s+service_role/i);
  });

  it("wrapper postcondition uses has_function_privilege, not proacl text", () => {
    expect(wrappers.executable).toMatch(/has_function_privilege\(\s*'anon'/i);
    expect(wrappers.executable).toMatch(/has_function_privilege\(\s*'authenticated'/i);
    expect(wrappers.executable).toMatch(/has_function_privilege\(\s*'service_role'/i);
    expect(wrappers.executable).toMatch(/RAISE\s+EXCEPTION/i);
    expect(wrappers.executable).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i);
    expect(wrappers.executable).not.toMatch(/__default_privilege_selftest/i);
  });

  it("wrapper migration refuses to proceed if a wrapper is missing", () => {
    expect(wrappers.executable).toMatch(/refuse to leave a hole/i);
  });

  it("recorded no-op revokes only named roles and does not claim PUBLIC was removed", () => {
    expect(triggerNoop.raw).toMatch(/NO-OP/i);
    expect(triggerNoop.executable).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.grant_staff_role_for_verified_email\(\)\s+FROM\s+anon\s*,\s*authenticated/i,
    );
    expect(triggerNoop.executable).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.profiles_block_gamification_updates\(\)\s+FROM\s+anon\s*,\s*authenticated/i,
    );
    expect(triggerNoop.executable).not.toMatch(/FROM\s+PUBLIC/i);
    expect(triggerNoop.executable).not.toMatch(/RAISE\s+EXCEPTION/i);
    expect(triggerNoop.executable).not.toMatch(/has_function_privilege/i);
  });

  it("working follow-up revokes PUBLIC on every trigger definer", () => {
    expect(publicRevoke.executable).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+%s\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/i,
    );
    for (const name of TRIGGER_DEFINER_FUNCTIONS) {
      expect(publicRevoke.executable).toContain(`'${name}'`);
    }
  });

  it("working follow-up enumerates every quicklog_save_manual overload", () => {
    expect(publicRevoke.executable).toMatch(/p\.proname\s*=\s*'quicklog_save_manual'/i);
    expect(publicRevoke.executable).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+%s\s+FROM\s+PUBLIC\s*,\s*anon/i,
    );
    expect(publicRevoke.executable).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+%s\s+TO\s+authenticated/i,
    );
    expect(publicRevoke.executable).not.toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+%s\s+TO\s+(anon|PUBLIC)\b/i,
    );
  });

  it("working follow-up aligns quicklog_save_manual with quicklog_save_event via privilege probes", () => {
    expect(publicRevoke.executable).toMatch(/p\.proname\s*=\s*'quicklog_save_event'/i);
    expect(publicRevoke.executable).toMatch(/does not match quicklog_save_event/i);
    expect(publicRevoke.executable).not.toMatch(/__default_privilege_selftest/i);
    expect(publicRevoke.executable).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i);
  });

  it("working follow-up hard-fails rather than warns", () => {
    expect(publicRevoke.executable).not.toMatch(/RAISE\s+NOTICE/i);
    expect(publicRevoke.executable).toMatch(/RAISE\s+EXCEPTION/i);
    expect(publicRevoke.executable).toMatch(/NOTIFY\s+pgrst\s*,\s*'reload schema'/i);
  });
});
