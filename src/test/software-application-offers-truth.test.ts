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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PRICING } from "@/constants/pricing";

const ROOT = resolve(__dirname, "../..");
// Classic vite plugin offers block moved to sitewide JSON-LD under TanStack SSR.
const OFFERS_SOURCE = readFileSync(
  resolve(ROOT, "src/lib/build/siteSoftwareApplicationJsonLd.ts"),
  "utf8",
);
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

function extractOffersBlock(source: string): string {
  const start = source.indexOf("offers: [");
  expect(start, "siteSoftwareApplicationJsonLd must contain the offers block").toBeGreaterThan(-1);
  const end = source.indexOf("],", start);
  expect(end, "offers block must terminate").toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("SoftwareApplication offers match the publicly purchasable SKU list", () => {
  const offersBlock = extractOffersBlock(OFFERS_SOURCE);

  it("advertises exactly the public plans, in order", () => {
    const names = [...offersBlock.matchAll(/name: "([^"]+)"/g)].map((m) => m[1]);
    expect(names).toEqual([...EXPECTED_PUBLIC_OFFER_NAMES]);
  });

  it("never advertises Founder Lifetime (deep-link-only, not public)", () => {
    expect(offersBlock).not.toContain("Founder Lifetime");
    expect(offersBlock).not.toContain("PRICING.founder");
  });

  it("prices come from the pricing single source of truth", () => {
    expect(offersBlock).toContain("PRICING.free.price");
    expect(offersBlock).toContain("PRICING.pro.monthlyPrice");
    expect(offersBlock).toContain("PRICING.pro.annualPrice");
    expect(offersBlock).toContain("PRICING.craft.monthlyPrice");
    expect(offersBlock).toContain("PRICING.craft.annualPrice");
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
