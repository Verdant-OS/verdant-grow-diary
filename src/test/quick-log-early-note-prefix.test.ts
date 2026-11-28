/**
 * The early-stage "What changed?" text is saved exactly as typed when it is
 * the only note text. With a milestone, vigor, Short note, readings or
 * details also present, the saved note keeps its "Early note: " label
 * (Cheek, 2026-11-28, "Drop Early note", after QA walk FA-20261128-M1).
 */
import { describe, expect, it } from "vitest";
import { buildEarlyStageNoteSuffix, hasQuickLogNoteText } from "@/lib/earlyStageQuickLogRules";
import { buildQuickLogEarlyStageNoteText } from "@/lib/quickLogEarlyNoteTextRules";

describe("buildQuickLogEarlyStageNoteText", () => {
  it("saves What changed? as typed when it is the only note text", () => {
    expect(buildQuickLogEarlyStageNoteText({ notes: "popped soil" })).toBe("popped soil");
    expect(buildQuickLogEarlyStageNoteText({ notes: "popped soil", otherNoteText: "" })).toBe(
      "popped soil",
    );
    expect(buildQuickLogEarlyStageNoteText({ notes: "popped soil", otherNoteText: null })).toBe(
      "popped soil",
    );
  });

  it("trims the typed text, as before", () => {
    expect(buildQuickLogEarlyStageNoteText({ notes: "  popped soil \n" })).toBe("popped soil");
  });

  it("treats a whitespace-only other note as no other note", () => {
    expect(buildQuickLogEarlyStageNoteText({ notes: "popped soil", otherNoteText: " \n\t" })).toBe(
      "popped soil",
    );
  });

  it("does not depend on the stage context", () => {
    expect(buildQuickLogEarlyStageNoteText({ notes: "popped soil", stage: "Seedling" })).toBe(
      "popped soil",
    );
  });

  it("keeps the label when a milestone is also set", () => {
    const input = { milestone: "taproot_visible", notes: "tiny root tip" } as const;
    expect(buildQuickLogEarlyStageNoteText(input)).toBe(buildEarlyStageNoteSuffix(input));
    expect(buildQuickLogEarlyStageNoteText(input)).toContain("Early note: tiny root tip");
  });

  it("keeps the label when vigor is also set", () => {
    const input = { vigor: "medium", notes: "tiny root tip" } as const;
    expect(buildQuickLogEarlyStageNoteText(input)).toBe(buildEarlyStageNoteSuffix(input));
    expect(buildQuickLogEarlyStageNoteText(input)).toContain("Early note: tiny root tip");
  });

  it("keeps the label when a Short note (or readings or details) is also present", () => {
    const input = { notes: "popped soil", otherNoteText: "day 4" };
    expect(buildQuickLogEarlyStageNoteText(input)).toBe("Early note: popped soil");
  });

  it("leaves milestone and vigor without notes unchanged", () => {
    const input = { milestone: "taproot_visible", vigor: "medium" } as const;
    expect(buildQuickLogEarlyStageNoteText(input)).toBe(buildEarlyStageNoteSuffix(input));
    expect(buildQuickLogEarlyStageNoteText({ ...input, otherNoteText: "" })).toBe(
      buildEarlyStageNoteSuffix(input),
    );
  });

  it("returns empty text when nothing early-stage was entered", () => {
    expect(buildQuickLogEarlyStageNoteText({})).toBe("");
    expect(buildQuickLogEarlyStageNoteText({ notes: null, otherNoteText: "day 4" })).toBe("");
  });

  it("whitespace-only What changed? adds no text and still fails the note gate", () => {
    expect(buildQuickLogEarlyStageNoteText({ notes: "   \n" })).toBe("");
    expect(hasQuickLogNoteText({ note: "", earlyNotes: "   \n" })).toBe(false);
  });
});
