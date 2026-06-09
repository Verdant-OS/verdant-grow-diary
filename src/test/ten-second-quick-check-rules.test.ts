import { describe, it, expect } from "vitest";
import {
  TEN_SECOND_QUICK_CHECK_STATUSES,
  QUICK_CHECK_DETAIL_CHIPS,
  applyQuickCheckDetailChip,
  applyTenSecondQuickCheck,
  buildQuickCheckLine,
  hasTenSecondQuickCheck,
} from "@/lib/tenSecondQuickCheckRules";

describe("tenSecondQuickCheckRules", () => {
  it("exposes the three primary quick check statuses", () => {
    expect(TEN_SECOND_QUICK_CHECK_STATUSES).toEqual(["Better", "Same", "Worse"]);
  });

  it("exposes lightweight detail chips", () => {
    expect(QUICK_CHECK_DETAIL_CHIPS).toEqual([
      "Watered",
      "Fed",
      "Spotted issue",
      "Photo only",
    ]);
  });

  it("builds a stable quick check line", () => {
    expect(buildQuickCheckLine("Better")).toBe("Quick check: Better.");
    expect(buildQuickCheckLine("Same")).toBe("Quick check: Same.");
    expect(buildQuickCheckLine("Worse")).toBe("Quick check: Worse.");
  });

  it("applies a quick check to an empty note", () => {
    expect(applyTenSecondQuickCheck("", "Better")).toBe("Quick check: Better.");
  });

  it("keeps existing typed note detail after the quick check line", () => {
    expect(applyTenSecondQuickCheck("Lower leaves perked up", "Better")).toBe(
      "Quick check: Better.\nLower leaves perked up",
    );
  });

  it("replaces an existing quick check instead of stacking contradictory status", () => {
    const note = "Quick check: Worse.\nLower leaf issue";
    expect(applyTenSecondQuickCheck(note, "Same")).toBe(
      "Quick check: Same.\nLower leaf issue",
    );
  });

  it("detects whether a note contains a quick check line", () => {
    expect(hasTenSecondQuickCheck("Quick check: Same.")).toBe(true);
    expect(hasTenSecondQuickCheck("Same")).toBe(false);
  });

  it("adds detail chips without duplicates", () => {
    const one = applyQuickCheckDetailChip("Quick check: Same.", "Watered");
    const two = applyQuickCheckDetailChip(one, "Watered");
    expect(one).toBe("Quick check: Same.\nWatered");
    expect(two).toBe(one);
  });

  it("formats Photo only as a sentence", () => {
    expect(applyQuickCheckDetailChip("Quick check: Same.", "Photo only")).toBe(
      "Quick check: Same.\nPhoto only.",
    );
  });

  it("is deterministic and does not mutate inputs", () => {
    const input = "Original note";
    const a = applyTenSecondQuickCheck(input, "Worse");
    const b = applyTenSecondQuickCheck(input, "Worse");
    expect(a).toBe(b);
    expect(input).toBe("Original note");
  });
});
