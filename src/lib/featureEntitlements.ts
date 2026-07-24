/**
 * featureEntitlements — pure feature-gate helper.
 *
 * Derives feature access from an already-resolved `ResolvedEntitlement`
 * (see src/lib/entitlements). No React, no Supabase, no fetch, no time reads,
 * no localStorage/sessionStorage/client flags.
 *
 * PRESENTATION SAFETY:
 *   These helpers render upgrade gates in the UI. They are NOT the
 *   authoritative security boundary. Paid writes for `pheno_tracker` are
 *   enforced server-side by:
 *     - Ownership RLS on every pheno_* table (auth.uid() = user_id, plus
 *       hunt/plant consistency), and
 *     - RESTRICTIVE RLS policies on all pheno_* write paths that require
 *       `public.has_pheno_tracker_entitlement(auth.uid())` for
 *       INSERT/UPDATE/DELETE. Free / expired / canceled / paused users are
 *       rejected at the database even if they bypass the UI.
 *     - Edge callers should use
 *       `supabase/functions/_shared/assertPhenoTrackerEntitlement.ts`.
 */

import type {
  PlanId,
  ResolvedEntitlement,
} from "@/lib/entitlements/types";

/**
 * `advanced_timeline_filters` gates the Pro timeline conveniences
 * (date-range filtering, next-missing-action jump). Presentation-only:
 * it never gates access to the grower's own diary data, only the
 * advanced view tooling — so no server-side enforcement is required.
 */
export type FeatureKey = "pheno_tracker" | "advanced_timeline_filters";

const PRO_PLAN_IDS: ReadonlyArray<PlanId> = [
  "pro_monthly",
  "pro_annual",
  "founder_lifetime",
];

function isProPlan(plan: PlanId): boolean {
  return (PRO_PLAN_IDS as ReadonlyArray<string>).includes(plan);
}

/**
 * Full feature access. True iff the resolved entitlement is currently active
 * AND the effective plan is a Pro/lifetime plan. Staff lift already flows
 * through `isActive` + `effectivePlanId === "pro_monthly"` in the resolver.
 */
export function canUseFeature(
  entitlement: ResolvedEntitlement | null | undefined,
  _featureKey: FeatureKey,
): boolean {
  if (!entitlement) return false;
  return entitlement.isActive && isProPlan(entitlement.effectivePlanId);
}

/**
 * Read-only access to existing records. True when the caller currently has
 * full access, OR when they held a Pro/lifetime plan that has degraded
 * (canceled / paused / past_due / expired). This preserves grower history
 * — we never hide a user's own past pheno data as a billing punishment.
 */
export function canReadExistingFeatureData(
  entitlement: ResolvedEntitlement | null | undefined,
  featureKey: FeatureKey,
): boolean {
  if (!entitlement) return false;
  if (canUseFeature(entitlement, featureKey)) return true;
  return isProPlan(entitlement.displayPlanId);
}

/**
 * Write/create/export access. Strictly equivalent to `canUseFeature`.
 * Callers on the write path (create hunt, save candidate score, save keeper
 * decision, export report) MUST check this before invoking write helpers.
 */
export function canWriteFeatureData(
  entitlement: ResolvedEntitlement | null | undefined,
  featureKey: FeatureKey,
): boolean {
  return canUseFeature(entitlement, featureKey);
}

/** All supported feature keys, exported for deterministic-typing tests. */
export const FEATURE_KEYS: ReadonlyArray<FeatureKey> = [
  "pheno_tracker",
  "advanced_timeline_filters",
];
