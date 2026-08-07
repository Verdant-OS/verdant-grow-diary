import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  constantTimeEqual,
  constantTimeEqualHex,
  constantTimeEqualAny,
} from "@/lib/constantTimeEqual";

describe("constantTimeEqual", () => {
  it("accepts identical strings including empty", () => {
    expect(constantTimeEqual("", "")).toBe(true);
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("pdl_ntfset_fake", "pdl_ntfset_fake")).toBe(true);
  });

  it("rejects content mismatch at any position", () => {
    expect(constantTimeEqual("abcd", "abce")).toBe(false);
    expect(constantTimeEqual("x", "y")).toBe(false);
    expect(constantTimeEqual("prefix-a", "prefix-b")).toBe(false);
  });

  it("rejects length mismatch without accepting prefixes", () => {
    expect(constantTimeEqual("abcd", "abcde")).toBe(false);
    expect(constantTimeEqual("abcde", "abcd")).toBe(false);
    expect(constantTimeEqual("", "a")).toBe(false);
  });

  it("constantTimeEqualHex matches constantTimeEqual", () => {
    expect(constantTimeEqualHex("deadbeef", "deadbeef")).toBe(true);
    expect(constantTimeEqualHex("deadbeef", "deadbeee")).toBe(false);
    expect(constantTimeEqualHex("aa", "aaa")).toBe(false);
  });

  it("constantTimeEqualAny scans all candidates (rotation)", () => {
    const expected = "match-me";
    expect(constantTimeEqualAny(expected, ["no", "match-me", "also-no"])).toBe(true);
    expect(constantTimeEqualAny(expected, ["match-me", "match-me"])).toBe(true);
    expect(constantTimeEqualAny(expected, ["no", "nope"])).toBe(false);
    expect(constantTimeEqualAny(expected, [])).toBe(false);
  });
});

describe("constantTimeEqual — static hygiene", () => {
  const SRC = readFileSync(resolve(process.cwd(), "src/lib/constantTimeEqual.ts"), "utf8");

  it("does not early-return on first char mismatch inside the loop", () => {
    // No return inside the for-loop body.
    expect(SRC).toMatch(/for \(let i = 0; i < maxLength; i\+\+\) \{/);
    const loop = SRC.slice(SRC.indexOf("for (let i = 0; i < maxLength"));
    const body = loop.slice(0, loop.indexOf("return mismatch === 0"));
    expect(body).not.toMatch(/\breturn\b/);
  });

  it("documents JS best-effort limits (no false constant-time claim)", () => {
    expect(SRC).toMatch(/not a cryptographic proof/i);
    expect(SRC).toMatch(/best-effort/i);
  });

  it("crypto call sites import the shared helper (no local XOR reimplementation)", () => {
    const pi = readFileSync(resolve(process.cwd(), "src/lib/piIngestAuthRules.ts"), "utf8");
    const eco = readFileSync(resolve(process.cwd(), "src/lib/ecowittRealIngestAuth.ts"), "utf8");
    const paddle = readFileSync(
      resolve(process.cwd(), "supabase/functions/paddle-webhook/verifyPaddleSignature.ts"),
      "utf8",
    );
    const email = readFileSync(
      resolve(process.cwd(), "supabase/functions/send-transactional-email/contract.ts"),
      "utf8",
    );

    expect(pi).toMatch(/from ["']\.\/constantTimeEqual["']/);
    expect(pi).not.toMatch(/export function constantTimeEqualHex/);
    expect(eco).toMatch(/from ["']\.\/constantTimeEqual["']/);
    expect(eco).not.toMatch(/function safeEqual/);
    expect(paddle).toMatch(/from ["'].*constantTimeEqual\.ts["']/);
    expect(paddle).not.toMatch(/export function constantTimeEqual\(/);
    expect(email).toMatch(/from ["'].*constantTimeEqual\.ts["']/);
    expect(email).not.toMatch(/function constantTimeEqual\(/);
  });
});
