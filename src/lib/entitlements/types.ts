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
  | "founder_lifetime"
  // Craft: the craft-grower / rosin tier. Everything Pro has, plus the Blueprint
  // overlay and a 300/month AI-credit bucket (see planCatalog). Definition mirrors
  // the deploy branch so the lineages stay converged. Fully resolvable everywhere
  // the app reasons about entitlements; activation is only the Paddle products
  // (no billing row can carry these until they exist).
  | "craft_monthly"
  | "craft_annual";

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
  /**
   * Real-data Pheno Comparison — side-by-side candidate selection evidence for
   * a real grow's hunt (not the public sample preview). Paid: false for free,
   * true for Pro/founder. Presentation gate only (the data is the user's own,
   * RLS-scoped) — no money spent, so a client capability check is sufficient.
   */
  phenoComparison: boolean;
  /**
   * Pro Blueprint overlay (per-stage SOP scoring). Craft-exclusive (+ Founder).
   * The overlay feature itself lives on the deploy branch; on main this flag is
   * carried for entitlement-shape parity so the lineages stay converged.
   */
  blueprint: boolean;
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
