/**
 * Today Trust + Route Polish v1 — Plants KPI source label.
 *
 * Static-file scan: the Plants KPI must clarify that "healthy" reflects
 * the grower-assigned plant.health field, not a sensor-derived health
 * verdict. Calculation (plants.filter(p => p.health === "healthy")) must
 * remain unchanged.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DASHBOARD = readFileSync(
  resolve(__dirname, "../../src/pages/Dashboard.tsx"),
  "utf8",
);

describe("Dashboard · Plants KPI source label", () => {
  it("clarifies the healthy count is user-assigned, not sensor-derived", () => {
    expect(DASHBOARD).toMatch(/user-assigned, not sensor-derived/);
  });

  it("does not imply the healthy count is live or sensor-derived", () => {
    expect(DASHBOARD).not.toMatch(/sensor-derived health/i);
    expect(DASHBOARD).not.toMatch(/live[- ]healthy/i);
    expect(DASHBOARD).not.toMatch(/healthy by sensor/i);
  });

  it("preserves the original healthy count calculation", () => {
    expect(DASHBOARD).toMatch(
      /plants\.filter\(\(p\)\s*=>\s*p\.health\s*===\s*"healthy"\)\.length/,
    );
  });
});
