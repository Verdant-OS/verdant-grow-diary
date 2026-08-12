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
import { buildPaywallCtaViewModel, type PaywallCtaViewModel } from "@/lib/paywallCtaViewModel";
import {
  reconcileAiCreditDenialPlanId,
  resolveAiDoctorEntitlementView,
  type AiDoctorEntitlementView,
} from "@/lib/aiDoctorEntitlementRules";
import { sanitizeCheckoutReturnTo } from "@/lib/checkoutReturnTo";
import { isKnownPlanId, PLAN_CATALOG } from "@/lib/entitlements/planCatalog";
import { SUBSCRIPTION_PLAN_IDS } from "@/lib/paidPlanAllowlist";
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
  /**
   * Top-up destination. Only populated on `wait` — the branch whose viewer is
   * actually allowed to buy a pack. Never set on upsell/unknown.
   */
  packHref?: string;
}

/**
 * Recurring/lifetime plans, derived from the single-source allowlist rather
 * than copied. This list used to be a local literal; a tier added to
 * PAID_PLAN_IDS but missed here would show a paying subscriber the "unknown"
 * copy instead of "wait". Credit packs are excluded on purpose — a pack id in
 * `credit.plan_id` is not a plan and must not resolve to "wait".
 */
const PAID_PLAN_IDS: ReadonlySet<string> = new Set(SUBSCRIPTION_PLAN_IDS);

interface SurfaceCopy {
  featureTitle: string;
  waitTitleFeature: string;
  upsellTitle: string;
  upsellBody: string;
  waitBody: string;
  unknownTitle: string;
  unknownBody: string;
}

const DOCTOR_COPY: SurfaceCopy = {
  featureTitle: "AI Doctor",
  waitTitleFeature: "AI Doctor",
  upsellTitle: "You've used your AI Doctor checks for this grow.",
  upsellBody:
    "Free grows include 3 AI Doctor checks. Pro gives you 100 AI checks per month across every grow. This request was not charged.",
  waitBody:
    "Your monthly allowance resets on the 1st of the month (UTC). This request was not charged. Existing analyses stay available.",
  unknownTitle: "You've reached an AI Doctor limit.",
  unknownBody: "This request was not charged. Please try again later.",
};

const COACH_COPY: SurfaceCopy = {
  featureTitle: "AI Coach",
  waitTitleFeature: "AI",
  upsellTitle: "You've used your AI Coach checks for this grow.",
  upsellBody:
    "Free grows include 3 AI checks. Pro gives you 100 AI checks per month across every grow. This request was not charged.",
  waitBody:
    "Your monthly allowance resets on the 1st of the month (UTC). This request was not charged. Existing notes stay available.",
  unknownTitle: "You've reached an AI Coach limit.",
  unknownBody: "This request was not charged. Please try again later.",
};

function copyFor(surface: AiCreditLimitNoticeSurface): SurfaceCopy {
  return surface === "coach" ? COACH_COPY : DOCTOR_COPY;
}

function paidMonthlyCreditAllowance(planId: string): number | null {
  if (!isKnownPlanId(planId) || planId === "free") return null;
  const allowance = PLAN_CATALOG[planId].aiMonthlyCredits;
  return typeof allowance === "number" && Number.isSafeInteger(allowance) && allowance > 0
    ? allowance
    : null;
}

function paidWaitTitle(copy: SurfaceCopy, allowance: number): string {
  return `You've used your ${allowance} ${copy.waitTitleFeature} checks this month.`;
}

export interface AiCreditLimitNoticeInput {
  credit: AiCreditDenial;
  currentPlanLabel?: string;
  /** Defaults to "doctor" to preserve S3.0 behavior. */
  surface?: AiCreditLimitNoticeSurface;
  /**
   * Optional same-origin route to restore after a confirmed checkout.
   * Invalid or external paths deliberately fall back to the plain pricing page.
   */
  returnTo?: string | null;
  /**
   * Optional viewer entitlement. When provided, paid/founder viewers
   * bypass the "free → upsell" branch defensively, even if the server
   * denial mis-tagged plan_id="free". Never grants credits; only
   * downgrades upsell copy to plan-neutral "wait" copy.
   */
  viewerEntitlement?: ResolvedEntitlement | null;
  /**
   * False when the viewer entitlement read failed. In that state the client
   * cannot safely use fallback Free to reinforce an upsell, so copy remains
   * plan-neutral even if a denial payload says Free.
   */
  viewerEntitlementVerified?: boolean;
}

function buildPricingHref(returnTo: string | null | undefined): string {
  const safeReturnTo = sanitizeCheckoutReturnTo(returnTo);
  return safeReturnTo
    ? `/pricing?${new URLSearchParams({ returnTo: safeReturnTo }).toString()}`
    : "/pricing";
}

/** Anchor Pricing scrolls to for the one-time credit-pack section. */
const CREDIT_PACK_HASH = "#buy-credits";

/**
 * Top-up destination for the paid `wait` notice.
 *
 * The hash stays LAST, after any query, because the two halves are read by
 * different consumers: Pricing scrolls on `location.hash`, while the checkout
 * hook reads `returnTo` out of `location.search` to build the post-purchase
 * landing. Putting the return path in the fragment would scroll correctly and
 * then silently strand the buyer, which is the exact bug this closes.
 *
 * With no safe return path this yields the bare `/pricing#buy-credits` — what
 * the link was before it could carry one — so existing call sites and their
 * pins stay byte-for-byte identical.
 */
export function buildCreditPackHref(returnTo: string | null | undefined): string {
  return `${buildPricingHref(returnTo)}${CREDIT_PACK_HASH}`;
}

export function buildAiCreditLimitNoticeViewModel(
  input: AiCreditLimitNoticeInput,
): AiCreditLimitNoticeViewModel {
  const surface: AiCreditLimitNoticeSurface = input.surface ?? "doctor";
  const copy = copyFor(surface);
  if (input.viewerEntitlementVerified === false) {
    return {
      kind: "unknown",
      surface,
      title: copy.unknownTitle,
      body: copy.unknownBody,
      charged: false,
    };
  }
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
      pricingHref: buildPricingHref(input.returnTo),
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
    const allowance = paidMonthlyCreditAllowance(planId);
    if (allowance == null) {
      return {
        kind: "unknown",
        surface,
        title: copy.unknownTitle,
        body: copy.unknownBody,
        charged: false,
      };
    }
    return {
      kind: "wait",
      surface,
      title: paidWaitTitle(copy, allowance),
      body: copy.waitBody,
      charged: false,
      packHref: buildCreditPackHref(input.returnTo),
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
