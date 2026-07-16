import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SRC = readFileSync(resolve(__dirname, "../pages/Tents.tsx"), "utf8");

describe("Tents list VPD stage-missing info badge", () => {
  it("still imports the canonical stage-aware VPD helper", () => {
    expect(SRC).toMatch(/normalizeVpdStage[\s\S]*from\s+["']@\/lib\/vpdStageTargetRules["']/);
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
    // hasVpdValue is derived from the truth-filtered snapshot: the VPD
    // metric exists and is not status "unknown" (i.e. a real value).
    expect(SRC).toMatch(/const hasVpdValue = !!vpdMetric && vpdMetric\.status !== "unknown"/);
    expect(SRC).toMatch(
      /hasVpdValue\s*&&\s*normalizeVpdStage\(t\.stage\)\s*===\s*"unknown"\s*&&\s*\(\s*<VpdStageMissingBadge[\s\S]*?tents-list-vpd-stage-missing-badge/,
    );
  });

  it("badge branch performs no alert/queue/automation writes", () => {
    const m = SRC.match(/normalizeVpdStage\(t\.stage\)\s*===\s*"unknown"\s*&&\s*\(([\s\S]*?)\)\}/);
    expect(m).toBeTruthy();
    expect(m![1]).not.toMatch(
      /saveAlert|logAlertEvent|action_queue|service_role|automation|device.control|from\(['"]alerts['"]\)/i,
    );
  });

  it("does not introduce service_role or action_queue strings to the file", () => {
    expect(SRC).not.toMatch(/service_role/);
    expect(SRC).not.toMatch(/action_queue/);
  });

  it("preserves the stage-aware VPD MetricChip wiring via the shared presenter", () => {
    expect(SRC).toMatch(/buildTentSnapshotView/);
    expect(SRC).toMatch(/const vpdMetric = snapView\.metrics\.find\(\(m\) => m\.key === "vpd"\)/);
  });
});
