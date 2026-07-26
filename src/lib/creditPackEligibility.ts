/**
 * Who can actually SPEND a one-time AI credit pack.
 *
 * Packs top up the MONTHLY credit bucket. `ai_credit_spend` only consults pack
 * balance under `IF v_scope = 'per_month'`, and `v_scope` is `'per_grow'`
 * whenever `ai_credit_allowance` returns a non-null `per_grow`
 * (20260721104000_ai_credit_spend_pack_overflow.sql). Free is `per_grow = 3`,
 * so a free grower's purchased pack lands in `ai_credit_grants` and **no spend
 * path ever reads it** — money taken, nothing delivered.
 *
 * `Capabilities.aiCreditsPerGrow` is the TS mirror of that same column
 * (`null` = "n/a; uses the monthly bucket"), so `=== null` here is exactly the
 * SQL's `per_month` branch rather than a parallel list of paid plan ids. A
 * hand-maintained list is the shape of the copy that let Craft go missing from
 * the webhook allowlist; deriving keeps a future tier correct for free.
 *
 * Pure: no React, no Supabase, no time reads.
 */
import type { ResolvedEntitlement } from "@/lib/entitlements/types";

export type CreditPackPurchaseGate =
  /** Entitlement still loading — say nothing yet. */
  | { kind: "pending" }
  /** Packs are spendable; show the buy buttons. */
  | { kind: "allowed" }
  /**
   * Packs would be unspendable for this viewer. `reason` distinguishes the
   * honest copy: a signed-out visitor needs an account first, a free grower
   * needs a plan with a monthly bucket, and an unreadable entitlement must
   * fail CLOSED rather than sell something we cannot confirm is usable.
   */
  | { kind: "blocked"; reason: "signed_out" | "no_monthly_bucket" | "unverified" };

/**
 * The core predicate, shared by the client and the edge function.
 *
 * Kept dependency-free so it mirrors into supabase/functions/_shared/lib via
 * scripts/sync-edge-shared.mjs — the SERVER is the authority here (a client
 * check alone can be bypassed by calling the function directly), and both
 * sides must agree by construction rather than by two copies staying in sync.
 */
export function creditPackIsSpendable(entitlement: ResolvedEntitlement): boolean {
  return entitlement.isActive && entitlement.capabilities.aiCreditsPerGrow === null;
}

export interface CreditPackGateInput {
  entitlement: ResolvedEntitlement;
  /** False when the canonical subscription row could not be read. */
  entitlementVerified: boolean;
  loading: boolean;
  signedIn: boolean;
}

/**
 * Can this viewer spend pack credits if they buy them?
 *
 * Deliberately conservative at every uncertain edge: loading yields `pending`
 * (never a buyable state that later retracts), and an unverified entitlement
 * yields `blocked`. Selling a pack we cannot confirm is spendable is the
 * failure this exists to prevent, so "don't know" must never resolve to "sell".
 */
export function resolveCreditPackPurchaseGate(
  input: CreditPackGateInput,
): CreditPackPurchaseGate {
  if (input.loading) return { kind: "pending" };
  if (!input.signedIn) return { kind: "blocked", reason: "signed_out" };
  if (!input.entitlementVerified) return { kind: "blocked", reason: "unverified" };
  if (!creditPackIsSpendable(input.entitlement)) {
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
