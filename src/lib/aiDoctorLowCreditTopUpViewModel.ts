/**
 * Pure rules for the low-balance top-up nudge shown after a successful,
 * durably saved AI Doctor review.
 *
 * The counterpart to buildAiDoctorPostValueUpgradeViewModel, which is strictly
 * Free -> Pro and fails closed for every paid viewer. This covers the other
 * side: a PAYING grower whose monthly allowance is nearly spent, for whom the
 * correct action is a one-time pack, never an upgrade.
 *
 * Eligibility is delegated to creditPackPurchaseEligible — the same predicate
 * the pricing page and the credit-denial notice use — so this cannot offer a
 * pack to someone who could not buy one. That matters beyond tidiness: a
 * verified staff role can present as paid while remaining source="free", and
 * presentation must never authorize a cost-bearing purchase prompt.
 *
 * Pure: no React, no Supabase, no time reads.
 */
import type { AiCreditRemainingInput } from "@/lib/aiCreditRemainingBadgeViewModel";
import { buildCreditPackHref } from "@/lib/aiCreditLimitNoticeViewModel";
import { creditPackPurchaseEligible } from "@/lib/creditPackEligibility";
import type { ResolvedEntitlement } from "@/lib/entitlements/types";

export const AI_DOCTOR_LOW_CREDIT_SURFACE = "ai_doctor_low_credit" as const;

/**
 * At or below this many remaining credits the grower is close enough to the
 * wall that a top-up is useful rather than noise. Above it, the plain
 * remaining-credit badge already says everything needed.
 */
export const AI_DOCTOR_LOW_CREDIT_THRESHOLD = 2;

export interface AiDoctorLowCreditTopUpInput {
  /** The `credit` envelope from a SUCCESSFUL spend, not a denial. */
  credit: AiCreditRemainingInput | null | undefined;
  viewerEntitlement: ResolvedEntitlement | null | undefined;
  entitlementLoading: boolean;
  /** Value must be delivered and durable before asking for money. */
  durableSessionSaved: boolean;
  /** Same-origin route to restore after a confirmed purchase. */
  returnTo?: string | null;
}

export type AiDoctorLowCreditTopUpViewModel =
  | Readonly<{ visible: false }>
  | Readonly<{ visible: true; remaining: number; label: string; href: string }>;

const HIDDEN: AiDoctorLowCreditTopUpViewModel = Object.freeze({ visible: false });

function lowMonthlyRemaining(credit: AiCreditRemainingInput | null | undefined): number | null {
  if (!credit) return null;
  // Paid allowances are the monthly bucket. A per-grow scope is the Free
  // contract, which the post-value upgrade view model owns instead.
  if (credit.scope !== "per_month") return null;
  const { remaining } = credit;
  if (!Number.isInteger(remaining)) return null;
  if ((remaining as number) < 0) return null;
  if ((remaining as number) > AI_DOCTOR_LOW_CREDIT_THRESHOLD) return null;
  // Already holding purchased credits — the allowance is low but they are not
  // actually about to be blocked, so this would be a sale for its own sake.
  const packBalance = credit.pack_balance;
  if (typeof packBalance === "number" && packBalance > 0) return null;
  return remaining as number;
}

export function buildAiDoctorLowCreditTopUpViewModel(
  input: AiDoctorLowCreditTopUpInput,
): AiDoctorLowCreditTopUpViewModel {
  if (input.entitlementLoading || !input.durableSessionSaved) return HIDDEN;
  if (!input.viewerEntitlement) return HIDDEN;
  if (!creditPackPurchaseEligible(input.viewerEntitlement)) return HIDDEN;

  const remaining = lowMonthlyRemaining(input.credit);
  if (remaining === null) return HIDDEN;

  return {
    visible: true,
    remaining,
    // Says what a pack DOES (adds credits that never expire), never what it
    // guarantees. Packs are finite — 50 or 150 — so "covers checks until they
    // reset" would promise coverage a grower can exhaust before the reset.
    label:
      remaining === 0
        ? "You've used this month's AI credits. A one-time pack adds more without waiting for the reset."
        : `${remaining} AI credit${remaining === 1 ? "" : "s"} left this month. A one-time pack adds more without waiting for the reset.`,
    href: buildCreditPackHref(input.returnTo),
  };
}
