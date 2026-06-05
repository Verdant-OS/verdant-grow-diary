/**
 * aiCreditLimitNoticeViewModel — pure view model for the AI Doctor
 * credit-denial notice.
 *
 * Branching rule (CRITICAL): decide upsell vs wait vs unknown using the
 * server-supplied `credit.plan_id` from the denial payload. Never default
 * to "upsell". A paying user must never see an upgrade prompt.
 *
 * Pure: no React, no Supabase, no I/O.
 */
import {
  buildPaywallCtaViewModel,
  type PaywallCtaViewModel,
} from "@/lib/paywallCtaViewModel";

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

export interface AiCreditLimitNoticeViewModel {
  kind: AiCreditLimitNoticeKind;
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

const UPSELL_TITLE =
  "You've used your AI Doctor checks for this grow.";
const UPSELL_BODY =
  "Free grows include 3 AI Doctor checks. Pro gives you 100 AI checks per month across every grow. This request was not charged.";

const WAIT_TITLE = "You've used your 100 AI Doctor checks this month.";
const WAIT_BODY =
  "Your monthly allowance resets on the 1st of the month (UTC). This request was not charged. Existing analyses stay available.";

const UNKNOWN_TITLE = "You've reached an AI Doctor limit.";
const UNKNOWN_BODY =
  "This request was not charged. Please try again later.";

export interface AiCreditLimitNoticeInput {
  credit: AiCreditDenial;
  currentPlanLabel?: string;
}

export function buildAiCreditLimitNoticeViewModel(
  input: AiCreditLimitNoticeInput,
): AiCreditLimitNoticeViewModel {
  const planId = input.credit?.plan_id;

  if (planId === "free") {
    const paywallVm = buildPaywallCtaViewModel({
      featureTitle: "AI Doctor",
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
      title: UPSELL_TITLE,
      body: UPSELL_BODY,
      charged: false,
      paywallVm,
    };
  }

  if (typeof planId === "string" && PAID_PLAN_IDS.has(planId)) {
    return {
      kind: "wait",
      title: WAIT_TITLE,
      body: WAIT_BODY,
      charged: false,
    };
  }

  return {
    kind: "unknown",
    title: UNKNOWN_TITLE,
    body: UNKNOWN_BODY,
    charged: false,
  };
}
