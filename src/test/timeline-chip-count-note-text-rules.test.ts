/**
 * Supplement for #2446: direct pins on timelineEntryHasNoteText so Quick Log
 * placeholder vs grower-written note regressions fail in a fast pure suite
 * without mounting Timeline.
 */
import { describe, expect, it } from "vitest";
import { timelineEntryHasNoteText } from "@/lib/timelineChipCountRules";

describe("timelineEntryHasNoteText (pure rules supplement #2446)", () => {
  it("accepts grower-written text and rejects blank or stored placeholder", () => {
    expect(timelineEntryHasNoteText("Watered, looks fine")).toBe(true);
    expect(timelineEntryHasNoteText("")).toBe(false);
    expect(timelineEntryHasNoteText("   ")).toBe(false);
    expect(timelineEntryHasNoteText("\n\t  \n")).toBe(false);
    expect(timelineEntryHasNoteText("(quick log)")).toBe(false);
  });

  it("does not treat non-string note values as note text", () => {
    expect(timelineEntryHasNoteText(null)).toBe(false);
    expect(timelineEntryHasNoteText(undefined)).toBe(false);
    expect(timelineEntryHasNoteText(0)).toBe(false);
    expect(timelineEntryHasNoteText(false)).toBe(false);
    expect(timelineEntryHasNoteText({ text: "hello" })).toBe(false);
    expect(timelineEntryHasNoteText(["note"])).toBe(false);
  });

  it("keeps only the exact stored Quick Log placeholder out of Notes", () => {
    expect(timelineEntryHasNoteText("(Quick Log)")).toBe(true);
    expect(timelineEntryHasNoteText(" (quick log) ")).toBe(true);
    expect(timelineEntryHasNoteText("(QUICK LOG)")).toBe(true);
    expect(timelineEntryHasNoteText("topped in the quick log")).toBe(true);
  });
});
