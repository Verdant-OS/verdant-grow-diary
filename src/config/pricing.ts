/**
 * Pricing tiers — source of truth for the /upgrade page.
 *
 * All tier data (names, prices, billing periods, Paddle price IDs, features,
 * caps) lives here and nowhere else. Components must READ from this module —
 * never hardcode a price, tier name, or feature string in JSX.
 *
 * SAFETY:
 *  - `priceDisplay` values are PLACEHOLDERS and provisional. Do not treat as final.
 *  - Every `paddlePriceId` is `null` until the corresponding Paddle price is
 *    created. Any CTA bound to a null price MUST be inert (see Upgrade page).
 *  - `cap.claimed` is display-only. Founder-cap enforcement happens server-side.
 */

export type BillingPeriod = "free" | "monthly" | "annual" | "lifetime";

export interface PricingTier {
  id: string;
  name: string;
  /** PLACEHOLDER, provisional display string. */
  priceDisplay: string;
  priceSubtext: string;
  billingPeriod: BillingPeriod;
  /** null until the Paddle price is created. CTA must be inert when null. */
  paddlePriceId: string | null;
  features: string[];
  highlighted?: boolean;
  /** Founder Lifetime only. Display-only counters. */
  cap?: { total: number; claimed: number };
}

export const PRICING_TIERS: PricingTier[] = [
  {
    id: "free",
    name: "Free",
    priceDisplay: "$0",
    priceSubtext: "Local only",
    billingPeriod: "free",
    paddlePriceId: null,
    features: ["Core One-Tent Loop", "Single tent & plant", "Local data only"],
  },
  {
    id: "pro_monthly",
    name: "Pro",
    priceDisplay: "$12", // PLACEHOLDER
    priceSubtext: "per month",
    billingPeriod: "monthly",
    paddlePriceId: null,
    highlighted: true,
    features: [
      "Cloud sync & backup",
      "Multi-tent",
      "Exports & data ownership",
      "Full grow history",
    ],
  },
  {
    id: "pro_annual",
    name: "Pro Annual",
    priceDisplay: "$115", // PLACEHOLDER
    priceSubtext: "per year",
    billingPeriod: "annual",
    paddlePriceId: null,
    features: ["Everything in Pro", "Best value"],
  },
  {
    id: "founder_lifetime",
    name: "Founder Lifetime",
    priceDisplay: "$129", // PLACEHOLDER
    priceSubtext: "one-time",
    billingPeriod: "lifetime",
    paddlePriceId: null,
    cap: { total: 75, claimed: 0 },
    features: ["Pro, forever", "Founder perks"],
  },
];
