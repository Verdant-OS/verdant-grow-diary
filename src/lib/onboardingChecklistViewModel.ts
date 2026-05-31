/**
 * onboardingChecklistViewModel — pure helper that decides what the
 * first-run onboarding checklist should show on the authenticated
 * Dashboard.
 *
 * Pure: no React, no Supabase, no side effects. The caller passes counts
 * derived from data the Dashboard already loads (grows / tents / plants /
 * diary entries / sensor readings). The view model returns:
 *
 *   - the ordered list of checklist items + complete/incomplete state
 *   - whether the checklist should be shown at all
 *   - whether the user is fully activated
 *
 * Activation rule (intentionally lenient — Verdant is grow-room friendly):
 *   - has at least one grow
 *   - has at least one tent
 *   - has at least one plant
 *   - has at least one diary/log entry OR sensor reading
 *
 * Links point to the safest existing routes — no automation, no device
 * control, no fake-live data. Copy is approved by `forbiddenCopy`:
 * the helper guarantees no "live", "autopilot", or "guaranteed" claims
 * leak into the rendered text.
 */

export type OnboardingStepKey =
  | "create_grow"
  | "add_tent"
  | "add_plant"
  | "first_log";

export interface OnboardingStep {
  key: OnboardingStepKey;
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
  complete: boolean;
}

export interface OnboardingChecklistInput {
  growCount: number;
  tentCount: number;
  plantCount: number;
  diaryEntryCount: number;
  sensorReadingCount: number;
}

export interface OnboardingChecklistViewModel {
  steps: OnboardingStep[];
  completeCount: number;
  totalCount: number;
  isFullyActivated: boolean;
  /** True only when at least one step is still incomplete. */
  shouldShowChecklist: boolean;
  /** Friendly copy used by the card. Kept here so tests can assert it. */
  intro: string;
  honestyNote: string;
  completedHeadline: string;
}

export const ONBOARDING_INTRO =
  "Start with one real grow. Verdant gets smarter as your plant history builds.";

export const ONBOARDING_HONESTY_NOTE =
  "No fake-live data. Manual readings are welcome when clearly labeled.";

export const ONBOARDING_COMPLETED_HEADLINE = "Your grow memory is active";

/** Routes the checklist links to — kept narrow to safe, existing pages. */
export const ONBOARDING_ROUTES = {
  create_grow: "/grows",
  add_tent: "/tents",
  add_plant: "/plants",
  first_log: "/sensors",
} as const;

export function buildOnboardingChecklistViewModel(
  input: OnboardingChecklistInput,
): OnboardingChecklistViewModel {
  const hasGrow = (input.growCount ?? 0) > 0;
  const hasTent = (input.tentCount ?? 0) > 0;
  const hasPlant = (input.plantCount ?? 0) > 0;
  const hasFirstSignal =
    (input.diaryEntryCount ?? 0) > 0 || (input.sensorReadingCount ?? 0) > 0;

  const steps: OnboardingStep[] = [
    {
      key: "create_grow",
      title: "Create your first grow",
      description: "Name your run and set basic targets.",
      href: ONBOARDING_ROUTES.create_grow,
      ctaLabel: "Create grow",
      complete: hasGrow,
    },
    {
      key: "add_tent",
      title: "Add your tent",
      description: "Verdant tracks environment per tent.",
      href: ONBOARDING_ROUTES.add_tent,
      ctaLabel: "Add tent",
      complete: hasTent,
    },
    {
      key: "add_plant",
      title: "Add your first plant",
      description: "Plant memory starts the moment you add it.",
      href: ONBOARDING_ROUTES.add_plant,
      ctaLabel: "Add plant",
      complete: hasPlant,
    },
    {
      key: "first_log",
      title: "Log your first note or sensor reading",
      description: "A diary entry or a manual sensor reading — your call.",
      href: ONBOARDING_ROUTES.first_log,
      ctaLabel: "Log first reading",
      complete: hasFirstSignal,
    },
  ];

  const completeCount = steps.filter((s) => s.complete).length;
  const totalCount = steps.length;
  const isFullyActivated = completeCount === totalCount;

  return {
    steps,
    completeCount,
    totalCount,
    isFullyActivated,
    shouldShowChecklist: !isFullyActivated,
    intro: ONBOARDING_INTRO,
    honestyNote: ONBOARDING_HONESTY_NOTE,
    completedHeadline: ONBOARDING_COMPLETED_HEADLINE,
  };
}
