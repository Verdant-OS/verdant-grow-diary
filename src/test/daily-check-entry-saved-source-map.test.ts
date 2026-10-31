import { describe, expect, it } from "vitest";
import {
  buildDailyCheckSavedItems,
  DAILY_CHECK_SAVED_ITEM_MANUAL_SNAPSHOT_LABEL,
  resolveDailyCheckEntrySavedSource,
} from "@/lib/dailyCheckPostSubmitRules";

const SUBMITTED_AT = Date.parse("2026-10-10T09:15:03.000Z");

const ACTIVITY_LABELS = [
  ["note", "note", "Plant note"],
  ["photo", "photo", "Photo"],
  ["watering", "watering", "Watering"],
  ["feeding", "feeding", "Feeding"],
  ["environment_check", "environment_check", "Environment check"],
  ["training", "training", "Training"],
  ["defoliation", "defoliation", "Defoliation"],
  ["issue_observation", "issue_observation", "Issue / observation"],
  ["harvest", "harvest", "Harvest"],
  ["manual_sensor_snapshot", "manual-snapshot", DAILY_CHECK_SAVED_ITEM_MANUAL_SNAPSHOT_LABEL],
] as const;

describe("resolveDailyCheckEntrySavedSource activity map", () => {
  it.each(ACTIVITY_LABELS)("labels a confirmed %s save as %s", (activityId, key, label) => {
    const source = resolveDailyCheckEntrySavedSource({ activityId });
    expect(buildDailyCheckSavedItems({ source, submittedAt: SUBMITTED_AT })).toEqual([
      { key, label },
    ]);
  });

  it("keeps the manual snapshot label from claiming a live reading", () => {
    const items = buildDailyCheckSavedItems({
      source: resolveDailyCheckEntrySavedSource({ activityId: "manual_sensor_snapshot" }),
      submittedAt: SUBMITTED_AT,
    });
    expect(items[0]?.label).toContain("manual");
    expect(items[0]?.label).toContain("not live");
  });

  it("keeps lookalike and non-string activity ids on the plant-note default", () => {
    for (const activityId of ["PHOTO", "Watering", " photo", "manual_sensor", 1, { id: "photo" }]) {
      const source = resolveDailyCheckEntrySavedSource({ activityId: activityId as string });
      expect(source).toBe("note");
      expect(buildDailyCheckSavedItems({ source, submittedAt: SUBMITTED_AT })[0]?.label).toBe(
        "Plant note",
      );
    }
  });

  it("is deterministic for every mapped activity id", () => {
    for (const [activityId] of ACTIVITY_LABELS) {
      const detail = { activityId };
      expect(resolveDailyCheckEntrySavedSource(detail)).toBe(
        resolveDailyCheckEntrySavedSource(detail),
      );
    }
  });
});
