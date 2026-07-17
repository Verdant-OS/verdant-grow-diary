/**
 * unionEntitlements — pure union of BYO Paddle and Lovable Paddle rows.
 *
 * Selects the STRONGEST entitlement source deterministically:
 *   1. Entitling founder_lifetime (from Lovable Paddle) — beats everything.
 *   2. Entitling paid recurring subscription (BYO or Lovable, whichever is
 *      active, trialing, in dunning, or within cancellation grace). If both
 *      are simultaneously entitling, BYO wins as the incumbent source of
 *      truth for existing customers.
 *   3. Any non-null row that is not currently entitled — BYO preferred, so
 *      existing operator audit surfaces keep their signal.
 *   4. null → free.
 *
 * Pure. No React, no Supabase, no fetch. Time is injected.
 */

import type { BillingSubscriptionRow, PlanId } from "./types";
import { subscriptionGrantsAccess } from "../paddleSubscriptionAccessRules";

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

function rowGrantsPaidAccess(row: BillingSubscriptionRow | null, now: Date): boolean {
  if (row == null) return false;
  return subscriptionGrantsAccess(row, now);
}

function isEntitlingLifetime(row: BillingSubscriptionRow | null, now: Date): boolean {
  return row != null && row.plan_id === "founder_lifetime" && rowGrantsPaidAccess(row, now);
}

function isEntitlingRecurring(row: BillingSubscriptionRow | null, now: Date): boolean {
  return (
    row != null &&
    (RECURRING_PLANS as ReadonlyArray<string>).includes(row.plan_id) &&
    rowGrantsPaidAccess(row, now)
  );
}

export function pickStrongestBilling(
  byoRow: BillingSubscriptionRow | null,
  lovableRow: BillingSubscriptionRow | null,
  now: Date,
): PickStrongestResult {
  // 1. Lifetime wins over everything.
  if (isEntitlingLifetime(lovableRow, now)) {
    return { row: lovableRow, source: "lovable_paddle_lifetime" };
  }
  // (BYO lifetime, should it ever exist, folds into byo_paddle branch below.)
  if (isEntitlingLifetime(byoRow, now)) {
    return { row: byoRow, source: "byo_paddle" };
  }

  // 2. Any entitlement-granting recurring subscription. BYO is incumbent →
  // tie goes to BYO, including a customer in dunning or cancellation grace.
  const byoEntitles = isEntitlingRecurring(byoRow, now);
  const lovableEntitles = isEntitlingRecurring(lovableRow, now);
  if (byoEntitles) return { row: byoRow, source: "byo_paddle" };
  if (lovableEntitles) {
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
export function resolveUnionEntitlements(input: ResolveUnionInput): ResolvedEntitlement {
  const mappedLovable = mapLovableSubscriptionRow(input.lovableRow, {
    expectedBillingEnvironment: input.expectedBillingEnvironment,
  });
  const picked = pickStrongestBilling(input.byoRow, mappedLovable, input.now);
  const resolved = resolveEntitlements(picked.row, input.now, input.opts);
  return { ...resolved, source: picked.source };
}

/**
 * Bounded newest-first scan window for public.subscriptions reads.
 *
 * public.subscriptions is unique per paddle_subscription_id, NOT per user,
 * so one account can hold several rows in one environment (e.g. an active
 * Founder Lifetime row plus a newer canceled Pro row). A single-newest-row
 * read lets the non-entitling newer row shadow the entitling older one, so
 * readers scan a bounded window and apply any-entitling-row semantics — the
 * same EXISTS shape the DB gates use. 20 comfortably exceeds any real
 * per-user, per-environment row count.
 *
 * Mirrors SUBSCRIPTION_ROW_SCAN_LIMIT in
 * supabase/functions/_shared/unionEntitlementLookup.ts.
 */
export const SUBSCRIPTION_ROW_SCAN_LIMIT = 20;

// Resolve one Lovable row in isolation. No opts on purpose: caller-level
// lifts (e.g. staff) must not make every row look entitling, or the picker
// would degenerate back to newest-row-wins.
function resolveLovableRowAlone(
  row: LovableSubscriptionRow,
  environment: LovableBillingEnvironment,
  now: Date,
): ResolvedEntitlement {
  return resolveUnionEntitlements({
    byoRow: null,
    lovableRow: row,
    expectedBillingEnvironment: environment,
    now,
  });
}

function isEntitling(resolved: ResolvedEntitlement): boolean {
  return resolved.isActive && resolved.effectivePlanId !== "free";
}

/**
 * Per-row entitlement probe. Shared with the server helper
 * (supabase/functions/_shared/unionEntitlementLookup.ts) so both sides use
 * identical row-level semantics.
 */
export function lovableRowEntitles(
  row: LovableSubscriptionRow,
  environment: LovableBillingEnvironment,
  now: Date,
): boolean {
  return isEntitling(resolveLovableRowAlone(row, environment, now));
}

/**
 * Any-entitling-row selection over a bounded window (matches the DB gates'
 * EXISTS semantics). Shared by the client hook and the server helper
 * (supabase/functions/_shared/unionEntitlementLookup.ts).
 *
 * Rows MUST arrive newest-first with a unique tiebreak (created_at desc,
 * paddle_subscription_id desc — created_at alone is not unique, so without
 * the tiebreak equal timestamps make the pick nondeterministic).
 *
 * Selection mirrors pickStrongestBilling's precedence:
 *   1. Newest entitling founder_lifetime row — lifetime beats any recurring
 *      plan regardless of recency, so a Founder who also holds a newer
 *      active Pro row still displays as Founder.
 *   2. Newest entitling recurring row.
 *   3. Newest row (entitling or not), so the degraded-display resolution
 *      behaves exactly as the previous single-newest-row read did.
 */
export function pickEntitlingLovableRow(
  rows: ReadonlyArray<LovableSubscriptionRow>,
  environment: LovableBillingEnvironment,
  now: Date,
): LovableSubscriptionRow | null {
  let newestEntitlingRecurring: LovableSubscriptionRow | null = null;
  for (const row of rows) {
    const resolved = resolveLovableRowAlone(row, environment, now);
    if (!isEntitling(resolved)) continue;
    if (resolved.effectivePlanId === "founder_lifetime") return row;
    if (newestEntitlingRecurring == null) newestEntitlingRecurring = row;
  }
  return newestEntitlingRecurring ?? (rows.length > 0 ? rows[0] : null);
}
