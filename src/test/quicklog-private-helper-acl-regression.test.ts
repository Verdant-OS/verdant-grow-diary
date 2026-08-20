/**
 * EXECUTE-grant regression fence for the Quick Log manual-save spine.
 *
 * Contract (verified live 2026-08-19 and enforced by the 20260818010000
 * forward repair's own pre/postconditions): only postgres may EXECUTE the
 * five private helpers, and the public wrapper keeps EXECUTE for
 * authenticated + service_role (never anon, never PUBLIC).
 *
 * Three layers keep that true:
 *   1. This static fence — pins the published migration shapes and scans
 *      every migration NEWER than the forward repair for literal re-grants
 *      (the sanctioned use of source scanning: proving a forbidden
 *      construct is absent from files).
 *   2. scripts/run-quicklog-private-helper-grants-db-security.ts — resolved
 *      has_function_privilege + runtime call proofs against the replayed
 *      local stack (wired into test:security-db-local).
 *   3. The PG15 delegate-repair harness's ACL fence proofs.
 * Dynamic grants built with format()/EXECUTE are invisible to layer 1 by
 * nature — layers 2 and 3 are the resolved-value authority.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  QUICKLOG_FORWARD_REPAIR_VERSION,
  QUICKLOG_GRANT_MIGRATIONS,
  QUICKLOG_MANUAL_WRAPPER_FUNCTION,
  QUICKLOG_PRIVATE_HELPER_FUNCTIONS,
  QUICKLOG_PRIVATE_HELPER_SIGNATURES,
  expectedExecuteForQuicklogManualWrapper,
  expectedExecuteForQuicklogPrivateHelper,
  migrationGrantsClientExecuteOn,
  migrationLeavesWrapperWithoutRequiredGrant,
} from "@/lib/quicklogPrivateHelperGrantRules";
import { EXECUTE_ROLE_SERVICE } from "@/lib/pgmqEmailWrapperGrantRules";

const ROOT = resolve(__dirname, "../..");
const MIGRATIONS_DIR = resolve(ROOT, "supabase/migrations");

function stripComments(sql: string): string {
  return sql.replace(/\r\n?/g, "\n").replace(/^\s*--.*$/gm, "");
}

function loadMigration(relPath: string): string {
  const abs = resolve(ROOT, relPath);
  return existsSync(abs) ? stripComments(readFileSync(abs, "utf8")) : "";
}

describe("quicklog private-helper grant contract (rules module)", () => {
  it("pins exactly the five private helpers with exact signatures", () => {
    expect([...QUICKLOG_PRIVATE_HELPER_FUNCTIONS]).toEqual([
      "quicklog_save_manual_pre_logged_at",
      "quicklog_try_parse_logged_at",
      "quicklog_try_parse_uuid",
      "quicklog_stamp_diary_logged_at",
      "quicklog_stamp_grow_event_logged_at",
    ]);
    for (const name of QUICKLOG_PRIVATE_HELPER_FUNCTIONS) {
      expect(QUICKLOG_PRIVATE_HELPER_SIGNATURES[name]).toContain(`public.${name}`);
    }
  });

  it("expects postgres-only EXECUTE on every private helper", () => {
    for (const name of QUICKLOG_PRIVATE_HELPER_FUNCTIONS) {
      expect(expectedExecuteForQuicklogPrivateHelper(name)).toEqual({
        anon: false,
        authenticated: false,
        [EXECUTE_ROLE_SERVICE]: false,
      });
    }
  });

  it("expects authenticated + service_role EXECUTE on the public wrapper", () => {
    expect(expectedExecuteForQuicklogManualWrapper()).toEqual({
      anon: false,
      authenticated: true,
      [EXECUTE_ROLE_SERVICE]: true,
    });
  });
});

describe("published migration shapes (immutable history pins)", () => {
  const foundation = loadMigration(QUICKLOG_GRANT_MIGRATIONS.dualTimestampFoundation);
  const forwardRepair = loadMigration(QUICKLOG_GRANT_MIGRATIONS.forwardRepair);

  it("both grant-bearing migrations exist", () => {
    expect(foundation.length).toBeGreaterThan(0);
    expect(forwardRepair.length).toBeGreaterThan(0);
  });

  it("the foundation revokes the parse helpers and trigger stamps from clients", () => {
    for (const helper of [
      "quicklog_try_parse_logged_at\\(text\\)",
      "quicklog_try_parse_uuid\\(text\\)",
      "quicklog_stamp_diary_logged_at\\(\\)",
      "quicklog_stamp_grow_event_logged_at\\(\\)",
    ]) {
      expect(foundation).toMatch(
        new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.${helper}\\s+FROM\\s+PUBLIC`, "i"),
      );
    }
  });

  it("the forward repair revokes the delegate from PUBLIC, anon, authenticated, and service_role", () => {
    for (const role of ["PUBLIC", "anon", "authenticated", EXECUTE_ROLE_SERVICE]) {
      expect(forwardRepair).toMatch(
        new RegExp(
          `REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.quicklog_save_manual_pre_logged_at\\([\\s\\S]*?\\)\\s+FROM\\s+${role};`,
          "i",
        ),
      );
    }
  });

  it("the forward repair postcondition asserts the resolved grants, not just text", () => {
    expect(forwardRepair).toMatch(/has_function_privilege/i);
    expect(forwardRepair).toMatch(/aclexplode/i);
    expect(forwardRepair).toMatch(/RAISE\s+EXCEPTION/i);
  });

  it("the foundation grants the wrapper back to authenticated and never to anon", () => {
    expect(foundation).toMatch(
      new RegExp(
        `GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${QUICKLOG_MANUAL_WRAPPER_FUNCTION}\\s*\\([\\s\\S]*?\\)\\s+TO\\s+authenticated;`,
        "i",
      ),
    );
    expect(foundation).toMatch(
      new RegExp(
        `REVOKE\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${QUICKLOG_MANUAL_WRAPPER_FUNCTION}\\s*\\([\\s\\S]*?\\)\\s+FROM\\s+anon;`,
        "i",
      ),
    );
  });
});

describe("forward fence — migrations newer than the forward repair", () => {
  const newerMigrations = readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .filter((name) => name.slice(0, 14) > QUICKLOG_FORWARD_REPAIR_VERSION)
    .sort();

  it("no newer migration grants client EXECUTE on any private helper", () => {
    const offenders: string[] = [];
    for (const fileName of newerMigrations) {
      const sql = stripComments(readFileSync(resolve(MIGRATIONS_DIR, fileName), "utf8"));
      for (const helper of QUICKLOG_PRIVATE_HELPER_FUNCTIONS) {
        if (migrationGrantsClientExecuteOn(sql, helper)) {
          offenders.push(`${fileName} → ${helper}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no newer migration leaves the wrapper without authenticated/service_role EXECUTE", () => {
    const offenders: string[] = [];
    for (const fileName of newerMigrations) {
      const sql = stripComments(readFileSync(resolve(MIGRATIONS_DIR, fileName), "utf8"));
      if (migrationLeavesWrapperWithoutRequiredGrant(sql)) offenders.push(fileName);
    }
    expect(offenders).toEqual([]);
  });

  it("fence detectors actually fire on the forbidden constructs (self-test)", () => {
    expect(
      migrationGrantsClientExecuteOn(
        "GRANT EXECUTE ON FUNCTION public.quicklog_try_parse_uuid(text) TO authenticated;",
        "quicklog_try_parse_uuid",
      ),
    ).toBe(true);
    expect(
      migrationGrantsClientExecuteOn(
        "GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;",
        "quicklog_try_parse_uuid",
      ),
    ).toBe(true);
    expect(
      migrationGrantsClientExecuteOn(
        "GRANT EXECUTE ON FUNCTION public.quicklog_try_parse_uuid(text) TO postgres;",
        "quicklog_try_parse_uuid",
      ),
    ).toBe(false);
    // Multi-function target lists must not slip past the fence.
    expect(
      migrationGrantsClientExecuteOn(
        "GRANT EXECUTE ON FUNCTION public.other_fn(), public.quicklog_try_parse_uuid(text) TO authenticated;",
        "quicklog_try_parse_uuid",
      ),
    ).toBe(true);
    expect(
      migrationLeavesWrapperWithoutRequiredGrant(
        "REVOKE EXECUTE ON FUNCTION public.quicklog_save_manual(text, uuid, text) FROM authenticated;",
      ),
    ).toBe(true);
    expect(
      migrationLeavesWrapperWithoutRequiredGrant(
        `REVOKE ALL ON FUNCTION public.quicklog_save_manual(text, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
         GRANT EXECUTE ON FUNCTION public.quicklog_save_manual(text, uuid, text) TO authenticated, service_role;`,
      ),
    ).toBe(false);
    expect(
      migrationLeavesWrapperWithoutRequiredGrant(
        "REVOKE ALL ON FUNCTION public.quicklog_save_manual_pre_logged_at(text, uuid, text) FROM authenticated;",
      ),
    ).toBe(false);
    // Statement order matters: a grant BEFORE the final revoke does not
    // restore access, so this must still trip the fence.
    expect(
      migrationLeavesWrapperWithoutRequiredGrant(
        `GRANT EXECUTE ON FUNCTION public.quicklog_save_manual(text, uuid, text) TO authenticated;
         REVOKE EXECUTE ON FUNCTION public.quicklog_save_manual(text, uuid, text) FROM authenticated;`,
      ),
    ).toBe(true);
  });
});

describe("runtime lane wiring", () => {
  it("the resolved-value harness is wired into test:security-db-local", () => {
    const packageJson = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const scripts = packageJson.scripts ?? {};
    expect(scripts["test:quicklog-private-helper-grants-db-security"]).toContain(
      "run-quicklog-private-helper-grants-db-security.ts",
    );
    expect(scripts["test:security-db-local"]).toContain(
      "test:quicklog-private-helper-grants-db-security",
    );
    expect(
      existsSync(resolve(ROOT, "scripts/run-quicklog-private-helper-grants-db-security.ts")),
    ).toBe(true);
  });
});
