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

  it("renders the badge with the required copy under the required test hook", () => {
    expect(SRC).toContain('data-testid="tents-list-vpd-stage-missing-badge"');
    expect(SRC).toContain("Set plant stage to evaluate VPD targets.");
  });

  it("gates the badge on present VPD and missing tent stage", () => {
    expect(SRC).toMatch(
      /last\?\.vpd\s*!=\s*null\s*&&\s*\(t\.stage\s*\?\?\s*null\)\s*==\s*null\s*&&\s*\(\s*<div[\s\S]*?tents-list-vpd-stage-missing-badge/,
    );
  });

  it("badge branch performs no alert/queue/automation writes", () => {
    const match = SRC.match(
      /\(t\.stage\s*\?\?\s*null\)\s*==\s*null\s*&&\s*\(([\s\S]*?)\)\}/,
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

  it("preserves the existing stage-aware VPD MetricChip wiring", () => {
    expect(SRC).toMatch(/vpdMetricChipStatus\(vpdClassification\)/);
  });
});
