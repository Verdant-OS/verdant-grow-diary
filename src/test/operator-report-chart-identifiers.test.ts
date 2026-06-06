/**
 * Operator report chart identifier regression — narrow snapshot of the
 * stable identifiers that the Reports / Grow Learning Hub renders for
 * the operator dataset. Snapshots only `{id, title, hrefLabel}` to keep
 * noise low: no SVG, no data values, no timestamps.
 *
 * Pure. No I/O. No Supabase. No automation.
 */
import { describe, it, expect } from "vitest";
import { OPERATOR_DIARY_DATASET } from "./fixtures/operatorDiaryDataset";
import {
  REPORTS_HUB_EMPTY_COPY,
  buildReportsHubSummary,
  type ReportsHubInput,
} from "@/lib/reportsHubViewModel";
import {
  REPORTS_HUB_ONBOARDING_TITLE,
  buildReportsHubOnboarding,
} from "@/lib/reportsHubOnboarding";

const POPULATED: ReportsHubInput = {
  growId: OPERATOR_DIARY_DATASET.grow.id,
  growName: OPERATOR_DIARY_DATASET.grow.name,
  outcomeSummary: {
    total: 1,
    improved: 1,
    unchanged: 0,
    worsened: 0,
    more_data_needed: 0,
    unknown: 0,
  },
  outcomeLearning: {
    totals: {
      total: 1,
      improved: 1,
      unchanged: 0,
      worsened: 0,
      more_data_needed: 0,
      unknown: 0,
    },
    groups: [],
    examples: [],
    needs_more_data: false,
  },
  alertsOpen: 0,
  alertsCritical: 0,
  alertsWarning: 0,
  latestSensorCapturedAt: OPERATOR_DIARY_DATASET.sensorReadings[0].capturedAt,
  recentSensorReadingCount: OPERATOR_DIARY_DATASET.sensorReadings.length,
  diaryEntriesLast7d: 4,
  diaryEntriesTotal: 4,
};

describe("Operator report charts — stable identifiers", () => {
  const summary = buildReportsHubSummary(POPULATED);

  it("snapshots only chart/section id + title + hrefLabel (low-noise)", () => {
    const snapshot = summary.cards.map((c) => ({
      id: c.id,
      title: c.title,
      hrefLabel: c.hrefLabel,
    }));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        {
          "hrefLabel": "Open learning report",
          "id": "action_outcome_learning",
          "title": "Action Outcome Learning",
        },
        {
          "hrefLabel": "Open grow detail",
          "id": "recent_outcomes",
          "title": "Recent Outcomes",
        },
        {
          "hrefLabel": "Review alerts",
          "id": "environment_alerts",
          "title": "Environment Alerts",
        },
        {
          "hrefLabel": "Open grow detail",
          "id": "sensor_context",
          "title": "Sensor Context",
        },
        {
          "hrefLabel": "Open timeline",
          "id": "timeline_activity",
          "title": "Timeline Activity",
        },
      ]
    `);
  });

  it("locks the empty-state copy that the hub shows when no data exists", () => {
    expect(REPORTS_HUB_EMPTY_COPY).toMatch(/no grow learning data yet/i);
  });
});

describe("Operator report — onboarding section identifiers", () => {
  it("snapshots the 3 onboarding cards' stable ids + headers when no data exists", () => {
    const onboarding = buildReportsHubOnboarding({
      growId: OPERATOR_DIARY_DATASET.grow.id,
      diaryEntriesTotal: 0,
      recentSensorReadingCount: 0,
      latestSensorCapturedAt: null,
      outcomeTotal: 0,
      alertsOpen: 0,
    });
    expect(onboarding.visible).toBe(true);
    const snapshot = onboarding.cards.map((c) => ({
      id: c.id,
      title: c.title,
      hrefLabel: c.hrefLabel,
    }));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        {
          "hrefLabel": "Open plants",
          "id": "add_plant",
          "title": "Add a plant",
        },
        {
          "hrefLabel": "Open sensors",
          "id": "add_sensor_snapshot",
          "title": "Add a manual sensor snapshot",
        },
        {
          "hrefLabel": "Open actions",
          "id": "review_action_outcome",
          "title": "Review an action outcome",
        },
      ]
    `);
    expect(REPORTS_HUB_ONBOARDING_TITLE).toMatch(/grow memory/i);
  });
});
