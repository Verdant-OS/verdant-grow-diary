/**
 * aiDoctorEntitlementRules — pure, presenter-facing entitlement rules for
 * the AI Doctor upsell prompt.
 *
 * Why this exists:
 *   Server-side credit denials carry a `plan_id` we trust for branching
 *   (free → upsell, paid → wait). However, a stale or misrouted denial
 *   payload can mark a paid/founder viewer's request with `plan_id="free"`,
 *   which would incorrectly show the founder a premium upgrade prompt.
 *
 *   This helper provides a defensive client-side bypass driven by the
 *   viewer's resolved entitlement (which itself comes from the
 *   `billing_subscriptions` RLS-protected read). It NEVER grants AI
 *   credits, NEVER mutates server usage logging, and NEVER skips a
 *   denial — it only downgrades a misclassified "upsell" notice into a
 *   plan-neutral "wait" notice for paid/founder viewers.
 *
 * Hard safety rules honored:
 *   - No I/O, no React, no Supabase, no fetch, no AI calls.
 *   - No schema/RLS/Edge/auth/migration changes.
 *   - No Action Queue mutations.
 *   - No device control.
 *   - No secret/PII rendering.
 *   - Server usage/cost logging is unaffected (this only changes UI copy).
 *   - Default fail-closed for unknown viewers — they get the same gating
 *     as before (no founder bypass leaks to free users).
 *
 * Out of scope (do not add here):
 *   - Granting credits.
 *   - Bypassing per-grow / per-month server limits.
 *   - Treating a non-founder as founder.
 */

import type {
  PlanId,
  ResolvedEntitlement,
} from "@/lib/entitlements/types";

/** Plans whose viewer should NEVER see a "free → upsell" AI Doctor prompt. */
const PAID_PLAN_IDS: ReadonlySet<PlanId> = new Set<PlanId>([
  "pro_monthly",
  "pro_annual",
  "founder_lifetime",
]);

/** Founder/builder/internal plan — full bypass of upsell prompt. */
const FOUNDER_PLAN_IDS: ReadonlySet<PlanId> = new Set<PlanId>([
  "founder_lifetime",
]);

export interface AiDoctorEntitlementInput {
  /** Resolved client entitlement, or null when unknown/loading/signed-out. */
  entitlement: ResolvedEntitlement | null | undefined;
}

export interface AiDoctorEntitlementView {
  /** True for founder_lifetime viewers (any status, active or degraded). */
  isFounder: boolean;
  /** True for any pro/founder viewer (active OR degraded display plan). */
  isPaidViewer: boolean;
  /** True when the viewer should bypass premium upsell prompts. */
  bypassesUpsell: boolean;
  /** Human-readable, NON-IDENTIFYING reason for the resolved view. */
  reason:
    | "founder_bypass"
    | "paid_plan_bypass"
    | "free_or_unknown_viewer";
}

/**
 * Resolve the viewer's AI Doctor entitlement view from their resolved
 * billing entitlement. Pure; no I/O.
 */
export function resolveAiDoctorEntitlementView(
  input: AiDoctorEntitlementInput,
): AiDoctorEntitlementView {
  const ent = input.entitlement ?? null;
  if (!ent) {
    return {
      isFounder: false,
      isPaidViewer: false,
      bypassesUpsell: false,
      reason: "free_or_unknown_viewer",
    };
  }

  // displayPlanId retains plan identity even when capabilities have
  // degraded to free (e.g. paused). For UPSELL SUPPRESSION purposes we
  // honor the display identity, because a founder whose row briefly
  // degrades must still never see "upgrade to Pro" copy.
  const display: PlanId = ent.displayPlanId;
  const effective: PlanId = ent.effectivePlanId;

  const isFounder =
    FOUNDER_PLAN_IDS.has(display) || FOUNDER_PLAN_IDS.has(effective);
  const isPaidViewer =
    isFounder ||
    PAID_PLAN_IDS.has(display) ||
    PAID_PLAN_IDS.has(effective);

  if (isFounder) {
    return {
      isFounder: true,
      isPaidViewer: true,
      bypassesUpsell: true,
      reason: "founder_bypass",
    };
  }
  if (isPaidViewer) {
    return {
      isFounder: false,
      isPaidViewer: true,
      bypassesUpsell: true,
      reason: "paid_plan_bypass",
    };
  }
  return {
    isFounder: false,
    isPaidViewer: false,
    bypassesUpsell: false,
    reason: "free_or_unknown_viewer",
  };
}

/**
 * Decide the effective AI-credit-notice plan_id to feed downstream view
 * models. If the server denial reported `plan_id="free"` but the viewer
 * is provably on a paid/founder plan client-side, return the viewer's
 * actual plan instead so the notice resolves to plan-neutral "wait"
 * copy rather than an upsell prompt.
 *
 * This NEVER changes a non-free denial. It NEVER promotes a free
 * viewer. It NEVER silences the notice — only the upsell variant is
 * downgraded for misclassified paid/founder viewers.
 */
export function reconcileAiCreditDenialPlanId(args: {
  denialPlanId: string | null | undefined;
  view: AiDoctorEntitlementView;
}): string | null | undefined {
  const { denialPlanId, view } = args;
  if (!view.bypassesUpsell) return denialPlanId ?? null;
  if (denialPlanId === "free") {
    return view.isFounder ? "founder_lifetime" : "pro_monthly";
  }
  return denialPlanId ?? null;
}
