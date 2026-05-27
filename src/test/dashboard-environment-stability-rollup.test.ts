import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  computeStabilityRollup,
} from "@/lib/dashboardStabilityRollupRules";
import type { StabilityResult } from "@/lib/environmentStabilityRules";

const SRC = readFileSync(resolve(__dirname, "../pages/Dashboard.tsx"), "utf8");
const HELPER_SRC = readFileSync(
  resolve(__dirname, "../lib/dashboardStabilityRollupRules.ts"),
  "utf8",
);

const FORBIDDEN =
  /saveAlert|logAlertEvent|action_queue|service_role|insertAlert|device\.control|automation/i;

function r(status: StabilityResult["status"]): StabilityResult {
  return {
    status,
    last24h: { hoursOutside: 0, hoursConsidered: 0, totalConsidered: 0, outsideCount: 0 },
    last7d: { hoursOutside: 0, hoursConsidered: 0, totalConsidered: 0, outsideCount: 0 },
    sparse: false,
    message: null,
    stage: "veg",
  };
}

describe("computeStabilityRollup", () => {
  it("returns 0 of N drifting when all stable", () => {
    const v = computeStabilityRollup([r("stable"), r("stable"), r("stable"), r("stable")]);
    expect(v.total).toBe(4);
    expect(v.driftingCount).toBe(0);
    expect(v.copy).toBe("0 of 4 tents drifting");
    expect(v.tone).toBe("stable");
  });

  it("counts watch + unstable as drifting", () => {
    const v = computeStabilityRollup([r("stable"), r("watch"), r("unstable"), r("stable")]);
    expect(v.driftingCount).toBe(2);
    expect(v.copy).toBe("2 of 4 tents drifting");
    expect(v.tone).toBe("unstable");
  });

  it("watch-only drifting uses watch tone", () => {
    const v = computeStabilityRollup([r("stable"), r("watch")]);
    expect(v.driftingCount).toBe(1);
    expect(v.tone).toBe("watch");
    expect(v.copy).toBe("1 of 2 tents drifting");
  });

  it("counts unavailable separately and not as drifting", () => {
    const v = computeStabilityRollup([r("unavailable")]);
    expect(v.driftingCount).toBe(0);
    expect(v.unavailableCount).toBe(1);
    expect(v.copy).toBe("1 tent unavailable");
    expect(v.tone).toBe("unavailable");
  });

  it("counts stage_unknown separately and not as drifting", () => {
    const v = computeStabilityRollup([r("stage_unknown")]);
    expect(v.driftingCount).toBe(0);
    expect(v.stageUnknownCount).toBe(1);
    expect(v.copy).toBe("Set stage for 1 tent");
  });

  it("excludes context_only from drifting", () => {
    const v = computeStabilityRollup([r("context_only"), r("context_only")]);
    expect(v.driftingCount).toBe(0);
    expect(v.contextOnlyCount).toBe(2);
  });

  it("is deterministic for the same input", () => {
    const input = [r("stable"), r("watch"), r("unstable"), r("unavailable")];
    expect(computeStabilityRollup(input)).toEqual(computeStabilityRollup(input));
  });

  it("handles empty list", () => {
    const v = computeStabilityRollup([]);
    expect(v.total).toBe(0);
    expect(v.tone).toBe("unavailable");
  });
});

describe("Dashboard wiring", () => {
  it("imports and uses computeStabilityRollup", () => {
    expect(SRC).toMatch(
      /import\s+\{[^}]*computeStabilityRollup[^}]*\}\s+from\s+["']@\/lib\/dashboardStabilityRollupRules["']/,
    );
    expect(SRC).toMatch(/computeStabilityRollup\(/);
  });

  it("renders rollup with dashboard-stability-rollup testId", () => {
    expect(SRC).toContain('data-testid="dashboard-stability-rollup"');
  });

  it("helper has no forbidden surface", () => {
    expect(HELPER_SRC).not.toMatch(FORBIDDEN);
    expect(HELPER_SRC).not.toMatch(/supabase|fetch\(/);
  });

  it("rollup region introduces no alert/queue/automation/device-control writes", () => {
    const startIdx = SRC.indexOf('data-testid="dashboard-stability-rollup"');
    expect(startIdx).toBeGreaterThan(-1);
    const block = SRC.slice(Math.max(0, startIdx - 400), startIdx + 400);
    expect(block).not.toMatch(FORBIDDEN);
  });
});
