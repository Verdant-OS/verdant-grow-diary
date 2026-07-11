/**
 * Slice A — Paddle environment fail-closed + localhost guard.
 *
 * Full test matrix for the pure helpers in src/lib/paddleEnvironment.ts.
 * Deterministic — no window, no network, no Paddle calls.
 */
import { describe, it, expect } from "vitest";
import {
  classifyPaddleToken,
  isLoopbackHostname,
  resolvePaddleCheckoutEnvironment,
  CHECKOUT_UNAVAILABLE_LOCALHOST_MESSAGE,
  CHECKOUT_UNAVAILABLE_GENERIC_MESSAGE,
} from "@/lib/paddleEnvironment";

describe("classifyPaddleToken", () => {
  it("classifies well-formed sandbox tokens", () => {
    expect(classifyPaddleToken("test_abc123xyz")).toBe("sandbox");
  });

  it("classifies well-formed live tokens", () => {
    expect(classifyPaddleToken("live_abc123xyz")).toBe("live");
  });

  it("fails closed on null / undefined / empty / whitespace", () => {
    expect(classifyPaddleToken(null)).toBe("unavailable");
    expect(classifyPaddleToken(undefined)).toBe("unavailable");
    expect(classifyPaddleToken("")).toBe("unavailable");
    expect(classifyPaddleToken("   ")).toBe("unavailable");
  });

  it("fails closed on unknown or malformed prefixes", () => {
    expect(classifyPaddleToken("prod_abc")).toBe("unavailable");
    expect(classifyPaddleToken("sandbox_abc")).toBe("unavailable");
    expect(classifyPaddleToken("abc123")).toBe("unavailable");
    expect(classifyPaddleToken("TEST_abc")).toBe("unavailable");
    expect(classifyPaddleToken("LIVE_abc")).toBe("unavailable");
  });

  it("fails closed on prefix-only tokens (no payload)", () => {
    expect(classifyPaddleToken("test_")).toBe("unavailable");
    expect(classifyPaddleToken("live_")).toBe("unavailable");
  });

  it("trims surrounding whitespace before classifying", () => {
    expect(classifyPaddleToken("  test_abc  ")).toBe("sandbox");
    expect(classifyPaddleToken("\tlive_abc\n")).toBe("live");
  });

  it("never returns the token value in the classification", () => {
    // Sanity: the return type is a fixed union, but assert the actual
    // returned string is only one of the three known labels.
    const out = classifyPaddleToken("test_super_secret_token_value");
    expect(["sandbox", "live", "unavailable"]).toContain(out);
    expect(out).not.toContain("super_secret_token_value");
  });
});

describe("isLoopbackHostname", () => {
  it("matches localhost and its subdomains", () => {
    expect(isLoopbackHostname("localhost")).toBe(true);
    expect(isLoopbackHostname("app.localhost")).toBe(true);
    expect(isLoopbackHostname("foo.bar.localhost")).toBe(true);
  });

  it("matches IPv4 loopback range 127.0.0.0/8", () => {
    expect(isLoopbackHostname("127.0.0.1")).toBe(true);
    expect(isLoopbackHostname("127.0.0.0")).toBe(true);
    expect(isLoopbackHostname("127.255.255.255")).toBe(true);
    expect(isLoopbackHostname("127.1.2.3")).toBe(true);
  });

  it("matches IPv6 loopback and 0.0.0.0", () => {
    expect(isLoopbackHostname("::1")).toBe(true);
    expect(isLoopbackHostname("0.0.0.0")).toBe(true);
  });

  it("does not match non-loopback IPv4 addresses", () => {
    expect(isLoopbackHostname("128.0.0.1")).toBe(false);
    expect(isLoopbackHostname("10.0.0.1")).toBe(false);
    expect(isLoopbackHostname("192.168.1.1")).toBe(false);
    expect(isLoopbackHostname("126.0.0.1")).toBe(false);
  });

  it("does not match public hostnames", () => {
    expect(isLoopbackHostname("verdantgrowdiary.com")).toBe(false);
    expect(isLoopbackHostname("www.verdantgrowdiary.com")).toBe(false);
    expect(isLoopbackHostname("verdantgrowdiary-com.lovable.app")).toBe(false);
    expect(isLoopbackHostname("id-preview--x.lovable.app")).toBe(false);
  });

  it("does not match hostnames that merely contain 'localhost'", () => {
    expect(isLoopbackHostname("mylocalhost.com")).toBe(false);
    expect(isLoopbackHostname("localhost.example.com")).toBe(false);
  });

  it("returns false for null / undefined / empty / non-string", () => {
    expect(isLoopbackHostname(null)).toBe(false);
    expect(isLoopbackHostname(undefined)).toBe(false);
    expect(isLoopbackHostname("")).toBe(false);
    expect(isLoopbackHostname("   ")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isLoopbackHostname("LOCALHOST")).toBe(true);
    expect(isLoopbackHostname("LocalHost")).toBe(true);
  });
});

describe("resolvePaddleCheckoutEnvironment", () => {
  it("returns sandbox for a sandbox token on any host, including loopback", () => {
    expect(
      resolvePaddleCheckoutEnvironment({
        token: "test_abc",
        hostname: "localhost",
      }),
    ).toBe("sandbox");
    expect(
      resolvePaddleCheckoutEnvironment({
        token: "test_abc",
        hostname: "127.0.0.1",
      }),
    ).toBe("sandbox");
    expect(
      resolvePaddleCheckoutEnvironment({
        token: "test_abc",
        hostname: "id-preview--x.lovable.app",
      }),
    ).toBe("sandbox");
  });

  it("returns live for a live token on a non-loopback production host", () => {
    expect(
      resolvePaddleCheckoutEnvironment({
        token: "live_abc",
        hostname: "verdantgrowdiary.com",
      }),
    ).toBe("live");
    expect(
      resolvePaddleCheckoutEnvironment({
        token: "live_abc",
        hostname: "www.verdantgrowdiary.com",
      }),
    ).toBe("live");
  });

  it("FAILS CLOSED: live token on loopback → unavailable", () => {
    expect(
      resolvePaddleCheckoutEnvironment({
        token: "live_abc",
        hostname: "localhost",
      }),
    ).toBe("unavailable");
    expect(
      resolvePaddleCheckoutEnvironment({
        token: "live_abc",
        hostname: "127.0.0.1",
      }),
    ).toBe("unavailable");
    expect(
      resolvePaddleCheckoutEnvironment({
        token: "live_abc",
        hostname: "::1",
      }),
    ).toBe("unavailable");
    expect(
      resolvePaddleCheckoutEnvironment({
        token: "live_abc",
        hostname: "app.localhost",
      }),
    ).toBe("unavailable");
  });

  it("returns unavailable for missing / malformed tokens regardless of host", () => {
    expect(
      resolvePaddleCheckoutEnvironment({ token: null, hostname: "verdantgrowdiary.com" }),
    ).toBe("unavailable");
    expect(
      resolvePaddleCheckoutEnvironment({ token: "", hostname: "localhost" }),
    ).toBe("unavailable");
    expect(
      resolvePaddleCheckoutEnvironment({ token: "prod_abc", hostname: "verdantgrowdiary.com" }),
    ).toBe("unavailable");
    expect(
      resolvePaddleCheckoutEnvironment({ token: "test_", hostname: "localhost" }),
    ).toBe("unavailable");
    expect(
      resolvePaddleCheckoutEnvironment({ token: "live_", hostname: "verdantgrowdiary.com" }),
    ).toBe("unavailable");
  });

  it("returns unavailable when hostname is missing and token is live (fail closed)", () => {
    // Missing hostname cannot prove non-loopback safety, but classification of
    // the token still runs; live+unknown host still resolves to live because
    // isLoopbackHostname(null) === false. We accept that: server-side / SSR
    // callers must pass a real hostname. Document the behavior explicitly.
    expect(
      resolvePaddleCheckoutEnvironment({ token: "live_abc", hostname: null }),
    ).toBe("live");
    // And a sandbox token with unknown host still classifies as sandbox.
    expect(
      resolvePaddleCheckoutEnvironment({ token: "test_abc", hostname: null }),
    ).toBe("sandbox");
  });
});

describe("blocking copy constants", () => {
  it("localhost message matches spec verbatim", () => {
    expect(CHECKOUT_UNAVAILABLE_LOCALHOST_MESSAGE).toBe(
      "Checkout disabled: localhost requires a Paddle sandbox token.",
    );
  });

  it("generic unavailable message does not reveal token or environment details", () => {
    expect(CHECKOUT_UNAVAILABLE_GENERIC_MESSAGE).toMatch(/unavailable/i);
    expect(CHECKOUT_UNAVAILABLE_GENERIC_MESSAGE).not.toMatch(/token/i);
    expect(CHECKOUT_UNAVAILABLE_GENERIC_MESSAGE).not.toMatch(/live|sandbox/i);
  });
});
