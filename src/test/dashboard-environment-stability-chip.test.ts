import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SRC = readFileSync(resolve(__dirname, "../pages/Dashboard.tsx"), "utf8");

const FORBIDDEN =
  /saveAlert|logAlertEvent|action_queue|service_role|automation|device.control|insertAlert/i;

describe("Dashboard environment stability chip", () => {
  it("imports and uses computeEnvironmentStability from the canonical helper", () => {
    expect(SRC).toMatch(
      /import\s+\{\s*computeEnvironmentStability\s*\}\s+from\s+["']@\/lib\/environmentStabilityRules["']/,
    );
    expect(SRC).toMatch(
      /computeEnvironmentStability\(\s*rs\s*,\s*\{\s*stage:\s*t\.stage\s*\}\s*\)/,
    );
  });

  it("renders chip with required testId per tent", () => {
    expect(SRC).toContain("`dashboard-stability-chip-${tent.id}`");
  });

  it("includes all four required copy variants", () => {
    expect(SRC).toContain("Set stage for VPD stability");
    expect(SRC).toContain("VPD context only");
    expect(SRC).toContain("Stability: unavailable");
    expect(SRC).toContain("Outside 24h:");
  });

  it("derives chip copy from stability.status (no duplicated VPD bands)", () => {
    expect(SRC).toMatch(/stability\.status\s*===\s*["']stage_unknown["']/);
    expect(SRC).toMatch(/stability\.status\s*===\s*["']context_only["']/);
    expect(SRC).toMatch(/stability\.status\s*===\s*["']unavailable["']/);
    expect(SRC).toMatch(/stability\.last24h\.hoursOutside/);
    // VPD band table must not be re-declared inside Dashboard
    expect(SRC).not.toMatch(/min:\s*0\.8,\s*max:\s*1\.2/);
  });

  it("does not introduce alert/queue/automation/device-control writes in the chip region", () => {
    // Scope safety scan to the per-tent stability block + its map body.
    // (Dashboard already calls saveAlert/logAlertEvent elsewhere for the
    // user-initiated environment alert persistence flow, unrelated to this slice.)
    const blockMatch = SRC.match(
      /latestPerTent\.map\(\(\{[\s\S]*?dashboard-stability-chip-[\s\S]*?\}\)\;?\s*\}\)\}/,
    );
    expect(blockMatch).toBeTruthy();
    const block = blockMatch![0];
    expect(block).not.toMatch(FORBIDDEN);
    expect(block).not.toMatch(/service_role|action_queue/);
    // Also confirm the helper import itself adds no forbidden surface.
    expect(SRC).toMatch(
      /import\s+\{\s*computeEnvironmentStability\s*\}\s+from\s+["']@\/lib\/environmentStabilityRules["']/,
    );
  });
});

