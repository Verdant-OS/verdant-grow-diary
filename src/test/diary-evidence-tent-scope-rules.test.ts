/**
 * diaryEvidenceTentScopeRules — pure unit pins for #602.
 */
import { describe, expect, it } from "vitest";
import { isDiaryRowInTentScope } from "@/lib/diaryEvidenceTentScopeRules";

describe("isDiaryRowInTentScope", () => {
  it("allows every row when tent scope is empty (grow-scoped view)", () => {
    expect(isDiaryRowInTentScope(null, [])).toBe(true);
    expect(isDiaryRowInTentScope(undefined, [])).toBe(true);
    expect(isDiaryRowInTentScope("tent-a", [])).toBe(true);
    expect(isDiaryRowInTentScope("tent-a", null)).toBe(true);
    expect(isDiaryRowInTentScope("tent-a", undefined)).toBe(true);
  });

  it("accepts a row attributed to one of the scoped tents", () => {
    expect(isDiaryRowInTentScope("tent-a", ["tent-a"])).toBe(true);
    expect(isDiaryRowInTentScope("tent-b", ["tent-a", "tent-b"])).toBe(true);
  });

  it("rejects null / empty tent_id under a non-empty tent scope (fail closed)", () => {
    expect(isDiaryRowInTentScope(null, ["tent-a"])).toBe(false);
    expect(isDiaryRowInTentScope(undefined, ["tent-a"])).toBe(false);
    expect(isDiaryRowInTentScope("", ["tent-a"])).toBe(false);
    expect(isDiaryRowInTentScope("   ", ["tent-a"])).toBe(false);
  });

  it("rejects a foreign tent_id under a tent-scoped view", () => {
    expect(isDiaryRowInTentScope("tent-b", ["tent-a"])).toBe(false);
    expect(isDiaryRowInTentScope("tent-c", ["tent-a", "tent-b"])).toBe(false);
  });

  it("is deterministic for the same inputs", () => {
    const a = isDiaryRowInTentScope("tent-a", ["tent-a", "tent-b"]);
    const b = isDiaryRowInTentScope("tent-a", ["tent-a", "tent-b"]);
    expect(a).toBe(b);
    expect(a).toBe(true);
  });
});
