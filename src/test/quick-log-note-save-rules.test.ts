import { describe, expect, it } from "vitest";
import {
  QUICK_LOG_NOTE_ALREADY_SAVED_COPY,
  QUICK_LOG_PANEL_NOTE_SAVED_CODE,
  applyPanelSavedNoteToPreviewWarnings,
  buildQuickLogSavedNoteExcerpt,
  isDuplicateOfPanelSavedNote,
} from "@/lib/quickLogNoteSaveRules";

describe("buildQuickLogSavedNoteExcerpt", () => {
  it("returns null for missing, blank and non-string notes", () => {
    expect(buildQuickLogSavedNoteExcerpt(null)).toBeNull();
    expect(buildQuickLogSavedNoteExcerpt(undefined)).toBeNull();
    expect(buildQuickLogSavedNoteExcerpt("   \n ")).toBeNull();
    expect(buildQuickLogSavedNoteExcerpt(42 as unknown as string)).toBeNull();
  });

  it("trims and collapses whitespace, keeping short notes whole", () => {
    expect(buildQuickLogSavedNoteExcerpt("  Leaves   praying\n\nafter lights on ")).toBe(
      "Leaves praying after lights on",
    );
  });

  it("cuts long notes at the limit with an ellipsis", () => {
    const long = "a".repeat(200);
    const excerpt = buildQuickLogSavedNoteExcerpt(long, 20);
    expect(excerpt).toBe(`${"a".repeat(19)}…`);
    expect(excerpt?.length).toBe(20);
  });

  it("is deterministic for the same input", () => {
    expect(buildQuickLogSavedNoteExcerpt("same note")).toBe(
      buildQuickLogSavedNoteExcerpt("same note"),
    );
  });
});

describe("applyPanelSavedNoteToPreviewWarnings", () => {
  const missing = {
    code: "note:missing",
    message: "Add a quick note before saving.",
    severity: "info" as const,
  };
  const ph = { code: "ph:invalid", message: "pH is not a number.", severity: "warning" as const };

  it("leaves warnings unchanged when no panel note was saved", () => {
    const warnings = [missing, ph];
    expect(applyPanelSavedNoteToPreviewWarnings(warnings, null)).toBe(warnings);
    expect(applyPanelSavedNoteToPreviewWarnings(warnings, "   ")).toBe(warnings);
  });

  it("replaces the missing-note hint with a saved-note line naming the text", () => {
    const out = applyPanelSavedNoteToPreviewWarnings([missing, ph], "Leaf tips curling");
    expect(out.map((w) => w.code)).toEqual([QUICK_LOG_PANEL_NOTE_SAVED_CODE, "ph:invalid"]);
    expect(out[0].message).toContain("Leaf tips curling");
    expect(out[0].message).not.toMatch(/add a quick note/i);
    expect(out[0].severity).toBe("info");
  });

  it("does not touch a captured main note", () => {
    const ok = { code: "note:ok", message: "Note captured.", severity: "info" as const };
    expect(applyPanelSavedNoteToPreviewWarnings([ok], "Leaf tips curling")).toEqual([ok]);
  });
});

describe("isDuplicateOfPanelSavedNote", () => {
  it("is true when the main note repeats the panel-saved note on a note-like entry", () => {
    expect(
      isDuplicateOfPanelSavedNote({
        note: "  leaf tips  curling ",
        panelSavedNote: "leaf tips curling",
        eventType: "observation",
      }),
    ).toBe(true);
  });

  it("is false for different text, blank values or a non-note entry", () => {
    expect(
      isDuplicateOfPanelSavedNote({
        note: "new text",
        panelSavedNote: "old",
        eventType: "observation",
      }),
    ).toBe(false);
    expect(
      isDuplicateOfPanelSavedNote({ note: "", panelSavedNote: "", eventType: "observation" }),
    ).toBe(false);
    expect(
      isDuplicateOfPanelSavedNote({ note: "x", panelSavedNote: null, eventType: "observation" }),
    ).toBe(false);
    expect(
      isDuplicateOfPanelSavedNote({
        note: "x",
        panelSavedNote: "x",
        eventType: "environment_check",
      }),
    ).toBe(false);
  });

  it("names the already-saved state in plain words", () => {
    expect(QUICK_LOG_NOTE_ALREADY_SAVED_COPY).toMatch(/already saved/i);
  });
});
