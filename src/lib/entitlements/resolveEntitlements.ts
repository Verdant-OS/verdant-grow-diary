/**
 * resolveEntitlements — pure function. Source of truth for what capabilities
 * a user has *right now*, given their billing row and the current time.
 *
 * Pure: no React, no Supabase, no fetch, no internal now(). `now` MUST be
 * passed in by the caller so the function is deterministic and testable.
 *
 * Branches:
 *  - null row → free caps, active. Absence of row = free user.
 *  - status 'active' AND (current_period_end IS NULL OR > now) → plan caps,
 *    isActive true.
 *  - status in past_due/canceled/expired/paused, OR period elapsed →
 *    free caps, isActive false. paused retains plan identity in displayPlanId
 *    so UX can show "Pro — paused; resume to restore".
 *  - unknown plan_id → free caps, isActive false, degraded.
 *  - unknown status → free caps, isActive false, degraded.
 *
 * Never silently keeps Pro after expiry.
 */

import type {
  BillingSubscriptionRow,
  PlanId,
  ResolvedEntitlement,
  SubscriptionStatus,
} from "./types";
import { FREE_CAPABILITIES } from "./capabilities";
import { PLAN_CATALOG, isKnownPlanId } from "./planCatalog";

const KNOWN_STATUSES: ReadonlyArray<SubscriptionStatus> = [
  "active",
  "past_due",
  "canceled",
  "paused",
  "expired",
];

function isKnownStatus(value: unknown): value is SubscriptionStatus {
  return typeof value === "string" &&
    (KNOWN_STATUSES as ReadonlyArray<string>).includes(value);
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
  };
}

export function resolveEntitlements(
  row: BillingSubscriptionRow | null,
  now: Date,
): ResolvedEntitlement {
  // Absence = free.
  if (row == null) {
    return {
      effectivePlanId: "free",
      displayPlanId: "free",
      status: "active",
      isActive: true,
      capabilities: FREE_CAPABILITIES,
      degraded: false,
      degradedReason: "null_row_free",
    };
  }

  // Defensive: DB CHECKs prevent these but the client type is widened.
  if (!isKnownPlanId(row.plan_id)) {
    return freeFallback("free", "unknown", "unknown_plan_id");
  }
  if (!isKnownStatus(row.status)) {
    return freeFallback(row.plan_id, "unknown", "unknown_status");
  }

  const planId = row.plan_id as PlanId;
  const status = row.status as SubscriptionStatus;

  // Period expiry check (NULL = no expiry: free or founder_lifetime).
  let periodElapsed = false;
  if (row.current_period_end != null) {
    const end = new Date(row.current_period_end);
    if (Number.isNaN(end.getTime()) || end.getTime() <= now.getTime()) {
      periodElapsed = true;
    }
  }

  if (status === "active" && !periodElapsed) {
    return {
      effectivePlanId: planId,
      displayPlanId: planId,
      status,
      isActive: true,
      capabilities: PLAN_CATALOG[planId],
      degraded: false,
      degradedReason: null,
    };
  }

  // Degraded paths — retain displayPlanId for UX messaging.
  const reason: ResolvedEntitlement["degradedReason"] =
    status === "past_due" ? "past_due"
    : status === "canceled" ? "canceled"
    : status === "paused" ? "paused"
    : status === "expired" ? "expired"
    : "expired"; // active + periodElapsed

  return {
    effectivePlanId: "free",
    displayPlanId: planId,
    status,
    isActive: false,
    capabilities: FREE_CAPABILITIES,
    degraded: true,
    degradedReason: reason,
  };
}
