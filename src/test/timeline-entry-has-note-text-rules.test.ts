/**
 * Regression guard for `timelineEntryHasNoteText` — non-string persisted values
 * must not count as grower Notes (Pollen #1 / #2453).
 */
import { describe, expect, it } from "vitest";
import { QUICK_LOG_GENERATED_NOTES, timelineEntryHasNoteText } from "@/lib/timelineChipCountRules";
import { QUICK_LOG_PHOTO_DIARY_DEFAULT_NOTE } from "@/lib/quickLogPhotoDiaryEntry";

describe("timelineEntryHasNoteText non-string inputs", () => {
  it("returns false for numbers and objects", () => {
    expect(timelineEntryHasNoteText(42)).toBe(false);
    expect(timelineEntryHasNoteText({ text: "note" })).toBe(false);
  });
});

// Codex P1 on #2453 at 1b2ea901: Quick Log's generated fallbacks are not Notes.
describe("timelineEntryHasNoteText generated Quick Log text", () => {
  it("is false for the photo and manual-readings fallbacks", () => {
    expect(timelineEntryHasNoteText("Photo attached from Quick Log.")).toBe(false);
    expect(timelineEntryHasNoteText("Manual readings captured from Quick Log.")).toBe(false);
  });

  it("tracks the photo writer's default note", () => {
    expect(QUICK_LOG_GENERATED_NOTES.has(QUICK_LOG_PHOTO_DIARY_DEFAULT_NOTE)).toBe(true);
  });
});
