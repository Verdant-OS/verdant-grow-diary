import { describe, it, expect } from "vitest";
import {
  buildSignedOutRedirect,
  DEFAULT_AUTH_REDIRECT,
  PUBLIC_MARKETING_LANDING,
  sanitizeAuthRedirect,
  SIGNED_OUT_LANDING,
} from "@/lib/authRedirectRules";

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

// Signed-out re-entry (measured live on 94f9c631, tokenless tab): a protected
// route miss landed on the full marketing /welcome, so a returning grower read
// "I don't have an account". The miss must land on the sign-in screen with the
// destination preserved; anonymous visits to / and /welcome stay marketing.
describe("buildSignedOutRedirect — signed-out re-entry lands on the sign-in screen", () => {
  it("names the sign-in screen as the signed-out landing and /welcome as marketing", () => {
    expect(SIGNED_OUT_LANDING).toBe("/auth");
    expect(PUBLIC_MARKETING_LANDING).toBe("/welcome");
  });

  it("sends a protected-route miss to /auth with the destination preserved", () => {
    expect(buildSignedOutRedirect("/grows")).toBe("/auth?redirectTo=%2Fgrows");
    expect(buildSignedOutRedirect("/dashboard")).toBe("/auth?redirectTo=%2Fdashboard");
    expect(buildSignedOutRedirect("/dashboard", "?growId=g1")).toBe(
      "/auth?redirectTo=%2Fdashboard%3FgrowId%3Dg1",
    );
    expect(buildSignedOutRedirect("/sensors", "", "#manual-reading")).toBe(
      "/auth?redirectTo=%2Fsensors%23manual-reading",
    );
  });

  it("never loops the sign-in screen back onto itself", () => {
    expect(buildSignedOutRedirect("/auth")).toBe("/auth");
    expect(buildSignedOutRedirect("/auth", "?redirectTo=%2Fgrows")).toBe("/auth");
    expect(buildSignedOutRedirect("/auth", "", "#signup")).toBe("/auth");
  });

  it("never restores a marketing entry as a destination", () => {
    expect(buildSignedOutRedirect("/")).toBe("/auth");
    expect(buildSignedOutRedirect("/welcome")).toBe("/auth");
    expect(buildSignedOutRedirect("/welcome", "?redirectTo=%2Fplants")).toBe("/auth");
    expect(buildSignedOutRedirect("/welcome", "", "#features")).toBe("/auth");
  });

  it("falls back to plain /auth for unknown or unsafe locations", () => {
    expect(buildSignedOutRedirect("/not-a-route")).toBe("/auth");
    expect(buildSignedOutRedirect("//evil.example")).toBe("/auth");
    expect(buildSignedOutRedirect("/plants", "?q=a b")).toBe("/auth");
  });
});
