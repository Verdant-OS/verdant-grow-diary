/**
 * Static guardrails for the pi_ingest_commit_batch atomic-write RPC.
 * The RPC must:
 *  - exist as a migration
 *  - be SECURITY DEFINER with locked-down search_path
 *  - REVOKE from anon/authenticated, GRANT EXECUTE only to service_role
 *  - perform inserts into sensor_readings + pi_ingest_idempotency_keys
 *  - NOT write to alerts or action_queue
 *  - NOT be wired into the Edge Function index.ts yet
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MIG_DIR = resolve(ROOT, "supabase/migrations");

function findRpcMigration(): { path: string; sql: string } | null {
  if (!existsSync(MIG_DIR)) return null;
  for (const name of readdirSync(MIG_DIR)) {
    const p = join(MIG_DIR, name);
    const sql = readFileSync(p, "utf8");
    if (/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.pi_ingest_commit_batch/i.test(sql)) {
      return { path: p, sql };
    }
  }
  return null;
}

describe("pi_ingest_commit_batch RPC — migration exists", () => {
  it("a migration defines public.pi_ingest_commit_batch", () => {
    expect(findRpcMigration()).not.toBeNull();
  });
});

describe("pi_ingest_commit_batch RPC — signature & safety", () => {
  const mig = findRpcMigration();
  const sql = mig?.sql ?? "";

  it.each([
    ["declares p_user_id uuid", /p_user_id\s+uuid/i],
    ["declares p_bridge_id text", /p_bridge_id\s+text/i],
    ["declares p_tent_id uuid", /p_tent_id\s+uuid/i],
    ["declares p_rows jsonb", /p_rows\s+jsonb/i],
    ["returns inserted and rejected counts", /RETURNS\s+TABLE\s*\(\s*inserted\s+int\s*,\s*rejected\s+int\s*\)/i],
    ["is SECURITY DEFINER", /SECURITY\s+DEFINER/i],
    ["pins search_path", /SET\s+search_path\s*=\s*public\s*,\s*pg_temp/i],
    ["inserts into sensor_readings", /INSERT\s+INTO\s+public\.sensor_readings/i],
    ["inserts into pi_ingest_idempotency_keys", /INSERT\s+INTO\s+public\.pi_ingest_idempotency_keys/i],
    ["uses RETURNING id for sensor row linkage", /RETURNING\s+id\s+INTO\s+v_sensor_id/i],
    ["links sensor_reading_id on the idempotency insert", /sensor_reading_id[\s\S]{0,400}v_sensor_id/i],
    ["skips existing (user_id, idempotency_key) rows", /pi_ingest_idempotency_keys[\s\S]{0,200}idempotency_key/i],
    ["validates tent ownership", /tent\s+does\s+not\s+belong\s+to\s+user/i],
    ["REVOKEs from anon", /REVOKE\s+ALL[\s\S]{0,200}\bFROM\s+anon\b/i],
    ["REVOKEs from authenticated", /REVOKE\s+ALL[\s\S]{0,200}\bFROM\s+authenticated\b/i],
    ["GRANTs EXECUTE to service_role", /GRANT\s+EXECUTE[\s\S]{0,200}\bTO\s+service_role\b/i],
  ])("RPC migration %s", (_label, re) => {
    expect(sql).toMatch(re);
  });

  it("RPC does NOT write to alerts", () => {
    expect(sql).not.toMatch(/INSERT\s+INTO\s+(public\.)?alerts\b/i);
    expect(sql).not.toMatch(/UPDATE\s+(public\.)?alerts\b/i);
  });

  it("RPC does NOT write to action_queue", () => {
    expect(sql).not.toMatch(/INSERT\s+INTO\s+(public\.)?action_queue\b/i);
    expect(sql).not.toMatch(/UPDATE\s+(public\.)?action_queue\b/i);
  });

  it("RPC does NOT reference automation/device-control surfaces", () => {
    expect(sql).not.toMatch(/device[_-]?control|automation_trigger|equipment_command/i);
  });

  it("RPC does NOT introduce requestHash/request_hash", () => {
    expect(sql).not.toMatch(/requestHash|request_hash/);
  });
});

describe("pi_ingest_commit_batch RPC — not wired into Edge Function yet", () => {
  const INDEX_PATH = resolve(
    ROOT,
    "supabase/functions/pi-ingest-readings/index.ts",
  );
  const src = existsSync(INDEX_PATH) ? readFileSync(INDEX_PATH, "utf8") : "";

  it("index.ts does not call pi_ingest_commit_batch", () => {
    expect(src).not.toMatch(/pi_ingest_commit_batch/);
  });

  it("index.ts still has no .rpc()/.insert()/.upsert()/.update()/.delete()", () => {
    expect(src).not.toMatch(/\.rpc\s*\(/);
    expect(src).not.toMatch(/\.insert\s*\(/);
    expect(src).not.toMatch(/\.upsert\s*\(/);
    expect(src).not.toMatch(/\.update\s*\(/);
    expect(src).not.toMatch(/\.delete\s*\(/);
  });

  it("index.ts has no { ok: true } success path", () => {
    expect(src).not.toMatch(/ok\s*:\s*true/);
  });

  it("index.ts still returns auth_ok_pipeline_not_implemented", () => {
    expect(src).toMatch(/auth_ok_pipeline_not_implemented/);
  });
});
