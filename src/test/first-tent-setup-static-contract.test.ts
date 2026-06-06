/**
 * Static contract: Sensors page + QuickLog enforce the first-tent
 * gate before sensor pairing / sensor snapshot surfaces.
 *
 * No app/schema/RLS/ingest changes — these tests scan source.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const SENSORS = readFileSync(resolve(ROOT, "src/pages/Sensors.tsx"), "utf8");
const QUICK_LOG = readFileSync(resolve(ROOT, "src/components/QuickLog.tsx"), "utf8");
const MANUAL = readFileSync(
  resolve(ROOT, "src/components/ManualSensorReadingCard.tsx"),
  "utf8",
);
const EMPTY_STATE = readFileSync(
  resolve(ROOT, "src/components/FirstTentSetupEmptyState.tsx"),
  "utf8",
);

describe("First-tent setup gate — Sensors page", () => {
  it("renders the empty state instead of bridge/manual UI when no active tent exists", () => {
    expect(SENSORS).toMatch(/FirstTentSetupEmptyState/);
    expect(SENSORS).toMatch(/manualTents\.length === 0/);
    expect(SENSORS).toMatch(/surface="sensor_pairing"/);
  });

  it("does not auto-create a tent or fabricate live data on the sensor surface", () => {
    expect(SENSORS).not.toMatch(/\.from\(\s*["']tents["']\s*\)\s*\.insert/);
    expect(SENSORS).not.toMatch(/source:\s*["']live["']/);
  });
});

describe("First-tent setup gate — ManualSensorReadingCard", () => {
  it("uses the shared helper and gates submission behind active tents", () => {
    expect(MANUAL).toMatch(/shouldRequireFirstTentSetup/);
    expect(MANUAL).toMatch(/FirstTentSetupEmptyState/);
    expect(MANUAL).toMatch(/manual_sensor/);
  });
});

describe("First-tent setup gate — QuickLog snapshot attachment", () => {
  it("hides the snapshot toggle + strip when no active tent exists", () => {
    expect(QUICK_LOG).toMatch(/shouldRequireFirstTentSetup/);
    expect(QUICK_LOG).toMatch(/quick-log-snapshot-tent-required/);
    expect(QUICK_LOG).toMatch(/!tentSetupRequired/);
  });

  it("does not auto-select a tent or fabricate snapshot context", () => {
    expect(QUICK_LOG).not.toMatch(/\.from\(\s*["']tents["']\s*\)\s*\.insert/);
    expect(QUICK_LOG).not.toMatch(/fabricat|fake/i);
  });
});

describe("First-tent setup empty state safety", () => {
  it("never advertises live/demo data and routes the CTA through react-router", () => {
    expect(EMPTY_STATE.toLowerCase()).not.toMatch(/live|demo|fake/);
    expect(EMPTY_STATE).toMatch(/from\s+["']react-router-dom["']/);
  });
});
