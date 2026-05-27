import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SRC = readFileSync(
  resolve(__dirname, "../components/PlantTentEnvironmentPanel.tsx"),
  "utf8",
);

describe("PlantTentEnvironmentPanel VPD stage-missing info badge", () => {
  it("still imports the canonical stage-aware VPD helper", () => {
    expect(SRC).toMatch(
      /classifyVpdAgainstStage[\s\S]*from\s+["']@\/lib\/vpdStageTargetRules["']/,
    );
  });

  it("renders the badge with required copy and test hook", () => {
    expect(SRC).toContain('data-testid="plant-tent-vpd-stage-missing-badge"');
    expect(SRC).toContain("Set plant stage to evaluate VPD targets.");
  });

  it("gates the badge on a present VPD value and missing plant stage", () => {
    expect(SRC).toMatch(
      /snap\?\.vpd\s*!==\s*null\s*&&\s*snap\?\.vpd\s*!==\s*undefined\s*&&\s*\(plantStage\s*\?\?\s*null\)\s*===\s*null\s*&&\s*\(\s*<div[\s\S]*?plant-tent-vpd-stage-missing-badge/,
    );
  });

  it("badge branch performs no alert/queue/automation writes", () => {
    const match = SRC.match(
      /\(plantStage\s*\?\?\s*null\)\s*===\s*null\s*&&\s*\(([\s\S]*?)\)\}/,
    );
    expect(match).toBeTruthy();
    const block = match![1];
    expect(block).not.toMatch(
      /saveAlert|logAlertEvent|action_queue|service_role|automation|device.control|from\(['"]alerts['"]\)/i,
    );
  });

  it("does not introduce service_role or action_queue strings to the file", () => {
    expect(SRC).not.toMatch(/service_role/);
    expect(SRC).not.toMatch(/action_queue/);
  });
});
