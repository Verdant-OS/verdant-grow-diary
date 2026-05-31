/**
 * Unit tests for reportsHubOnboarding.
 *
 * - Visible when there is no meaningful data
 * - Hidden when any meaningful signal exists
 * - Cards link to existing routes
 * - Copy stays observational / non-completion-claiming
 * - Source is safe (no writes, automation, device control, service_role)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildReportsHubOnboarding,
  hasMeaningfulReportsData,
  REPORTS_HUB_ONBOARDING_SUBTITLE,
  REPORTS_HUB_ONBOARDING_TITLE,
  type ReportsHubOnboardingInput,
} from "@/lib/reportsHubOnboarding";
import { stripSourceComments } from "./utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const SRC = stripSourceComments(
  readFileSync(resolve(ROOT, "src/lib/reportsHubOnboarding.ts"), "utf8"),
);

const base: ReportsHubOnboardingInput = {
  growId: "grow-1",
  diaryEntriesTotal: 0,
  recentSensorReadingCount: 0,
  latestSensorCapturedAt: null,
  outcomeTotal: 0,
  alertsOpen: 0,
};

describe("buildReportsHubOnboarding", () => {
  it("shows 3 setup cards when there is no meaningful data", () => {
    const { visible, cards } = buildReportsHubOnboarding(base);
    expect(visible).toBe(true);
    expect(cards.map((c) => c.id)).toEqual([
      "add_plant",
      "add_sensor_snapshot",
      "review_action_outcome",
    ]);
  });

  it("links each setup card to an existing route", () => {
    const { cards } = buildReportsHubOnboarding(base);
    const byId = Object.fromEntries(cards.map((c) => [c.id, c.href]));
    expect(byId.add_plant).toBe("/plants?growId=grow-1");
    expect(byId.add_sensor_snapshot).toBe("/sensors");
    expect(byId.review_action_outcome).toBe("/actions?growId=grow-1");
  });

  it("falls back to base routes when no grow is scoped", () => {
    const { cards } = buildReportsHubOnboarding({ ...base, growId: null });
    const byId = Object.fromEntries(cards.map((c) => [c.id, c.href]));
    expect(byId.add_plant).toBe("/plants");
    expect(byId.review_action_outcome).toBe("/actions");
  });

  it("hides the section when any meaningful signal exists", () => {
    expect(
      buildReportsHubOnboarding({ ...base, diaryEntriesTotal: 1 }).visible,
    ).toBe(false);
    expect(
      buildReportsHubOnboarding({ ...base, recentSensorReadingCount: 1 })
        .visible,
    ).toBe(false);
    expect(
      buildReportsHubOnboarding({
        ...base,
        latestSensorCapturedAt: new Date().toISOString(),
      }).visible,
    ).toBe(false);
    expect(
      buildReportsHubOnboarding({ ...base, outcomeTotal: 1 }).visible,
    ).toBe(false);
    expect(
      buildReportsHubOnboarding({ ...base, alertsOpen: 1 }).visible,
    ).toBe(false);
  });

  it("hasMeaningfulReportsData mirrors visibility logic", () => {
    expect(hasMeaningfulReportsData(base)).toBe(false);
    expect(
      hasMeaningfulReportsData({ ...base, diaryEntriesTotal: 5 }),
    ).toBe(true);
  });

  it("copy stays observational and never claims healthy/complete/fixed", () => {
    const forbidden = /\b(fixed|guaranteed|healthy|complete|caused|best|worst)\b/i;
    expect(forbidden.test(SRC)).toBe(false);
    expect(forbidden.test(REPORTS_HUB_ONBOARDING_TITLE)).toBe(false);
    expect(forbidden.test(REPORTS_HUB_ONBOARDING_SUBTITLE)).toBe(false);
    for (const card of buildReportsHubOnboarding(base).cards) {
      expect(forbidden.test(card.title)).toBe(false);
      expect(forbidden.test(card.description)).toBe(false);
      expect(forbidden.test(card.hrefLabel)).toBe(false);
    }
  });

  it("source is safe (no writes, automation, device control, service_role)", () => {
    expect(SRC).not.toMatch(/service_role/);
    expect(SRC).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b/i,
    );
    expect(SRC).not.toMatch(
      /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/,
    );
  });
});
