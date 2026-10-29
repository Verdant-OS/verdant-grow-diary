/**
 * Regression: after "Remove log" on Timeline the header read
 * "Detailed diary: showing 0 of 1 entry (0 loaded)". The removed row left the
 * loaded list but the server total stayed at 1. The header's total must drop
 * with the removal.
 */
import { describe, expect, it } from "vitest";
import { diaryEntriesTotalAfterRemoval } from "@/lib/diaryEntryRemovalRules";

describe("diaryEntriesTotalAfterRemoval", () => {
  it("drops the total by one when the only entry is removed", () => {
    expect(diaryEntriesTotalAfterRemoval(1)).toBe(0);
  });

  it("drops a larger total by one", () => {
    expect(diaryEntriesTotalAfterRemoval(37)).toBe(36);
  });

  it("never goes below zero", () => {
    expect(diaryEntriesTotalAfterRemoval(0)).toBe(0);
  });

  it("keeps an unknown total unknown", () => {
    expect(diaryEntriesTotalAfterRemoval(null)).toBeNull();
  });
});
