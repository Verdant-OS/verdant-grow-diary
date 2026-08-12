/**
 * aiDoctorCreditsExhaustedTeaserRules — pure view rules for the Plant Detail
 * "AI Doctor credits" retention/conversion marker.
 *
 * Free-plan grows get a fixed, non-renewing AI Doctor credit allotment
 * (aiCreditsPerGrow) — unlike Pro's monthly-renewing pool. The doctor
 * surfaces themselves stay silent about credit state (they intentionally
 * show no paywall/upgrade copy — see PlantDetailAiDoctorLiveReview's
 * plan-neutral denial notice). This module is for a calm, separate,
 * Plant-Detail-level nudge with two moments:
 *   - "low": exactly one credit left, and the grower has already spent at
 *     least one — they're mid-demand, not yet blocked. Catching this before
 *     the hard wall converts better than a deny-time message ever will.
 *   - "exhausted": the allotment is fully spent (unchanged from the
 *     original teaser) — the moment demand is undeniable.
 *
 * Hard constraints (repo rules-module style, matches plantLogStreakRules):
 *   - Pure & deterministic: no I/O, no React, no Date reads.
 *   - Honest: shown only when the grow's own recorded usage has reached its
 *     own resolved threshold — never a guess, never an estimate.
 *   - Calm copy: no pressure mechanics, no loss-aversion wording, none of
 *     the banned marketing words (see paywallCtaViewModel banned list).
 *   - The teaser NEVER hides data — it is an additive one-line link.
 *   - Presentation-only: this never gates AI Doctor access itself: real
 *     spend attempts are still checked server-side by ai_credit_spend.
 */

export interface AiDoctorCreditsExhaustedTeaserInput {
  /** True when the resolved plan is free (teaser eligibility). */
  isFreePlan: boolean;
  /** This grow's fixed per-grow AI Doctor credit allotment (capabilities.aiCreditsPerGrow). */
  limit: number | null | undefined;
  /** Sum of ai_credit_spends.weight for this user + grow (mirrors the server-side usage check exactly). */
  used: number | null | undefined;
}

export type AiDoctorCreditsTeaserState = "none" | "low" | "exhausted";

export interface AiDoctorCreditsExhaustedTeaserView {
  /** True only when limit/used both resolved to finite, sane values. */
  resolved: boolean;
  remaining: number;
  teaser: {
    show: boolean;
    state: AiDoctorCreditsTeaserState;
    copy: string;
    ctaLabel: string;
    href: string;
  };
}

export const AI_DOCTOR_CREDITS_TEASER_COPY =
  "This grow's AI Doctor credits are used up. Pro credits reset every month.";

export const AI_DOCTOR_CREDITS_LOW_COPY =
  "This grow has 1 AI Doctor credit left. Pro credits reset every month.";

export const AI_DOCTOR_CREDITS_TEASER_CTA_LABEL = "See plans";
export const AI_DOCTOR_CREDITS_TEASER_HREF = "/pricing";

function isFiniteNonNegative(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

export function buildAiDoctorCreditsExhaustedTeaserView(
  input: AiDoctorCreditsExhaustedTeaserInput,
): AiDoctorCreditsExhaustedTeaserView {
  const resolved =
    isFiniteNonNegative(input.limit) && input.limit > 0 && isFiniteNonNegative(input.used);

  const HIDDEN_TEASER = {
    show: false,
    state: "none" as const,
    copy: AI_DOCTOR_CREDITS_TEASER_COPY,
    ctaLabel: AI_DOCTOR_CREDITS_TEASER_CTA_LABEL,
    href: AI_DOCTOR_CREDITS_TEASER_HREF,
  };

  if (!resolved) {
    return { resolved: false, remaining: 0, teaser: HIDDEN_TEASER };
  }

  const remaining = Math.max(input.limit! - input.used!, 0);
  const exhausted = remaining <= 0;
  // Only warn once the grower has actually spent at least one credit — a
  // fresh, untouched grow with a small limit must never look "low".
  const low = !exhausted && remaining === 1 && input.used! > 0;

  if (input.isFreePlan !== true || (!exhausted && !low)) {
    return { resolved: true, remaining, teaser: HIDDEN_TEASER };
  }

  const state: AiDoctorCreditsTeaserState = exhausted ? "exhausted" : "low";

  return {
    resolved: true,
    remaining,
    teaser: {
      show: true,
      state,
      copy: exhausted ? AI_DOCTOR_CREDITS_TEASER_COPY : AI_DOCTOR_CREDITS_LOW_COPY,
      ctaLabel: AI_DOCTOR_CREDITS_TEASER_CTA_LABEL,
      href: AI_DOCTOR_CREDITS_TEASER_HREF,
    },
  };
}
