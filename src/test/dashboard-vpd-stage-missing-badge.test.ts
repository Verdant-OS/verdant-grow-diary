import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SRC = readFileSync(
  resolve(__dirname, "../pages/Dashboard.tsx"),
  "utf8",
);

describe("Dashboard VPD stage-missing info badge", () => {
  it("uses the shared VpdStageMissingBadge component", () => {
    expect(SRC).toMatch(
      /import\s+VpdStageMissingBadge\s+from\s+["']@\/components\/VpdStageMissingBadge["']/,
    );
    expect(SRC).toMatch(
      /<VpdStageMissingBadge[\s\S]*?testId=["']dashboard-vpd-stage-missing-badge["']/,
    );
  });

  it("computes vpdStageMissing from current VPD value and unknown stage", () => {
    expect(SRC).toMatch(
      /vpdStageMissing\s*=\s*\n?\s*snap\?\.vpd\s*!=\s*null\s*&&\s*\(scopedGrow\?\.stage\s*\?\?\s*null\)\s*===\s*null/,
    );
  });

  it("gates the badge on vpdStageMissing only", () => {
    expect(SRC).toMatch(
      /\{vpdStageMissing\s*&&\s*\(\s*<VpdStageMissingBadge[\s\S]*?dashboard-vpd-stage-missing-badge/,
    );
  });

  it("badge branch performs no alert/queue/automation writes", () => {
    const m = SRC.match(
      /\{vpdStageMissing\s*&&\s*\(([\s\S]*?)\)\}/,
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
});
