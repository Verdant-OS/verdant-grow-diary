import { describe, expect, it } from "vitest";
import { CREDIT_PACKS, PRICING } from "@/constants/pricing";
import {
  STRIPE_API_VERSION,
  STRIPE_DIGITAL_TAX_CODE,
  STRIPE_TEST_PLAN_IDS,
  assertStripePriceId,
  assertStripeTestSecret,
  classifyStripePlanId,
  stripeCatalogAmountCents,
  stripePriceEnvName,
} from "@/lib/stripeTestModeCatalogRules";

describe("stripe test-mode catalog", () => {
  it("lists the six purchasable products and no Founder product", () => {
    expect([...STRIPE_TEST_PLAN_IDS]).toEqual([
      "pro_monthly",
      "pro_annual",
      "craft_monthly",
      "craft_annual",
      "credit_pack_50",
      "credit_pack_150",
    ]);
    expect(STRIPE_TEST_PLAN_IDS).not.toContain("founder_lifetime");
    expect(stripePriceEnvName("founder_lifetime")).toBeNull();
    expect(stripePriceEnvName("pro_monthly")).toBe("STRIPE_PRICE_PRO_MONTHLY");
  });

  it("derives cents and pack credits from the pricing constants", () => {
    expect(stripeCatalogAmountCents("pro_monthly")).toBe(PRICING.pro.monthlyPrice * 100);
    expect(stripeCatalogAmountCents("pro_annual")).toBe(PRICING.pro.annualPrice * 100);
    expect(stripeCatalogAmountCents("craft_monthly")).toBe(PRICING.craft.monthlyPrice * 100);
    expect(stripeCatalogAmountCents("craft_annual")).toBe(PRICING.craft.annualPrice * 100);
    expect(stripeCatalogAmountCents("credit_pack_50")).toBe(CREDIT_PACKS[0].priceUsd * 100);
    expect(stripeCatalogAmountCents("credit_pack_150")).toBe(CREDIT_PACKS[1].priceUsd * 100);
    const pack = classifyStripePlanId("credit_pack_150");
    expect(pack.kind).toBe("credit_pack");
    if (pack.kind === "credit_pack") expect(pack.credits).toBe(CREDIT_PACKS[1].credits);
  });

  it("retires both Founder id spellings before any other class", () => {
    expect(classifyStripePlanId("founder_lifetime").kind).toBe("retired");
    expect(classifyStripePlanId("founder-lifetime").kind).toBe("retired");
    expect(classifyStripePlanId("nope").kind).toBe("unknown");
    expect(classifyStripePlanId("pro_monthly").kind).toBe("subscription");
  });

  it("accepts only an sk_test_ secret and rejects live or empty keys", () => {
    expect(assertStripeTestSecret("sk_test_fixture_only")).toEqual({ ok: true });
    expect(assertStripeTestSecret("").ok).toBe(false);
    expect(assertStripeTestSecret("sk_live_fixture_only").ok).toBe(false);
    expect(assertStripeTestSecret("sk_test_fixture_sk_live_hidden").ok).toBe(false);
  });

  it("accepts a price id placeholder and rejects key material", () => {
    expect(assertStripePriceId("price_test_pro_monthly")).toEqual({ ok: true });
    expect(assertStripePriceId("price_test_sk_live_nope").ok).toBe(false);
    expect(assertStripePriceId("sk_test_fixture_only").ok).toBe(false);
    expect(assertStripePriceId("").ok).toBe(false);
  });

  it("pins the Stripe API version and the shared digital tax code", () => {
    expect(STRIPE_API_VERSION).toBe("2026-02-25.preview");
    expect(STRIPE_DIGITAL_TAX_CODE).toBe("txcd_10103100");
  });
});
