/**
 * Static contract tests for
 * 20260821064300_signup_acquisition_service_role_hardening.sql.
 *
 * 20260813030000_signup_acquisition_forward_repair.sql revokes PUBLIC/anon/
 * authenticated on the table and all four functions it installs, but never
 * revokes FROM service_role. On this project's legacy default privileges a
 * fresh CREATE TABLE / CREATE FUNCTION grants service_role full access with
 * no explicit GRANT (verified live 2026-08-21 with a rolled-back probe, and
 * reproduced in a local PostgreSQL 16 replay for this migration). This
 * migration closes exactly that gap and nothing else.
 *
 * Source-text scanning is appropriate here: the subject is a .sql artifact
 * that cannot be imported and resolved, and every assertion below proves the
 * presence or absence of exact statements in that file.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPAIR = "supabase/migrations/20260813030000_signup_acquisition_forward_repair.sql";
const HARDENING =
  "supabase/migrations/20260821064300_signup_acquisition_service_role_hardening.sql";

const TABLE = "public.signup_acquisition_attributions";
const FUNCTIONS = [
  "public.handle_new_user()",
  "public.record_signup_acquisition_first_touch(text)",
  "public.signup_acquisition_operator_snapshot()",
  "public.signup_to_paid_operator_snapshot()",
] as const;

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

/**
 * This file has no block comments or dollar-quoted string bodies to worry
 * about (it is REVOKE statements plus two DO blocks with no string
 * literals), so stripping `-- ...` line comments is sufficient here — unlike
 * the general-purpose scanner in quicklog-private-helper-acl-regression.test.ts,
 * which has to handle both.
 */
function stripLineComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

describe("the repair migration really does omit service_role (the gap this file closes)", () => {
  it("contains zero mentions of service_role", () => {
    expect(read(REPAIR)).not.toMatch(/service_role/);
  });
});

describe("signup acquisition service_role hardening (20260821064300)", () => {
  const sql = read(HARDENING);

  it("revokes service_role on the table and all four functions", () => {
    expect(sql).toMatch(
      new RegExp(`REVOKE ALL ON TABLE ${TABLE.replace(/\./g, "\\.")} FROM service_role;`),
    );
    for (const fn of FUNCTIONS) {
      const escaped = fn.replace(/[.()]/g, (c) => `\\${c}`);
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${escaped} FROM service_role;`));
    }
  });

  it("touches only service_role — no PUBLIC/anon/authenticated grant or revoke", () => {
    expect(sql).not.toMatch(/FROM\s+(PUBLIC|anon|authenticated)\b/);
    expect(sql).not.toMatch(/TO\s+(PUBLIC|anon|authenticated)\b/);
  });

  it("is one transaction with a preflight gate and a postflight assertion", () => {
    expect(sql).toMatch(/^BEGIN;$/m);
    expect(sql).toMatch(/^COMMIT;$/m);
    expect(sql).toMatch(/\$signup_service_role_hardening_preflight\$/);
    expect(sql).toMatch(/\$signup_service_role_hardening_postflight\$/);
    expect(sql).toMatch(/signup_service_role_hardening_prerequisite_missing_table/);
    expect(sql).toMatch(/signup_service_role_hardening_prerequisite_missing_functions/);
    expect(sql).toMatch(/signup_service_role_hardening_table_postcondition_failed/);
    expect(sql).toMatch(/signup_service_role_hardening_function_postcondition_failed/);
  });

  it("asserts the intended authenticated grants survive, not just that service_role is gone", () => {
    expect(sql).toMatch(/signup_service_role_hardening_authenticated_grant_lost/);
    for (const fn of [
      "record_signup_acquisition_first_touch",
      "signup_acquisition_operator_snapshot",
      "signup_to_paid_operator_snapshot",
    ]) {
      expect(sql).toContain(fn);
    }
  });

  it("introduces no table, column, policy, or capability — REVOKE only", () => {
    // Executable statements only — the header's emergency-rollback note is
    // documentation, not something this file runs, and legitimately says
    // GRANT/CREATE TABLE in prose describing the mechanism and the rollback.
    const executable = stripLineComments(sql);
    expect(executable).not.toMatch(/CREATE TABLE/i);
    expect(executable).not.toMatch(/ALTER TABLE.*ADD COLUMN/is);
    expect(executable).not.toMatch(/CREATE POLICY/i);
    expect(executable).not.toMatch(/DROP POLICY/i);
    expect(executable).not.toMatch(/\bGRANT\b/);
    expect(executable).not.toMatch(/target_device/i);
  });

  it("sorts after the migration whose objects it hardens", () => {
    const hardeningVersion = HARDENING.split("/").pop()!.slice(0, 14);
    const repairVersion = REPAIR.split("/").pop()!.slice(0, 14);
    expect(repairVersion < hardeningVersion).toBe(true);
  });
});
