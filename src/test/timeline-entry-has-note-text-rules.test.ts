/**
 * Regression guard for `timelineEntryHasNoteText` — non-string persisted values
 * must not count as grower Notes (Pollen #1 / #2453).
 */
import { describe, expect, it } from "vitest";
import { timelineEntryHasNoteText } from "@/lib/timelineChipCountRules";

describe("timelineEntryHasNoteText non-string inputs", () => {
  it("returns false for numbers and objects", () => {
    expect(timelineEntryHasNoteText(42)).toBe(false);
    expect(timelineEntryHasNoteText({ text: "note" })).toBe(false);
  });
});
