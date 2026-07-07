/**
 * manual_sensor_snapshot_edits migration — static safety posture.
 *
 * Guards the append-only correction history migration. Any violation of
 * these rules is a stop-ship — the table must never mutate original
 * sensor_readings, never relabel to non-manual sources, and never leak
 * across users.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIG_DIR = join(process.cwd(), "supabase", "migrations");

function findMigration(): string {
  const files = readdirSync(MIG_DIR);
  const match = files.find((f) => f.endsWith("_manual_sensor_snapshot_edits.sql"));
  if (!match) throw new Error("manual_sensor_snapshot_edits migration not found");
  return readFileSync(join(MIG_DIR, match), "utf8");
}

describe("manual_sensor_snapshot_edits migration posture", () => {
  const sql = findMigration();
  const lower = sql.toLowerCase();

  it("creates public.manual_sensor_snapshot_edits table", () => {
    expect(lower).toMatch(/create\s+table\s+public\.manual_sensor_snapshot_edits/);
  });

  it("references sensor_readings for original + replacement with FK safety", () => {
    expect(sql).toMatch(/original_reading_id[^,]+references\s+public\.sensor_readings\(id\)\s+on\s+delete\s+cascade/i);
    expect(sql).toMatch(/replacement_reading_id[^,]+references\s+public\.sensor_readings\(id\)\s+on\s+delete\s+set\s+null/i);
  });

  it("pins source_before and source_after to 'manual' via CHECK", () => {
    expect(sql).toMatch(/source_before[^,]+check\s*\(\s*source_before\s*=\s*'manual'\s*\)/i);
    expect(sql).toMatch(/source_after[^,]+check\s*\(\s*source_after\s*=\s*'manual'\s*\)/i);
  });

  it("enables RLS", () => {
    expect(lower).toMatch(/alter\s+table\s+public\.manual_sensor_snapshot_edits\s+enable\s+row\s+level\s+security/);
  });

  it("grants SELECT + INSERT to authenticated, ALL to service_role, no anon, no PUBLIC", () => {
    expect(sql).toMatch(/grant\s+select\s*,\s*insert\s+on\s+public\.manual_sensor_snapshot_edits\s+to\s+authenticated/i);
    expect(sql).toMatch(/grant\s+all\s+on\s+public\.manual_sensor_snapshot_edits\s+to\s+service_role/i);
    // No anon grant on this table.
    expect(sql).not.toMatch(/grant[^;]+on\s+public\.manual_sensor_snapshot_edits[^;]+to\s+anon/i);
    // No PUBLIC grant on this table.
    expect(sql).not.toMatch(/grant[^;]+on\s+public\.manual_sensor_snapshot_edits[^;]+to\s+public/i);
  });

  it("has SELECT-own and INSERT-own policies only (no UPDATE, no DELETE)", () => {
    expect(sql).toMatch(/create\s+policy[^;]+manual_sensor_snapshot_edits[^;]+for\s+select[^;]+auth\.uid\(\)\s*=\s*user_id/i);
    expect(sql).toMatch(/create\s+policy[^;]+manual_sensor_snapshot_edits[^;]+for\s+insert/i);
    expect(sql).not.toMatch(/create\s+policy[^;]+manual_sensor_snapshot_edits[^;]+for\s+update/i);
    expect(sql).not.toMatch(/create\s+policy[^;]+manual_sensor_snapshot_edits[^;]+for\s+delete/i);
  });

  it("insert policy validates ownership of original + replacement readings and manual source", () => {
    // Correlated EXISTS on sensor_readings with auth.uid() + source='manual'.
    expect(sql).toMatch(/exists\s*\(\s*select\s+1\s+from\s+public\.sensor_readings\s+r\s+where\s+r\.id\s*=\s*original_reading_id[\s\S]+r\.user_id\s*=\s*auth\.uid\(\)[\s\S]+r\.source\s*=\s*'manual'/i);
    expect(sql).toMatch(/replacement_reading_id\s+is\s+null[\s\S]+exists\s*\(\s*select\s+1\s+from\s+public\.sensor_readings\s+r2/i);
  });

  it("indexes user_id/changed_at and original_reading_id for owner reads", () => {
    expect(lower).toMatch(/create\s+index[^;]+user_id[^;]+changed_at\s+desc/);
    expect(lower).toMatch(/create\s+index[^;]+\(\s*original_reading_id\s*\)/);
  });

  it("does not modify sensor_readings/alerts/action_queue/ai_credit_spends", () => {
    for (const forbidden of [
      /alter\s+table\s+public\.sensor_readings/i,
      /update\s+public\.sensor_readings/i,
      /delete\s+from\s+public\.sensor_readings/i,
      /public\.alerts\b/i,
      /public\.action_queue\b/i,
      /public\.ai_credit_spends\b/i,
      /public\.pheno_/i,
    ]) {
      expect(sql).not.toMatch(forbidden);
    }
  });
});
