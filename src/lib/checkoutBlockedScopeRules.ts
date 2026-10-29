/**
 * Scope of a failed checkout attempt, derived from the price resolver's
 * sanitized reason. Pure and deterministic.
 *
 * - "plan": only the attempted plan cannot check out (its price is missing,
 *   unknown or sold out). Other plans may still open checkout.
 * - "pack": every credit pack is blocked for this grower
 *   (`pack_requires_monthly_plan`); subscription plans are unaffected.
 * - "checkout": checkout itself cannot run right now (shared environment,
 *   gateway, auth or configuration failure, or any reason not listed here).
 *   Unknown reasons fail closed to this scope.
 */
export type CheckoutBlockedScope = "plan" | "pack" | "checkout";

const PLAN_SCOPED_REASONS: ReadonlySet<string> = new Set([
  "unknown_plan",
  "price_not_configured",
  "plan_sold_out",
]);

const PACK_SCOPED_REASONS: ReadonlySet<string> = new Set(["pack_requires_monthly_plan"]);

export function checkoutBlockedScopeForReason(
  reason: string | null | undefined,
): CheckoutBlockedScope {
  if (typeof reason !== "string") return "checkout";
  if (PLAN_SCOPED_REASONS.has(reason)) return "plan";
  if (PACK_SCOPED_REASONS.has(reason)) return "pack";
  return "checkout";
}
