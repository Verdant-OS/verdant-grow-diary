import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_PATH = resolve(
  __dirname,
  "../../supabase/migrations/20260617115621_a2a5d7f5-7c52-4dd9-a5bb-687e9d26f4df.sql",
);

const sql = readFileSync(MIGRATION_PATH, "utf8");

describe("sensor_readings dedupe index + canonical source migration", () => {
  it("drops the existing partial unique index", () => {
    expect(sql).toMatch(
      /DROP INDEX IF EXISTS public\.sensor_readings_dedupe_uidx/,
    );
  });

  it("recreates sensor_readings_dedupe_uidx as a non-partial unique index", () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX\s+sensor_readings_dedupe_uidx\s+ON public\.sensor_readings\s*\(\s*user_id,\s*tent_id,\s*source,\s*metric,\s*captured_at\s*\)/,
    );
  });

  it("does not recreate the index with a WHERE captured_at IS NOT NULL predicate", () => {
    const createBlock = sql.match(
      /CREATE UNIQUE INDEX[\s\S]*?sensor_readings_dedupe_uidx[\s\S]*?;/,
    );
    expect(createBlock).not.toBeNull();
    expect(createBlock![0]).not.toMatch(/WHERE\s+captured_at\s+IS\s+NOT\s+NULL/i);
  });

  it("does not alter RLS, grants, or create/drop tables, and does not delete data", () => {
    expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(sql).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/DROP POLICY/i);
    expect(sql).not.toMatch(/\bGRANT\b/i);
    expect(sql).not.toMatch(/\bREVOKE\b/i);
    expect(sql).not.toMatch(/CREATE TABLE/i);
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/DELETE FROM/i);
    expect(sql).not.toMatch(/TRUNCATE/i);
  });

  it("updates validate_sensor_reading to include canonical V0 source labels", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.validate_sensor_reading/);
    for (const label of ["live", "manual", "csv", "demo", "stale", "invalid"]) {
      expect(sql).toContain(`'${label}'`);
    }
  });

  it("preserves back-compat source labels in validate_sensor_reading", () => {
    for (const label of [
      "ecowitt",
      "mqtt",
      "webhook",
      "pi_bridge",
      "webhook_generic",
    ]) {
      expect(sql).toContain(`'${label}'`);
    }
  });
});
