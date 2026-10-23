import { describe, expect, it } from "vitest";
import { timelineEntryHasNoteText } from "@/lib/timelineChipCountRules";

describe("timelineEntryHasNoteText", () => {
  it("rejects non-string note payloads", () => {
    expect(timelineEntryHasNoteText(42)).toBe(false);
    expect(timelineEntryHasNoteText({ text: "hello" })).toBe(false);
    expect(timelineEntryHasNoteText(["note"])).toBe(false);
  });

  it("treats only the Quick Log placeholder as non-note text", () => {
    expect(timelineEntryHasNoteText("(quick log)")).toBe(false);
    expect(timelineEntryHasNoteText(" (Quick Log) ")).toBe(false);
    expect(timelineEntryHasNoteText("quick log without parens")).toBe(true);
  });
});
