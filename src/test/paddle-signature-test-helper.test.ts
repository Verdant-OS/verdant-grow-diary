/**
 * Tests for the test-only Paddle-Signature helper.
 * Uses obvious fake secrets — never a real Paddle webhook secret.
 */
import { describe, it, expect } from "vitest";
import {
  buildPaddleSignatureHeader,
  verifyPaddleSignatureHeader,
} from "./helpers/paddleSignatureTestHelper";

const FAKE_SECRET = "test-fake-secret-do-not-use-in-prod";
const OTHER_FAKE_SECRET = "test-fake-secret-alternate";
const RAW = '{"event_type":"subscription.created","data":{"id":"sub_abc"}}';
const TS = 1_800_000_000;

describe("buildPaddleSignatureHeader", () => {
  it("is deterministic for same body/timestamp/secret", () => {
    const a = buildPaddleSignatureHeader({ rawBody: RAW, secret: FAKE_SECRET, timestamp: TS });
    const b = buildPaddleSignatureHeader({ rawBody: RAW, secret: FAKE_SECRET, timestamp: TS });
    expect(a).toBe(b);
    expect(a).toMatch(/^ts=\d+;h1=[0-9a-f]{64}$/);
  });

  it("changes signature when raw body changes", () => {
    const a = buildPaddleSignatureHeader({ rawBody: RAW, secret: FAKE_SECRET, timestamp: TS });
    const b = buildPaddleSignatureHeader({
      rawBody: RAW + " ",
      secret: FAKE_SECRET,
      timestamp: TS,
    });
    expect(a).not.toBe(b);
  });

  it("changes signature when timestamp changes", () => {
    const a = buildPaddleSignatureHeader({ rawBody: RAW, secret: FAKE_SECRET, timestamp: TS });
    const b = buildPaddleSignatureHeader({ rawBody: RAW, secret: FAKE_SECRET, timestamp: TS + 1 });
    expect(a).not.toBe(b);
  });

  it("changes signature when secret changes", () => {
    const a = buildPaddleSignatureHeader({ rawBody: RAW, secret: FAKE_SECRET, timestamp: TS });
    const b = buildPaddleSignatureHeader({ rawBody: RAW, secret: OTHER_FAKE_SECRET, timestamp: TS });
    expect(a).not.toBe(b);
  });

  it("preserves whitespace/order in raw body (signs verbatim)", () => {
    const bodyA = '{"a":1,"b":2}';
    const bodyB = '{ "a":1, "b":2 }';
    const bodyC = '{"b":2,"a":1}';
    const sigs = new Set([
      buildPaddleSignatureHeader({ rawBody: bodyA, secret: FAKE_SECRET, timestamp: TS }),
      buildPaddleSignatureHeader({ rawBody: bodyB, secret: FAKE_SECRET, timestamp: TS }),
      buildPaddleSignatureHeader({ rawBody: bodyC, secret: FAKE_SECRET, timestamp: TS }),
    ]);
    expect(sigs.size).toBe(3);
  });

  it("rejects non-integer timestamps", () => {
    expect(() =>
      buildPaddleSignatureHeader({ rawBody: RAW, secret: FAKE_SECRET, timestamp: 1.5 }),
    ).toThrow(/timestamp/);
  });
});

describe("verifyPaddleSignatureHeader", () => {
  it("accepts a generated header against the same body/secret", async () => {
    const header = buildPaddleSignatureHeader({
      rawBody: RAW,
      secret: FAKE_SECRET,
      timestamp: TS,
    });
    expect(await verifyPaddleSignatureHeader(header, RAW, FAKE_SECRET)).toBe(true);
  });

  it("rejects tampered raw body", async () => {
    const header = buildPaddleSignatureHeader({
      rawBody: RAW,
      secret: FAKE_SECRET,
      timestamp: TS,
    });
    const tampered = RAW.replace("sub_abc", "sub_evil");
    expect(await verifyPaddleSignatureHeader(header, tampered, FAKE_SECRET)).toBe(false);
  });

  it("rejects wrong secret", async () => {
    const header = buildPaddleSignatureHeader({
      rawBody: RAW,
      secret: FAKE_SECRET,
      timestamp: TS,
    });
    expect(await verifyPaddleSignatureHeader(header, RAW, OTHER_FAKE_SECRET)).toBe(false);
  });

  it("rejects malformed header", async () => {
    expect(await verifyPaddleSignatureHeader("nope", RAW, FAKE_SECRET)).toBe(false);
    expect(await verifyPaddleSignatureHeader("ts=1;h1=", RAW, FAKE_SECRET)).toBe(false);
    expect(await verifyPaddleSignatureHeader(";;", RAW, FAKE_SECRET)).toBe(false);
  });

  it("fake secret is obviously fake (no live/test Paddle prefix)", () => {
    expect(FAKE_SECRET).not.toMatch(/^pdl_ntfset_/);
    expect(OTHER_FAKE_SECRET).not.toMatch(/^pdl_ntfset_/);
  });
});
