/**
 * pricingPlanPreselect — pure helper that maps the canonical `?plan=` query
 * param accepted by the `/pricing` page to a billing-toggle state and the
 * preselected plan id.
 *
 * `/pricing` is the sole user-facing checkout entry (see Pricing.tsx +
 * usePaddleCheckout). Legacy `/billing/:plan` links redirect here via
 * `legacyCheckoutRedirect.ts` using the exact same `?plan=` contract, so a
 * grower who bookmarked `/billing/pro-annual` lands on `/pricing` with the
 * Annual toggle already selected.
 *
 * A preselect NEVER opens Paddle. The grower must still explicitly click a
 * Pricing CTA. This helper is presenter-only.
 */

export type PricingBillingPeriod = "monthly" | "annual";

export type PricingPreselectPlan = "pro_monthly" | "pro_annual" | "founder_lifetime";

export interface PricingPlanPreselect {
  /** Canonical plan id chosen by the query param, or `null` when absent/unknown. */
  plan: PricingPreselectPlan | null;
  /**
   * Billing toggle that should be set on mount. `null` = do not override the
   * page default. Founder Lifetime is a one-time plan and does not change
   * the toggle.
   */
  billing: PricingBillingPeriod | null;
}

/**
 * Allowlist of accepted `?plan=` values (canonical underscore PlanIds only).
 * Unknown / free / paid-adjacent values fall through to "no preselect".
 */
const PLAN_PARAM_MAP: Readonly<Record<string, PricingPreselectPlan>> = Object.freeze({
  pro_monthly: "pro_monthly",
  pro_annual: "pro_annual",
  founder_lifetime: "founder_lifetime",
});

const BILLING_FOR_PLAN: Readonly<Record<PricingPreselectPlan, PricingBillingPeriod | null>> =
  Object.freeze({
    pro_monthly: "monthly",
    pro_annual: "annual",
    founder_lifetime: null,
  });

export function resolvePricingPlanPreselect(
  planParam: string | null | undefined,
): PricingPlanPreselect {
  if (typeof planParam !== "string" || planParam.length === 0) {
    return { plan: null, billing: null };
  }
  const normalized = planParam.toLowerCase();
  const plan = PLAN_PARAM_MAP[normalized] ?? null;
  return { plan, billing: plan ? BILLING_FOR_PLAN[plan] : null };
}

/** Type-guard used by tests / callers that need the paid preselect subset. */
export function isPreselectPlanId(value: unknown): value is PricingPreselectPlan {
  return value === "pro_monthly" || value === "pro_annual" || value === "founder_lifetime";
}
