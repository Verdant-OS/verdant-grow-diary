/**
 * Shared server-side gate for every bridge-token live-sensor boundary.
 *
 * The caller supplies only a server-resolved owner id: auth.getClaims() for
 * minting or the authenticated bridge_tokens row for ingest. Billing plan
 * and capabilities are loaded only from canonical public.subscriptions.
 */
import { loadUnionEntitlementForUser } from "./unionEntitlementLookup.ts";
import type { PlanId } from "./lib/lib/entitlements/types.ts";
import type { LovableBillingEnvironment } from "./lib/lib/entitlements/lovablePaddleAdapter.ts";
import type { EntitlementSource } from "./lib/lib/entitlements/unionEntitlements.ts";

export type LiveSensorEntitlementDecision =
  | {
      ok: true;
      effectivePlanId: PlanId;
      source: EntitlementSource;
    }
  | {
      ok: false;
      reason: "upgrade_required" | "entitlement_lookup_failed";
    };

export async function requireLiveSensorEntitlement(
  supabase: unknown,
  userId: string,
  expectedBillingEnvironment: LovableBillingEnvironment,
  now: Date,
): Promise<LiveSensorEntitlementDecision> {
  try {
    const { entitlement, lookupFailed } = await loadUnionEntitlementForUser(
      supabase,
      userId,
      expectedBillingEnvironment,
      now,
    );
    if (lookupFailed) {
      return { ok: false, reason: "entitlement_lookup_failed" };
    }
    if (entitlement.capabilities.liveSensors !== true) {
      return { ok: false, reason: "upgrade_required" };
    }
    return {
      ok: true,
      effectivePlanId: entitlement.effectivePlanId,
      source: entitlement.source ?? "free",
    };
  } catch {
    return { ok: false, reason: "entitlement_lookup_failed" };
  }
}
