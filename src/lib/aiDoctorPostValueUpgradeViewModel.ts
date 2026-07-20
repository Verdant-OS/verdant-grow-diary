/**
 * Pure post-value conversion rules for a successfully saved AI Doctor review.
 *
 * The upgrade path is deliberately stricter than the ordinary remaining-
 * credit badge. It requires the server-resolved plan identity returned by the
 * fresh credit spend, the exact Free 3-per-grow contract, a durable saved
 * session, and a settled client entitlement that does not identify an active
 * paid or Founder viewer. Missing or contradictory context fails closed.
 */
import type { AiCreditRemainingInput } from "@/lib/aiCreditRemainingBadgeViewModel";
import { sanitizeCheckoutReturnTo } from "@/lib/checkoutReturnTo";
import { resolveAiDoctorEntitlementView } from "@/lib/aiDoctorEntitlementRules";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";
import { PLAN_CATALOG } from "@/lib/entitlements/planCatalog";
import type { ResolvedEntitlement } from "@/lib/entitlements/types";
import type { PaywallCtaViewModel } from "@/lib/paywallCtaViewModel";

export const AI_DOCTOR_POST_VALUE_UPGRADE_SURFACE = "ai_doctor_post_value" as const;
export const AI_DOCTOR_FREE_CREDITS_PER_GROW = FREE_CAPABILITIES.aiCreditsPerGrow ?? 0;
export const AI_DOCTOR_PRO_CREDITS_PER_MONTH = PLAN_CATALOG.pro_monthly.aiMonthlyCredits;

export interface AiDoctorPostValueUpgradeInput {
  credit: AiCreditRemainingInput | null | undefined;
  viewerEntitlement: ResolvedEntitlement | null | undefined;
  entitlementLoading: boolean;
  durableSessionSaved: boolean;
  returnTo?: string | null;
}

export type AiDoctorPostValueUpgradeViewModel =
  | Readonly<{ visible: false; paywallVm?: undefined }>
  | Readonly<{ visible: true; paywallVm: PaywallCtaViewModel }>;

const HIDDEN: AiDoctorPostValueUpgradeViewModel = Object.freeze({ visible: false });

function buildPricingHref(returnTo: string | null | undefined): string {
  const safeReturnTo = sanitizeCheckoutReturnTo(returnTo);
  return safeReturnTo
    ? `/pricing?${new URLSearchParams({ returnTo: safeReturnTo }).toString()}`
    : "/pricing";
}

function isExactFreePostValueCredit(
  credit: AiCreditRemainingInput | null | undefined,
): credit is AiCreditRemainingInput & {
  plan_id: "free";
  remaining: 0;
  scope: "per_grow";
  scope_limit: 3;
} {
  return (
    credit?.plan_id === "free" &&
    credit.scope === "per_grow" &&
    Number.isInteger(credit.remaining) &&
    credit.remaining === 0 &&
    Number.isInteger(credit.scope_limit) &&
    credit.scope_limit === AI_DOCTOR_FREE_CREDITS_PER_GROW
  );
}

export function buildAiDoctorPostValueUpgradeViewModel(
  input: AiDoctorPostValueUpgradeInput,
): AiDoctorPostValueUpgradeViewModel {
  if (input.entitlementLoading || !input.durableSessionSaved) return HIDDEN;
  if (!input.viewerEntitlement) return HIDDEN;
  if (!isExactFreePostValueCredit(input.credit)) return HIDDEN;

  const viewer = resolveAiDoctorEntitlementView({ entitlement: input.viewerEntitlement });
  if (viewer.bypassesUpsell) return HIDDEN;
  if (input.viewerEntitlement.effectivePlanId !== "free") return HIDDEN;
  if (
    input.viewerEntitlement.status === "unknown" ||
    input.viewerEntitlement.degradedReason === "unknown_plan_id" ||
    input.viewerEntitlement.degradedReason === "unknown_status"
  ) {
    return HIDDEN;
  }

  return {
    visible: true,
    paywallVm: {
      requiredPlanLabel: "Pro",
      currentPlanLabel: "Free",
      title: "Keep AI Doctor available for future checks",
      description: `This grow has used its ${AI_DOCTOR_FREE_CREDITS_PER_GROW} included AI credits. Pro adds a shared pool of ${AI_DOCTOR_PRO_CREDITS_PER_MONTH} AI credits per month across every grow.`,
      unlockBullets: [
        `${AI_DOCTOR_PRO_CREDITS_PER_MONTH} shared AI credits each month for AI Doctor and AI Coach`,
        "Unlimited grows and full grow history",
        "Advanced timeline filtering and sensor snapshot history",
        "Exports and backups of your grow data",
      ],
      primaryCtaLabel: "See Pro plans",
      primaryCtaHref: buildPricingHref(input.returnTo),
      secondaryCopy:
        "This review is saved in AI Doctor history. Nothing runs automatically—the grower decides when to request another check.",
    },
  };
}
