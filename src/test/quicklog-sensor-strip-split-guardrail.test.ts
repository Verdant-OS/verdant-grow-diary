/**
 * Static guardrail: the parked Quick Log enhancements (mini-chart,
 * recent-series hook, localStorage attach preference) must NOT be wired
 * back into the production QuickLog component before field validation.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const QL = readFileSync(resolve(__dirname, "../components/QuickLog.tsx"), "utf8");

describe("QuickLog publish-slice split guardrail", () => {
  it("does not import or mount the sensor mini-chart", () => {
    expect(QL).not.toMatch(/QuickLogSensorMiniChart/);
  });

  it("does not import or use the recent tent sensor series hook", () => {
    expect(QL).not.toMatch(/useRecentTentSensorSeries/);
  });

  it("does not import or use the attach-preference localStorage helpers", () => {
    expect(QL).not.toMatch(/quickLogSensorAttachPreference/);
    expect(QL).not.toMatch(/hasQuickLogSensorAttachPreference/);
    expect(QL).not.toMatch(/loadQuickLogSensorAttachPreference/);
    expect(QL).not.toMatch(/saveQuickLogSensorAttachPreference/);
  });

  it("does not reference localStorage directly", () => {
    expect(QL).not.toMatch(/localStorage/);
  });

  it("parked source files are removed from the repo", () => {
    const root = resolve(__dirname, "..", "..");
    expect(existsSync(resolve(root, "src/components/QuickLogSensorMiniChart.tsx"))).toBe(false);
    expect(existsSync(resolve(root, "src/hooks/useRecentTentSensorSeries.ts"))).toBe(false);
    expect(existsSync(resolve(root, "src/lib/quickLogSensorMiniChartRules.ts"))).toBe(false);
    expect(existsSync(resolve(root, "src/lib/quickLogSensorAttachPreference.ts"))).toBe(false);
  });

  it("has no automation / device-control / fake-live wording", () => {
    expect(QL).not.toMatch(/action_queue/i);
    expect(QL).not.toMatch(/service_role/);
    expect(QL).not.toMatch(/functions\.invoke/);
    expect(QL).not.toMatch(/\.rpc\(/);
    expect(QL).not.toMatch(/live updating/i);
  });
});
