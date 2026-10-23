/**
 * Supplement for #2468: fast pure pins on timelineEntryHasNoteText edge inputs
 * without editing scorer-locked timeline-entry-has-note-text-rules.test.ts.
 */
import { describe, expect, it } from "vitest";
import { timelineEntryHasNoteText } from "@/lib/timelineChipCountRules";

describe("timelineEntryHasNoteText supplement (#2468)", () => {
  it("rejects non-string persisted values beyond null and undefined", () => {
    expect(timelineEntryHasNoteText(0)).toBe(false);
    expect(timelineEntryHasNoteText(false)).toBe(false);
    expect(timelineEntryHasNoteText(["note"])).toBe(false);
  });

  it("treats whitespace-only strings as empty", () => {
    expect(timelineEntryHasNoteText("\n\t  \n")).toBe(false);
  });

  it("keeps grower-typed Quick Log placeholder variants as Notes", () => {
    expect(timelineEntryHasNoteText("(Quick Log)")).toBe(true);
    expect(timelineEntryHasNoteText(" (quick log) ")).toBe(true);
    expect(timelineEntryHasNoteText("(QUICK LOG)")).toBe(true);
  });
});
