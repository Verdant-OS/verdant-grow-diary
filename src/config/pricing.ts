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
  /** Exact feature strings shown on pricing cards and the upgrade success panel. */
  features: string[];
  highlighted?: boolean;
  /** Founder Lifetime only. Display-only counters. */
  cap?: { total: number; claimed: number };
}

const PRO_UNLOCKED_FEATURES = [
  "Cloud sync & backup",
  "Multi-tent tracking",
  "Exports & data ownership",
  "Full grow history",
  "Priority support",
  "Advanced grow reports (planned)",
];

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
    features: [...PRO_UNLOCKED_FEATURES],
  },
  {
    id: "pro_annual",
    name: "Pro Annual",
    priceDisplay: "$115", // PLACEHOLDER
    priceSubtext: "per year",
    billingPeriod: "annual",
    paddlePriceId: null,
    features: [...PRO_UNLOCKED_FEATURES, "Annual billing value"],
  },
  {
    id: "founder_lifetime",
    name: "Founder Lifetime",
    priceDisplay: "$129", // PLACEHOLDER
    priceSubtext: "one-time",
    billingPeriod: "lifetime",
    paddlePriceId: null,
    cap: { total: 75, claimed: 0 },
    features: [
      ...PRO_UNLOCKED_FEATURES,
      "Ongoing Pro-level access",
      "Founder badge & early-supporter perks",
    ],
  },
];

/**
 * Plan comparison rows.
 *
 * Each row's `values` map is keyed by PricingTier.id. Values may be a short
 * string (e.g. "Included", "1 tent") or a boolean. Presenter renders booleans
 * as check/dash. Kept here so /upgrade never hardcodes copy.
 */
export interface PlanComparisonRow {
  label: string;
  values: Record<string, string | boolean>;
}

export const PLAN_COMPARISON: PlanComparisonRow[] = [
  {
    label: "Price",
    values: {
      free: "$0",
      pro_monthly: "$12 / mo",
      pro_annual: "$115 / yr",
      founder_lifetime: "$129 once",
    },
  },
  {
    label: "Billing period",
    values: {
      free: "Free",
      pro_monthly: "Monthly",
      pro_annual: "Annual",
      founder_lifetime: "One-time",
    },
  },
  {
    label: "Core grow diary",
    values: { free: true, pro_monthly: true, pro_annual: true, founder_lifetime: true },
  },
  {
    label: "Plant & tent tracking",
    values: {
      free: "1 tent · 1 plant",
      pro_monthly: "Multi-tent",
      pro_annual: "Multi-tent",
      founder_lifetime: "Multi-tent",
    },
  },
  {
    label: "Photo logs",
    values: { free: true, pro_monthly: true, pro_annual: true, founder_lifetime: true },
  },
  {
    label: "Manual sensor snapshots",
    values: { free: true, pro_monthly: true, pro_annual: true, founder_lifetime: true },
  },
  {
    label: "Timeline & history depth",
    values: {
      free: "Recent",
      pro_monthly: "Full history",
      pro_annual: "Full history",
      founder_lifetime: "Full history",
    },
  },
  {
    label: "Cloud sync & backup",
    values: { free: false, pro_monthly: true, pro_annual: true, founder_lifetime: true },
  },
  {
    label: "Exports (CSV / PDF)",
    values: { free: false, pro_monthly: true, pro_annual: true, founder_lifetime: true },
  },
  {
    label: "Priority support",
    values: { free: false, pro_monthly: true, pro_annual: true, founder_lifetime: true },
  },
  {
    label: "Advanced grow reports (planned)",
    values: { free: false, pro_monthly: true, pro_annual: true, founder_lifetime: true },
  },
  {
    label: "Founder badge & early-supporter perks",
    values: { free: false, pro_monthly: false, pro_annual: false, founder_lifetime: true },
  },
  {
    label: "Availability",
    values: {
      free: "Available",
      pro_monthly: "Checkout finalizing",
      pro_annual: "Checkout finalizing",
      founder_lifetime: "Checkout finalizing",
    },
  },
];

export interface UpgradeFaqItem {
  q: string;
  a: string;
}

/**
 * FAQ copy for /upgrade. Avoids forbidden claims (autopilot, guaranteed yield,
 * "AI grows for you", device control). Data-ownership language never implies
 * Verdant sells grower data.
 */
export const UPGRADE_FAQ: UpgradeFaqItem[] = [
  {
    q: "How does billing work?",
    a: "Pro is billed monthly or annually through Paddle, our payment processor. Prices shown are provisional placeholders while checkout is being finalized — no charge is made until you review and confirm inside Paddle.",
  },
  {
    q: "Do I own my grow data?",
    a: "Yes. Your grow history, diary entries, photos, and sensor snapshots stay yours. Verdant does not sell grower data. Pro adds cloud sync, backups, and exports so you can take your history with you.",
  },
  {
    q: "What do Founder Lifetime supporters get?",
    a: "Founder Lifetime is a limited early-supporter tier: one payment, ongoing Pro-level access, a founder badge, and early-supporter status. The claimed / total counter shown on the card is informational — there is no artificial urgency.",
  },
  {
    q: "What happens if I cancel Pro?",
    a: "You keep your account and your grow history stays intact on the Free tier. Pro-only features (cloud sync, advanced exports, priority support) simply stop when your billing access ends.",
  },
  {
    q: "Does Verdant control my equipment?",
    a: "No. Verdant does not control lights, pumps, fans, or any other equipment, and never runs your grow on autopilot. Every consequential action stays grower-approved.",
  },
  {
    q: "How does the AI help?",
    a: "AI Doctor uses your grow context to suggest what to look at next. It flags what's missing instead of guessing, and it never guarantees a diagnosis, harvest outcome, or yield improvement.",
  },
];
