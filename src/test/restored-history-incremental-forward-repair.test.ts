import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPAIR_FILENAME = "20260823120000_restored_history_ai_credit_pheno_quicklog_repair.sql";
const REPAIR = readMigration(REPAIR_FILENAME);
const CANONICAL_CREDIT = readMigration("20260721104000_ai_credit_spend_pack_overflow.sql");
const CANONICAL_PHENO = readMigration("20260725220000_craft_pheno_tracker_entitlement.sql");
const CANONICAL_QUICKLOG = readMigration("20260725024026_quicklog_dual_timestamp_foundation.sql");

const RESTORED_VERSIONS = [
  "20260710003624",
  "20260710003638",
  "20260710005819",
  "20260710012854",
  "20260710012950",
  "20260710013213",
  "20260710013235",
  "20260710013255",
  "20260725033124",
  "20260728230229",
];

function readMigration(filename: string): string {
  return readFileSync(resolve("supabase", "migrations", filename), "utf8").replace(/\r\n/g, "\n");
}

function functionBlock(sql: string, startMarker: string): string {
  const start = sql.indexOf(startMarker);
  if (start < 0) throw new Error(`Missing function marker: ${startMarker}`);
  const endMarker = "$function$;";
  const end = sql.indexOf(endMarker, start);
  if (end < 0) throw new Error(`Missing function terminator after: ${startMarker}`);
  return sql.slice(start, end + endMarker.length);
}

function normalizeCreateFunction(block: string): string {
  return block.replace(/^CREATE OR REPLACE FUNCTION/, "CREATE FUNCTION");
}

describe("restored-history incremental forward repair", () => {
  it("is a new additive version after every restored historical migration", () => {
    const repairVersion = REPAIR_FILENAME.slice(0, 14);
    for (const restoredVersion of RESTORED_VERSIONS) {
      expect(repairVersion.localeCompare(restoredVersion)).toBeGreaterThan(0);
    }
  });

  it("reasserts the exact final legacy AI-credit body and denies every API role", () => {
    const marker = "CREATE OR REPLACE FUNCTION public.ai_credit_spend(\n  p_feature text,";
    expect(functionBlock(REPAIR, marker)).toBe(functionBlock(CANONICAL_CREDIT, marker));
    for (const role of ["PUBLIC", "anon", "authenticated", "service_role"]) {
      expect(REPAIR).toContain(
        `REVOKE ALL ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb) FROM ${role}`,
      );
    }
    expect(REPAIR).not.toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.ai_credit_spend\(text,\s*uuid,\s*text,\s*text,\s*jsonb\)/i,
    );
  });

  it("reasserts the exact final Craft-aware entitlement oracle and ACL", () => {
    const marker = "CREATE OR REPLACE FUNCTION public.has_pheno_tracker_entitlement(_user_id uuid)";
    expect(functionBlock(REPAIR, marker)).toBe(functionBlock(CANONICAL_PHENO, marker));
    expect(REPAIR).toContain(
      "REVOKE ALL ON FUNCTION public.has_pheno_tracker_entitlement(uuid) FROM PUBLIC",
    );
    expect(REPAIR).toContain(
      "REVOKE ALL ON FUNCTION public.has_pheno_tracker_entitlement(uuid) FROM anon",
    );
    expect(REPAIR).toContain(
      "GRANT EXECUTE ON FUNCTION public.has_pheno_tracker_entitlement(uuid) TO authenticated",
    );
    expect(REPAIR).toContain(
      "GRANT EXECUTE ON FUNCTION public.has_pheno_tracker_entitlement(uuid) TO service_role",
    );
  });

  it("restores both staff triggers to the final allowlist function without another backfill", () => {
    expect(
      REPAIR.match(/CREATE TRIGGER on_auth_user_(?:created|confirmed)_grant_staff/g),
    ).toHaveLength(2);
    expect(
      REPAIR.match(/EXECUTE FUNCTION public\.grant_staff_role_for_verified_allowlist\(\)/g),
    ).toHaveLength(2);
    expect(REPAIR).not.toContain("EXECUTE FUNCTION public.grant_staff_role_for_verified_email()");
    expect(REPAIR).not.toContain("INSERT INTO public.user_roles");
    for (const functionName of [
      "grant_staff_role_for_verified_email",
      "grant_staff_role_for_verified_allowlist",
    ]) {
      expect(REPAIR).toContain(
        `REVOKE ALL ON FUNCTION public.${functionName}()\n  FROM PUBLIC, anon, authenticated, service_role;`,
      );
    }
  });

  it("reasserts the exact final dual-timestamp wrapper and authenticated-only ACL", () => {
    const repairMarker =
      "CREATE OR REPLACE FUNCTION public.quicklog_save_event(\n  p_idempotency_key text,";
    const canonicalMarker =
      "CREATE FUNCTION public.quicklog_save_event(\n  p_idempotency_key text,";
    expect(normalizeCreateFunction(functionBlock(REPAIR, repairMarker))).toBe(
      normalizeCreateFunction(functionBlock(CANONICAL_QUICKLOG, canonicalMarker)),
    );
    expect(REPAIR).toMatch(
      /REVOKE ALL ON FUNCTION public\.quicklog_save_event\([\s\S]*?\) FROM PUBLIC;/,
    );
    expect(REPAIR).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.quicklog_save_event\([\s\S]*?\) FROM anon;/,
    );
    expect(REPAIR).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.quicklog_save_event\([\s\S]*?\) FROM service_role;/,
    );
    expect(REPAIR).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.quicklog_save_event\([\s\S]*?\) TO authenticated;/,
    );
    expect(REPAIR).toContain("Persists canonical Captured logged_at separately from occurred_at");
  });
});
