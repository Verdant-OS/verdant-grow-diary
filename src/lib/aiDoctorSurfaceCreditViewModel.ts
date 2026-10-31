/**
 * aiDoctorSurfaceCreditViewModel — pure presentation rules for the AI Doctor
 * surface credit balance and Free plan 3-credit allowance text (#2161).
 *
 * Pure: no React, no Supabase, no fetch, no Date reads.
 * No CTA, no upgrade link, no urgency language.
 */
import type { AiCreditRemainingInput } from "@/lib/aiCreditRemainingBadgeViewModel";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";
import type { ResolvedEntitlement } from "@/lib/entitlements/types";

export const AI_DOCTOR_FREE_PLAN_CREDIT_ALLOWANCE = FREE_CAPABILITIES.aiCreditsPerGrow ?? 3;
export const AI_DOCTOR_STAFF_MONTHLY_CREDIT_ALLOWANCE = 10000;

export const AI_DOCTOR_FREE_PLAN_CREDIT_COPY =
  `Free plan includes ${AI_DOCTOR_FREE_PLAN_CREDIT_ALLOWANCE} AI Doctor credits per grow.` as const;

/**
 * Resolves the authoritative billing environment (`"live"` | `"sandbox"`) from
 * an explicit override or configured `PAYMENTS_ENVIRONMENT` /
 * `VITE_PAYMENTS_ENVIRONMENT` setting, or `null` when unresolved.
 */
export function resolveAuthoritativeBillingEnvironment(
  explicit?: string | null,
): "live" | "sandbox" | null {
  const candidate =
    explicit ??
    (typeof process !== "undefined" ? process.env?.PAYMENTS_ENVIRONMENT : undefined) ??
    (import.meta.env?.VITE_PAYMENTS_ENVIRONMENT as string | undefined);
  if (candidate === "live" || candidate === "sandbox") {
    return candidate;
  }
  return null;
}

export interface AiDoctorSpendRowLike {
  id?: string | null;
  grow_id?: string | null;
  period_key?: string | null;
  refund_of?: string | null;
  weight: number | null;
  funded_by: string | null;
  billing_environment?: string | null;
}

export interface AiDoctorGrantRowLike {
  credits: number | null;
  environment?: string | null;
  expires_at: string | null;
}

/**
 * Formats a UTC Date as a `YYYY-MM` period key matching `ai_credit_spend`'s
 * `to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM')`.
 */
export function formatAiCreditUtcPeriodKey(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Sums allowance-funded spend weights for a grow, excluding pack-funded rows
 * (`funded_by === "pack"`) to mirror the server's per-grow allowance arm.
 */
export function sumAiDoctorAllowanceSpends(
  rows: ReadonlyArray<AiDoctorSpendRowLike> | null | undefined,
  growId?: string | null,
): number {
  return (rows ?? []).reduce((sum, row) => {
    if (row.funded_by === "pack") return sum;
    if (growId && row.grow_id !== undefined && row.grow_id !== growId) return sum;
    return sum + (row.weight ?? 0);
  }, 0);
}

/**
 * Sums allowance-funded spend weights for a UTC `YYYY-MM` period key,
 * excluding pack-funded rows to mirror the server's monthly allowance arm.
 */
export function sumAiDoctorMonthlyAllowanceSpends(
  rows: ReadonlyArray<AiDoctorSpendRowLike> | null | undefined,
  periodKey: string,
): number {
  return (rows ?? []).reduce((sum, row) => {
    if (row.funded_by === "pack") return sum;
    if (row.period_key !== undefined && row.period_key !== periodKey) return sum;
    return sum + (row.weight ?? 0);
  }, 0);
}

/**
 * Computes the authoritative environment-scoped pack balance (`v_pack_granted -
 * v_pack_used`) matching `ai_credit_spend` in
 * `20260728090736_ai_credit_pack_portability.sql`.
 */
export function computeAiCreditPackBalance(args: {
  grantRows: ReadonlyArray<AiDoctorGrantRowLike> | null | undefined;
  spendRows: ReadonlyArray<AiDoctorSpendRowLike> | null | undefined;
  billingEnvironment: "live" | "sandbox";
  nowMs: number;
}): number {
  const { grantRows, spendRows, billingEnvironment, nowMs } = args;

  const packGranted = (grantRows ?? []).reduce((sum, row) => {
    const env =
      typeof row.environment === "string" && row.environment.length > 0 ? row.environment : "live";
    if (env !== billingEnvironment) return sum;
    if (row.expires_at != null) {
      const expiresAtMs = Date.parse(row.expires_at);
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) return sum;
    }
    if (typeof row.credits !== "number" || !Number.isFinite(row.credits)) return sum;
    return sum + row.credits;
  }, 0);

  const spendById = new Map<string, AiDoctorSpendRowLike>();
  for (const row of spendRows ?? []) {
    if (typeof row.id === "string" && row.id.length > 0) {
      spendById.set(row.id, row);
    }
  }

  const packUsed = (spendRows ?? []).reduce((sum, row) => {
    if (row.funded_by !== "pack") return sum;
    const parentEnv =
      typeof row.refund_of === "string" ? spendById.get(row.refund_of)?.billing_environment : null;
    const resolvedEnv =
      typeof row.billing_environment === "string" && row.billing_environment.length > 0
        ? row.billing_environment
        : typeof parentEnv === "string" && parentEnv.length > 0
          ? parentEnv
          : "live";
    if (resolvedEnv !== billingEnvironment) return sum;
    if (typeof row.weight !== "number" || !Number.isFinite(row.weight)) return sum;
    return sum + row.weight;
  }, 0);

  return Math.max(Math.floor(packGranted - packUsed), 0);
}

export interface AiDoctorSurfaceCreditInput {
  entitlement?: ResolvedEntitlement | null;
  entitlementLoading?: boolean;
  entitlementLookupFailed?: boolean;
  /** Allowance-funded credits used on the current grow, when resolved. */
  allowanceUsed?: number | null;
  /** Allowance-funded credits used in the current UTC month, when resolved. */
  monthlyUsed?: number | null;
  /**
   * Authoritative environment-scoped remaining pack credits, when resolved.
   * `null`/omitted means unresolved: the pre-run badge is then labelled as the
   * included allowance only, never as a total balance.
   */
  packBalance?: number | null;
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

function resolveValidDeniedCredit(
  deniedCredit: AiDoctorSurfaceCreditInput["deniedCredit"],
): AiCreditRemainingInput | null {
  if (!deniedCredit) return null;
  if (deniedCredit.scope !== "per_grow" && deniedCredit.scope !== "per_month") return null;
  if (
    typeof deniedCredit.remaining !== "number" ||
    !Number.isFinite(deniedCredit.remaining) ||
    deniedCredit.remaining < 0
  ) {
    return null;
  }
  if (
    typeof deniedCredit.scope_limit !== "number" ||
    !Number.isFinite(deniedCredit.scope_limit) ||
    deniedCredit.scope_limit <= 0
  ) {
    return null;
  }
  return {
    remaining: Math.floor(deniedCredit.remaining),
    scope: deniedCredit.scope,
    scope_limit: Math.floor(deniedCredit.scope_limit),
  };
}

/**
 * Resolves which allowance bucket the server will meter for this viewer, from
 * the EFFECTIVE entitlement only (mirrors `ai_credit_spend`): verified staff
 * use the 10,000 monthly ceiling; an effective monthly bucket (active Pro /
 * Craft / Founder) uses `aiMonthlyCredits`; everything else — including a
 * paused or expired Founder whose capabilities degraded to Free — uses the
 * per-grow Free allowance. Display identity (`displayPlanId`) never selects a
 * quota; Founder upsell suppression is handled elsewhere.
 */
export function resolveAiDoctorEffectiveMonthlyLimit(
  entitlement: ResolvedEntitlement | null | undefined,
): number | null {
  if (entitlement?.isStaff === true) return AI_DOCTOR_STAFF_MONTHLY_CREDIT_ALLOWANCE;
  const caps = entitlement?.capabilities;
  const monthly = caps?.aiMonthlyCredits;
  const perGrow = caps?.aiCreditsPerGrow;
  if (
    typeof monthly === "number" &&
    Number.isFinite(monthly) &&
    monthly > 0 &&
    !(typeof perGrow === "number" && perGrow > 0)
  ) {
    return Math.floor(monthly);
  }
  return null;
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

  const packBalanceResolved =
    typeof input.packBalance === "number" &&
    Number.isFinite(input.packBalance) &&
    input.packBalance >= 0;
  const resolvedPackBalance = packBalanceResolved ? Math.floor(input.packBalance as number) : 0;
  const packFields = packBalanceResolved
    ? resolvedPackBalance > 0
      ? { pack_balance: resolvedPackBalance }
      : {}
    : { allowance_only: true };

  const monthlyLimit = resolveAiDoctorEffectiveMonthlyLimit(input.entitlement);

  if (monthlyLimit !== null) {
    if (input.postSpendCredit) {
      return {
        creditRemaining: input.postSpendCredit,
        freePlanCreditCopy: null,
      };
    }
    if (input.deniedCredit) {
      const denied = resolveValidDeniedCredit(input.deniedCredit);
      return {
        creditRemaining: denied && denied.scope === "per_month" ? denied : null,
        freePlanCreditCopy: null,
      };
    }
    if (
      input.allowanceReadFailed !== true &&
      typeof input.monthlyUsed === "number" &&
      Number.isFinite(input.monthlyUsed) &&
      input.monthlyUsed >= 0
    ) {
      const used = Math.floor(input.monthlyUsed);
      return {
        creditRemaining: {
          remaining: Math.max(monthlyLimit - used, 0),
          scope: "per_month",
          scope_limit: monthlyLimit,
          ...packFields,
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

  if (input.deniedCredit) {
    return {
      creditRemaining: resolveValidDeniedCredit(input.deniedCredit),
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
      ...packFields,
    },
    freePlanCreditCopy,
  };
}
