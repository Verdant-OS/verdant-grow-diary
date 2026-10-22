/**
 * Notes chip qualification (Pollen #1): grower note text only; excludes blank
 * Quick Log waterings and synthetic manual-sensor receipt rows.
 */
import { describe, expect, it } from "vitest";
import {
  timelineEntryHasNoteText,
  timelineEntryQualifiesForNotesChip,
} from "@/lib/timelineChipCountRules";
import { TIMELINE_MANUAL_SENSOR_RECEIPT_ID_PREFIX } from "@/lib/timelineManualSensorMeasurementRules";

describe("timelineEntryQualifiesForNotesChip", () => {
  it("requires non-blank note text on ordinary diary rows", () => {
    expect(timelineEntryQualifiesForNotesChip({ id: "de-1", note: "Canopy check" })).toBe(true);
    expect(timelineEntryQualifiesForNotesChip({ id: "de-2", note: "" })).toBe(false);
    expect(timelineEntryQualifiesForNotesChip({ id: "de-3", note: "   " })).toBe(false);
  });

  it("excludes synthetic sensor receipts even when they carry formatted receipt note text", () => {
    const receiptId = `${TIMELINE_MANUAL_SENSOR_RECEIPT_ID_PREFIX}reading-1`;
    expect(
      timelineEntryQualifiesForNotesChip({
        id: receiptId,
        note: "Manual snapshot · 24.0 °C · 55% RH",
      }),
    ).toBe(false);
  });
});

describe("timelineEntryHasNoteText", () => {
  it("rejects non-string note payloads", () => {
    expect(timelineEntryHasNoteText(42)).toBe(false);
    expect(timelineEntryHasNoteText({ body: "nested" })).toBe(false);
  });
});
