/**
 * lovablePaddleAdapter — pure mapper from public.subscriptions rows
 * (Lovable built-in Paddle sink) to the shared BillingSubscriptionRow shape
 * consumed by the existing entitlement resolver.
 *
 * Pure. No React, no Supabase, no fetch, no time reads. Callers pass `now`.
 *
 * Rules (Phase 2b):
 *  - Maps price_id → plan_id for {pro_monthly, pro_annual, founder_lifetime}.
 *  - Unknown price_id → null (does NOT unlock anything).
 *  - status must be a known status. Unknown → null.
 *  - current_period_end is REQUIRED for pro_monthly / pro_annual; NULL there
 *    would be an invalid "no expiry" claim and MUST NOT unlock.
 *  - Founder Lifetime unlock requires all of:
 *      price_id === "founder_lifetime"
 *      status   === "active"
 *      paddle_subscription_id starts with "lifetime_"
 *      current_period_end is exactly null (a missing value is rejected)
 *    Any deviation → null (defense against a stray monthly-shaped row
 *    claiming to be lifetime).
 *  - Environment must match `expectedBillingEnvironment` — mismatch → null.
 *    Do not infer environment from anywhere except this explicit option.
 *  - Never returns raw Paddle IDs in the mapped output.
 */

import type { BillingSubscriptionRow, PlanId, SubscriptionStatus } from "./types";

export type LovableBillingEnvironment = "sandbox" | "live";

/**
 * Minimal shape of public.subscriptions we depend on. Kept structurally-typed
 * so callers can pass supabase's generated row type directly.
 */
export interface LovableSubscriptionRow {
  user_id: string;
  paddle_subscription_id: string;
  paddle_customer_id: string;
  product_id: string;
  price_id: string;
  status: string;
  current_period_end: string | null;
  current_period_start?: string | null;
  cancel_at_period_end?: boolean;
  environment: string;
  created_at?: string;
  updated_at?: string;
}

export interface MapLovableOptions {
  /**
   * The billing environment this caller expects rows to belong to.
   * Sandbox rows are ignored when 'live' is expected, and vice versa.
   * There is NO default — callers MUST decide explicitly to avoid
   * accidentally granting sandbox access to production users.
   */
  expectedBillingEnvironment: LovableBillingEnvironment;
}

const KNOWN_PRICE_TO_PLAN: Readonly<Record<string, PlanId>> = Object.freeze({
  pro_monthly: "pro_monthly",
  pro_annual: "pro_annual",
  founder_lifetime: "founder_lifetime",
});

const KNOWN_STATUSES: ReadonlyArray<SubscriptionStatus> = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "paused",
  "expired",
];

function isKnownStatus(v: string): v is SubscriptionStatus {
  return (KNOWN_STATUSES as ReadonlyArray<string>).includes(v);
}

export function mapLovableSubscriptionRow(
  row: LovableSubscriptionRow | null | undefined,
  opts: MapLovableOptions,
): BillingSubscriptionRow | null {
  if (row == null) return null;
  if (
    opts?.expectedBillingEnvironment !== "sandbox" &&
    opts?.expectedBillingEnvironment !== "live"
  ) {
    return null;
  }
  if (row.environment !== opts.expectedBillingEnvironment) return null;

  const planId = KNOWN_PRICE_TO_PLAN[row.price_id];
  if (planId == null) return null;
  if (!isKnownStatus(row.status)) return null;

  // Lifetime invariant: all four conditions must hold for a lifetime unlock.
  if (planId === "founder_lifetime") {
    const startsLifetime =
      typeof row.paddle_subscription_id === "string" &&
      row.paddle_subscription_id.startsWith("lifetime_");
    if (row.status !== "active" || !startsLifetime || row.current_period_end !== null) {
      return null;
    }
  } else {
    // Recurring plans require an explicit period end. A NULL end here would
    // be an unbounded "never expires" claim on a subscription — refuse it.
    if (row.current_period_end == null) return null;
  }

  return {
    // Synthetic normalized row — no raw Paddle IDs are exposed downstream.
    id: `lovable_paddle:${planId}`,
    user_id: row.user_id,
    plan_id: planId,
    status: row.status,
    provider: "paddle",
    provider_customer_id: null,
    provider_subscription_id: null,
    current_period_end: row.current_period_end,
    cancel_at_period_end: row.cancel_at_period_end === true,
    founder_number: null,
    created_at: row.created_at ?? new Date(0).toISOString(),
    updated_at: row.updated_at ?? new Date(0).toISOString(),
  };
}
