import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SRC = readFileSync(
  resolve(__dirname, "../pages/Dashboard.tsx"),
  "utf8",
);

describe("Dashboard VPD stage-missing info badge", () => {
  it("computes vpdStageMissing from current VPD value and unknown stage", () => {
    expect(SRC).toMatch(
      /vpdStageMissing\s*=\s*\n?\s*snap\?\.vpd\s*!=\s*null\s*&&\s*\(scopedGrow\?\.stage\s*\?\?\s*null\)\s*===\s*null/,
    );
  });

  it("renders the info badge with the required copy under a test hook", () => {
    expect(SRC).toContain('data-testid="dashboard-vpd-stage-missing-badge"');
    expect(SRC).toContain("Set plant stage to evaluate VPD targets.");
  });

  it("gates the badge on vpdStageMissing only", () => {
    expect(SRC).toMatch(
      /\{vpdStageMissing\s*&&\s*\(\s*<div[\s\S]*?dashboard-vpd-stage-missing-badge/,
    );
  });

  it("does not persist alerts, queue actions, or introduce automation/device control from the badge branch", () => {
    // The badge block should not call saveAlert/logAlertEvent/action_queue/service_role/etc.
    const badgeBlockMatch = SRC.match(
      /\{vpdStageMissing\s*&&\s*\(([\s\S]*?)\)\}\s*\n\s*\{alerts\.length/,
    );
    expect(badgeBlockMatch).toBeTruthy();
    const block = badgeBlockMatch![1];
    expect(block).not.toMatch(/saveAlert|logAlertEvent|action_queue|service_role|automation|device.control|from\(['"]alerts['"]\)/i);
  });

  it("does not introduce service_role/action_queue/device-control strings to the file", () => {
    expect(SRC).not.toMatch(/service_role/);
    expect(SRC).not.toMatch(/action_queue/);
    expect(SRC).not.toMatch(/device[- ]control/i);
  });

});
