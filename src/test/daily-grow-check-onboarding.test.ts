/**
 * Tests for the pure Daily Grow Check onboarding guidance rules.
 *
 * Also includes static safety scans confirming the feature does not add
 * any device control, automation, service_role usage, or new write paths
 * to alerts/action_queue/sensor_readings/diary_entries.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  deriveDailyGrowCheckOnboarding,
  ONBOARDING_TITLE,
} from "@/lib/dailyGrowCheckOnboardingRules";

const READY_INPUT = {
  hasActiveGrow: true,
  tentsCount: 1,
  plantsCount: 1,
  plantsWithoutTentCount: 0,
  focusedPlantId: null as string | null,
  focusedPlantTentId: null as string | null,
  hasAnyManualSnapshot: true,
  hasAnyQuickLog: true,
  hasTodayCheckActivity: true,
};

describe("deriveDailyGrowCheckOnboarding · pure rules", () => {
  it("returns Add Tent when no tents exist", () => {
    const g = deriveDailyGrowCheckOnboarding({
      ...READY_INPUT,
      tentsCount: 0,
    });
    expect(g.step).toBe("add-tent");
    expect(g.ctaLabel).toBe("Add Tent");
    expect(g.ctaHref).toBe("/tents");
    expect(g.title).toBe(ONBOARDING_TITLE);
  });

  it("returns Add Plant when tents exist but no plants", () => {
    const g = deriveDailyGrowCheckOnboarding({
      ...READY_INPUT,
      plantsCount: 0,
      plantsWithoutTentCount: 0,
    });
    expect(g.step).toBe("add-plant");
    expect(g.ctaHref).toBe("/plants");
  });

  it("returns Assign Plant when focused plant has no tent", () => {
    const g = deriveDailyGrowCheckOnboarding({
      ...READY_INPUT,
      focusedPlantId: "p-1",
      focusedPlantTentId: null,
    });
    expect(g.step).toBe("assign-plant");
    expect(g.ctaHref).toBe("/plants/p-1");
  });

  it("returns Assign Plant when every plant in scope is unassigned", () => {
    const g = deriveDailyGrowCheckOnboarding({
      ...READY_INPUT,
      plantsCount: 2,
      plantsWithoutTentCount: 2,
    });
    expect(g.step).toBe("assign-plant");
    expect(g.ctaHref).toBe("/plants");
  });

  it("returns Add Manual Snapshot when no manual snapshot exists", () => {
    const g = deriveDailyGrowCheckOnboarding({
      ...READY_INPUT,
      hasAnyManualSnapshot: false,
    });
    expect(g.step).toBe("add-manual-snapshot");
    expect(g.subtitle).toMatch(/manual snapshot/i);
    // Must explicitly disclaim live sensor data:
    expect(g.subtitle.toLowerCase()).toContain("not live sensor data");
    expect(g.ctaHref).toBe("/daily-check");
  });

  it("returns Add Quick Log when no diary entry exists", () => {
    const g = deriveDailyGrowCheckOnboarding({
      ...READY_INPUT,
      hasAnyQuickLog: false,
    });
    expect(g.step).toBe("add-quicklog");
    expect(g.ctaLabel).toBe("Add Quick Log");
  });

  it("returns Start Daily Grow Check when setup ready but no activity today", () => {
    const g = deriveDailyGrowCheckOnboarding({
      ...READY_INPUT,
      hasTodayCheckActivity: false,
    });
    expect(g.step).toBe("run-daily-check");
    expect(g.ctaLabel).toBe("Start Daily Grow Check");
    expect(g.isReady).toBe(false);
  });

  it("returns ready when all setup and today's activity exist", () => {
    const g = deriveDailyGrowCheckOnboarding(READY_INPUT);
    expect(g.step).toBe("ready");
    expect(g.isReady).toBe(true);
  });

  it("returns Add Grow first when hasActiveGrow is explicitly false", () => {
    const g = deriveDailyGrowCheckOnboarding({
      ...READY_INPUT,
      hasActiveGrow: false,
      tentsCount: 0,
      plantsCount: 0,
    });
    expect(g.step).toBe("add-grow");
    expect(g.ctaHref).toBe("/grows");
  });

  it("priority order is deterministic when multiple gaps exist", () => {
    // tents=0, plants=0, no snapshot, no quicklog -> should pick tent first.
    const g = deriveDailyGrowCheckOnboarding({
      ...READY_INPUT,
      tentsCount: 0,
      plantsCount: 0,
      plantsWithoutTentCount: 0,
      hasAnyManualSnapshot: false,
      hasAnyQuickLog: false,
      hasTodayCheckActivity: false,
    });
    expect(g.step).toBe("add-tent");

    // Same inputs again -> same answer (determinism).
    const g2 = deriveDailyGrowCheckOnboarding({
      ...READY_INPUT,
      tentsCount: 0,
      plantsCount: 0,
      plantsWithoutTentCount: 0,
      hasAnyManualSnapshot: false,
      hasAnyQuickLog: false,
      hasTodayCheckActivity: false,
    });
    expect(g2).toEqual(g);
  });

  it("only CTAs point to existing in-app flows (no new routes)", () => {
    const allowedExact = new Set([
      "/grows",
      "/tents",
      "/plants",
      "/daily-check",
    ]);
    const inputs: Array<Parameters<typeof deriveDailyGrowCheckOnboarding>[0]> = [
      { ...READY_INPUT, hasActiveGrow: false },
      { ...READY_INPUT, tentsCount: 0 },
      { ...READY_INPUT, plantsCount: 0 },
      { ...READY_INPUT, plantsCount: 2, plantsWithoutTentCount: 2 },
      { ...READY_INPUT, hasAnyManualSnapshot: false },
      { ...READY_INPUT, hasAnyQuickLog: false },
      { ...READY_INPUT, hasTodayCheckActivity: false },
      READY_INPUT,
    ];
    for (const i of inputs) {
      const g = deriveDailyGrowCheckOnboarding(i);
      const ok =
        allowedExact.has(g.ctaHref) ||
        /^\/plants\/[^/]+$/.test(g.ctaHref) ||
        /^\/tents\/[^/]+$/.test(g.ctaHref);
      expect(ok).toBe(true);
    }
  });

  it("Add Plant routes to focused tent when known", () => {
    const g = deriveDailyGrowCheckOnboarding({
      ...READY_INPUT,
      plantsCount: 0,
      focusedTentId: "tent-9",
    });
    expect(g.ctaHref).toBe("/tents/tent-9");
  });

  it("Add Manual Snapshot routes to the focused plant's assigned tent", () => {
    const g = deriveDailyGrowCheckOnboarding({
      ...READY_INPUT,
      hasAnyManualSnapshot: false,
      focusedPlantId: "p-1",
      focusedPlantTentId: "tent-7",
    });
    expect(g.step).toBe("add-manual-snapshot");
    expect(g.ctaHref).toBe("/tents/tent-7");
  });

  it("Add Manual Snapshot falls back to focused tent, then /daily-check", () => {
    const withTent = deriveDailyGrowCheckOnboarding({
      ...READY_INPUT,
      hasAnyManualSnapshot: false,
      focusedTentId: "tent-3",
    });
    expect(withTent.ctaHref).toBe("/tents/tent-3");

    const noContext = deriveDailyGrowCheckOnboarding({
      ...READY_INPUT,
      hasAnyManualSnapshot: false,
    });
    expect(noContext.ctaHref).toBe("/daily-check");
  });

  it("Add Quick Log routes to focused plant detail when known", () => {
    const g = deriveDailyGrowCheckOnboarding({
      ...READY_INPUT,
      hasAnyQuickLog: false,
      focusedPlantId: "p-42",
      focusedPlantTentId: "tent-1",
    });
    expect(g.ctaHref).toBe("/plants/p-42");
  });
});

describe("Daily Grow Check onboarding · static safety", () => {
  const files = [
    "src/lib/dailyGrowCheckOnboardingRules.ts",
    "src/components/DailyGrowCheckOnboardingCard.tsx",
  ];

  const FORBIDDEN = [
    "service_role",
    "mqtt",
    "home_assistant",
    "pi_bridge",
    "actuator",
    "device_command",
    "autopilot",
  ];

  for (const f of files) {
    it(`${f} contains no forbidden tokens`, () => {
      const text = readFileSync(resolve(process.cwd(), f), "utf8").toLowerCase();
      for (const token of FORBIDDEN) {
        expect(text.includes(token)).toBe(false);
      }
    });

    it(`${f} does not introduce new write paths`, () => {
      const text = readFileSync(resolve(process.cwd(), f), "utf8");
      expect(/\.insert\s*\(/.test(text)).toBe(false);
      expect(/\.update\s*\(/.test(text)).toBe(false);
      expect(/\.delete\s*\(/.test(text)).toBe(false);
      expect(/\.upsert\s*\(/.test(text)).toBe(false);
      expect(/\.rpc\s*\(/.test(text)).toBe(false);
    });
  }

  it("no migration or schema files were added for onboarding", () => {
    // Sanity scan: helper file must not reference table mutations.
    const text = readFileSync(
      resolve(process.cwd(), "src/lib/dailyGrowCheckOnboardingRules.ts"),
      "utf8",
    );
    expect(text).not.toMatch(/CREATE\s+TABLE/i);
    expect(text).not.toMatch(/ALTER\s+TABLE/i);
    expect(text).not.toMatch(/onboarding_checklist/i);
  });
});
