/**
 * Reports / Grow Learning Hub — narrow route-identifier regression test.
 *
 * Snapshots the stable `{ cardId → hrefPattern, hrefLabel }` map so any
 * silent change to chart/section identifiers or the route they link to is
 * caught in CI. Also cross-checks each generated href against the
 * `APP_ROUTES` manifest so cards never link to a missing mount.
 *
 * Pure. No I/O. No Supabase. No automation.
 */
import { describe, it, expect } from "vitest";
import {
  buildReportsHubSummary,
  type ReportsHubInput,
} from "@/lib/reportsHubViewModel";
import { APP_ROUTES } from "@/lib/appRouteManifest";

const GROW_ID = "grow-route-id-test";

const INPUT: ReportsHubInput = {
  growId: GROW_ID,
  growName: "Blue Dream",
  outcomeSummary: {
    total: 5,
    improved: 2,
    unchanged: 2,
    worsened: 1,
    more_data_needed: 0,
    unknown: 0,
  },
  outcomeLearning: {
    totals: {
      total: 5,
      improved: 2,
      unchanged: 2,
      worsened: 1,
      more_data_needed: 0,
      unknown: 0,
    },
    groups: [],
    examples: [],
    needs_more_data: false,
  },
  alertsOpen: 3,
  alertsCritical: 1,
  alertsWarning: 2,
  latestSensorCapturedAt: "2026-06-04T10:00:00.000Z",
  recentSensorReadingCount: 12,
  diaryEntriesLast7d: 4,
  diaryEntriesTotal: 9,
};

/** Strip query string + replace concrete growId with `:growId` to match
 * the parameterized manifest pattern. */
function toRoutePattern(href: string): string {
  const noHash = href.split("#")[0];
  const noQuery = noHash.split("?")[0];
  return noQuery.replace(GROW_ID, ":growId").replace(
    new RegExp(`/${GROW_ID}(?=/|$)`),
    "/:growId",
  );
}

describe("Reports hub card identifiers + routes", () => {
  const summary = buildReportsHubSummary(INPUT);

  it("preserves the canonical card id/href/label snapshot", () => {
    const snapshot = summary.cards.map((c) => ({
      id: c.id,
      href: c.href,
      hrefLabel: c.hrefLabel,
    }));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        {
          "href": "/grows/grow-route-id-test",
          "hrefLabel": "Open learning report",
          "id": "action_outcome_learning",
        },
        {
          "href": "/grows/grow-route-id-test",
          "hrefLabel": "Open grow detail",
          "id": "recent_outcomes",
        },
        {
          "href": "/alerts?growId=grow-route-id-test",
          "hrefLabel": "Review alerts",
          "id": "environment_alerts",
        },
        {
          "href": "/grows/grow-route-id-test",
          "hrefLabel": "Open grow detail",
          "id": "sensor_context",
        },
        {
          "href": "/logs?growId=grow-route-id-test",
          "hrefLabel": "Open timeline",
          "id": "timeline_activity",
        },
      ]
    `);
  });

  it("every card href resolves to a path mounted in APP_ROUTES", () => {
    const manifestPaths = new Set(APP_ROUTES.map((r) => r.path));
    for (const card of summary.cards) {
      const pattern = toRoutePattern(card.href);
      expect(
        manifestPaths.has(pattern),
        `Card '${card.id}' href '${card.href}' (pattern '${pattern}') is not mounted in APP_ROUTES`,
      ).toBe(true);
    }
  });

  it("card id set is the canonical 5 reports surfaces (no silent additions)", () => {
    expect(summary.cards.map((c) => c.id).sort()).toEqual([
      "action_outcome_learning",
      "environment_alerts",
      "recent_outcomes",
      "sensor_context",
      "timeline_activity",
    ]);
  });
});
