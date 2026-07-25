/**
 * assertPhenoTrackerEntitlement — server-side Pro gate for Pheno Tracker writes.
 *
 * Use from Edge Functions that write pheno_* data (none today; here for
 * future RPC/edge callers). Direct table writes from the browser are
 * already blocked by the RESTRICTIVE RLS policies backed by
 * `public.has_pheno_tracker_entitlement(auth.uid())`.
 *
 * SANITIZED FAILURE MODE:
 *   Returns `{ ok:false, status:403, reason:"pheno_tracker_pro_required" }`.
 *   Never surfaces subscription IDs, customer IDs, provider payloads,
 *   internal entitlement rows, secrets, or DB errors.
 */

// deno-lint-ignore-file no-explicit-any
import { loadUnionEntitlement, resolveServerBillingEnvironment } from "./unionEntitlementLookup.ts";

export type PhenoTrackerGateResult =
  | { ok: true }
  | { ok: false; status: 403; reason: "pheno_tracker_pro_required" };

// Every plan whose capabilities dominate Pro's. Craft is sold as "Everything
// in Pro" and planCatalog defines it as a literal superset, so it belongs here
// exactly as Pro does — omitting it denied a paying subscriber the feature
// server-side even after the client allowed it. Kept in lockstep with
// featureEntitlements.PRO_PLAN_IDS and has_pheno_tracker_entitlement; the
// sell-vs-grant parity test fails if these three ever disagree.
const PRO_PLAN_IDS = new Set([
  "pro_monthly",
  "pro_annual",
  "craft_monthly",
  "craft_annual",
  "founder_lifetime",
]);

/**
 * Assert the caller currently holds active Pro. Caller MUST pass a
 * user-JWT-scoped supabase client so RLS applies to the entitlement reads.
 */
export async function assertPhenoTrackerEntitlement(
  supabase: any,
  now: Date = new Date(),
): Promise<PhenoTrackerGateResult> {
  try {
    const env = resolveServerBillingEnvironment();
    const { entitlement } = await loadUnionEntitlement(supabase, env, now);
    if (entitlement.isActive && PRO_PLAN_IDS.has(entitlement.effectivePlanId)) {
      return { ok: true };
    }
  } catch {
    // fail closed
  }
  return { ok: false, status: 403, reason: "pheno_tracker_pro_required" };
}

/** Sanitized JSON response for the deny case. */
export function phenoTrackerDeniedResponse(corsHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: "pheno_tracker_pro_required" }), {
    status: 403,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
