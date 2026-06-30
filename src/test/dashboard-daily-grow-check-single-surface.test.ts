/**
 * Dashboard daily-check single-surface regression.
 *
 * The Dashboard previously rendered two overlapping daily-check surfaces:
 *   - DailyGrowCheckOnboardingCard ("Set up your daily grow loop")
 *   - DailyGrowCheckStatusCard ("Daily Grow Check" / "Start Check")
 *
 * The onboarding card was redundant on Dashboard and was removed.
 * This test guards that exactly one daily-check entry surface remains on
 * Dashboard and no Action Queue / device-control / automation strings
 * were introduced as part of the cleanup.
 *
 * Pure static-file scan — no schema, no Supabase writes, no UI render.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dashboardSrc = readFileSync(
  resolve(process.cwd(), "src/pages/Dashboard.tsx"),
  "utf8",
);

describe("Dashboard · single daily grow-check surface", () => {
  it("does not import or render DailyGrowCheckOnboardingCard", () => {
    expect(dashboardSrc).not.toMatch(/DailyGrowCheckOnboardingCard/);
    expect(dashboardSrc).not.toMatch(/daily-grow-check-onboarding-card/);
  });

  it("does not reference the redundant 'Set up your daily grow loop' copy", () => {
    expect(dashboardSrc.toLowerCase()).not.toMatch(/set up your daily grow loop/);
    expect(dashboardSrc.toLowerCase()).not.toMatch(/set your daily grow loop/);
  });

  it("still renders the Daily Grow Check status card and Start Check CTA path", () => {
    expect(dashboardSrc).toMatch(/DailyGrowCheckStatusCard/);
  });

  it("still exposes the Quick Log page entry button routing to /daily-check", () => {
    // Slice 2 label cleanup: the PageHeader CTA was renamed
    // "Daily Grow Check" → "Quick Log" so there is one grower-facing
    // logging concept. Route target is unchanged.
    expect(dashboardSrc).toMatch(/dashboard-daily-grow-check-entry/);
    expect(dashboardSrc).toMatch(/>Quick Log</);
    expect(dashboardSrc).toMatch(/\/daily-check/);
    // The PageHeader actions block must not present "Daily Grow Check" as
    // a competing primary CTA label alongside Quick Log.
    const headerActions = dashboardSrc.match(
      /dashboard-daily-grow-check-entry[\s\S]{0,400}<\/Button>/,
    )?.[0] ?? "";
    expect(headerActions).not.toMatch(/>Daily Grow Check</);
  });

  it("has exactly one DailyGrowCheckStatusCard render on Dashboard", () => {
    const matches = dashboardSrc.match(/<DailyGrowCheckStatusCard\b/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("does not introduce Supabase write or Action Queue / device-control / automation code", () => {
    // Cleanup must remain read-only UI.
    expect(dashboardSrc).not.toMatch(
      /action_queue|device[_-]?control|automation\.run|executeDevice/i,
    );
  });
});
