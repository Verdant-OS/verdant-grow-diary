/**
 * featureEntitlements — pure feature-gate helper.
 *
 * Derives feature access from an already-resolved `ResolvedEntitlement`
 * (see src/lib/entitlements). No React, no Supabase, no fetch, no time reads,
 * no localStorage/sessionStorage/client flags.
 *
 * PRESENTATION SAFETY:
 *   These helpers are used to render upgrade gates in the UI. They are NOT
 *   the authoritative security boundary for paid writes. Writes/exports for
 *   paid features must ALSO be protected by:
 *     - Supabase RLS on the underlying tables (already in place for
 *       pheno_hunts, pheno_candidate_scores, pheno_keeper_decisions, etc.),
 *     - and, for cost/entitlement-sensitive endpoints, a server-side
 *       entitlement re-check (see supabase/functions/_shared/unionEntitlementLookup.ts).
 *
 *   TODO (server-side gating): There is no server-side entitlement check
 *   today for `pheno_tracker` write paths — Free clients are prevented from
 *   writing by UI-only gating and by the client build not calling the write
 *   helpers from the gated state. RLS still prevents cross-user writes. A
 *   dedicated `assert_pheno_tracker_entitlement()` RPC or Edge check should
 *   be added before we claim server-side paid enforcement.
 */

import type {
  PlanId,
  ResolvedEntitlement,
} from "@/lib/entitlements/types";

export type FeatureKey = "pheno_tracker";

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
export const FEATURE_KEYS: ReadonlyArray<FeatureKey> = ["pheno_tracker"];
