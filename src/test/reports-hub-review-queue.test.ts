/**
 * Unit tests for reportsHubReviewQueue.
 *
 * Covers:
 *  - Empty input → no items, empty=true
 *  - Each item type appears under correct conditions
 *  - Max 4 items in deterministic priority order
 *  - Links route to existing detail surfaces (ActionDetail, AlertDetail,
 *    GrowDetail, alerts list fallback)
 *  - Copy stays observational (no fixed/guaranteed/healthy/caused/best/worst)
 *  - Source file is safe (no writes, automation, device control, service_role)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildReportsReviewQueue,
  MAX_REVIEW_ITEMS,
  REPORTS_REVIEW_QUEUE_SUBTITLE,
  REPORTS_REVIEW_QUEUE_TITLE,
  STALE_SENSOR_THRESHOLD_MS,
  type ReportsReviewQueueInput,
} from "@/lib/reportsHubReviewQueue";
import { stripSourceComments } from "./utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const SRC = stripSourceComments(
  readFileSync(resolve(ROOT, "src/lib/reportsHubReviewQueue.ts"), "utf8"),
);

const NOW = new Date("2026-06-01T12:00:00Z").getTime();

const base: ReportsReviewQueueInput = {
  growId: "grow-1",
  pendingOutcomeReviewCount: 0,
  firstPendingActionId: null,
  oldestPendingCompletedAt: null,
  alertsOpen: 0,
  firstOpenAlertId: null,
  firstOpenAlertSeverity: null,
  firstOpenAlertCreatedAt: null,
  latestSensorCapturedAt: new Date(NOW - 60_000).toISOString(),
  recentSensorReadingCount: 5,
  lowSampleLearningGroups: 0,
  lowSampleSmallestCount: null,
  lowSampleThreshold: 3,
  now: NOW,
};

describe("buildReportsReviewQueue", () => {
  it("returns empty when there are no review items", () => {
    const result = buildReportsReviewQueue(base);
    expect(result.items).toEqual([]);
    expect(result.empty).toBe(true);
  });

  it("surfaces a missing-outcome card linking to ActionDetail", () => {
    const { items } = buildReportsReviewQueue({
      ...base,
      pendingOutcomeReviewCount: 2,
      firstPendingActionId: "act-99",
    });
    const item = items.find((i) => i.id === "missing_outcome");
    expect(item).toBeDefined();
    expect(item!.href).toBe("/actions/act-99");
    expect(item!.description).toMatch(/2 completed actions/);
  });

  it("missing-outcome falls back to GrowDetail when no action id is known", () => {
    const { items } = buildReportsReviewQueue({
      ...base,
      pendingOutcomeReviewCount: 1,
      firstPendingActionId: null,
    });
    expect(items[0].href).toBe("/grows/grow-1");
  });

  it("links a single open alert to AlertDetail and many alerts to alerts list", () => {
    const single = buildReportsReviewQueue({
      ...base,
      alertsOpen: 1,
      firstOpenAlertId: "alert-7",
    });
    const singleItem = single.items.find((i) => i.id === "open_alerts")!;
    expect(singleItem.href).toBe("/alerts/alert-7");

    const many = buildReportsReviewQueue({
      ...base,
      alertsOpen: 3,
      firstOpenAlertId: "alert-7",
    });
    const manyItem = many.items.find((i) => i.id === "open_alerts")!;
    expect(manyItem.href).toBe("/alerts?growId=grow-1");
  });

  it("surfaces a stale sensor card when latest reading is older than the threshold", () => {
    const { items } = buildReportsReviewQueue({
      ...base,
      latestSensorCapturedAt: new Date(
        NOW - STALE_SENSOR_THRESHOLD_MS - 60_000,
      ).toISOString(),
    });
    const item = items.find((i) => i.id === "stale_sensor");
    expect(item).toBeDefined();
    expect(item!.href).toBe("/grows/grow-1");
    expect(item!.description).toMatch(/24 hours/);
  });

  it("surfaces a missing sensor card when there are no readings at all", () => {
    const { items } = buildReportsReviewQueue({
      ...base,
      latestSensorCapturedAt: null,
      recentSensorReadingCount: 0,
    });
    expect(items.find((i) => i.id === "stale_sensor")).toBeDefined();
  });

  it("surfaces a low-sample learning card when at least one group needs more data", () => {
    const { items } = buildReportsReviewQueue({
      ...base,
      lowSampleLearningGroups: 2,
    });
    const item = items.find((i) => i.id === "low_sample_learning");
    expect(item).toBeDefined();
    expect(item!.href).toBe("/grows/grow-1");
    expect(item!.description).toMatch(/2 outcome patterns/);
  });

  it("renders at most 4 items in deterministic priority order", () => {
    const { items } = buildReportsReviewQueue({
      ...base,
      pendingOutcomeReviewCount: 1,
      firstPendingActionId: "act-1",
      alertsOpen: 2,
      firstOpenAlertId: "alert-1",
      latestSensorCapturedAt: null,
      recentSensorReadingCount: 0,
      lowSampleLearningGroups: 3,
    });
    expect(items.length).toBeLessThanOrEqual(MAX_REVIEW_ITEMS);
    expect(items.map((i) => i.id)).toEqual([
      "missing_outcome",
      "open_alerts",
      "stale_sensor",
      "low_sample_learning",
    ]);
  });

  it("copy stays observational across helper exports", () => {
    const forbidden = /\b(fixed|guaranteed|healthy|caused|best|worst)\b/i;
    expect(forbidden.test(SRC)).toBe(false);
    expect(forbidden.test(REPORTS_REVIEW_QUEUE_TITLE)).toBe(false);
    expect(forbidden.test(REPORTS_REVIEW_QUEUE_SUBTITLE)).toBe(false);
    const result = buildReportsReviewQueue({
      ...base,
      pendingOutcomeReviewCount: 1,
      firstPendingActionId: "a",
      alertsOpen: 1,
      firstOpenAlertId: "b",
      latestSensorCapturedAt: null,
      recentSensorReadingCount: 0,
      lowSampleLearningGroups: 1,
    });
    for (const item of result.items) {
      expect(forbidden.test(item.title)).toBe(false);
      expect(forbidden.test(item.description)).toBe(false);
      expect(forbidden.test(item.hrefLabel)).toBe(false);
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
