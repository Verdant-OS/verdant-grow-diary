/**
 * checkoutRecoveryPlanSlug — the single sanitizer every checkout-recovery
 * analytics call site MUST route the `plan` field through before emitting a
 * pricing or funnel event.
 *
 * Why this exists:
 *  - Recovery events (`pricing_checkout_recovery_{retry,choose_another_plan,
 *    dismissed}` and their funnel mirrors) must always carry the *sanitized*
 *    plan identifier the grower actually acted on, drawn from the shared
 *    PAID_PLAN_ALLOWLIST — never a route, a nickname, a raw Paddle price id,
 *    a free-form label, or any other internal plan metadata.
 *  - Typing `lastCheckoutPlanRef` alone is not enough: a future edit could
 *    widen the ref, seed it from URL state, or forward server-provided
 *    strings straight into `trackFunnelEvent`. This helper is the runtime
 *    fence that keeps that from becoming a leak.
 *  - When the caller has nothing valid to report (missing state, unknown
 *    slug, malformed value), we emit the stable `"unknown_plan"` token so
 *    the analytics contract stays uniform and the funnel sanitizer's
 *    whitespace / length rules still accept it.
 */

import { PAID_PLAN_ALLOWLIST, type PaidPlanId } from "@/lib/paidPlanAllowlist";

/** Stable fallback token — enum-like, no whitespace, funnel-sanitizer safe. */
export const CHECKOUT_RECOVERY_UNKNOWN_PLAN_SLUG = "unknown_plan" as const;

export type CheckoutRecoveryPlanSlug = PaidPlanId | typeof CHECKOUT_RECOVERY_UNKNOWN_PLAN_SLUG;

/**
 * Returns the input iff it is an exact member of the shared paid-plan
 * allowlist. Everything else — undefined, null, wrong type, unknown slug,
 * label ("Pro Monthly"), URL, Paddle price id ("pri_..."), free text —
 * collapses to the stable `"unknown_plan"` token.
 */
export function sanitizeCheckoutRecoveryPlanSlug(value: unknown): CheckoutRecoveryPlanSlug {
  if (typeof value !== "string") return CHECKOUT_RECOVERY_UNKNOWN_PLAN_SLUG;
  if (!PAID_PLAN_ALLOWLIST.has(value)) return CHECKOUT_RECOVERY_UNKNOWN_PLAN_SLUG;
  return value as PaidPlanId;
}
