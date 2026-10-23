/**
 * Pure pins for timelineChipCountRules helpers (cron regression coverage).
 * Complements page-level chip tests (#2163) and receipt suffix tests.
 */
import { describe, expect, it } from "vitest";
import {
  timelineDiaryRowsForChipCounts,
  timelineMeasurementChipCount,
  timelineStageChipRows,
} from "@/lib/timelineChipCountRules";
import { TIMELINE_MANUAL_SENSOR_RECEIPT_ID_PREFIX } from "@/lib/timelineManualSensorMeasurementRules";

const diary = (id: string) => ({ id });
const receipt = (n: number) => ({
  id: `${TIMELINE_MANUAL_SENSOR_RECEIPT_ID_PREFIX}tent:${n}`,
});

describe("timelineDiaryRowsForChipCounts", () => {
  it("drops synthetic sensor receipt ids from diary chip totals", () => {
    const rows = [diary("a"), receipt(1), diary("b"), receipt(2)];
    expect(timelineDiaryRowsForChipCounts(rows).map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("timelineStageChipRows", () => {
  it("uses the full list under Measurements and diary rows otherwise", () => {
    const diaryRows = [diary("d1"), diary("d2")];
    const listRows = [...diaryRows, receipt(1)];
    expect(timelineStageChipRows("measurement", diaryRows, listRows)).toHaveLength(3);
    expect(timelineStageChipRows("all", diaryRows, listRows)).toHaveLength(2);
    expect(timelineStageChipRows("note", diaryRows, listRows)).toHaveLength(2);
  });
});

describe("timelineMeasurementChipCount", () => {
  it("sums diary measurement rows and listed receipt ids", () => {
    const rows = [diary("m1"), receipt(1), receipt(2), { id: null }];
    expect(timelineMeasurementChipCount(2, rows)).toBe(4);
  });

  it("treats invalid diary counts as zero and ignores null rows", () => {
    expect(timelineMeasurementChipCount(Number.NaN, [receipt(1)])).toBe(1);
    expect(timelineMeasurementChipCount(-3, null)).toBe(0);
    expect(timelineMeasurementChipCount(1.9, undefined)).toBe(1);
  });
});
