import { describe, it, expect } from "vitest";
import {
  formatGrowDisplayLabel,
  GROW_DISPLAY_FALLBACK,
  looksLikeUuid,
} from "@/lib/growDisplayLabel";

describe("formatGrowDisplayLabel", () => {
  const uuid = "11111111-2222-3333-4444-555555555555";

  it("returns the trimmed name when provided", () => {
    expect(formatGrowDisplayLabel("  Tent A Grow  ", uuid)).toBe("Tent A Grow");
  });

  it("falls back when name is null/undefined/empty", () => {
    expect(formatGrowDisplayLabel(null, uuid)).toBe(GROW_DISPLAY_FALLBACK);
    expect(formatGrowDisplayLabel(undefined, uuid)).toBe(GROW_DISPLAY_FALLBACK);
    expect(formatGrowDisplayLabel("", uuid)).toBe(GROW_DISPLAY_FALLBACK);
    expect(formatGrowDisplayLabel("   ", uuid)).toBe(GROW_DISPLAY_FALLBACK);
  });

  it("never returns a UUID-shaped string as the visible label", () => {
    expect(formatGrowDisplayLabel(uuid, uuid)).toBe(GROW_DISPLAY_FALLBACK);
    expect(formatGrowDisplayLabel(uuid.toUpperCase(), uuid)).toBe(
      GROW_DISPLAY_FALLBACK,
    );
  });

  it("looksLikeUuid detects canonical v4-shaped strings only", () => {
    expect(looksLikeUuid(uuid)).toBe(true);
    expect(looksLikeUuid("not-a-uuid")).toBe(false);
    expect(looksLikeUuid(null)).toBe(false);
    expect(looksLikeUuid(123)).toBe(false);
  });

  it("is deterministic and pure", () => {
    expect(formatGrowDisplayLabel("My Grow")).toBe(
      formatGrowDisplayLabel("My Grow"),
    );
  });
});
