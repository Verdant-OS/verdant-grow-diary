/**
 * Pricing tiers — presenter data for the /upgrade page.
 *
 * L1 (audit fix): price display strings and the founder cap number are
 * DERIVED from `src/constants/pricing.ts` so /pricing and /upgrade cannot
 * disagree on the number a user sees. Feature copy and comparison rows
 * remain here because /upgrade has a wider comparison table than the
 * /pricing cards; both pages nonetheless reference the same source of
 * truth for cardinal numbers.
 *
 * SAFETY:
 *  - Never grants entitlement.
 *  - `paddlePriceId` is a HUMAN-READABLE plan id (e.g. "pro_monthly"), not
 *    a raw `pri_...`; get-paddle-price resolves it server-side. This
 *    mirrors what /pricing already does via usePaddleCheckout.
 *  - `cap.claimed` here is a legacy display default; the live counter now
 *    comes from `useFounderSlotsRemaining()`.
 */

import {
  PRO_MONTHLY_PRICE_USD,
  PRO_ANNUAL_PRICE_USD,
  FOUNDER_LIFETIME_PRICE_USD,
  FOUNDER_LIFETIME_LIMIT,
} from "@/constants/pricing";

export type BillingPeriod = "free" | "monthly" | "annual" | "lifetime";

export interface PricingTier {
  id: string;
  name: string;
  /** Display price string; derived from constants/pricing for L1 consistency. */
  priceDisplay: string;
  priceSubtext: string;
  billingPeriod: BillingPeriod;
  /**
   * Human-readable plan id passed to `usePaddleCheckout` / `get-paddle-price`.
   * `null` means "no checkout for this tier" (the Free tier).
   */
  paddlePriceId: string | null;
  /** Exact feature strings shown on pricing cards and the upgrade success panel. */
  features: string[];
  highlighted?: boolean;
  /** Founder Lifetime only. Display-only fallback; live counter overrides. */
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
    priceSubtext: "free forever",
    billingPeriod: "free",
    paddlePriceId: null,
    // Mirrors truthful entries from constants/pricing PRICING.free.features —
    // the old "Local only / Single tent & plant" copy was wrong (data lives
    // in Supabase for signed-in growers; no single-tent gate is enforced).
    features: [
      "Core One-Tent Loop",
      "Historical logs kept forever",
      "Manual sensor entries & CSV import",
    ],
  },
  {
    id: "pro_monthly",
    name: "Pro",
    priceDisplay: `$${PRO_MONTHLY_PRICE_USD}`,
    priceSubtext: "per month",
    billingPeriod: "monthly",
    paddlePriceId: "pro_monthly",
    highlighted: true,
    features: [...PRO_UNLOCKED_FEATURES],
  },
  {
    id: "pro_annual",
    name: "Pro Annual",
    priceDisplay: `$${PRO_ANNUAL_PRICE_USD}`,
    priceSubtext: "per year",
    billingPeriod: "annual",
    paddlePriceId: "pro_annual",
    features: [...PRO_UNLOCKED_FEATURES, "Annual billing value"],
  },
  {
    id: "founder_lifetime",
    name: "Founder Lifetime",
    priceDisplay: `$${FOUNDER_LIFETIME_PRICE_USD}`,
    priceSubtext: "one-time",
    billingPeriod: "lifetime",
    paddlePriceId: "founder_lifetime",
    cap: { total: FOUNDER_LIFETIME_LIMIT, claimed: 0 },
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
      pro_monthly: `$${PRO_MONTHLY_PRICE_USD} / mo`,
      pro_annual: `$${PRO_ANNUAL_PRICE_USD} / yr`,
      founder_lifetime: `$${FOUNDER_LIFETIME_PRICE_USD} once`,
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

/**
 * Canonical feature ordering.
 *
 * Built once from PRICING_TIERS in declaration order: each feature is
 * indexed the first time it appears across tiers, then explicit founder
 * perks appended last. Every tier's resolved feature list is sorted by
 * this index so inherited features render in the SAME relative order
 * across tiers (Free features first, then Pro-added, then Founder-added).
 *
 * Deterministic, presenter-only. No randomness, no locale-dependent sort.
 */
const FOUNDER_PERK_FEATURE = "Founder badge & early-supporter perks";

export const CANONICAL_FEATURE_ORDER: readonly string[] = (() => {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const tier of PRICING_TIERS) {
    for (const feature of tier.features) {
      if (!seen.has(feature)) {
        seen.add(feature);
        order.push(feature);
      }
    }
  }
  if (!seen.has(FOUNDER_PERK_FEATURE)) {
    order.push(FOUNDER_PERK_FEATURE);
  }
  return Object.freeze(order);
})();

/**
 * Sort features by canonical order.
 *
 * Known features (present in CANONICAL_FEATURE_ORDER) render first, in
 * canonical index order. Unknown features render AFTER all known
 * features, deterministically tie-broken by locale-independent
 * lexicographic order of the raw feature string. Pure and mutation-safe.
 */
export function sortSuccessPanelFeatures(
  features: readonly string[],
): string[] {
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const f of features) {
    if (!seen.has(f)) {
      seen.add(f);
      deduped.push(f);
    }
  }
  return [...deduped].sort((a, b) => {
    const ia = CANONICAL_FEATURE_ORDER.indexOf(a);
    const ib = CANONICAL_FEATURE_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    // Both unknown: stable, locale-independent lexicographic order.
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
}

function sortByCanonicalOrder(features: readonly string[]): string[] {
  return sortSuccessPanelFeatures(features);
}

/**
 * Resolve the concrete feature list shown for a tier.
 *
 * Pro Annual inherits Pro Monthly features. Founder Lifetime inherits Pro
 * Monthly features plus founder-specific perks. Free and Pro Monthly return
 * their own configured features. Unknown tier IDs return an empty list.
 *
 * Output is ALWAYS sorted by CANONICAL_FEATURE_ORDER so inherited features
 * render in a consistent order across tiers.
 */
export function resolveTierFeatures(tierId: string): string[] {
  const tier = PRICING_TIERS.find((t) => t.id === tierId);
  if (!tier) return [];

  let raw: string[];
  if (tierId === "pro_annual") {
    const pro = PRICING_TIERS.find((t) => t.id === "pro_monthly");
    raw = pro ? [...pro.features] : [...tier.features];
  } else if (tierId === "founder_lifetime") {
    const pro = PRICING_TIERS.find((t) => t.id === "pro_monthly");
    const base = pro ? [...pro.features] : [...tier.features];
    raw = [...base, FOUNDER_PERK_FEATURE];
  } else {
    raw = [...tier.features];
  }

  return sortByCanonicalOrder(raw);
}

/**
 * Success panel feature row identity.
 *
 * Returns a deterministic, stable key for a feature string suitable for
 * React `key` props and DOM `data-*` attributes. Known canonical features
 * map to `feat-<canonical-index>` so the SAME feature has the SAME key
 * across every tier's success panel. Unknown / unrecognized feature
 * strings fall back to `feat-x-<slug>` where the slug is a normalized
 * form of the string, ensuring identity is still deterministic and does
 * not collide with canonical indices.
 *
 * Pure, presenter-only. No randomness, no locale-dependent behavior.
 */
export function successPanelFeatureRowKey(feature: string): string {
  const idx = CANONICAL_FEATURE_ORDER.indexOf(feature);
  if (idx !== -1) return `feat-${idx}`;
  const slug = feature
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return `feat-x-${slug || "unknown"}`;
}

export interface UpgradeFaqItem {
  q: string;
  a: string;
}

/**
 * FAQ copy for /upgrade. Avoids forbidden claims (hands-free grow control, guaranteed yield,
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
    a: "No. Verdant does not control lights, pumps, fans, or any other equipment, and never runs your grow for you. Every consequential action stays grower-approved.",
  },
  {
    q: "How does the AI help?",
    a: "AI Doctor uses your grow context to suggest what to look at next. It flags what's missing instead of guessing, and it never guarantees a diagnosis, harvest outcome, or yield improvement.",
  },
];
