/**
 * Pure unit tests for timelineChipCountRules — chip/list parity helpers (#2163).
 */
import { describe, expect, it } from "vitest";
import {
  EMPTY_TIMELINE_DIARY_PHOTO_IDS,
  timelineDiaryRowsForChipCounts,
  timelineEntryCountsAsPhoto,
  timelineEventChipIncludesRow,
  timelineMeasurementChipCount,
  unionTimelineDiaryPhotoIds,
} from "@/lib/timelineChipCountRules";
import { TIMELINE_MANUAL_SENSOR_RECEIPT_ID_PREFIX } from "@/lib/timelineManualSensorMeasurementRules";

const RECEIPT_ID = `${TIMELINE_MANUAL_SENSOR_RECEIPT_ID_PREFIX}abc`;
const DIARY_ID = "de-1";

describe("timelineChipCountRules", () => {
  it("timelineEventChipIncludesRow keeps sensor receipts on measurement and manual-only all", () => {
    expect(timelineEventChipIncludesRow("measurement", RECEIPT_ID)).toBe(true);
    expect(timelineEventChipIncludesRow("all", RECEIPT_ID, { hasDiaryRows: false })).toBe(true);
    expect(timelineEventChipIncludesRow("all", RECEIPT_ID, { hasDiaryRows: true })).toBe(false);
    expect(timelineEventChipIncludesRow("note", RECEIPT_ID)).toBe(false);
    expect(timelineEventChipIncludesRow("photo", DIARY_ID)).toBe(true);
  });

  it("timelineDiaryRowsForChipCounts excludes synthetic sensor receipt ids", () => {
    const rows = [{ id: DIARY_ID }, { id: RECEIPT_ID }, { id: "de-2" }];
    expect(timelineDiaryRowsForChipCounts(rows).map((r) => r.id)).toEqual([DIARY_ID, "de-2"]);
  });

  it("timelineMeasurementChipCount adds receipt rows to the diary measurement total", () => {
    const rows = [{ id: DIARY_ID }, { id: RECEIPT_ID }, { id: `${RECEIPT_ID}-2` }];
    expect(timelineMeasurementChipCount(2, rows)).toBe(4);
    expect(timelineMeasurementChipCount(NaN, null)).toBe(0);
    expect(timelineMeasurementChipCount(-3, [])).toBe(0);
  });

  it("unionTimelineDiaryPhotoIds is referentially stable when nothing new arrives", () => {
    const base = new Set(["a"]);
    expect(unionTimelineDiaryPhotoIds(base, EMPTY_TIMELINE_DIARY_PHOTO_IDS)).toBe(base);
    expect(unionTimelineDiaryPhotoIds(base, new Set())).toBe(base);
  });

  it("timelineEntryCountsAsPhoto counts storage-backed ids before signed URLs exist", () => {
    const ids = new Set(["photo-row"]);
    expect(timelineEntryCountsAsPhoto({ id: "photo-row", photo_url: null }, ids)).toBe(true);
    expect(
      timelineEntryCountsAsPhoto({ id: "other", photo_url: "https://x.test/p.jpg" }, ids),
    ).toBe(true);
    expect(timelineEntryCountsAsPhoto({ id: "plain", photo_url: null }, ids)).toBe(false);
  });
});
