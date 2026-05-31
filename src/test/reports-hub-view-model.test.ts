/**
 * Unit tests for reportsHubViewModel.
 *
 * Covers:
 *  - Empty input → all cards empty, allEmpty = true
 *  - Populated input → expected primary/secondary stats
 *  - Card links point to existing detail surfaces
 *  - Copy stays observational (no fixed / guaranteed / healthy / caused /
 *    best / worst claims)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildReportsHubSummary,
  REPORTS_HUB_EMPTY_COPY,
  REPORTS_HUB_SUBTITLE_COPY,
  type ReportsHubInput,
} from "@/lib/reportsHubViewModel";
import { EMPTY_GROW_OUTCOME_SUMMARY } from "@/lib/growOutcomeRollupRules";
import { EMPTY_LEARNING_REPORT } from "@/lib/actionOutcomeLearningRules";

const ROOT = resolve(__dirname, "../..");
const VM_SRC = readFileSync(resolve(ROOT, "src/lib/reportsHubViewModel.ts"), "utf8");

const baseInput: ReportsHubInput = {
  growId: "grow-1",
  growName: "Blue Dream",
  outcomeSummary: EMPTY_GROW_OUTCOME_SUMMARY,
  outcomeLearning: EMPTY_LEARNING_REPORT,
  alertsOpen: 0,
  alertsCritical: 0,
  alertsWarning: 0,
  latestSensorCapturedAt: null,
  recentSensorReadingCount: 0,
  diaryEntriesLast7d: 0,
  diaryEntriesTotal: 0,
};

describe("buildReportsHubSummary", () => {
  it("flags all cards empty when there is no data", () => {
    const { cards, allEmpty } = buildReportsHubSummary(baseInput);
    expect(cards).toHaveLength(5);
    expect(allEmpty).toBe(true);
    expect(cards.every((c) => c.empty)).toBe(true);
  });

  it("renders populated stats and is not allEmpty when data exists", () => {
    const summary = buildReportsHubSummary({
      ...baseInput,
      outcomeSummary: {
        total: 12,
        improved: 4,
        unchanged: 5,
        worsened: 2,
        more_data_needed: 1,
        unknown: 0,
      },
      outcomeLearning: {
        ...EMPTY_LEARNING_REPORT,
        groups: [
          { metric: "ph", label: "pH", totals: { total: 3, improved: 2, unchanged: 1, worsened: 0, more_data_needed: 0, unknown: 0 }, needs_more_data: false },
          { metric: "ec", label: "EC", totals: { total: 4, improved: 1, unchanged: 2, worsened: 1, more_data_needed: 0, unknown: 0 }, needs_more_data: false },
        ],
      },
      alertsOpen: 3,
      alertsCritical: 1,
      alertsWarning: 2,
      latestSensorCapturedAt: new Date("2026-05-30T12:00:00Z").toISOString(),
      recentSensorReadingCount: 42,
      diaryEntriesLast7d: 6,
      diaryEntriesTotal: 18,
    });
    expect(summary.allEmpty).toBe(false);

    const learning = summary.cards.find((c) => c.id === "action_outcome_learning")!;
    expect(learning.primaryStat).toMatch(/2 grouped patterns/);
    expect(learning.empty).toBe(false);
    expect(learning.caveat).toMatch(/early patterns/i);

    const outcomes = summary.cards.find((c) => c.id === "recent_outcomes")!;
    expect(outcomes.primaryStat).toMatch(/12 recorded outcomes/);
    expect(outcomes.secondaryStats).toContain("Improved 4");
    expect(outcomes.secondaryStats).toContain("Worsened 2");

    const alerts = summary.cards.find((c) => c.id === "environment_alerts")!;
    expect(alerts.primaryStat).toMatch(/3 open alerts/);
    expect(alerts.secondaryStats).toContain("Critical 1");

    const sensor = summary.cards.find((c) => c.id === "sensor_context")!;
    expect(sensor.primaryStat).toMatch(/42 recent readings/);
    expect(sensor.secondaryStats[0]).toMatch(/Last reading/);

    const timeline = summary.cards.find((c) => c.id === "timeline_activity")!;
    expect(timeline.primaryStat).toMatch(/18 diary entries/);
    expect(timeline.secondaryStats).toContain("Last 7 days: 6");
  });

  it("links to existing detail surfaces", () => {
    const { cards } = buildReportsHubSummary(baseInput);
    const map = Object.fromEntries(cards.map((c) => [c.id, c.href]));
    expect(map.action_outcome_learning).toBe("/grows/grow-1");
    expect(map.recent_outcomes).toBe("/grows/grow-1");
    expect(map.environment_alerts).toBe("/alerts?growId=grow-1");
    expect(map.sensor_context).toBe("/grows/grow-1");
    expect(map.timeline_activity).toBe("/logs?growId=grow-1");
  });

  it("copy stays observational", () => {
    const forbidden = /\b(fixed|guaranteed|healthy|caused|best|worst)\b/i;
    expect(forbidden.test(VM_SRC)).toBe(false);
    expect(forbidden.test(REPORTS_HUB_EMPTY_COPY)).toBe(false);
    expect(forbidden.test(REPORTS_HUB_SUBTITLE_COPY)).toBe(false);
  });

  it("source surface is safe (no automation / device control / service_role)", () => {
    expect(VM_SRC).not.toMatch(/service_role/);
    expect(VM_SRC).not.toMatch(/mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b/i);
    expect(VM_SRC).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
  });
});
