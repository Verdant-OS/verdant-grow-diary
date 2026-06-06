/**
 * aiCreditServiceDegradedViewModel — shared pure view model for the
 * `upstream_credit_exhausted` envelope reason.
 *
 * The upstream model provider returned 402 (or equivalent) after the
 * grower's local credit was already refunded by the edge function. This
 * is a transient service-degradation, NOT a grower paywall:
 *
 *  - MUST NOT render any upgrade CTA, paywall, pricing link, or upsell.
 *  - MUST NOT imply the grower was charged.
 *  - Calm, expected copy. No urgency.
 *
 * Pure: no React, no Supabase, no I/O, no Date reads.
 */

export type AiCreditServiceDegradedSurface = "doctor" | "coach";

export interface AiCreditServiceDegradedViewModel {
  surface: AiCreditServiceDegradedSurface;
  title: string;
  body: string;
  /** Always false. Server-side refund happens before this reason is emitted. */
  charged: false;
  /** Always false. Hard fence against paywall regressions. */
  showPaywallCta: false;
}

const DOCTOR_TITLE = "AI Doctor is briefly unavailable.";
const COACH_TITLE = "AI Coach is briefly unavailable.";
const BODY =
  "The upstream AI service is temporarily out of capacity. Your request was not charged. Please try again shortly.";

export function buildAiCreditServiceDegradedViewModel(
  surface: AiCreditServiceDegradedSurface,
): AiCreditServiceDegradedViewModel {
  return {
    surface,
    title: surface === "coach" ? COACH_TITLE : DOCTOR_TITLE,
    body: BODY,
    charged: false,
    showPaywallCta: false,
  };
}
