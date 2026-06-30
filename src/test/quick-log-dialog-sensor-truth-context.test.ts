/**
 * Verdant QuickLog Dialog Sensor Truth Context v1 — presenter contract.
 *
 * Static-source assertions. Reads QuickLog.tsx and verifies the
 * Manual snapshot truth lines render inside the Sensor truth section,
 * sourced from the shared manualSensorTruthCopy constants.
 *
 * No Supabase, no rendering, no writes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MANUAL_SENSOR_TRUTH_TITLE,
  MANUAL_SENSOR_TRUTH_SOURCE_LINE,
  MANUAL_SENSOR_TRUTH_NOT_DEVICE_CONTROL_LINE,
  MANUAL_SENSOR_TRUTH_NOT_DIAGNOSIS_LINE,
  MANUAL_SENSOR_TRUTH_MISSING_READINGS_LINE,
} from "@/constants/manualSensorTruthCopy";

const SRC = readFileSync(resolve("src/components/QuickLog.tsx"), "utf8");

describe("QuickLog Dialog Sensor Truth Context v1 — copy wiring", () => {
  it("imports the shared manualSensorTruthCopy constants", () => {
    expect(SRC).toMatch(
      /from\s+"@\/constants\/manualSensorTruthCopy"/,
    );
    expect(SRC).toContain("MANUAL_SENSOR_TRUTH_TITLE");
    expect(SRC).toContain("MANUAL_SENSOR_TRUTH_LINES");
    expect(SRC).toContain("MANUAL_SENSOR_TRUTH_MISSING_READINGS_LINE");
  });

  it("renders a manual-truth block inside the QuickLog dialog", () => {
    expect(SRC).toMatch(/data-testid="quick-log-snapshot-manual-truth"/);
    expect(SRC).toMatch(/data-testid="quick-log-snapshot-manual-truth-line"/);
    expect(SRC).toMatch(/data-testid="quick-log-snapshot-manual-truth-missing"/);
  });

  it("renders the manual-truth block inside the Sensor truth section", () => {
    const sectionStart = SRC.indexOf('data-testid="quick-log-truth-section"');
    const blockStart = SRC.indexOf('data-testid="quick-log-snapshot-manual-truth"');
    const toggleStart = SRC.indexOf('data-testid="quick-log-snapshot-toggle"');
    expect(sectionStart).toBeGreaterThan(0);
    expect(blockStart).toBeGreaterThan(sectionStart);
    // Block appears above (or near) the attach toggle so the grower
    // sees the truth context before flipping it.
    expect(blockStart).toBeLessThan(toggleStart);
  });

  it("does not inline duplicate manual-truth string literals", () => {
    // The presenter must source copy from constants. Hardcoded duplicates
    // would let the safety language drift out of sync with the shared file.
    expect(SRC).not.toContain(MANUAL_SENSOR_TRUTH_SOURCE_LINE);
    expect(SRC).not.toContain(MANUAL_SENSOR_TRUTH_NOT_DEVICE_CONTROL_LINE);
    expect(SRC).not.toContain(MANUAL_SENSOR_TRUTH_NOT_DIAGNOSIS_LINE);
    expect(SRC).not.toContain(MANUAL_SENSOR_TRUTH_MISSING_READINGS_LINE);
  });
});

describe("QuickLog Dialog Sensor Truth Context v1 — constants safety", () => {
  it("manual-truth title says 'Manual snapshot'", () => {
    expect(MANUAL_SENSOR_TRUTH_TITLE).toBe("Manual snapshot");
  });

  it("manual-truth lines never call manual data live", () => {
    expect(MANUAL_SENSOR_TRUTH_SOURCE_LINE).toMatch(/not live sensor data/i);
    expect(MANUAL_SENSOR_TRUTH_NOT_DEVICE_CONTROL_LINE).toMatch(
      /not live device control/i,
    );
  });

  it("manual-truth lines never imply diagnosis from one reading", () => {
    expect(MANUAL_SENSOR_TRUTH_NOT_DIAGNOSIS_LINE).toMatch(
      /not a plant-health diagnosis/i,
    );
  });

  it("missing-readings line keeps unknown ≠ healthy", () => {
    expect(MANUAL_SENSOR_TRUTH_MISSING_READINGS_LINE).toMatch(/unknown/i);
    expect(MANUAL_SENSOR_TRUTH_MISSING_READINGS_LINE).toMatch(/not healthy/i);
  });
});

describe("QuickLog Dialog Sensor Truth Context v1 — behavior preserved", () => {
  it("does not change the attach-toggle test id or wiring", () => {
    expect(SRC).toMatch(/data-testid="quick-log-snapshot-toggle"/);
    expect(SRC).toMatch(/checked=\{snapshot && !!selectedPlant && snapshotUsable\}/);
  });

  it("does not introduce device-control imports", () => {
    expect(SRC).not.toMatch(/device[-_ ]?control/i);
  });

  it("missing-readings line is gated on no snapshot / not usable", () => {
    expect(SRC).toMatch(/\(!snapshot \|\| !snapshotUsable\)/);
  });
});
