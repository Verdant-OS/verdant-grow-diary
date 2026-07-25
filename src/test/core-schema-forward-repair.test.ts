import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const REPAIR_NAME = "20260725023000_core_schema_forward_repair.sql";
const DUAL_TIMESTAMP_NAME = "20260725024026_quicklog_dual_timestamp_foundation.sql";
const FUNCTION_MARKER = "CREATE OR REPLACE FUNCTION public.quicklog_save_event(";

const readMigration = (name: string) =>
  readFileSync(resolve(ROOT, "supabase/migrations", name), "utf8").replace(/\r\n/g, "\n");

const repair = readMigration(REPAIR_NAME);
const canonicalRpc = readMigration("20260723210000_quicklog_save_event_diary_event_type.sql");

describe("core schema forward repair", () => {
  it("sorts before the reserved dual-timestamp wrapper migration", () => {
    expect(REPAIR_NAME.localeCompare(DUAL_TIMESTAMP_NAME)).toBeLessThan(0);
  });

  it("adds the nullable request fingerprint column without fabricating legacy hashes", () => {
    expect(repair).toMatch(
      /ALTER TABLE public\.quicklog_idempotency\s+ADD COLUMN IF NOT EXISTS request_hash text;/,
    );
    expect(repair).not.toMatch(/ALTER COLUMN request_hash SET NOT NULL/);
  });

  it("normalizes and enforces the exact plant type contract", () => {
    expect(repair).toMatch(
      /ALTER TABLE public\.plants\s+ADD COLUMN IF NOT EXISTS plant_type text NOT NULL DEFAULT 'unknown';/,
    );
    expect(repair).toMatch(/ALTER COLUMN plant_type SET DEFAULT 'unknown'/);
    expect(repair).toContain(
      "lower(btrim(COALESCE(plant_type, ''))) IN ('autoflower', 'photoperiod', 'unknown')",
    );
    expect(repair).toMatch(/WHERE plant_type IS DISTINCT FROM CASE[\s\S]*?ELSE 'unknown'\s+END;/);
    expect(repair).toMatch(/DROP CONSTRAINT IF EXISTS plants_plant_type_check/);
    expect(repair).toMatch(
      /ADD CONSTRAINT plants_plant_type_check\s+CHECK \(plant_type IN \('autoflower', 'photoperiod', 'unknown'\)\)\s+NOT VALID;/,
    );
    expect(repair).toMatch(/VALIDATE CONSTRAINT plants_plant_type_check/);
    expect(repair).toMatch(/ALTER COLUMN plant_type SET NOT NULL/);
  });

  it("reinstalls the latest reviewed Quick Log RPC byte-for-byte", () => {
    const repairFunctionIndex = repair.indexOf(FUNCTION_MARKER);
    const canonicalFunctionIndex = canonicalRpc.indexOf(FUNCTION_MARKER);

    expect(repairFunctionIndex).toBeGreaterThan(-1);
    expect(canonicalFunctionIndex).toBeGreaterThan(-1);
    expect(repair.slice(repairFunctionIndex).trimEnd()).toBe(
      canonicalRpc.slice(canonicalFunctionIndex).trimEnd(),
    );
  });

  it("retains request hashing, diary event type, fixed search path, and role grants", () => {
    const functionAndGrants = repair.slice(repair.indexOf(FUNCTION_MARKER));

    expect(functionAndGrants).toContain("SECURITY DEFINER");
    expect(functionAndGrants).toContain("SET search_path TO 'public', 'pg_temp'");
    expect(functionAndGrants).toContain("SELECT grow_event_id, request_hash");
    expect(functionAndGrants).toContain("'event_type', p_event_type");
    expect(functionAndGrants).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC/);
    expect(functionAndGrants).toMatch(/REVOKE EXECUTE ON FUNCTION[\s\S]*FROM anon/);
    expect(functionAndGrants).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*TO authenticated/);
    expect(functionAndGrants).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
