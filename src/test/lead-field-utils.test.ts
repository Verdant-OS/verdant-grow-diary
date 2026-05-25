/**
 * Unit tests for src/lib/leadFieldUtils.ts
 *
 * Pure function tests: isMeaningfulString and parseLeadTime.
 * No I/O, no Supabase, no React.
 */
import { describe, it, expect } from "vitest";
import { isMeaningfulString, parseLeadTime, KNOWN_LEAD_STATUSES } from "@/lib/leadFieldUtils";

describe("isMeaningfulString", () => {
  it("returns true for a regular non-empty string", () => {
    expect(isMeaningfulString("hello")).toBe(true);
    expect(isMeaningfulString("a")).toBe(true);
    expect(isMeaningfulString("  content  ")).toBe(true);
  });

  it("returns false for an empty string", () => {
    expect(isMeaningfulString("")).toBe(false);
  });

  it("returns false for a whitespace-only string", () => {
    expect(isMeaningfulString("   ")).toBe(false);
    expect(isMeaningfulString("\t")).toBe(false);
    expect(isMeaningfulString("\n")).toBe(false);
    expect(isMeaningfulString("  \n  ")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isMeaningfulString(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isMeaningfulString(undefined)).toBe(false);
  });

  it("returns true for strings with mixed whitespace and content", () => {
    expect(isMeaningfulString("  x  ")).toBe(true);
    expect(isMeaningfulString("\thello\n")).toBe(true);
  });

  it("acts as a type guard — returned true means value is string", () => {
    const val: string | null = "test";
    if (isMeaningfulString(val)) {
      // TypeScript should narrow val to string here; just assert it works
      expect(val.toUpperCase()).toBe("TEST");
    }
  });
});

describe("parseLeadTime", () => {
  it("parses a valid ISO timestamp and returns its epoch milliseconds", () => {
    const iso = "2026-05-20T12:00:00.000Z";
    const expected = new Date(iso).getTime();
    expect(parseLeadTime(iso)).toBe(expected);
  });

  it("parses a date-only ISO string", () => {
    const iso = "2026-01-01";
    const t = parseLeadTime(iso);
    expect(t).toBeTypeOf("number");
    expect(Number.isFinite(t!)).toBe(true);
  });

  it("returns null for null", () => {
    expect(parseLeadTime(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(parseLeadTime(undefined)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseLeadTime("")).toBeNull();
  });

  it("returns null for a non-date string", () => {
    expect(parseLeadTime("not-a-date")).toBeNull();
  });

  it("returns null for 'Invalid Date' strings", () => {
    expect(parseLeadTime("2026-99-99")).toBeNull();
    expect(parseLeadTime("foo bar baz")).toBeNull();
  });

  it("different ISO timestamps produce strictly ordered results", () => {
    const earlier = parseLeadTime("2026-01-01T00:00:00Z");
    const later = parseLeadTime("2026-12-31T23:59:59Z");
    expect(earlier).not.toBeNull();
    expect(later).not.toBeNull();
    expect(earlier!).toBeLessThan(later!);
  });

  it("same timestamp string returns the same value on repeated calls", () => {
    const iso = "2026-05-24T08:30:00Z";
    expect(parseLeadTime(iso)).toBe(parseLeadTime(iso));
  });
});

describe("KNOWN_LEAD_STATUSES constant", () => {
  it("is a ReadonlySet", () => {
    expect(KNOWN_LEAD_STATUSES).toBeInstanceOf(Set);
  });

  it("contains all expected lead statuses", () => {
    const expected = ["new", "reviewed", "contacted", "follow_up", "closed", "spam"];
    for (const s of expected) {
      expect(KNOWN_LEAD_STATUSES.has(s)).toBe(true);
    }
  });

  it("has exactly 6 statuses", () => {
    expect(KNOWN_LEAD_STATUSES.size).toBe(6);
  });

  it("does not contain unknown status strings", () => {
    expect(KNOWN_LEAD_STATUSES.has("deleted")).toBe(false);
    expect(KNOWN_LEAD_STATUSES.has("pending")).toBe(false);
    expect(KNOWN_LEAD_STATUSES.has("")).toBe(false);
  });
});
