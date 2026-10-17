/**
 * Live checkout opens only on an explicit production hostname (owner decision,
 * 2026-10-17: production goes live). A `test_` token stays sandbox everywhere;
 * a `live_` token resolves live only on verdantgrowdiary.com or its www host.
 */
import { describe, expect, it } from "vitest";
import {
  CHECKOUT_UNAVAILABLE_LOCALHOST_MESSAGE,
  PRODUCTION_CHECKOUT_HOSTNAMES,
  isProductionCheckoutHostname,
  resolvePaddleCheckoutEnvironment,
} from "@/lib/paddleEnvironment";
import { LIVE_CHECKOUT_FAQ_ANSWER, buildCheckoutTrustCopy } from "@/lib/checkoutTrustCopyRules";

const LIVE = "live_fixturetokenpayload00000000";
const TEST = "test_fixturetokenpayload00000000";

describe("live checkout production hostnames", () => {
  it("allows exactly the apex and www production hosts", () => {
    expect([...PRODUCTION_CHECKOUT_HOSTNAMES]).toEqual([
      "verdantgrowdiary.com",
      "www.verdantgrowdiary.com",
    ]);
  });

  it.each([
    "verdantgrowdiary.com",
    "www.verdantgrowdiary.com",
    "VerdantGrowDiary.com",
    "verdantgrowdiary.com.",
  ])("resolves a live token to live on %s", (hostname) => {
    expect(resolvePaddleCheckoutEnvironment({ token: LIVE, hostname })).toBe("live");
    expect(isProductionCheckoutHostname(hostname)).toBe(true);
  });

  it.each([
    "localhost",
    "127.0.0.1",
    "::1",
    "id-preview--66255e7b-892c-4be5-8686-ab1cfc3666db.lovable.app",
    "verdant-grow-diary.pages.dev",
    "verdant-grow-diary2.example.workers.dev",
    "staging.verdantgrowdiary.com",
    "verdantgrowdiary.com.evil.example",
    "evilverdantgrowdiary.com",
    "",
  ])("keeps a live token unavailable on %s", (hostname) => {
    expect(resolvePaddleCheckoutEnvironment({ token: LIVE, hostname })).toBe("unavailable");
    expect(isProductionCheckoutHostname(hostname)).toBe(false);
  });

  it.each([null, undefined])("keeps a live token unavailable with a %s hostname", (hostname) => {
    expect(resolvePaddleCheckoutEnvironment({ token: LIVE, hostname })).toBe("unavailable");
  });

  it.each(["verdantgrowdiary.com", "localhost", "id-preview--x.lovable.app", null])(
    "keeps a test token sandbox on %s",
    (hostname) => {
      expect(resolvePaddleCheckoutEnvironment({ token: TEST, hostname })).toBe("sandbox");
    },
  );

  it.each(["live_", "  live_  ", "", "   ", null, undefined, "pk_live_other", "LIVE_upper"])(
    "keeps a malformed or missing token %j unavailable on the production host",
    (token) => {
      expect(resolvePaddleCheckoutEnvironment({ token, hostname: "verdantgrowdiary.com" })).toBe(
        "unavailable",
      );
    },
  );

  it("is deterministic for the same input", () => {
    const input = { token: LIVE, hostname: "www.verdantgrowdiary.com" };
    expect(resolvePaddleCheckoutEnvironment(input)).toBe(resolvePaddleCheckoutEnvironment(input));
  });

  it("names the production host in the off-host blocking copy and never a token", () => {
    expect(CHECKOUT_UNAVAILABLE_LOCALHOST_MESSAGE).toBe(
      "Live checkout is only available on verdantgrowdiary.com.",
    );
    expect(CHECKOUT_UNAVAILABLE_LOCALHOST_MESSAGE).not.toMatch(/live_|test_/);
  });
});

describe("checkout trust copy for live checkout", () => {
  it("returns live copy that can create a live charge only when checkout is live", () => {
    const copy = buildCheckoutTrustCopy({ environment: "live", blocked: false });
    expect(copy.state).toBe("live");
    expect(copy.canCreateLiveCharge).toBe(true);
    expect(copy.faqAnswer).toBe(LIVE_CHECKOUT_FAQ_ANSWER);
    expect(copy.faqAnswer).not.toMatch(/sandbox/i);
  });

  it("keeps live copy truthful after a single-plan failure (other plans can still charge)", () => {
    const copy = buildCheckoutTrustCopy({
      environment: "live",
      blocked: true,
      blockedScope: "plan",
    });
    expect(copy.state).toBe("live");
    expect(copy.canCreateLiveCharge).toBe(true);
  });

  it("does not claim live checkout after a checkout-wide failure", () => {
    const copy = buildCheckoutTrustCopy({
      environment: "live",
      blocked: true,
      blockedScope: "checkout",
    });
    expect(copy.state).toBe("unavailable");
    expect(copy.canCreateLiveCharge).toBe(false);
  });

  it("still replaces sandbox copy when sandbox checkout is blocked", () => {
    expect(buildCheckoutTrustCopy({ environment: "sandbox", blocked: true }).state).toBe(
      "unavailable",
    );
  });
});
