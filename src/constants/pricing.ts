/**
 * Pricing constants for Verdant tiers.
 *
 * All tier data, feature copy, FAQ copy, and AI credit explainer live here.
 * No business logic should be hardcoded in JSX.
 */

export const PRICING = {
  free: {
    name: "Free",
    slug: "free",
    subtitle: "Grow Diary",
    price: 0,
    cadence: "forever",
    highlighted: false,
    badge: undefined as string | undefined,
    description:
      "Start free. Build your grow diary and see if Verdant fits your workflow.",
    features: [
      "1 active grow",
      "Historical logs kept forever",
      "3 AI Doctor credits per grow",
      "Manual sensor entries",
      "CSV sensor import",
      "Plant diary and timeline",
      "Basic photo logs",
    ],
  },
  pro: {
    name: "Pro",
    slug: "pro",
    subtitle: "Grow OS",
    monthlyPrice: 12,
    annualPrice: 99,
    cadenceMonthly: "/ month",
    cadenceAnnual: "/ year",
    highlighted: true,
    badge: "Most Popular",
    annualSavingsPercent: 31,
    description:
      "Upgrade when Verdant becomes your real grow memory system.",
    features: [
      "Unlimited grows",
      "100 AI Doctor credits / month",
      "Live / read-only sensor integrations when available",
      "Full Action Queue",
      "Advanced timeline filtering",
      "Sensor snapshot history",
      "Priority support",
      "Export / backups",
    ],
  },
  founder: {
    name: "Founder Lifetime",
    slug: "founder-lifetime",
    subtitle: "Early Supporter",
    price: 129,
    cadence: "one-time",
    highlighted: false,
    limit: 75,
    badge: "First 75 only",
    description:
      "A limited early-supporter offer. Pay once and get full Pro access for the life of the product.",
    features: [
      "Lifetime Pro access",
      "100 AI Doctor credits / month",
      "Overage applies",
      "Founder badge / early supporter positioning",
    ],
  },
} as const;

export const AI_CREDIT_EXPLAINER = {
  title: "AI Doctor Credits",
  points: [
    "1 standard AI Doctor analysis = 1 credit",
    "Advanced / escalated review may use more credits",
    "Free users can upgrade when credits are used",
    "Pro and Lifetime users can buy credit packs later if needed",
  ],
  note: "Credit purchase logic is not yet implemented.",
} as const;

export const TRUST_STRIP = {
  label: "Safe by Design",
  items: [
    "Read-only",
    "Honest data labels",
    "Your history is always yours",
    "No blind automation",
  ],
} as const;

export const FOUNDER_LIFETIME_LIMIT = PRICING.founder.limit;
export const FOUNDER_LIFETIME_PRICE_USD = PRICING.founder.price;
export const PRO_MONTHLY_PRICE_USD = PRICING.pro.monthlyPrice;
export const PRO_ANNUAL_PRICE_USD = PRICING.pro.annualPrice;
