import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DASHBOARD = readFileSync(resolve(__dirname, "../pages/Dashboard.tsx"), "utf8");

describe("Dashboard Quick Log manual VPD merge wiring (#2130)", () => {
  it("merges wide manual readings into stability only for the single-tent strip", () => {
    expect(DASHBOARD).toMatch(/const singleStripTentId = tents\.length === 1/);
    expect(DASHBOARD).toMatch(/useSensorsQuickLogManualReadings\(singleStripTentId\)/);
    expect(DASHBOARD).toContain("mergeVpdStabilityInputs(rs, vpdStabilityInputsFromWideReadings");
    expect(DASHBOARD).toContain("t.id === singleStripTentId");
    expect(DASHBOARD).toMatch(
      /const stabilityReadings[\s\S]*?computeEnvironmentStability\(stabilityReadings/,
    );
  });
});
