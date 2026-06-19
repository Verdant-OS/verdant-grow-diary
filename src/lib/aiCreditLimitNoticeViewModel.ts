/**
 * aiCreditLimitNoticeViewModel — pure view model for AI credit-denial
 * notices, shared between the AI Doctor (S3.0) and AI Coach (S3.2)
 * surfaces.
 *
 * Branching rule (CRITICAL): decide upsell vs wait vs unknown using the
 * server-supplied `credit.plan_id` from the denial payload. Never default
 * to "upsell". A paying user must never see an upgrade prompt.
 *
 * The optional `surface` switch picks between Doctor and Coach copy.
 * Default is "doctor" so existing call sites stay byte-for-byte identical.
 *
 * Pure: no React, no Supabase, no I/O.
 */
import {
  buildPaywallCtaViewModel,
  type PaywallCtaViewModel,
} from "@/lib/paywallCtaViewModel";
import {
  reconcileAiCreditDenialPlanId,
  resolveAiDoctorEntitlementView,
  type AiDoctorEntitlementView,
} from "@/lib/aiDoctorEntitlementRules";
import type { ResolvedEntitlement } from "@/lib/entitlements/types";

export type AiCreditDenialScope = "per_grow" | "per_month" | string;

export interface AiCreditDenial {
  ok: false;
  status: "denied";
  reason: "limit_reached" | string;
  scope: AiCreditDenialScope;
  scope_used?: number;
  scope_limit?: number;
  remaining?: number;
  plan_id?: string | null;
  period_key?: string | null;
}

export type AiCreditLimitNoticeKind = "upsell" | "wait" | "unknown";
export type AiCreditLimitNoticeSurface = "doctor" | "coach";

export interface AiCreditLimitNoticeViewModel {
  kind: AiCreditLimitNoticeKind;
  surface: AiCreditLimitNoticeSurface;
  title: string;
  body: string;
  /** Always false — denial happens before the model call. */
  charged: false;
  /** Only populated on `upsell`. Never set on wait/unknown. */
  paywallVm?: PaywallCtaViewModel;
}

const PAID_PLAN_IDS = new Set([
  "pro_monthly",
  "pro_annual",
  "founder_lifetime",
]);

interface SurfaceCopy {
  featureTitle: string;
  upsellTitle: string;
  upsellBody: string;
  waitTitle: string;
  waitBody: string;
  unknownTitle: string;
  unknownBody: string;
}

const DOCTOR_COPY: SurfaceCopy = {
  featureTitle: "AI Doctor",
  upsellTitle: "You've used your AI Doctor checks for this grow.",
  upsellBody:
    "Free grows include 3 AI Doctor checks. Pro gives you 100 AI checks per month across every grow. This request was not charged.",
  waitTitle: "You've used your 100 AI Doctor checks this month.",
  waitBody:
    "Your monthly allowance resets on the 1st of the month (UTC). This request was not charged. Existing analyses stay available.",
  unknownTitle: "You've reached an AI Doctor limit.",
  unknownBody: "This request was not charged. Please try again later.",
};

const COACH_COPY: SurfaceCopy = {
  featureTitle: "AI Coach",
  upsellTitle: "You've used your AI Coach checks for this grow.",
  upsellBody:
    "Free grows include 3 AI checks. Pro gives you 100 AI checks per month across every grow. This request was not charged.",
  waitTitle: "You've used your 100 AI checks this month.",
  waitBody:
    "Your monthly allowance resets on the 1st of the month (UTC). This request was not charged. Existing notes stay available.",
  unknownTitle: "You've reached an AI Coach limit.",
  unknownBody: "This request was not charged. Please try again later.",
};

function copyFor(surface: AiCreditLimitNoticeSurface): SurfaceCopy {
  return surface === "coach" ? COACH_COPY : DOCTOR_COPY;
}


export interface AiCreditLimitNoticeInput {
  credit: AiCreditDenial;
  currentPlanLabel?: string;
  /** Defaults to "doctor" to preserve S3.0 behavior. */
  surface?: AiCreditLimitNoticeSurface;
  /**
   * Optional viewer entitlement. When provided, paid/founder viewers
   * bypass the "free → upsell" branch defensively, even if the server
   * denial mis-tagged plan_id="free". Never grants credits; only
   * downgrades upsell copy to plan-neutral "wait" copy.
   */
  viewerEntitlement?: ResolvedEntitlement | null;
}

export function buildAiCreditLimitNoticeViewModel(
  input: AiCreditLimitNoticeInput,
): AiCreditLimitNoticeViewModel {
  const surface: AiCreditLimitNoticeSurface = input.surface ?? "doctor";
  const copy = copyFor(surface);
  const viewerView: AiDoctorEntitlementView = resolveAiDoctorEntitlementView({
    entitlement: input.viewerEntitlement ?? null,
  });
  const planId = reconcileAiCreditDenialPlanId({
    denialPlanId: input.credit?.plan_id,
    view: viewerView,
  });

  if (planId === "free") {
    const paywallVm = buildPaywallCtaViewModel({
      featureTitle: copy.featureTitle,
      requiredPlanLabel: "Pro",
      currentPlanLabel: input.currentPlanLabel,
      primaryCtaLabel: "See plans",
      pricingHref: "/pricing",
      unlockBullets: [
        "100 AI Doctor checks per month across every grow",
        "Unlimited grows and full grow history",
        "Advanced timeline filtering and sensor snapshot history",
        "Exports and backups of your grow data",
      ],
      secondaryCopy: "This request was not charged.",
    });
    return {
      kind: "upsell",
      surface,
      title: copy.upsellTitle,
      body: copy.upsellBody,
      charged: false,
      paywallVm,
    };
  }

  if (typeof planId === "string" && PAID_PLAN_IDS.has(planId)) {
    return {
      kind: "wait",
      surface,
      title: copy.waitTitle,
      body: copy.waitBody,
      charged: false,
    };
  }

  return {
    kind: "unknown",
    surface,
    title: copy.unknownTitle,
    body: copy.unknownBody,
    charged: false,
  };
}
