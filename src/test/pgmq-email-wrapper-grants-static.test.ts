/**
 * Static pins for the 2026-08-15 pgmq / trigger-definer EXECUTE hardening.
 *
 * The resolved grant matrix lives in pgmqEmailWrapperGrantRules.ts and is
 * asserted there by import. This file pins the published SQL shape (#989)
 * so a later edit cannot silently drop the PUBLIC revoke or turn the
 * recorded no-op back into a named-role-only REVOKE.
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

  it("wrapper migration revokes PUBLIC, anon, and authenticated on explicit signatures", () => {
    expect(wrappers.executable).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.enqueue_email\s*\(\s*text\s*,\s*jsonb\s*\)\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/i,
    );
    expect(wrappers.executable).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.read_email_batch\s*\(\s*text\s*,\s*integer\s*,\s*integer\s*\)\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/i,
    );
    expect(wrappers.executable).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.delete_email\s*\(\s*text\s*,\s*bigint\s*\)\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/i,
    );
    expect(wrappers.executable).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.move_to_dlq\s*\(\s*text\s*,\s*text\s*,\s*bigint\s*,\s*jsonb\s*\)\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/i,
    );
    for (const name of PGMQ_EMAIL_WRAPPER_FUNCTIONS) {
      expect(wrappers.executable).toContain(name);
    }
  });

  it("wrapper migration re-grants the service role so the email worker is not locked out", () => {
    expect(wrappers.executable).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.enqueue_email\s*\(\s*text\s*,\s*jsonb\s*\)\s+TO\s+service_role/i,
    );
    expect(wrappers.executable).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.read_email_batch\s*\(\s*text\s*,\s*integer\s*,\s*integer\s*\)\s+TO\s+service_role/i,
    );
    expect(wrappers.executable).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.delete_email\s*\(\s*text\s*,\s*bigint\s*\)\s+TO\s+service_role/i,
    );
    expect(wrappers.executable).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.move_to_dlq\s*\(\s*text\s*,\s*text\s*,\s*bigint\s*,\s*jsonb\s*\)\s+TO\s+service_role/i,
    );
  });

  it("wrapper postcondition uses has_function_privilege, not proacl text", () => {
    expect(wrappers.executable).toMatch(/has_function_privilege\(\s*'anon'/i);
    expect(wrappers.executable).toMatch(/has_function_privilege\(\s*'authenticated'/i);
    expect(wrappers.executable).toMatch(/has_function_privilege\(\s*'service_role'/i);
    expect(wrappers.executable).toMatch(/RAISE\s+EXCEPTION/i);
    expect(wrappers.executable).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i);
    expect(wrappers.executable).not.toMatch(/__default_privilege_selftest/i);
  });

  it("wrapper REVOKE names each signature so a missing function aborts the apply", () => {
    expect(wrappers.executable).toMatch(/public\.enqueue_email\s*\(\s*text\s*,\s*jsonb\s*\)/i);
    expect(wrappers.executable).toMatch(
      /public\.read_email_batch\s*\(\s*text\s*,\s*integer\s*,\s*integer\s*\)/i,
    );
    expect(wrappers.executable).toMatch(/public\.delete_email\s*\(\s*text\s*,\s*bigint\s*\)/i);
    expect(wrappers.executable).toMatch(
      /public\.move_to_dlq\s*\(\s*text\s*,\s*text\s*,\s*bigint\s*,\s*jsonb\s*\)/i,
    );
  });

  it("recorded no-op performs no DDL and does not claim PUBLIC was removed", () => {
    expect(triggerNoop.raw).toMatch(/NO-OP/i);
    expect(triggerNoop.executable).toMatch(/^SELECT\s+1\s*;$/i);
    expect(triggerNoop.executable).not.toMatch(/REVOKE/i);
    expect(triggerNoop.executable).not.toMatch(/GRANT/i);
    expect(triggerNoop.executable).not.toMatch(/FROM\s+PUBLIC/i);
    expect(triggerNoop.executable).not.toMatch(/RAISE\s+EXCEPTION/i);
    expect(triggerNoop.executable).not.toMatch(/has_function_privilege/i);
  });

  it("working follow-up revokes PUBLIC on every trigger definer", () => {
    expect(TRIGGER_DEFINER_FUNCTIONS).toEqual([
      "grant_staff_role_for_verified_email",
      "grant_staff_role_for_verified_allowlist",
      "profiles_block_gamification_updates",
    ]);
    expect(publicRevoke.executable).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.grant_staff_role_for_verified_email\(\)\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/i,
    );
    expect(publicRevoke.executable).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.grant_staff_role_for_verified_allowlist\(\)\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/i,
    );
    expect(publicRevoke.executable).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.profiles_block_gamification_updates\(\)\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/i,
    );
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

  it("working follow-up keeps quicklog_save_event out of scope and forbids service-role EXECUTE on triggers", () => {
    expect(publicRevoke.raw).toMatch(/quicklog_save_event is intentionally authenticated-only/i);
    expect(publicRevoke.executable).toMatch(
      /must not be executable by anon\/authenticated\/service_role \(trigger-only\)/i,
    );
    expect(publicRevoke.executable).not.toMatch(/does not match quicklog_save_event/i);
    expect(publicRevoke.executable).not.toMatch(/__default_privilege_selftest/i);
    expect(publicRevoke.executable).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i);
  });

  it("working follow-up hard-fails rather than warns", () => {
    expect(publicRevoke.executable).not.toMatch(/RAISE\s+NOTICE/i);
    expect(publicRevoke.executable).toMatch(/RAISE\s+EXCEPTION/i);
    expect(publicRevoke.executable).toMatch(/NOTIFY\s+pgrst\s*,\s*'reload schema'/i);
  });
});
