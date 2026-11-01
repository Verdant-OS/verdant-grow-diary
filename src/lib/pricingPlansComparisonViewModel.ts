/**
 * Pro vs Craft comparison — presenter data for the simple table that sits
 * directly under the plan cards on /pricing.
 *
 * Rules this module keeps:
 *  - Prices are DERIVED from `src/constants/pricing.ts` (the single source of
 *    truth) and follow the page's Monthly/Annual toggle, so the table can
 *    never show a number the cards above it do not show.
 *  - Row labels and credit cell values reuse the exact feature strings from
 *    `PRICING.pro.features` / `PRICING.craft.features`. `src/test/
 *    pricing-plans-comparison.test.tsx` pins that relationship, so the table
 *    and the cards cannot drift into two different vocabularies.
 *  - Craft ⊇ Pro (planCatalog): every Pro capability renders as included for
 *    Craft. Nothing here implies a capability the catalog does not back.
 *
 * Presenter-only. Never grants entitlement, never claims device control or a
 * guaranteed outcome.
 */
import { PRICING } from "@/constants/pricing";

export type PlansBillingPeriod = "monthly" | "annual";
export type PlansComparisonCell = boolean | string;

export interface PlansComparisonRow {
  label: string;
  pro: PlansComparisonCell;
  craft: PlansComparisonCell;
}

export interface PlansComparisonColumn {
  key: "pro" | "craft";
  name: string;
  /** Display price string, e.g. "$99". Derived, never hardcoded. */
  price: string;
  /** Cadence suffix, e.g. "/ year". */
  cadence: string;
}

export interface PlansComparisonTable {
  heading: string;
  caption: string;
  columns: PlansComparisonColumn[];
  rows: PlansComparisonRow[];
}

/** Craft-only capabilities, verbatim from PRICING.craft.features. */
export const CRAFT_ONLY_FEATURES = [
  "Pro Blueprint: live per-stage SOP scoring",
  "Per-stage VPD, temperature, humidity, EC, pH and light bands",
  "Day/night-aware temperature targets",
] as const;

/** Capabilities Pro includes and Craft inherits, verbatim from PRICING.pro.features. */
export const SHARED_PRO_FEATURES = [
  "Multi-tent grow memory",
  "Full sensor snapshot history",
  "Advanced timeline filtering and jump tools",
  "Export / backups",
  "Date-range diary report (Print / Save PDF)",
  "Post-Grow Learning Report (Print / Save PDF)",
] as const;

/** Monthly AI Doctor allowances, verbatim from the two feature lists. */
export const PRO_CREDIT_FEATURE = "100 AI Doctor credits / month";
export const CRAFT_CREDIT_FEATURE = "300 AI Doctor credits / month";

/**
 * Build the comparison table for the billing period the page is showing.
 *
 * Pure and deterministic: same `billing` in, same table out. Time, locale and
 * randomness play no part.
 */
export function buildPlansComparisonTable(billing: PlansBillingPeriod): PlansComparisonTable {
  const isAnnual = billing === "annual";
  const cadence = isAnnual ? "/ year" : "/ month";

  return {
    heading: "What Pro and Craft include",
    caption: `Prices in USD, the same as the plan cards above (${isAnnual ? "annual" : "monthly"} billing).`,
    columns: [
      {
        key: "pro",
        name: PRICING.pro.name,
        price: `$${isAnnual ? PRICING.pro.annualPrice : PRICING.pro.monthlyPrice}`,
        cadence,
      },
      {
        key: "craft",
        name: PRICING.craft.name,
        price: `$${isAnnual ? PRICING.craft.annualPrice : PRICING.craft.monthlyPrice}`,
        cadence,
      },
    ],
    rows: [
      {
        label: "Best for",
        pro: "Full grow history, exports and multi-tent",
        craft: "Dialing in every run against an SOP",
      },
      {
        label: "AI Doctor credits",
        pro: PRO_CREDIT_FEATURE,
        craft: CRAFT_CREDIT_FEATURE,
      },
      ...CRAFT_ONLY_FEATURES.map((feature) => ({ label: feature, pro: false, craft: true })),
      ...SHARED_PRO_FEATURES.map((feature) => ({ label: feature, pro: true, craft: true })),
    ],
  };
}
