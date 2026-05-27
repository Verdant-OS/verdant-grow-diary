import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SRC = readFileSync(resolve(__dirname, "../pages/Sensors.tsx"), "utf8");

describe("Sensors VPD stage-missing info badge", () => {
  it("still imports from the canonical stage-aware VPD helper module", () => {
    expect(SRC).toMatch(/from\s+["']@\/lib\/vpdStageTargetRules["']/);
  });

  it("derives vpdStageMissing from latest VPD value and missing selected-tent stage", () => {
    expect(SRC).toMatch(
      /vpdStageMissing\s*=\s*latest\?\.vpd\s*!=\s*null\s*&&\s*selectedTentStage\s*==\s*null/,
    );
  });

  it("uses the shared VpdStageMissingBadge component", () => {
    expect(SRC).toMatch(
      /import\s+VpdStageMissingBadge\s+from\s+["']@\/components\/VpdStageMissingBadge["']/,
    );
    expect(SRC).toMatch(
      /<VpdStageMissingBadge[\s\S]*?testId=["']sensors-vpd-stage-missing-badge["']/,
    );
  });

  it("gates the badge on the VPD card and vpdStageMissing", () => {
    expect(SRC).toMatch(
      /m\.key\s*===\s*["']vpd["']\s*&&\s*vpdStageMissing\s*&&\s*\(\s*<VpdStageMissingBadge[\s\S]*?sensors-vpd-stage-missing-badge/,
    );
  });

  it("badge branch performs no alert/queue/automation writes", () => {
    const m = SRC.match(
      /m\.key\s*===\s*["']vpd["']\s*&&\s*vpdStageMissing\s*&&\s*\(([\s\S]*?)\)\}/,
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

  it("preserves the existing Sensors VPD stage hint", () => {
    expect(SRC).toContain('data-testid="sensors-vpd-stage-hint"');
  });
});
