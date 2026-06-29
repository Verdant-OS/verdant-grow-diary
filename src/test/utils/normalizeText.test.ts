import { describe, it, expect } from "vitest";
import {
  normalizeText,
  expectNormalizedTextToContain,
} from "./normalizeText";

describe("normalizeText", () => {
  it("collapses newlines, tabs, and runs of spaces to a single space", () => {
    expect(normalizeText("a\n   b\t\tc  d")).toBe("a b c d");
  });

  it("trims leading/trailing whitespace", () => {
    expect(normalizeText("   hello world   ")).toBe("hello world");
  });

  it("is null/undefined safe", () => {
    expect(normalizeText(null)).toBe("");
    expect(normalizeText(undefined)).toBe("");
  });

  it("is deterministic", () => {
    const a = normalizeText("x\n y");
    const b = normalizeText("x\n y");
    expect(a).toBe(b);
  });
});

describe("expectNormalizedTextToContain", () => {
  it("matches across line breaks", () => {
    expectNormalizedTextToContain(
      "Re-check current grow\n        conditions before approving this action.",
      "current grow conditions before approving this action",
    );
  });

  it("throws when phrase is genuinely missing", () => {
    expect(() =>
      expectNormalizedTextToContain("hello world", "goodbye world"),
    ).toThrow();
  });
});
