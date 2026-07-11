/**
 * legacyCheckoutRedirect — pure helpers that translate legacy checkout /
 * billing entry paths into a canonical `/pricing` URL with an optional
 * `plan` preselect and a sanitized `returnTo`.
 *
 * Canonical-route ruling: `/pricing` is the sole user-facing checkout entry
 * (it owns `usePaddleCheckout`). `/upgrade` is a presenter-only page and is
 * NOT canonical. `/billing/:plan` remains mounted purely as a compatibility
 * redirect and MUST land on `/pricing` so the grower can actually complete
 * checkout.
 *
 * Presenter-only. No Paddle calls, no auth reads, no entitlement grants.
 * The redirect never auto-opens Paddle — Pricing shows the preselected
 * plan and the grower must click the CTA themselves.
 *
 * Contract:
 *   - Legacy hyphenated plan slugs (`pro-monthly`, `pro-annual`,
 *     `founder-lifetime`) map to canonical underscore PlanIds
 *     (`pro_monthly`, `pro_annual`, `founder_lifetime`).
 *   - Canonical PlanIds are passed through unchanged (defense in depth for
 *     any caller that already knows the canonical form).
 *   - Unknown / missing / free plan slug → bare `/pricing` (never invent a
 *     paid preselect).
 *   - `returnTo` is preserved only if `sanitizeCheckoutReturnTo` accepts it.
 *     A rejected value is dropped silently — never forwarded, never echoed.
 */

import type { PlanId } from "@/lib/entitlements/types";
import { sanitizeCheckoutReturnTo } from "@/lib/checkoutReturnTo";

/**
 * Allowlist of legacy plan slugs. Underscore variants are included so a
 * canonical caller (e.g. a bookmarked `/billing/pro_monthly`) resolves to
 * the same target.
 */
const LEGACY_PLAN_SLUG_MAP: Readonly<Record<string, PlanId>> = Object.freeze({
  "pro-monthly": "pro_monthly",
  "pro_monthly": "pro_monthly",
  "pro-annual": "pro_annual",
  "pro_annual": "pro_annual",
  "founder-lifetime": "founder_lifetime",
  "founder_lifetime": "founder_lifetime",
});

/**
 * Resolve a legacy plan slug to a canonical PlanId, or `null` when the slug
 * is missing / unknown / not a paid tier. `"free"` is intentionally NOT
 * mapped — a legacy billing link to Free is nonsensical, and dropping the
 * param sends the user to the plan picker.
 */
export function resolveLegacyPlanSlug(slug: string | null | undefined): PlanId | null {
  if (typeof slug !== "string" || slug.length === 0) return null;
  const normalized = slug.toLowerCase();
  return LEGACY_PLAN_SLUG_MAP[normalized] ?? null;
}

export interface BuildLegacyBillingRedirectInput {
  /** Value of the `:plan` path param (may be undefined for bare `/billing`). */
  planSlug: string | null | undefined;
  /**
   * The current URLSearchParams (or a raw query string). Only `returnTo` is
   * inspected; every other param is dropped so we never smuggle unexpected
   * state into the canonical URL.
   */
  search?: URLSearchParams | string | null;
}

/**
 * Build the canonical `/pricing` redirect target for a legacy billing entry.
 * Always returns a same-origin app path. Order of appended params is stable
 * (`plan` before `returnTo`) so tests can assert exact strings.
 */
export function buildLegacyBillingRedirect(
  input: BuildLegacyBillingRedirectInput,
): string {
  const plan = resolveLegacyPlanSlug(input.planSlug);

  let returnTo: string | null = null;
  if (input.search != null) {
    const params =
      typeof input.search === "string"
        ? new URLSearchParams(input.search)
        : input.search;
    returnTo = sanitizeCheckoutReturnTo(params.get("returnTo"));
  }

  const out = new URLSearchParams();
  if (plan) out.set("plan", plan);
  if (returnTo) out.set("returnTo", returnTo);
  const qs = out.toString();
  return qs ? `/pricing?${qs}` : "/pricing";
}
