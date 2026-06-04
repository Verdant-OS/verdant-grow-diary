/**
 * Sensors page — Import sensor data anchor + TentCsvImportCard placement.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const SENSORS = readFileSync(resolve(ROOT, "src/pages/Sensors.tsx"), "utf8");

describe("Sensors page · import sensor data anchor", () => {
  it("has id=import-sensor-data scroll anchor", () => {
    expect(SENSORS).toContain('id="import-sensor-data"');
    expect(SENSORS).toContain('data-testid="sensors-import-sensor-data-anchor"');
  });

  it("renders TentCsvImportCard for the selected tent", () => {
    expect(SENSORS).toContain("<TentCsvImportCard");
    expect(SENSORS).toMatch(/tentId=\{tentId\}/);
    expect(SENSORS).toMatch(/growId=\{/);
  });

  it("does not contain forbidden strings", () => {
    expect(SENSORS).not.toMatch(/service_role/);
    expect(SENSORS).not.toMatch(/autopilot/i);
    expect(SENSORS).not.toMatch(/_executed["']/);
  });
});
