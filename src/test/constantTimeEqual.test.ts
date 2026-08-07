/**
 * constantTimeEqual — pure unit tests.
 */
import { describe, it, expect } from "vitest";
import {
  constantTimeEqual,
  constantTimeEqualAny,
  constantTimeEqualBytes,
  constantTimeEqualHex,
  constantTimeEqualStrings,
} from "@/lib/constantTimeEqual";

describe("constantTimeEqualBytes", () => {
  it("accepts identical sequences", () => {
    expect(constantTimeEqualBytes([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(constantTimeEqualBytes(new Uint8Array([0xaa, 0xbb]), new Uint8Array([0xaa, 0xbb]))).toBe(
      true,
    );
  });

  it("rejects length mismatch without requiring equal content", () => {
    expect(constantTimeEqualBytes([1, 2], [1, 2, 3])).toBe(false);
    expect(constantTimeEqualBytes([], [0])).toBe(false);
  });

  it("rejects single-byte difference", () => {
    expect(constantTimeEqualBytes([1, 2, 3], [1, 2, 4])).toBe(false);
    expect(constantTimeEqualBytes([0xff], [0xfe])).toBe(false);
  });
});

describe("constantTimeEqualStrings / constantTimeEqual", () => {
  it("accepts equal strings", () => {
    expect(constantTimeEqualStrings("abc", "abc")).toBe(true);
    expect(constantTimeEqual("deadbeef", "deadbeef")).toBe(true);
  });

  it("rejects length and content mismatches", () => {
    expect(constantTimeEqual("abcd", "abc")).toBe(false);
    expect(constantTimeEqual("abcd", "abce")).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(constantTimeEqualStrings(null as unknown as string, "a")).toBe(false);
    expect(constantTimeEqualStrings("a", undefined as unknown as string)).toBe(false);
  });
});

describe("constantTimeEqualHex", () => {
  it("normalizes case and trims", () => {
    expect(constantTimeEqualHex("AbCd", "abcd")).toBe(true);
    expect(constantTimeEqualHex("  abcd  ", "ABCD")).toBe(true);
  });

  it("rejects mismatches", () => {
    expect(constantTimeEqualHex("abcd", "abce")).toBe(false);
    expect(constantTimeEqualHex("abc", "abcd")).toBe(false);
  });
});

describe("constantTimeEqualAny", () => {
  it("matches any candidate without requiring first slot", () => {
    expect(constantTimeEqualAny("sig", ["nope", "sig", "other"])).toBe(true);
    expect(constantTimeEqualAny("sig", ["nope", "other"])).toBe(false);
    expect(constantTimeEqualAny("sig", [])).toBe(false);
  });

  it("still requires full equal-length string match", () => {
    expect(constantTimeEqualAny("abcd", ["abc", "abcde", "abce"])).toBe(false);
  });
});
