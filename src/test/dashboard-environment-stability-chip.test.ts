import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  formatStabilityChipView,
} from "@/lib/dashboardStabilityChipCopyRules";
import type { StabilityResult } from "@/lib/environmentStabilityRules";

const SRC = readFileSync(resolve(__dirname, "../pages/Dashboard.tsx"), "utf8");
const HELPER_SRC = readFileSync(
  resolve(__dirname, "../lib/dashboardStabilityChipCopyRules.ts"),
  "utf8",
);

const FORBIDDEN =
  /saveAlert|logAlertEvent|action_queue|service_role|insertAlert|device.control/i;

function fixture(overrides: Partial<StabilityResult>): StabilityResult {
  return {
    status: "stable",
    last24h: {
      hoursOutside: 0,
      hoursConsidered: 24,
      totalConsidered: 24,
      outsideCount: 0,
    },
    last7d: {
      hoursOutside: 0,
      hoursConsidered: 168,
      totalConsidered: 168,
      outsideCount: 0,
    },
    sparse: false,
    message: null,
    stage: "veg",
    ...overrides,
  };
}

describe("Dashboard environment stability chip — wiring", () => {
  it("imports and uses computeEnvironmentStability and the chip copy helper", () => {
    expect(SRC).toMatch(
      /import\s+\{\s*computeEnvironmentStability\s*\}\s+from\s+["']@\/lib\/environmentStabilityRules["']/,
    );
    expect(SRC).toMatch(
      /import\s+\{\s*formatStabilityChipView\s*\}\s+from\s+["']@\/lib\/dashboardStabilityChipCopyRules["']/,
    );
    expect(SRC).toMatch(
      /computeEnvironmentStability\(\s*rs\s*,\s*\{\s*stage:\s*t\.stage\s*\}\s*\)/,
    );
    expect(SRC).toMatch(/formatStabilityChipView\(stability\)/);
  });

  it("renders chip with per-tent testId", () => {
    expect(SRC).toContain("`dashboard-stability-chip-${tent.id}`");
  });

  it("does not duplicate VPD band tables in the page", () => {
    expect(SRC).not.toMatch(/min:\s*0\.8,\s*max:\s*1\.2/);
    expect(SRC).not.toMatch(/min:\s*1\.0,\s*max:\s*1\.5/);
  });

  it("chip region introduces no alert/queue/automation/device-control writes", () => {
    const blockMatch = SRC.match(
      /latestPerTent\.map\(\(\{[\s\S]*?dashboard-stability-chip-[\s\S]*?\}\)\;?\s*\}\)\}/,
    );
    expect(blockMatch).toBeTruthy();
    const block = blockMatch![0];
    expect(block).not.toMatch(FORBIDDEN);
    expect(block).not.toMatch(/service_role|action_queue|automation/i);
  });

  it("copy helper itself has no forbidden surface", () => {
    expect(HELPER_SRC).not.toMatch(FORBIDDEN);
    expect(HELPER_SRC).not.toMatch(/supabase|fetch\(|service_role/);
  });
});

describe("formatStabilityChipView copy", () => {
  it("renders 'Outside 24h: Xh' for stable/watch/unstable", () => {
    expect(formatStabilityChipView(fixture({ status: "stable" })).copy).toBe(
      "Outside 24h: 0h",
    );
    expect(
      formatStabilityChipView(
        fixture({
          status: "watch",
          last24h: {
            hoursOutside: 1.5,
            hoursConsidered: 24,
            totalConsidered: 24,
            outsideCount: 3,
          },
        }),
      ).copy,
    ).toBe("Outside 24h: 1.5h");
    expect(
      formatStabilityChipView(
        fixture({
          status: "unstable",
          last24h: {
            hoursOutside: 6,
            hoursConsidered: 24,
            totalConsidered: 24,
            outsideCount: 8,
          },
        }),
      ).copy,
    ).toBe("Outside 24h: 6h");
  });

  it("renders 'Stability: unavailable' when no usable data", () => {
    const v = formatStabilityChipView(
      fixture({
        status: "unavailable",
        last24h: {
          hoursOutside: 0,
          hoursConsidered: 0,
          totalConsidered: 0,
          outsideCount: 0,
        },
      }),
    );
    expect(v.copy).toBe("Stability: unavailable");
  });

  it("renders 'Set stage for VPD stability' when stage is missing", () => {
    const v = formatStabilityChipView(
      fixture({ status: "stage_unknown", stage: "unknown" }),
    );
    expect(v.copy).toBe("Set stage for VPD stability");
  });

  it("renders 'VPD context only' for harvest/drying", () => {
    const v = formatStabilityChipView(
      fixture({ status: "context_only", stage: "harvest" }),
    );
    expect(v.copy).toBe("VPD context only");
  });

  it("uses destructive tone only for unstable", () => {
    expect(
      formatStabilityChipView(fixture({ status: "unstable" })).toneClass,
    ).toMatch(/destructive/);
    expect(
      formatStabilityChipView(fixture({ status: "watch" })).toneClass,
    ).toMatch(/warning/);
    expect(
      formatStabilityChipView(fixture({ status: "stable" })).toneClass,
    ).not.toMatch(/destructive|warning/);
  });
});
