/**
 * Pure chip-count rules (#2163, #2314): diary rows vs synthetic sensor receipts
 * must stay aligned between stage chips, the Measurements chip, and the list.
 */
import { describe, expect, it } from "vitest";
import {
  timelineDiaryRowsForChipCounts,
  timelineMeasurementChipCount,
  timelineStageChipRows,
} from "@/lib/timelineChipCountRules";
import { TIMELINE_MANUAL_SENSOR_RECEIPT_ID_PREFIX } from "@/lib/timelineManualSensorMeasurementRules";

const receipt = (n: number) => ({ id: `${TIMELINE_MANUAL_SENSOR_RECEIPT_ID_PREFIX}tent:${n}` });
const diary = (n: number) => ({ id: `diary-${n}` });

describe("timelineDiaryRowsForChipCounts", () => {
  it("drops synthetic sensor receipt rows from diary chip totals", () => {
    const rows = [diary(1), receipt(1), diary(2), receipt(2)];
    expect(timelineDiaryRowsForChipCounts(rows).map((r) => r.id)).toEqual(["diary-1", "diary-2"]);
  });

  it("does not mutate the input array", () => {
    const rows = [diary(1), receipt(1)];
    const before = rows.map((r) => r.id);
    timelineDiaryRowsForChipCounts(rows);
    expect(rows.map((r) => r.id)).toEqual(before);
  });
});

describe("timelineStageChipRows", () => {
  const diaryRows = [diary(1), diary(2)];
  const listRows = [...diaryRows, receipt(1)];

  it("counts diary rows only for non-measurement chips", () => {
    for (const filter of ["all", "photo", "note", "followup"] as const) {
      expect(timelineStageChipRows(filter, diaryRows, listRows)).toBe(diaryRows);
    }
  });

  it("includes listed sensor receipts under the Measurements chip", () => {
    expect(timelineStageChipRows("measurement", diaryRows, listRows)).toBe(listRows);
  });
});

describe("timelineMeasurementChipCount", () => {
  it("adds diary measurement rows and visible sensor receipts", () => {
    const rows = [diary(1), receipt(1), receipt(2)];
    expect(timelineMeasurementChipCount(3, rows)).toBe(5);
  });

  it("treats a non-finite diary count as zero before adding receipts", () => {
    const rows = [receipt(1), receipt(2)];
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(timelineMeasurementChipCount(bad, rows)).toBe(2);
    }
  });

  it("truncates toward zero and never counts a negative diary total", () => {
    expect(timelineMeasurementChipCount(2.9, [receipt(1)])).toBe(3);
    expect(timelineMeasurementChipCount(-3, [receipt(1), receipt(2)])).toBe(2);
  });

  it("ignores rows without a sensor-receipt id prefix", () => {
    expect(timelineMeasurementChipCount(1, [{ id: "diary-9" }, { id: null }])).toBe(1);
  });

  it("returns the diary count when rows are null or undefined", () => {
    expect(timelineMeasurementChipCount(4, null)).toBe(4);
    expect(timelineMeasurementChipCount(4, undefined)).toBe(4);
  });
});
