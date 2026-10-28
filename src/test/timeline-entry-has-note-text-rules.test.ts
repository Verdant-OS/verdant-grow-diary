/**
 * Regression guard for `timelineEntryHasNoteText` — non-string persisted values
 * must not count as grower Notes (Pollen #1 / #2453).
 */
import { describe, expect, it } from "vitest";
import { GENERATED_NOTE_TEXTS, timelineEntryHasNoteText } from "@/lib/timelineChipCountRules";
import { QUICK_LOG_PHOTO_DIARY_DEFAULT_NOTE } from "@/lib/quickLogPhotoDiaryEntry";
import { QUICK_LOG_VIDEO_DIARY_DEFAULT_NOTE } from "@/lib/quickLogVideoDiaryEntry";
import { ACTION_OUTCOME_DEFAULT_NOTES } from "@/lib/actionOutcomeRules";

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

  it("tracks the photo and video writers' default notes", () => {
    expect(GENERATED_NOTE_TEXTS.has(QUICK_LOG_PHOTO_DIARY_DEFAULT_NOTE)).toBe(true);
    expect(GENERATED_NOTE_TEXTS.has(QUICK_LOG_VIDEO_DIARY_DEFAULT_NOTE)).toBe(true);
    expect(timelineEntryHasNoteText(QUICK_LOG_VIDEO_DIARY_DEFAULT_NOTE)).toBe(false);
  });

  // Review of #2464 at 5be715ec: action-outcome default text is not a Note.
  it("is false for every action-outcome default note", () => {
    for (const note of Object.values(ACTION_OUTCOME_DEFAULT_NOTES)) {
      expect(timelineEntryHasNoteText(note)).toBe(false);
    }
  });
});
