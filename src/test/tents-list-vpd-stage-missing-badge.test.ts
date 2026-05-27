import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SRC = readFileSync(resolve(__dirname, "../pages/Tents.tsx"), "utf8");

describe("Tents list VPD stage-missing info badge", () => {
  it("still imports the canonical stage-aware VPD helper", () => {
    expect(SRC).toMatch(
      /classifyVpdAgainstStage[\s\S]*from\s+["']@\/lib\/vpdStageTargetRules["']/,
    );
  });

  it("uses the shared VpdStageMissingBadge component", () => {
    expect(SRC).toMatch(
      /import\s+VpdStageMissingBadge\s+from\s+["']@\/components\/VpdStageMissingBadge["']/,
    );
    expect(SRC).toMatch(
      /<VpdStageMissingBadge[\s\S]*?testId=["']tents-list-vpd-stage-missing-badge["']/,
    );
  });

  it("gates the badge on present VPD and unknown-normalized tent stage", () => {
    expect(SRC).toMatch(
      /last\?\.vpd\s*!=\s*null\s*&&\s*normalizeVpdStage\(t\.stage\)\s*===\s*"unknown"\s*&&\s*\(\s*<VpdStageMissingBadge[\s\S]*?tents-list-vpd-stage-missing-badge/,
    );
  });

  it("badge branch performs no alert/queue/automation writes", () => {
    const m = SRC.match(
      /normalizeVpdStage\(t\.stage\)\s*===\s*"unknown"\s*&&\s*\(([\s\S]*?)\)\}/,
    );
    expect(m).toBeTruthy();
    expect(m![1]).not.toMatch(
      /saveAlert|logAlertEvent|action_queue|service_role|automation|device.control|from\(['"]alerts['"]\)/i,
    );
  });

  it("does not introduce service_role or action_queue strings to the file", () => {
    expect(SRC).not.toMatch(/service_role/);
    expect(SRC).not.toMatch(/action_queue/);
  });

  it("preserves the existing stage-aware VPD MetricChip wiring", () => {
    expect(SRC).toMatch(/vpdMetricChipStatus\(vpdClassification\)/);
  });
});
