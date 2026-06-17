/**
 * Static safety tests for the soil_temp_c migration.
 *
 * Guards Verdant V0 invariants for sensor validation:
 *  - the validate_sensor_reading trigger allowlist includes soil_temp_c
 *  - existing metrics are preserved
 *  - canonical source allowlist is preserved
 *  - bounds (-20..80 °C) are enforced and not silently clamped
 *  - the latest-snapshot helper reads the canonical soil_temp_c metric
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION =
  "supabase/migrations/20260617164759_407c0f40-1f3a-4ac8-a25e-289c175f87fc.sql";

const sql = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");

describe("sensor-metric-allowlist (soil_temp_c migration)", () => {
  it("adds soil_temp_c to the metric allowlist", () => {
    expect(sql).toMatch(/'soil_temp_c'/);
  });

  it("preserves existing metric allowlist entries", () => {
    for (const m of [
      "temperature_c",
      "humidity_pct",
      "vpd_kpa",
      "co2_ppm",
      "soil_moisture_pct",
      "ph",
      "ec",
      "ppfd",
    ]) {
      expect(sql).toContain(`'${m}'`);
    }
  });

  it("preserves canonical source allowlist", () => {
    for (const s of ["'live'", "'manual'", "'csv'", "'demo'", "'stale'", "'invalid'"]) {
      expect(sql).toContain(s);
    }
  });

  it("enforces soil_temp_c bounds (-20..80) without clamping", () => {
    expect(sql).toMatch(/soil_temp_c[\s\S]*<\s*-20\s*OR[\s\S]*>\s*80/);
    expect(sql).not.toMatch(/LEAST\s*\([^)]*soil_temp_c/);
    expect(sql).not.toMatch(/GREATEST\s*\([^)]*soil_temp_c/);
  });

  it("get_latest_tent_sensor_snapshot reads canonical soil_temp_c", () => {
    expect(sql).toMatch(/metric\s*=\s*'soil_temp_c'/);
  });

  it("does not weaken validation (still rejects NaN/NULL value)", () => {
    expect(sql).toMatch(/sensor value must be a finite number/);
  });
});
