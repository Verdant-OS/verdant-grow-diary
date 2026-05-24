/**
 * dailyGrowCheckOnboardingRules — pure, deterministic helper that decides
 * the single most-useful next step for a grower setting up the Daily Grow
 * Check loop.
 *
 * Read-only logic. No persistence, no writes, no schema, no automation,
 * no device control. Reuses existing add/edit/move surfaces only.
 *
 * Priority (high → low):
 *   1. Active grow missing
 *   2. No tents
 *   3. No plants
 *   4. Plant exists but no tent assigned
 *   5. No manual sensor snapshot yet
 *   6. No QuickLog yet
 *   7. No Daily Grow Check activity today
 *   8. Ready
 *
 * The helper intentionally returns ONE next step at a time. Showing a
 * single clear action is friendlier than a checklist.
 */

export type OnboardingStep =
  | "add-grow"
  | "add-tent"
  | "add-plant"
  | "assign-plant"
  | "add-manual-snapshot"
  | "add-quicklog"
  | "run-daily-check"
  | "ready";

export interface OnboardingInput {
  /** When undefined, grow gating is skipped. When false, "add-grow" wins. */
  hasActiveGrow?: boolean;
  tentsCount: number;
  plantsCount: number;
  /** Count of plants in the grower's scope with no tent_id. */
  plantsWithoutTentCount: number;
  /** Optional focus plant (e.g. came from /daily-check?plantId=). */
  focusedPlantId?: string | null;
  focusedPlantTentId?: string | null;
  /** True if at least one manual (source = manual) sensor reading exists. */
  hasAnyManualSnapshot: boolean;
  /** True if at least one diary entry exists. */
  hasAnyQuickLog: boolean;
  /** True if today already shows manual snapshot or QuickLog activity. */
  hasTodayCheckActivity: boolean;
}

export interface OnboardingGuidance {
  step: OnboardingStep;
  /** Short headline copy. */
  title: string;
  /** One-sentence supporting copy. */
  subtitle: string;
  /** Primary CTA label. */
  ctaLabel: string;
  /** Existing in-app route the CTA should navigate to. */
  ctaHref: string;
  /** True when nothing remains to do — caller may hide the card. */
  isReady: boolean;
}

export const ONBOARDING_TITLE = "Set up your daily grow loop";
export const ONBOARDING_INTRO_SUBTITLE =
  "Start with one tent, one plant, and one manual snapshot.";

/**
 * Decide the single next-step guidance for a grower.
 *
 * Deterministic: identical inputs always yield identical outputs.
 */
export function deriveDailyGrowCheckOnboarding(
  input: OnboardingInput,
): OnboardingGuidance {
  // 1. Active grow missing (only if caller passed an explicit boolean).
  if (input.hasActiveGrow === false) {
    return {
      step: "add-grow",
      title: ONBOARDING_TITLE,
      subtitle: "Start a grow so tents, plants, and check activity can live somewhere.",
      ctaLabel: "Add Grow",
      ctaHref: "/grows",
      isReady: false,
    };
  }

  // 2. No tents.
  if (input.tentsCount <= 0) {
    return {
      step: "add-tent",
      title: ONBOARDING_TITLE,
      subtitle: "Add a tent so Verdant knows where this plant lives.",
      ctaLabel: "Add Tent",
      ctaHref: "/tents",
      isReady: false,
    };
  }

  // 3. No plants.
  if (input.plantsCount <= 0) {
    return {
      step: "add-plant",
      title: ONBOARDING_TITLE,
      subtitle: "Add your first plant to start tracking history.",
      ctaLabel: "Add Plant",
      ctaHref: "/plants",
      isReady: false,
    };
  }

  // 4. Plant exists but no tent assigned.
  //    Prefer a focused plant when caller passed one; otherwise trigger when
  //    every plant in scope is unassigned.
  const focusedPlantNeedsTent =
    !!input.focusedPlantId && !input.focusedPlantTentId;
  const allPlantsUnassigned =
    input.plantsCount > 0 && input.plantsWithoutTentCount >= input.plantsCount;
  if (focusedPlantNeedsTent || allPlantsUnassigned) {
    return {
      step: "assign-plant",
      title: ONBOARDING_TITLE,
      subtitle:
        "Assign this plant to a tent so environment context follows it.",
      ctaLabel: "Assign Plant to Tent",
      ctaHref: input.focusedPlantId
        ? `/plants/${input.focusedPlantId}`
        : "/plants",
      isReady: false,
    };
  }

  // 5. No manual snapshot yet (anywhere in scope).
  if (!input.hasAnyManualSnapshot) {
    return {
      step: "add-manual-snapshot",
      title: ONBOARDING_TITLE,
      subtitle:
        "Add your first manual snapshot. This is not live sensor data.",
      ctaLabel: "Add Manual Snapshot",
      ctaHref: "/daily-check",
      isReady: false,
    };
  }

  // 6. No QuickLog yet.
  if (!input.hasAnyQuickLog) {
    return {
      step: "add-quicklog",
      title: ONBOARDING_TITLE,
      subtitle: "Add a quick note so Verdant has plant memory.",
      ctaLabel: "Add Quick Log",
      ctaHref: "/daily-check",
      isReady: false,
    };
  }

  // 7. No Daily Grow Check activity today.
  if (!input.hasTodayCheckActivity) {
    return {
      step: "run-daily-check",
      title: ONBOARDING_TITLE,
      subtitle: "You're ready to run today's check.",
      ctaLabel: "Start Daily Grow Check",
      ctaHref: "/daily-check",
      isReady: false,
    };
  }

  // 8. Ready.
  return {
    step: "ready",
    title: "Daily grow loop ready",
    subtitle: "You're ready to run today's check.",
    ctaLabel: "Start Daily Grow Check",
    ctaHref: "/daily-check",
    isReady: true,
  };
}
