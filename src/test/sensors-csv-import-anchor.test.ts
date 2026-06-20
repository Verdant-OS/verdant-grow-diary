/**
 * sensors-csv-import-anchor — regression guard ensuring the Sensors page
 * keeps mounting the CSV import launcher. Verifies via source-level
 * inspection (cheap, no provider mocking needed) and a static safety
 * check that the page does not relabel csv data as live.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SENSORS_SRC = readFileSync(
  resolve(__dirname, "../pages/Sensors.tsx"),
  "utf8",
);

describe("Sensors page — CSV import regression guard", () => {
  it("imports the EnvironmentCsvImportLauncher", () => {
    expect(SENSORS_SRC).toMatch(
      /from\s+["']@\/components\/EnvironmentCsvImportLauncher["']/,
    );
  });

  it("mounts the launcher with a sensors-csv-import test anchor", () => {
    expect(SENSORS_SRC).toMatch(/data-testid="sensors-csv-import-anchor"/);
    expect(SENSORS_SRC).toMatch(/<EnvironmentCsvImportLauncher/);
    expect(SENSORS_SRC).toMatch(/testIdPrefix="sensors-csv-import"/);
  });

  it("passes the selected grow and tent through to the launcher", () => {
    expect(SENSORS_SRC).toMatch(/growId=\{selectedGrowId\}/);
    expect(SENSORS_SRC).toMatch(/tentId=\{tentId\}/);
  });

  it("preserves the existing manual reading anchor and bridge health card", () => {
    expect(SENSORS_SRC).toMatch(/data-testid="sensors-manual-reading-anchor"/);
    expect(SENSORS_SRC).toMatch(/<SensorBridgeHealthCard/);
  });

  it("never labels csv readings as live in the page copy", () => {
    const stripped = SENSORS_SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(
      /\/\/.*$/gm,
      "",
    );
    expect(stripped).not.toMatch(/csv[^a-z]+live/i);
    expect(stripped).not.toMatch(/live\s+csv/i);
  });

  it("does not introduce AI, Action Queue, alerts, or device-control wiring on the Sensors page", () => {
    const stripped = SENSORS_SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(
      /\/\/.*$/gm,
      "",
    );
    expect(stripped).not.toMatch(/action_queue/i);
    expect(stripped).not.toMatch(/from\(['"]alerts['"]\)/i);
    expect(stripped).not.toMatch(/lovable-ai|openai|gemini/i);
    expect(stripped).not.toMatch(
      /execute_device|setpoint_write|irrigation_control|light_control|fan_control/i,
    );
    expect(stripped).not.toMatch(/service_role/i);
    expect(stripped).not.toMatch(/raw_payload/);
  });
});
