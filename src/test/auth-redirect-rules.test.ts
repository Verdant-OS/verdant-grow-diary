import { describe, it, expect } from "vitest";
import { sanitizeAuthRedirect, DEFAULT_AUTH_REDIRECT } from "@/lib/authRedirectRules";

describe("sanitizeAuthRedirect", () => {
  const cases: Array<[unknown, string]> = [
    ["/dashboard", "/dashboard"],
    ["/plants/abc-123", "/plants/abc-123"],
    ["/grow/1?tab=timeline", "/grow/1?tab=timeline"],
    ["/path#hash", "/path#hash"],
    // Rejected:
    [undefined, DEFAULT_AUTH_REDIRECT],
    [null, DEFAULT_AUTH_REDIRECT],
    ["", DEFAULT_AUTH_REDIRECT],
    [" ", DEFAULT_AUTH_REDIRECT],
    ["dashboard", DEFAULT_AUTH_REDIRECT],
    ["//evil.example", DEFAULT_AUTH_REDIRECT],
    ["//evil.example/path", DEFAULT_AUTH_REDIRECT],
    ["https://evil.example/path", DEFAULT_AUTH_REDIRECT],
    ["http://evil", DEFAULT_AUTH_REDIRECT],
    ["javascript:alert(1)", DEFAULT_AUTH_REDIRECT],
    ["/javascript:alert(1)", DEFAULT_AUTH_REDIRECT],
    ["data:text/html,xss", DEFAULT_AUTH_REDIRECT],
    ["vbscript:msgbox(1)", DEFAULT_AUTH_REDIRECT],
    ["/\\evil.example", DEFAULT_AUTH_REDIRECT],
    ["\\evil", DEFAULT_AUTH_REDIRECT],
    ["/path with space", DEFAULT_AUTH_REDIRECT],
    ["/path\nnewline", DEFAULT_AUTH_REDIRECT],
    ["/path\u0000nul", DEFAULT_AUTH_REDIRECT],
    [123 as unknown, DEFAULT_AUTH_REDIRECT],
    [{ url: "/x" } as unknown, DEFAULT_AUTH_REDIRECT],
    [["/x"] as unknown, DEFAULT_AUTH_REDIRECT],
    ["/" + "a".repeat(600), DEFAULT_AUTH_REDIRECT],
  ];
  for (const [input, expected] of cases) {
    it(`returns ${JSON.stringify(expected)} for ${JSON.stringify(input)}`, () => {
      expect(sanitizeAuthRedirect(input)).toBe(expected);
    });
  }

  it("honors a safe custom fallback", () => {
    expect(sanitizeAuthRedirect("https://evil", "/dashboard")).toBe("/dashboard");
  });
  it("ignores an unsafe custom fallback and reverts to '/'", () => {
    expect(sanitizeAuthRedirect("https://evil", "//evil")).toBe("/");
    expect(sanitizeAuthRedirect(null, "https://evil")).toBe("/");
  });
  it("never throws on bizarre input", () => {
    expect(() => sanitizeAuthRedirect(Symbol("x") as unknown)).not.toThrow();
    expect(() => sanitizeAuthRedirect(() => "/x" as unknown)).not.toThrow();
    const circ: Record<string, unknown> = {};
    circ.self = circ;
    expect(() => sanitizeAuthRedirect(circ)).not.toThrow();
  });
});
