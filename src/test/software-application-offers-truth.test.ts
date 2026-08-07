/**
 * Structured-data truth: the build-time SoftwareApplication JSON-LD may only
 * advertise plans a grower can actually buy from the PUBLIC pricing page.
 *
 * Founder Lifetime was retired from the public grid — Pricing.tsx renders its
 * card only behind an explicit `?plan=founder_lifetime` deep link — so it must
 * not appear as a public Offer. Craft is publicly offered and must appear.
 * Existing founder entitlements are unaffected (planCatalog/PAID_PLAN_IDS are
 * out of scope here); this pins DISPLAY truth only.
 */
import { describe, it, expect } from "vitest";
import { PRICING } from "@/constants/pricing";
import { SOFTWARE_APPLICATION_JSON_LD } from "@/lib/build/tanstackPublicSeoHead";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const HEAD_INVARIANTS = readFileSync(
  resolve(ROOT, "scripts/public-route-head-invariants.config.mjs"),
  "utf8",
);
const PRICING_PAGE = readFileSync(resolve(ROOT, "src/pages/Pricing.tsx"), "utf8");

/** Offer names that must match the publicly purchasable SKU list, in order. */
const EXPECTED_PUBLIC_OFFER_NAMES = [
  "Free",
  "Pro (monthly)",
  "Pro (annual)",
  "Craft (monthly)",
  "Craft (annual)",
] as const;

describe("SoftwareApplication offers match the publicly purchasable SKU list", () => {
  it("advertises exactly the public plans, in order", () => {
    const names = SOFTWARE_APPLICATION_JSON_LD.offers.map((offer) => offer.name);
    expect(names).toEqual([...EXPECTED_PUBLIC_OFFER_NAMES]);
  });

  it("never advertises Founder Lifetime (deep-link-only, not public)", () => {
    expect(JSON.stringify(SOFTWARE_APPLICATION_JSON_LD)).not.toMatch(/Founder Lifetime/i);
  });

  it("prices come from the pricing single source of truth", () => {
    expect(SOFTWARE_APPLICATION_JSON_LD.offers.map((offer) => offer.price)).toEqual([
      String(PRICING.free.price),
      String(PRICING.pro.monthlyPrice),
      String(PRICING.pro.annualPrice),
      String(PRICING.craft.monthlyPrice),
      String(PRICING.craft.annualPrice),
    ]);
    // The referenced fields must actually exist and be finite numbers.
    for (const price of [
      PRICING.free.price,
      PRICING.pro.monthlyPrice,
      PRICING.pro.annualPrice,
      PRICING.craft.monthlyPrice,
      PRICING.craft.annualPrice,
    ]) {
      expect(Number.isFinite(price)).toBe(true);
    }
  });

  it("head-invariants validator pins the same offer list", () => {
    for (const name of EXPECTED_PUBLIC_OFFER_NAMES) {
      expect(HEAD_INVARIANTS).toContain(`"${name}"`);
    }
    expect(HEAD_INVARIANTS).not.toContain('"Founder Lifetime"');
  });

  it("the premise holds: Pricing.tsx gates the Founder card behind the deep link", () => {
    // If the Founder card ever returns to the default public grid, this test
    // must be revisited together with the offers list.
    expect(PRICING_PAGE).toContain("showFounderOffer &&");
    expect(PRICING_PAGE).toContain('"pricing-card-founder"');
  });
});
