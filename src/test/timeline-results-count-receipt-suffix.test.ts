/**
 * QA follow-up to #2163 (production 05f5138d, 2/2): under Measurements the
 * chip said 52 while the header said "showing 37 of 116 entries", and after
 * Load older entries 56 vs 41. The list itself renders 52 rows: 37 diary
 * rows plus 15 manual sensor receipts. The header counted diary rows only,
 * so it now names the receipts it lists.
 */
import { describe, expect, it } from "vitest";
import { timelineResultsCountReceiptSuffix } from "@/lib/timelineChipCountRules";
import { TIMELINE_MANUAL_SENSOR_RECEIPT_ID_PREFIX } from "@/lib/timelineManualSensorMeasurementRules";

const receipt = (n: number) => ({ id: `${TIMELINE_MANUAL_SENSOR_RECEIPT_ID_PREFIX}tent:${n}` });
const diary = (n: number) => ({ id: `diary-${n}` });

describe("timelineResultsCountReceiptSuffix", () => {
  it("names the QA case: 37 diary rows plus 15 receipts, which add up to the chip's 52", () => {
    const rows = [
      ...Array.from({ length: 37 }, (_, i) => diary(i)),
      ...Array.from({ length: 15 }, (_, i) => receipt(i)),
    ];
    expect(rows).toHaveLength(52);
    expect(timelineResultsCountReceiptSuffix(rows)).toBe(" · plus 15 manual sensor readings");
  });

  it("uses the singular for one receipt", () => {
    expect(timelineResultsCountReceiptSuffix([diary(1), receipt(1)])).toBe(
      " · plus 1 manual sensor reading",
    );
  });

  it("is empty when the list carries no receipt", () => {
    expect(timelineResultsCountReceiptSuffix([diary(1), diary(2)])).toBe("");
    expect(timelineResultsCountReceiptSuffix([])).toBe("");
  });

  it("is empty for null, undefined and rows without ids", () => {
    expect(timelineResultsCountReceiptSuffix(null)).toBe("");
    expect(timelineResultsCountReceiptSuffix(undefined)).toBe("");
    expect(timelineResultsCountReceiptSuffix([{ id: null }, {}])).toBe("");
  });
});
