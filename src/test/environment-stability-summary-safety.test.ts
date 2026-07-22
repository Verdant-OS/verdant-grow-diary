import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const HELPER_SRC = readFileSync(resolve(__dirname, "../lib/environmentStabilityRules.ts"), "utf8");
const CARD_SRC = readFileSync(
  resolve(__dirname, "../components/EnvironmentStabilityCard.tsx"),
  "utf8",
);
const TENT_SRC = readFileSync(resolve(__dirname, "../pages/TentDetail.tsx"), "utf8");
const SENSORS_SRC = readFileSync(resolve(__dirname, "../pages/Sensors.tsx"), "utf8");

const FORBIDDEN =
  /saveAlert|logAlertEvent|action_queue|service_role|automation|device.control|from\(['"]alerts['"]\)|insertAlert/i;

describe("Environment Stability Summary v1 — safety + wiring", () => {
  it("helper reuses the canonical stage-aware VPD classifier", () => {
    expect(HELPER_SRC).toMatch(
      /classifyVpdAgainstStage[\s\S]*from\s+["']@\/lib\/vpdStageTargetRules["']/,
    );
  });

  it("helper contains no alert/queue/automation/device-control writes", () => {
    expect(HELPER_SRC).not.toMatch(FORBIDDEN);
    expect(HELPER_SRC).not.toMatch(/fetch\(|supabase|service_role/);
  });

  it("card presenter contains no alert/queue/automation/device-control writes", () => {
    expect(CARD_SRC).not.toMatch(FORBIDDEN);
    expect(CARD_SRC).not.toMatch(/fetch\(|supabase|service_role/);
  });

  it("Tent Detail renders EnvironmentStabilityCard with tent stage", () => {
    expect(TENT_SRC).toMatch(
      /import\s+EnvironmentStabilityCard\s+from\s+["']@\/components\/EnvironmentStabilityCard["']/,
    );
    expect(TENT_SRC).toMatch(
      /<EnvironmentStabilityCard[\s\S]*?testId=["']tent-detail-environment-stability["'][\s\S]*?stage:\s*tent\.stage/,
    );
  });

  it("Sensors page renders EnvironmentStabilityCard and respects selected-tent filter", () => {
    expect(SENSORS_SRC).toMatch(
      /import\s+EnvironmentStabilityCard\s+from\s+["']@\/components\/EnvironmentStabilityCard["']/,
    );
    // The card must use the selected-tent slice narrowed to actual VPD
    // observations, not compatibility zeroes or global readings.
    expect(SENSORS_SRC).toMatch(/vpdStabilityReadings\s*=\s*readingsByMetric\.vpd/);
    expect(SENSORS_SRC).toMatch(
      /computeEnvironmentStability\(\s*vpdStabilityReadings\s*,\s*\{[\s\S]*?stage:\s*selectedTentStage/,
    );
    expect(SENSORS_SRC).toMatch(
      /<EnvironmentStabilityCard[\s\S]*?testId=["']sensors-environment-stability["'][\s\S]*?result=\{vpdStability\}/,
    );
  });

  it("Sensors page reconciles derived VPD with an unavailable stability summary", () => {
    // When only a derived VPD estimate exists, the stability card reports
    // unavailable (it consumes directly measured VPD only). The sibling note
    // must name both facts so they cannot read as contradictory.
    expect(SENSORS_SRC).toMatch(
      /derivedVpdKpa\s*!==\s*null\s*&&\s*vpdStability\.status\s*===\s*["']unavailable["']/,
    );
    expect(SENSORS_SRC).toContain("sensors-derived-vpd-stability-note");
    expect(SENSORS_SRC).toMatch(
      /A derived VPD estimate is available below; stability tracking requires\s+directly recorded VPD readings\./,
    );
  });

  it("does not introduce service_role or action_queue strings to the touched pages", () => {
    expect(TENT_SRC).not.toMatch(/service_role|action_queue/);
    expect(SENSORS_SRC).not.toMatch(/service_role|action_queue/);
  });

  it("card copy includes the required labels", () => {
    expect(CARD_SRC).toContain("Outside VPD target");
    expect(CARD_SRC).toContain("Last 24h");
    expect(CARD_SRC).toContain("Last 7d");
    expect(CARD_SRC).toContain("Stage-aware");
    expect(CARD_SRC).toContain("Read-only summary");
  });
});
