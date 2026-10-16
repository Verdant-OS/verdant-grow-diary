/**
 * Photo-only note detection for Plant Quick Log (#2174 support).
 */
import { describe, expect, it } from "vitest";

import { applyQuickLogActionChip, isPhotoOnlyQuickLogNote } from "@/lib/tenSecondQuickCheckRules";

describe("tenSecondQuickCheckRules — photo only", () => {
  it("marks a note that is only the Photo only chip", () => {
    const note = applyQuickLogActionChip("", "Photo only");
    expect(isPhotoOnlyQuickLogNote(note)).toBe(true);
  });

  it("accepts the legacy photo-only sentence", () => {
    expect(isPhotoOnlyQuickLogNote("Photo only — no other changes today.")).toBe(true);
  });

  it("is false when another action line is present", () => {
    let note = applyQuickLogActionChip("", "Photo only");
    note = applyQuickLogActionChip(note, "Watered");
    expect(isPhotoOnlyQuickLogNote(note)).toBe(false);
  });

  it("is false for an empty note", () => {
    expect(isPhotoOnlyQuickLogNote("")).toBe(false);
  });
});
