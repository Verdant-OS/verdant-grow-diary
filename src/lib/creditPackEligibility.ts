/**
 * Who may PURCHASE a one-time AI credit pack through Verdant's normal UI.
 *
 * Purchased/granted balance is portable after settlement, so this is a
 * merchandising rule rather than a claim that Free cannot technically spend
 * an already-owned pack. New packs remain paid-plan top-ups in the product
 * catalog, while the server spend contract protects value already purchased
 * if the buyer's plan later lapses.
 *
 * `Capabilities.aiCreditsPerGrow === null` identifies the paid monthly bucket
 * without maintaining a second plan-id list.
 *
 * Pure: no React, no Supabase, no time reads.
 */
import type { ResolvedEntitlement } from "@/lib/entitlements/types";

export type CreditPackPurchaseGate =
  /** Entitlement still loading, so checkout must remain unavailable. */
  | { kind: "pending" }
  /** Pack purchase is available; show enabled buy buttons. */
  | { kind: "allowed" }
  /**
   * Pack purchase is unavailable for this viewer. The reason selects honest,
   * calm recovery copy without exposing provider or account details.
   */
  | { kind: "blocked"; reason: "signed_out" | "no_monthly_bucket" | "unverified" };

const PAID_BILLING_SOURCES: ReadonlySet<NonNullable<ResolvedEntitlement["source"]>> = new Set([
  "byo_paddle",
  "lovable_paddle_subscription",
  "lovable_paddle_lifetime",
]);

/**
 * The core predicate shared by the client and the edge function.
 *
 * Both a monthly credit bucket and paid billing provenance are required.
 * Provenance matters because a verified staff role can lift browser
 * capabilities to Pro for presentation while remaining source="free"; staff
 * presentation must never authorize a cost-bearing pack purchase.
 */
export function creditPackPurchaseEligible(entitlement: ResolvedEntitlement): boolean {
  return (
    entitlement.isActive &&
    entitlement.source !== undefined &&
    PAID_BILLING_SOURCES.has(entitlement.source) &&
    entitlement.capabilities.aiCreditsPerGrow === null
  );
}

export interface CreditPackGateInput {
  entitlement: ResolvedEntitlement;
  /** False when the relevant entitlement authority could not be read. */
  entitlementVerified: boolean;
  loading: boolean;
  signedIn: boolean;
}

/**
 * May this viewer start a new pack purchase?
 *
 * Uncertain states fail closed: loading stays pending and an unverified
 * entitlement stays blocked.
 */
export function resolveCreditPackPurchaseGate(input: CreditPackGateInput): CreditPackPurchaseGate {
  if (input.loading) return { kind: "pending" };
  if (!input.signedIn) return { kind: "blocked", reason: "signed_out" };
  if (!input.entitlementVerified) return { kind: "blocked", reason: "unverified" };
  if (!creditPackPurchaseEligible(input.entitlement)) {
    return { kind: "blocked", reason: "no_monthly_bucket" };
  }
  return { kind: "allowed" };
}

/** Grower-facing explanation for each blocked reason. Never blames the user. */
export function creditPackBlockedCopy(
  reason: Extract<CreditPackPurchaseGate, { kind: "blocked" }>["reason"],
): string {
  switch (reason) {
    case "signed_out":
      return "Credit packs top up a paid plan's monthly AI allowance. Sign in to see your top-up options.";
    case "no_monthly_bucket":
      return "Credit packs top up the monthly AI allowance that comes with Pro, Craft and Founder Lifetime. Free grows include 3 AI Doctor checks per grow instead, so a pack would have nothing to add to yet.";
    case "unverified":
      return "We couldn't confirm your plan just now, so we're not showing top-up options. Reload in a moment, or check your plan in Settings.";
  }
}
