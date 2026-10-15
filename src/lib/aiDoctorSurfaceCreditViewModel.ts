/**
 * aiDoctorSurfaceCreditViewModel — pure presentation rules for the AI Doctor
 * surface credit balance and Free plan 3-credit allowance text (#2161).
 *
 * Pure: no React, no Supabase, no fetch, no Date reads.
 * No CTA, no upgrade link, no urgency language.
 */
import type { AiCreditRemainingInput } from "@/lib/aiCreditRemainingBadgeViewModel";
import { resolveAiDoctorEntitlementView } from "@/lib/aiDoctorEntitlementRules";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";
import type { ResolvedEntitlement } from "@/lib/entitlements/types";

export const AI_DOCTOR_FREE_PLAN_CREDIT_ALLOWANCE = FREE_CAPABILITIES.aiCreditsPerGrow ?? 3;

export const AI_DOCTOR_FREE_PLAN_CREDIT_COPY =
  `Free plan includes ${AI_DOCTOR_FREE_PLAN_CREDIT_ALLOWANCE} AI Doctor credits per grow.` as const;

export interface AiDoctorSurfaceCreditInput {
  entitlement?: ResolvedEntitlement | null;
  entitlementLookupFailed?: boolean;
  /** Allowance-funded credits used on the current grow, when known. */
  allowanceUsed?: number | null;
  /** True when the client allowance-used read failed. */
  allowanceReadFailed?: boolean;
  /** Fresh post-spend credit envelope returned by `ai-doctor-review`. */
  postSpendCredit?: AiCreditRemainingInput | null;
  /** Server credit-denial envelope when `ai-doctor-review` returned `credit_denied`. */
  deniedCredit?: {
    scope?: string | null;
    scope_limit?: number | null;
    remaining?: number | null;
    plan_id?: string | null;
  } | null;
}

export interface AiDoctorSurfaceCreditViewModel {
  creditRemaining: AiCreditRemainingInput | null;
  freePlanCreditCopy: string | null;
}

export function buildAiDoctorSurfaceCreditViewModel(
  input: AiDoctorSurfaceCreditInput,
): AiDoctorSurfaceCreditViewModel {
  if (input.entitlementLookupFailed === true) {
    return {
      creditRemaining: input.postSpendCredit ?? null,
      freePlanCreditCopy: null,
    };
  }

  const viewer = resolveAiDoctorEntitlementView({
    entitlement: input.entitlement ?? null,
  });

  if (viewer.bypassesUpsell) {
    if (input.postSpendCredit) {
      return {
        creditRemaining: input.postSpendCredit,
        freePlanCreditCopy: null,
      };
    }
    if (
      input.deniedCredit &&
      input.deniedCredit.scope === "per_month" &&
      typeof input.deniedCredit.remaining === "number" &&
      typeof input.deniedCredit.scope_limit === "number"
    ) {
      return {
        creditRemaining: {
          remaining: input.deniedCredit.remaining,
          scope: "per_month",
          scope_limit: input.deniedCredit.scope_limit,
        },
        freePlanCreditCopy: null,
      };
    }
    return {
      creditRemaining: null,
      freePlanCreditCopy: null,
    };
  }

  if (
    input.entitlement?.status === "unknown" ||
    input.entitlement?.degradedReason === "unknown_plan_id" ||
    input.entitlement?.degradedReason === "unknown_status"
  ) {
    return {
      creditRemaining: input.postSpendCredit ?? null,
      freePlanCreditCopy: null,
    };
  }

  const capLimit = input.entitlement?.capabilities?.aiCreditsPerGrow;
  const perGrowLimit =
    typeof capLimit === "number" && Number.isFinite(capLimit) && capLimit > 0
      ? Math.floor(capLimit)
      : AI_DOCTOR_FREE_PLAN_CREDIT_ALLOWANCE;

  const freePlanCreditCopy =
    perGrowLimit === AI_DOCTOR_FREE_PLAN_CREDIT_ALLOWANCE
      ? AI_DOCTOR_FREE_PLAN_CREDIT_COPY
      : `Free plan includes ${perGrowLimit} AI Doctor credits per grow.`;

  if (input.postSpendCredit) {
    return {
      creditRemaining: input.postSpendCredit,
      freePlanCreditCopy,
    };
  }

  if (
    input.deniedCredit &&
    (input.deniedCredit.scope === "per_grow" || input.deniedCredit.scope === "per_month")
  ) {
    return {
      creditRemaining: {
        remaining:
          typeof input.deniedCredit.remaining === "number" ? input.deniedCredit.remaining : 0,
        scope: input.deniedCredit.scope,
        scope_limit:
          typeof input.deniedCredit.scope_limit === "number" && input.deniedCredit.scope_limit > 0
            ? input.deniedCredit.scope_limit
            : perGrowLimit,
      },
      freePlanCreditCopy,
    };
  }

  if (input.allowanceReadFailed === true) {
    return {
      creditRemaining: null,
      freePlanCreditCopy,
    };
  }

  const used =
    typeof input.allowanceUsed === "number" &&
    Number.isFinite(input.allowanceUsed) &&
    input.allowanceUsed >= 0
      ? Math.floor(input.allowanceUsed)
      : 0;

  return {
    creditRemaining: {
      remaining: Math.max(perGrowLimit - used, 0),
      scope: "per_grow",
      scope_limit: perGrowLimit,
    },
    freePlanCreditCopy,
  };
}
