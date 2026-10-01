import { CREDIT_PACKS } from "@/constants/pricing";
import { creditPackBlockedCopy, type CreditPackPurchaseGate } from "@/lib/creditPackEligibility";
import { PAID_PLAN_ALLOWLIST } from "@/lib/paidPlanAllowlist";

export type PricingCheckoutRetryGate =
  { allowed: true; message: null } | { allowed: false; message: string };

/** Presentation gate only; checkout and entitlement enforcement remain server-authoritative. */
export function resolvePricingCheckoutRetryGate(
  sku: unknown,
  creditPackGate: CreditPackPurchaseGate | null | undefined,
): PricingCheckoutRetryGate {
  if (typeof sku !== "string" || !PAID_PLAN_ALLOWLIST.has(sku)) {
    return { allowed: false, message: "Choose a plan or credit pack before retrying checkout." };
  }
  // A subscription retry does not require an existing paid monthly allowance.
  if (!CREDIT_PACKS.some((pack) => pack.sku === sku)) return { allowed: true, message: null };
  if (creditPackGate?.kind === "allowed") return { allowed: true, message: null };
  if (creditPackGate?.kind === "pending") {
    return { allowed: false, message: "Checking your plan…" };
  }
  return {
    allowed: false,
    message:
      (creditPackGate?.kind === "blocked" && creditPackBlockedCopy(creditPackGate.reason)) ||
      creditPackBlockedCopy("unverified"),
  };
}
