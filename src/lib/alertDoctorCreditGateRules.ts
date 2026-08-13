/**
 * alertDoctorCreditGateRules — pure view rules for intercepting the
 * tent-alerts panel's "Ask AI Doctor" row action when a free grow's AI
 * Doctor credits are exhausted.
 *
 * Without the gate, that click routes an out-of-credits free grower into a
 * dead end: the review section can only show the server-side quota denial.
 * The gate swaps the row action, honestly labeled, for the pricing surface
 * instead — and pairs it with a single calm reason line at panel level so
 * the swap never reads as a bait-and-switch.
 *
 * Hard constraints:
 *  - Pure & deterministic: no I/O, no React, no Date reads.
 *  - Fail-open: while the entitlement or usage read is unresolved (loading,
 *    lookup failure, missing grow), the gate must NOT intercept — an
 *    unverified viewer may be entitled, and a broken read must never take
 *    away a working CTA. Same doctrine as the blueprint_locked impression
 *    gate in PlantBlueprintOverlaySection.
 *  - Presentation-only: the server-side ai_credit_spend check remains the
 *    only spend authority; this never gates AI Doctor access itself.
 *  - No plan-string comparison: eligibility derives from the per-grow
 *    allotment capability (aiCreditsPerGrow is a number on free-taste
 *    plans, null on monthly-pool plans), never from a plan id literal.
 *  - The "low" teaser state deliberately does NOT intercept — a grower
 *    with a credit left keeps a working doctor CTA.
 *  - Pack overflow fails open: the spend contract lets EVERY plan draw
 *    purchased/granted pack credits once the included allowance is spent
 *    (ai_credit_pack_portability migration), so an exhausted allowance
 *    alone never proves the doctor CTA is a dead end. Any sign of pack
 *    ownership — or an unresolved pack read — suppresses interception.
 */
import {
  buildAiDoctorCreditsExhaustedTeaserView,
  AI_DOCTOR_CREDITS_TEASER_COPY,
  AI_DOCTOR_CREDITS_TEASER_CTA_LABEL,
  AI_DOCTOR_CREDITS_TEASER_HREF,
} from "@/lib/aiDoctorCreditsExhaustedTeaserRules";

/**
 * Funnel `surface` token for both the panel-level impression
 * (paywall_viewed) and the row-level click (paywall_cta_clicked).
 * Enum-like, id-free, sanitizer-safe.
 */
export const ALERT_DOCTOR_CREDIT_GATE_SURFACE = "alert_doctor_credits";

export interface AlertDoctorCreditGateInput {
  /**
   * capabilities.aiCreditsPerGrow — a number on per-grow-allotment (free)
   * plans, null on monthly-pool plans. Doubles as plan eligibility.
   */
  aiCreditsPerGrow: number | null | undefined;
  /** True only when the entitlement lookup finished AND did not fail. */
  entitlementReady: boolean;
  /**
   * ALLOWANCE-funded spend weight for this user + grow — pack-funded rows
   * excluded, mirroring the server's allowance arm; undefined while
   * loading.
   */
  creditsUsed: number | null | undefined;
  /**
   * True when the user owns any unexpired grant row (any environment) —
   * pack overflow could still fund a spend, so the gate must not
   * intercept. Undefined while loading — also fails open.
   */
  hasPackCredits: boolean | undefined;
}

export interface AlertDoctorCreditGateView {
  /** Swap the row's doctor CTA for the plans link + show the reason note. */
  intercept: boolean;
  /** Panel-level reason line. Calm copy shared with the #758 teaser rules. */
  note: string;
  ctaLabel: string;
  href: string;
}

export function buildAlertDoctorCreditGate(
  input: AlertDoctorCreditGateInput,
): AlertDoctorCreditGateView {
  const base = {
    note: AI_DOCTOR_CREDITS_TEASER_COPY,
    ctaLabel: AI_DOCTOR_CREDITS_TEASER_CTA_LABEL,
    href: AI_DOCTOR_CREDITS_TEASER_HREF,
  };
  if (input.entitlementReady !== true) return { intercept: false, ...base };
  // Strict false only: undefined (still loading) and true (packs owned)
  // both fail open — pack overflow could fund the spend server-side.
  if (input.hasPackCredits !== false) return { intercept: false, ...base };
  const view = buildAiDoctorCreditsExhaustedTeaserView({
    isFreePlan: typeof input.aiCreditsPerGrow === "number",
    limit: input.aiCreditsPerGrow,
    used: input.creditsUsed,
  });
  return {
    intercept: view.resolved && view.teaser.state === "exhausted",
    ...base,
  };
}
