/**
 * resolveEntitlements — pure function. Source of truth for what capabilities
 * a user has *right now*, given their billing row and the current time.
 *
 * Pure: no React, no Supabase, no fetch, no internal now(). `now` MUST be
 * passed in by the caller so the function is deterministic and testable.
 *
 * Staff override (UX-only):
 *  - When `opts.isStaff` is true, callers receive Pro-tier capabilities for
 *    presentation regardless of billing row. `isStaff` is set on the result.
 *  - This is NEVER authoritative for cost/security gates. AI credit spend
 *    is still capped and metered server-side (see ai_credit_spend).
 *  - If a real active paid row exists, that wins for displayPlanId; staff
 *    only lifts capabilities/isActive when the billing row would otherwise
 *    resolve to free/degraded.
 */

import type {
  BillingSubscriptionRow,
  PlanId,
  ResolvedEntitlement,
  SubscriptionStatus,
} from "./types";
import { FREE_CAPABILITIES } from "./capabilities";
import { PLAN_CATALOG, isKnownPlanId } from "./planCatalog";
import { subscriptionGrantsAccess } from "../paddleSubscriptionAccessRules";

const KNOWN_STATUSES: ReadonlyArray<SubscriptionStatus> = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "paused",
  "expired",
];

function isKnownStatus(value: unknown): value is SubscriptionStatus {
  return typeof value === "string" && (KNOWN_STATUSES as ReadonlyArray<string>).includes(value);
}

export interface ResolveEntitlementsOptions {
  /**
   * Verified staff role from the server-side `user_roles` trigger.
   * Presentation-only capability lift; never used for security or spend.
   */
  isStaff?: boolean;
}

function applyStaffLift(base: ResolvedEntitlement, isStaff: boolean): ResolvedEntitlement {
  if (!isStaff) return base;
  // If the caller already has an active paid plan, keep its display identity
  // and capabilities — staff never downgrades a real subscription.
  if (base.isActive && base.effectivePlanId !== "free") {
    return { ...base, isStaff: true };
  }
  // Otherwise lift to Pro-tier capabilities for UX display.
  return {
    ...base,
    effectivePlanId: "pro_monthly",
    // Preserve any real displayPlanId (e.g. "pro_monthly" paused) so
    // messaging like "Pro — paused" still reads correctly. Fall back to
    // pro_monthly if there was no plan identity to preserve.
    displayPlanId: base.displayPlanId !== "free" ? base.displayPlanId : "pro_monthly",
    isActive: true,
    capabilities: PLAN_CATALOG.pro_monthly,
    isStaff: true,
  };
}

function freeFallback(
  displayPlanId: PlanId,
  status: SubscriptionStatus | "unknown",
  reason: ResolvedEntitlement["degradedReason"],
): ResolvedEntitlement {
  return {
    effectivePlanId: "free",
    displayPlanId,
    status,
    isActive: status === "active" && reason === null,
    capabilities: FREE_CAPABILITIES,
    degraded: reason !== null && reason !== "null_row_free",
    degradedReason: reason,
    isStaff: false,
  };
}

export function resolveEntitlements(
  row: BillingSubscriptionRow | null,
  now: Date,
  opts: ResolveEntitlementsOptions = {},
): ResolvedEntitlement {
  const isStaff = opts.isStaff === true;

  // Absence = free.
  if (row == null) {
    return applyStaffLift(
      {
        effectivePlanId: "free",
        displayPlanId: "free",
        status: "active",
        isActive: true,
        capabilities: FREE_CAPABILITIES,
        degraded: false,
        degradedReason: "null_row_free",
        isStaff: false,
      },
      isStaff,
    );
  }

  // Defensive: DB CHECKs prevent these but the client type is widened.
  if (!isKnownPlanId(row.plan_id)) {
    return applyStaffLift(freeFallback("free", "unknown", "unknown_plan_id"), isStaff);
  }
  if (!isKnownStatus(row.status)) {
    return applyStaffLift(freeFallback(row.plan_id, "unknown", "unknown_status"), isStaff);
  }

  const planId = row.plan_id as PlanId;
  const status = row.status as SubscriptionStatus;

  // One shared status policy governs browser presentation and server-side
  // callers: active/trialing rows are valid in-period, past_due preserves
  // access during Paddle dunning, and canceled rows retain access only until
  // the paid-through period ends. Unknown/invalid dates fail closed.
  if (
    subscriptionGrantsAccess(
      { plan_id: planId, status, current_period_end: row.current_period_end },
      now,
    )
  ) {
    return applyStaffLift(
      {
        effectivePlanId: planId,
        displayPlanId: planId,
        status,
        isActive: true,
        capabilities: PLAN_CATALOG[planId],
        degraded: false,
        degradedReason: null,
        isStaff: false,
      },
      isStaff,
    );
  }

  // Degraded paths — retain displayPlanId for UX messaging.
  const reason: ResolvedEntitlement["degradedReason"] =
    status === "past_due"
      ? "past_due"
      : status === "canceled"
        ? "canceled"
        : status === "paused"
          ? "paused"
          : status === "expired"
            ? "expired"
            : "expired"; // active/trialing + elapsed or invalid period

  return applyStaffLift(
    {
      effectivePlanId: "free",
      displayPlanId: planId,
      status,
      isActive: false,
      capabilities: FREE_CAPABILITIES,
      degraded: true,
      degradedReason: reason,
      isStaff: false,
    },
    isStaff,
  );
}
