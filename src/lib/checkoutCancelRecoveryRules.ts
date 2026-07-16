import { sanitizeCheckoutReturnTo } from "@/lib/checkoutReturnTo";
import { resolvePricingPlanPreselect, type PricingPreselectPlan } from "@/lib/pricingPlanPreselect";

const PLAN_LABELS: Readonly<Record<PricingPreselectPlan, string>> = Object.freeze({
  pro_monthly: "Pro Monthly",
  pro_annual: "Pro Annual",
  founder_lifetime: "Founder Lifetime",
});

export interface CheckoutCancelRecovery {
  planId: PricingPreselectPlan | null;
  planLabel: string | null;
  pricingPath: string;
  returnPath: string;
  returnLabel: "Return to previous page" | "Go to my grow";
}

function asSearchParams(input: string | URLSearchParams | null | undefined): URLSearchParams {
  if (input instanceof URLSearchParams) return new URLSearchParams(input);
  if (typeof input !== "string") return new URLSearchParams();
  return new URLSearchParams(input.startsWith("?") ? input.slice(1) : input);
}

function appendSafeRecoveryParams(
  params: URLSearchParams,
  input: { planId: unknown; returnTo: unknown },
): void {
  const plan =
    typeof input.planId === "string" ? resolvePricingPlanPreselect(input.planId).plan : null;
  const returnTo =
    typeof input.returnTo === "string" ? sanitizeCheckoutReturnTo(input.returnTo) : null;
  if (plan) params.set("plan", plan);
  if (returnTo) params.set("returnTo", returnTo);
}

/** Build the route used only after Paddle reports a close-before-completion event. */
export function buildCheckoutCancelPath(input: { planId: unknown; returnTo?: unknown }): string {
  const params = new URLSearchParams();
  appendSafeRecoveryParams(params, {
    planId: input.planId,
    returnTo: input.returnTo,
  });
  const query = params.toString();
  return query ? `/checkout/cancel?${query}` : "/checkout/cancel";
}

/**
 * Recover a buyer's allowlisted plan and same-origin return path without
 * reopening checkout. Raw query values never become navigation targets.
 */
export function resolveCheckoutCancelRecovery(
  input: string | URLSearchParams | null | undefined,
): CheckoutCancelRecovery {
  const source = asSearchParams(input);
  const planId = resolvePricingPlanPreselect(source.get("plan")).plan;
  const safeReturnTo = sanitizeCheckoutReturnTo(source.get("returnTo"));

  const pricingParams = new URLSearchParams();
  appendSafeRecoveryParams(pricingParams, { planId, returnTo: safeReturnTo });
  const pricingQuery = pricingParams.toString();

  return {
    planId,
    planLabel: planId ? PLAN_LABELS[planId] : null,
    pricingPath: pricingQuery ? `/pricing?${pricingQuery}` : "/pricing",
    returnPath: safeReturnTo ?? "/",
    returnLabel: safeReturnTo ? "Return to previous page" : "Go to my grow",
  };
}
