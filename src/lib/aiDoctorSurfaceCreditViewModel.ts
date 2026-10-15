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

export interface AiDoctorSpendRowLike {
  weight: number | null;
  funded_by: string | null;
}

export interface AiDoctorGrantRowLike {
  credits: number | null;
  expires_at: string | null;
}

/**
 * Sums allowance-funded spend weights for a grow, excluding pack-funded rows
 * (`funded_by === "pack"`) to mirror the server's allowance arm.
 */
export function sumAiDoctorAllowanceSpends(
  rows: ReadonlyArray<AiDoctorSpendRowLike> | null | undefined,
): number {
  return (rows ?? []).reduce((sum, row) => {
    return row.funded_by === "pack" ? sum : sum + (row.weight ?? 0);
  }, 0);
}

/**
 * Returns true when any grant row has positive credits and has not expired as
 * of `nowMs`.
 */
export function hasUnexpiredAiCreditGrants(
  rows: ReadonlyArray<AiDoctorGrantRowLike> | null | undefined,
  nowMs: number,
): boolean {
  return (rows ?? []).some((row) => {
    if (!row.credits || row.credits <= 0) return false;
    if (!row.expires_at) return true;
    const expiresAtMs = Date.parse(row.expires_at);
    return !Number.isFinite(expiresAtMs) || expiresAtMs > nowMs;
  });
}

export interface AiDoctorSurfaceCreditInput {
  entitlement?: ResolvedEntitlement | null;
  entitlementLoading?: boolean;
  entitlementLookupFailed?: boolean;
  /** Allowance-funded credits used on the current grow, when resolved. */
  allowanceUsed?: number | null;
  /** True when the user owns any unexpired credit-pack grant row. */
  hasPackCredits?: boolean | null;
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

/**
 * Resolves the pre-run / post-run credit remaining badge input and Free-plan
 * 3-credit allowance copy for AI Doctor surfaces.
 */
export function buildAiDoctorSurfaceCreditViewModel(
  input: AiDoctorSurfaceCreditInput,
): AiDoctorSurfaceCreditViewModel {
  if (input.entitlementLoading === true || input.entitlementLookupFailed === true) {
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

  if (
    input.allowanceReadFailed === true ||
    typeof input.allowanceUsed !== "number" ||
    !Number.isFinite(input.allowanceUsed) ||
    input.allowanceUsed < 0
  ) {
    return {
      creditRemaining: null,
      freePlanCreditCopy,
    };
  }

  const used = Math.floor(input.allowanceUsed);

  return {
    creditRemaining: {
      remaining: Math.max(perGrowLimit - used, 0),
      scope: "per_grow",
      scope_limit: perGrowLimit,
      ...(input.hasPackCredits === true ? { has_pack_credits: true } : {}),
    },
    freePlanCreditCopy,
  };
}
