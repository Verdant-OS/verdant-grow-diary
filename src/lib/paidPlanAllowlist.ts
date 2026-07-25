/**
 * Paid-plan allowlist — single source of truth.
 *
 * Every consumer of the paid-plan universe (edge function allowlist Set,
 * pinned hardening regex, drift guards) MUST derive from PAID_PLAN_IDS here.
 * Do not maintain a parallel list anywhere else — that is how Craft drifted
 * out of the checkout gate in the first place.
 *
 * Order is significant: the pinned regex asserts the exact source order
 * to catch reordering that could mask an accidental removal.
 *
 * This module intentionally has zero runtime dependencies and imports
 * nothing from `@/…`, so it mirrors cleanly into
 * supabase/functions/_shared/lib/ via scripts/sync-edge-shared.mjs.
 */

/** Ordered list of plan ids checkout may resolve prices for. */
export const PAID_PLAN_IDS = [
  "pro_monthly",
  "pro_annual",
  "craft_monthly",
  "craft_annual",
  "founder_lifetime",
  // One-time AI credit packs. Purchasable price ids (SKU-recognition seam) —
  // NOT plans: they never enter planCatalog / KNOWN_PRICE_TO_PLAN, so a
  // credit purchase can never resolve to a Pro entitlement.
  "credit_pack_50",
  "credit_pack_150",
] as const;

export type PaidPlanId = (typeof PAID_PLAN_IDS)[number];

/** Set form for O(1) allowlist checks. */
export const PAID_PLAN_ALLOWLIST: ReadonlySet<string> = new Set(PAID_PLAN_IDS);

/**
 * Build the source-order regex the hardening tests pin against
 * `supabase/functions/get-paddle-price/index.ts`. Kept as a builder rather
 * than a constant so the test file can pass just the plan ids it wants to
 * assert on (recurring plans only, credit packs only, etc.).
 *
 * Quote-agnostic because prettier normalizes edge functions to double quotes.
 * Requires the entries to appear in the given order, separated by commas
 * and optional whitespace, inside a PAID_PLAN_ALLOWLIST literal.
 */
export function buildPaidPlanAllowlistSourceRegex(
  ids: readonly string[] = PAID_PLAN_IDS,
): RegExp {
  const entries = ids.map((id) => `["']${id}["']`).join(",\\s*");
  return new RegExp(`PAID_PLAN_IDS[\\s\\S]{0,800}${entries},`);
}
