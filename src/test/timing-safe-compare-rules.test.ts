/**
 * #1002 — one shared, deterministic secret/HMAC comparison helper.
 * Behavioral only: no wall-clock timing assertions (non-goal).
 */
import { describe, it, expect } from "vitest";
import {
  timingSafeEqual,
  timingSafeEqualHex,
  timingSafeMatchesAny,
} from "@/lib/timingSafeCompareRules";

describe("timingSafeEqual", () => {
  it("equal values match", () => {
    expect(timingSafeEqual("s3cret-token", "s3cret-token")).toBe(true);
  });
  it("a single differing byte does not match (first, middle, last)", () => {
    expect(timingSafeEqual("xbcdef", "abcdef")).toBe(false);
    expect(timingSafeEqual("abcXef", "abcdef")).toBe(false);
    expect(timingSafeEqual("abcdeX", "abcdef")).toBe(false);
  });
  it("unequal lengths never match, including prefixes and NUL padding", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("abcd", "abc")).toBe(false);
    expect(timingSafeEqual("abc", "abc\u0000")).toBe(false);
  });
  it("empty strings: equal to each other, never to a non-empty secret", () => {
    expect(timingSafeEqual("", "")).toBe(true);
    expect(timingSafeEqual("", "x")).toBe(false);
    expect(timingSafeEqual("x", "")).toBe(false);
  });
  it("non-ASCII compares by code unit", () => {
    expect(timingSafeEqual("clé-🔑", "clé-🔑")).toBe(true);
    expect(timingSafeEqual("clé-🔑", "cle-🔑")).toBe(false);
  });
  it("non-string input never matches", () => {
    expect(timingSafeEqual(null as unknown as string, "a")).toBe(false);
    expect(timingSafeEqual("a", undefined as unknown as string)).toBe(false);
  });
});

describe("timingSafeEqualHex", () => {
  it("normalizes case", () => {
    expect(timingSafeEqualHex("ABCDEF0123", "abcdef0123")).toBe(true);
  });
  it("invalid hex never matches, even when identical", () => {
    expect(timingSafeEqualHex("xyz", "xyz")).toBe(false);
    expect(timingSafeEqualHex("abcg", "abcg")).toBe(false);
  });
  it("empty hex never matches", () => {
    expect(timingSafeEqualHex("", "")).toBe(false);
  });
  it("different or different-length hex does not match", () => {
    expect(timingSafeEqualHex("abcd", "abce")).toBe(false);
    expect(timingSafeEqualHex("abcd", "abcd0")).toBe(false);
  });
});

describe("timingSafeMatchesAny", () => {
  const keys = ["key-one", "key-two", "key-three"];
  it("matches at the first, middle and last position", () => {
    expect(timingSafeMatchesAny("key-one", keys)).toBe(true);
    expect(timingSafeMatchesAny("key-two", keys)).toBe(true);
    expect(timingSafeMatchesAny("key-three", keys)).toBe(true);
  });
  it("no match", () => {
    expect(timingSafeMatchesAny("key-four", keys)).toBe(false);
  });
  it("evaluates every accepted value (no early return on match)", () => {
    let reads = 0;
    const counted = new Proxy(keys, {
      get(target, prop, recv) {
        if (typeof prop === "string" && /^\d+$/.test(prop)) reads += 1;
        return Reflect.get(target, prop, recv);
      },
    });
    expect(timingSafeMatchesAny("key-one", counted)).toBe(true);
    expect(reads).toBe(keys.length);
  });
  it("empty or missing candidate runs the loop and fails", () => {
    expect(timingSafeMatchesAny("", keys)).toBe(false);
    expect(timingSafeMatchesAny(null, keys)).toBe(false);
  });
  it("empty accepted values never match, and an empty list fails", () => {
    expect(timingSafeMatchesAny("", [""])).toBe(false);
    expect(timingSafeMatchesAny("key-one", [])).toBe(false);
  });
});
