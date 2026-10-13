import { describe, expect, it } from "vitest";
import {
  collectTimelineDiaryPhotoIds,
  EMPTY_TIMELINE_DIARY_PHOTO_IDS,
  timelineDiaryRowsForChipCounts,
  timelineEntryCountsAsPhoto,
  timelineEventChipIncludesRow,
  timelineMeasurementChipCount,
  unionTimelineDiaryPhotoIds,
} from "@/lib/timelineChipCountRules";

const VIEWER = "owner-1";

describe("timeline chip count rules", () => {
  it("collects external and owner storage references and skips everything else", () => {
    const ids = collectTimelineDiaryPhotoIds(
      [
        { id: "ext", photo_url: "https://cdn.example/leaf.jpg", details: null },
        { id: "stored", photo_url: `${VIEWER}/diary/leaf.jpg`, details: null },
        { id: "nested", photo_url: null, details: { photo_url: `${VIEWER}/diary/nested.jpg` } },
        { id: "plain", photo_url: null, details: { event_type: "note" } },
        { id: "foreign", photo_url: "someone-else/diary/leaf.jpg", details: null },
        {
          id: "sensor-reading:tent:ts",
          photo_url: "https://cdn.example/receipt.jpg",
          details: null,
        },
      ],
      VIEWER,
    );

    expect([...ids].sort()).toEqual(["ext", "nested", "stored"]);
  });

  it("adds synthetic receipts to diary measurement rows and leaves other rows out", () => {
    const rows = [
      { id: "diary-measure" },
      { id: "diary-note" },
      { id: "sensor-reading:tent:2026-07-20T08:00:00.000Z" },
      { id: "sensor-reading:tent:2026-07-20T07:55:00.000Z" },
      { id: "sensor-reading:tent:2026-07-20T07:50:00.000Z" },
    ];
    expect(timelineMeasurementChipCount(1, rows)).toBe(4);
    expect(timelineMeasurementChipCount(0, rows)).toBe(3);
    expect(timelineMeasurementChipCount(Number.NaN, null)).toBe(0);
    expect(timelineMeasurementChipCount(-2, undefined)).toBe(0);
  });

  it("keeps receipts on All and Measurements and off every other event chip", () => {
    const receiptId = "sensor-reading:tent:2026-07-20T08:00:00.000Z";
    const diaryId = "diary-1";
    for (const chip of ["all", "measurement"] as const) {
      expect(timelineEventChipIncludesRow(chip, receiptId)).toBe(true);
      expect(timelineEventChipIncludesRow(chip, diaryId)).toBe(true);
    }
    for (const chip of ["photo", "note", "followup", "actionresponse"] as const) {
      expect(timelineEventChipIncludesRow(chip, receiptId)).toBe(false);
      expect(timelineEventChipIncludesRow(chip, diaryId)).toBe(true);
    }
    expect(timelineEventChipIncludesRow("note", null)).toBe(true);
    expect(timelineEventChipIncludesRow("note", undefined)).toBe(true);
  });

  it("drops sensor receipts from the diary chip set", () => {
    const rows = timelineDiaryRowsForChipCounts([
      { id: "diary-1" },
      { id: "sensor-reading:tent:2026-07-20T12:00:00.000Z" },
      { id: "diary-2" },
    ]);
    expect(rows.map((row) => row.id)).toEqual(["diary-1", "diary-2"]);
  });

  it("counts an unsigned original reference and a later display URL once each", () => {
    const ids = new Set(["stored"]);
    expect(timelineEntryCountsAsPhoto({ id: "stored", photo_url: null }, ids)).toBe(true);
    expect(
      timelineEntryCountsAsPhoto(
        { id: "stored", photo_url: "https://signed.test/owner-1/diary/leaf.jpg" },
        ids,
      ),
    ).toBe(true);
    expect(timelineEntryCountsAsPhoto({ id: "plain", photo_url: null }, ids)).toBe(false);
    expect(
      timelineEntryCountsAsPhoto({ id: "plain", photo_url: "https://cdn.example/leaf.jpg" }, ids),
    ).toBe(true);
  });

  it("unions older pages without mutating the previous set", () => {
    const first = collectTimelineDiaryPhotoIds(
      [{ id: "stored", photo_url: `${VIEWER}/diary/leaf.jpg` }],
      VIEWER,
    );
    const older = collectTimelineDiaryPhotoIds(
      [{ id: "older", photo_url: `${VIEWER}/diary/older.jpg` }],
      VIEWER,
    );
    const combined = unionTimelineDiaryPhotoIds(first, older);
    expect([...first]).toEqual(["stored"]);
    expect([...combined].sort()).toEqual(["older", "stored"]);
    expect(unionTimelineDiaryPhotoIds(combined, older)).toBe(combined);
    expect(unionTimelineDiaryPhotoIds(EMPTY_TIMELINE_DIARY_PHOTO_IDS, new Set())).toBe(
      EMPTY_TIMELINE_DIARY_PHOTO_IDS,
    );
  });

  it("returns no photo ids for null viewer storage paths and empty input", () => {
    expect(collectTimelineDiaryPhotoIds([], VIEWER).size).toBe(0);
    expect(
      collectTimelineDiaryPhotoIds([{ id: "stored", photo_url: `${VIEWER}/diary/leaf.jpg` }], null)
        .size,
    ).toBe(0);
  });
});
