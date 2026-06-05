/**
 * Entitlement types — pure data shapes. No React, no Supabase, no I/O.
 *
 * Slice 1 scope: source-of-truth row + resolved capability output.
 * No checkout, no webhook, no UI gating, no server enforcement yet.
 */

export type PlanId =
  | "free"
  | "pro_monthly"
  | "pro_annual"
  | "founder_lifetime";

export type SubscriptionStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "paused"
  | "expired";

export type BillingProvider = "stripe" | "paddle";

/**
 * Mirrors a row in public.billing_subscriptions as seen by the client (RLS:
 * select-own only). Treat unknown plan_id/status strings defensively in the
 * resolver — DB CHECKs prevent them but client types must still degrade safely.
 */
export interface BillingSubscriptionRow {
  id: string;
  user_id: string;
  plan_id: string; // intentionally widened — resolver re-validates against PlanId.
  status: string;  // intentionally widened — resolver re-validates against SubscriptionStatus.
  provider: BillingProvider | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  current_period_end: string | null; // ISO timestamp
  cancel_at_period_end: boolean;
  founder_number: number | null;
  created_at: string;
  updated_at: string;
}

export interface Capabilities {
  maxActiveGrows: number | null;     // null = unlimited
  aiCreditsPerGrow: number | null;   // free "taste"; null = n/a (uses monthly)
  aiMonthlyCredits: number;          // monthly bucket; 0 for free; HARD-PINNED for founder.
  liveSensors: boolean;
  advancedExports: boolean;
  multiTent: boolean;
  sensorHistoryDays: number | null;  // null = unlimited
  prioritySupport: boolean;
}

/**
 * Output of the pure resolver. `isActive` reflects whether paid-tier
 * capabilities currently apply. `effectivePlanId` is what capabilities were
 * resolved from. `displayPlanId` retains plan identity for UX even when the
 * effective plan has degraded to free (e.g. paused → caps=free, displayed=pro).
 *
 * `degraded` is true when the row was present but could not be honored
 * (unknown plan, unknown status, expired, canceled, past_due, paused).
 */
export interface ResolvedEntitlement {
  effectivePlanId: PlanId;
  displayPlanId: PlanId;
  status: SubscriptionStatus | "unknown";
  isActive: boolean;
  capabilities: Capabilities;
  degraded: boolean;
  degradedReason:
    | null
    | "null_row_free"
    | "unknown_plan_id"
    | "unknown_status"
    | "expired"
    | "canceled"
    | "past_due"
    | "paused";
}
