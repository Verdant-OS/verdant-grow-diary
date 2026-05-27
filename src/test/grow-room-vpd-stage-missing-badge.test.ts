import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SRC = readFileSync(
  resolve(__dirname, "../pages/GrowRoomMode.tsx"),
  "utf8",
);

describe("GrowRoomMode VPD stage-missing info badge", () => {
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
      /<VpdStageMissingBadge[\s\S]*?testId=["']grow-room-vpd-stage-missing-badge["']/,
    );
  });

  it("gates the badge on a present VPD value and missing tent stage", () => {
    expect(SRC).toMatch(
      /card\.snapshot\?\.vpd\s*!=\s*null\s*&&\s*\n?\s*\(tentStageById\[card\.tentId\]\s*\?\?\s*null\)\s*===\s*null\s*&&\s*\(\s*<VpdStageMissingBadge[\s\S]*?grow-room-vpd-stage-missing-badge/,
    );
  });

  it("badge branch performs no alert/queue/automation writes", () => {
    const m = SRC.match(
      /\(tentStageById\[card\.tentId\]\s*\?\?\s*null\)\s*===\s*null\s*&&\s*\(([\s\S]*?)\)\}/,
    );
    expect(m).toBeTruthy();
    expect(m![1]).not.toMatch(
      /saveAlert|logAlertEvent|action_queue|service_role|automation|device.control|from\(['"]alerts['"]\)/i,
    );
  });

  it("does not introduce service_role strings to the file", () => {
    expect(SRC).not.toMatch(/service_role/);
  });

  it("preserves the existing grow-room VPD stage hint", () => {
    expect(SRC).toContain('data-testid="grow-room-vpd-stage-hint"');
  });
});
