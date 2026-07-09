/**
 * unionEntitlements — pure union of BYO Paddle and Lovable Paddle rows.
 *
 * Selects the STRONGEST entitlement source deterministically:
 *   1. Active founder_lifetime (from Lovable Paddle) — beats everything.
 *   2. Active paid recurring subscription (BYO or Lovable, whichever is
 *      currently active-and-in-period). If both are simultaneously active,
 *      BYO wins as the incumbent source of truth for existing customers.
 *   3. Any non-null row that is degraded (past_due / paused / canceled /
 *      expired) — BYO preferred, so existing operator audit surfaces keep
 *      their signal.
 *   4. null → free.
 *
 * Pure. No React, no Supabase, no fetch. Time is injected.
 */

import type { BillingSubscriptionRow, PlanId, SubscriptionStatus } from "./types";

export type EntitlementSource =
  | "free"
  | "byo_paddle"
  | "lovable_paddle_subscription"
  | "lovable_paddle_lifetime";

export interface PickStrongestResult {
  row: BillingSubscriptionRow | null;
  source: EntitlementSource;
}

const RECURRING_PLANS: ReadonlyArray<PlanId> = ["pro_monthly", "pro_annual"];

function isActiveInPeriod(
  row: BillingSubscriptionRow | null,
  now: Date,
): boolean {
  if (row == null) return false;
  if (row.status !== ("active" as SubscriptionStatus)) return false;
  if (row.current_period_end == null) return true; // e.g. founder_lifetime
  const end = new Date(row.current_period_end);
  if (Number.isNaN(end.getTime())) return false;
  return end.getTime() > now.getTime();
}

function isLifetimeActive(row: BillingSubscriptionRow | null, now: Date): boolean {
  return (
    row != null &&
    row.plan_id === "founder_lifetime" &&
    isActiveInPeriod(row, now)
  );
}

function isRecurringActive(row: BillingSubscriptionRow | null, now: Date): boolean {
  return (
    row != null &&
    (RECURRING_PLANS as ReadonlyArray<string>).includes(row.plan_id) &&
    isActiveInPeriod(row, now)
  );
}

export function pickStrongestBilling(
  byoRow: BillingSubscriptionRow | null,
  lovableRow: BillingSubscriptionRow | null,
  now: Date,
): PickStrongestResult {
  // 1. Lifetime wins over everything.
  if (isLifetimeActive(lovableRow, now)) {
    return { row: lovableRow, source: "lovable_paddle_lifetime" };
  }
  // (BYO lifetime, should it ever exist, folds into byo_paddle branch below.)
  if (isLifetimeActive(byoRow, now)) {
    return { row: byoRow, source: "byo_paddle" };
  }

  // 2. Active recurring subscription. BYO is incumbent → tie goes to BYO.
  const byoActive = isRecurringActive(byoRow, now);
  const lovableActive = isRecurringActive(lovableRow, now);
  if (byoActive) return { row: byoRow, source: "byo_paddle" };
  if (lovableActive) {
    return { row: lovableRow, source: "lovable_paddle_subscription" };
  }

  // 3. Degraded but present rows. Prefer BYO for continuity with audit surfaces.
  if (byoRow != null) return { row: byoRow, source: "byo_paddle" };
  if (lovableRow != null) {
    // Degraded lovable row: label conservatively as subscription-source
    // (lifetime label reserved for a currently-valid lifetime unlock only).
    const src: EntitlementSource =
      lovableRow.plan_id === "founder_lifetime"
        ? "lovable_paddle_lifetime"
        : "lovable_paddle_subscription";
    return { row: lovableRow, source: src };
  }

  // 4. No rows.
  return { row: null, source: "free" };
}

import { resolveEntitlements, type ResolveEntitlementsOptions } from "./resolveEntitlements";
import type { ResolvedEntitlement } from "./types";
import {
  mapLovableSubscriptionRow,
  type LovableSubscriptionRow,
  type LovableBillingEnvironment,
} from "./lovablePaddleAdapter";

export interface ResolveUnionInput {
  byoRow: BillingSubscriptionRow | null;
  lovableRow: LovableSubscriptionRow | null;
  expectedBillingEnvironment: LovableBillingEnvironment;
  now: Date;
  opts?: ResolveEntitlementsOptions;
}

/**
 * High-level pure composer: map the Lovable row through the adapter,
 * pick the strongest billing row via pickStrongestBilling, run it
 * through the existing pure resolver, and stamp `source` on the result.
 *
 * Does NOT read from Supabase or React. Callers (hook + server gates)
 * supply the two raw rows and the expected environment.
 */
export function resolveUnionEntitlements(
  input: ResolveUnionInput,
): ResolvedEntitlement {
  const mappedLovable = mapLovableSubscriptionRow(input.lovableRow, {
    expectedBillingEnvironment: input.expectedBillingEnvironment,
  });
  const picked = pickStrongestBilling(input.byoRow, mappedLovable, input.now);
  const resolved = resolveEntitlements(picked.row, input.now, input.opts);
  return { ...resolved, source: picked.source };
}
