import { describe, expect, it } from "vitest";
import {
  normalizeSharedSearchText,
  sharedSearchTextIncludes,
} from "@/lib/sharedSearchTextRules";

describe("sharedSearchTextRules", () => {
  it("normalizes punctuation, spacing, case, and accents deterministically", () => {
    expect(normalizeSharedSearchText("  Gorilla Glue #4  ")).toBe("gorilla glue 4");
    expect(normalizeSharedSearchText("Do-Si-Dos")).toBe("do si dos");
    expect(normalizeSharedSearchText("Crème Brûlée")).toBe("creme brulee");
  });

  it("gives entity and cultivar discovery the same punctuation behavior", () => {
    expect(sharedSearchTextIncludes("Original Glue (GG4)", "GG-4")).toBe(true);
    expect(sharedSearchTextIncludes("Project McDonald", "McDonald")).toBe(true);
  });
});
