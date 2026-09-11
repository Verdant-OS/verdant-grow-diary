import { describe, expect, it } from "vitest";
import { hasTrimmedRequiredIdentity } from "@/lib/formIdentityFailClosedRules";

describe("hasTrimmedRequiredIdentity", () => {
  it("rejects empty, whitespace-only, and non-string values", () => {
    expect(hasTrimmedRequiredIdentity("")).toBe(false);
    expect(hasTrimmedRequiredIdentity("   ")).toBe(false);
    expect(hasTrimmedRequiredIdentity("\t\n")).toBe(false);
    expect(hasTrimmedRequiredIdentity(null)).toBe(false);
    expect(hasTrimmedRequiredIdentity(undefined)).toBe(false);
  });

  it("accepts a trimmed non-empty name", () => {
    expect(hasTrimmedRequiredIdentity("Plant A")).toBe(true);
    expect(hasTrimmedRequiredIdentity("  Tent 1 ")).toBe(true);
  });
});
