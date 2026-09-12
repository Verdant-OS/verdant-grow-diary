/**
 * onboardingChecklistViewModel — pure helper that decides what the
 * first-run onboarding checklist should show on the authenticated
 * Dashboard.
 *
 * Pure: no React, no Supabase, no side effects. The caller passes counts
 * derived from data the Dashboard already loads (grows / tents / plants /
 * diary entries / sensor readings). New callers may pass a relationship-
 * checked One-Tent scope so unrelated rows cannot fake activation.
 *
 *   - the ordered list of checklist items + complete/incomplete state
 *   - whether the first-time get-started checklist shell should be shown
 *   - whether plant memory forces an operating primary frame
 *   - a compact Add tent next-step when plants exist but tents do not
 *   - whether the user is fully activated
 *
 * Canonical activation rule:
 *   - one grow
 *   - one tent linked to that grow
 *   - one plant linked to that tent and grow
 *   - one connected manual log (including watering or feeding)
 *   - one trustworthy sensor snapshot (manual is first-class)
 *
 * Links point to the safest existing routes — no automation, no device
 * control, no fake-live data. The copy is intentionally cautious: no
 * always-on / hands-off / guaranteed claims leak into the rendered text.
 * The test suite enforces this.
 */

import {
  buildConnectedActivationRoutes,
  type ConnectedActivationScope,
} from "@/lib/connectedOneTentActivationRules";
import {
  buildPlantQuickLogPrefill,
  type PlantQuickLogPrefill,
} from "@/lib/plantQuickLogPrefillRules";
import { dashboardPath } from "@/lib/routes";

export type OnboardingStepKey =
  "create_grow" | "add_tent" | "add_plant" | "first_log" | "first_sensor_snapshot";

export interface OnboardingStep {
  key: OnboardingStepKey;
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
  complete: boolean;
  /** Exact validated context for the presenter to hand to the existing sheet. */
  quickLogPrefill?: PlantQuickLogPrefill | null;
}

export interface OnboardingChecklistInput {
  growCount: number;
  tentCount: number;
  plantCount: number;
  diaryEntryCount: number;
  sensorReadingCount: number;
  /**
   * Relationship-checked scope. When supplied, grow/tent/plant completion is
   * derived from these IDs rather than independent counts.
   */
  connectedScope?: ConnectedActivationScope | null;
  /** Canonical diary + grow_events evidence for the connected scope. */
  firstLogEvidenceCount?: number | null;
  firstLogEvidenceStatus?: "idle" | "loading" | "ok" | "unavailable";
}

/**
 * Compact operating next-step shown after plant memory exists.
 * Never framed as first-time “Get your grow started.”
 */
export interface OnboardingOperatingNextStep {
  key: "add_tent";
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
}

export type OnboardingPrimaryFrame = "get_started" | "operating";

export interface OnboardingChecklistViewModel {
  steps: OnboardingStep[];
  completeCount: number;
  totalCount: number;
  isFullyActivated: boolean;
  /**
   * True only for the first-time get-started checklist shell.
   * Plant memory (≥1 plant) forces this false — growers with plants are past
   * “get started,” even if tent / log / sensor steps remain.
   */
  shouldShowChecklist: boolean;
  /** Alias of shouldShowChecklist — explicit name for framing tests. */
  shouldShowGetStartedShell: boolean;
  /** Dashboard primary frame: get-started shell vs operating. */
  primaryFrame: OnboardingPrimaryFrame;
  /**
   * When plant memory exists but a tent is still missing, surface a single
   * Add tent next-step without the 5-step get-started shell.
   */
  operatingNextStep: OnboardingOperatingNextStep | null;
  /** Friendly copy used by the card. Kept here so tests can assert it. */
  intro: string;
  honestyNote: string;
  completedHeadline: string;
}

export const ONBOARDING_OPERATING_ADD_TENT_TITLE = "Add a tent for this grow";

export const ONBOARDING_OPERATING_ADD_TENT_DESCRIPTION =
  "Plant memory is already on this grow. Add a tent so environment can attach.";

export const ONBOARDING_INTRO =
  "Connect one real grow, tent, and plant. Then preserve what you did and what the room measured.";

export const ONBOARDING_HONESTY_NOTE =
  "No fake-live data. Manual readings are welcome when clearly labeled.";

export const ONBOARDING_COMPLETED_HEADLINE = "Your grow memory is active";

/** Routes the checklist links to — kept narrow to safe, existing pages. */
export const ONBOARDING_ROUTES = {
  create_grow: "/grows",
  add_tent: "/tents",
  add_plant: "/plants",
  first_log: "/dashboard?open=quick-log",
  first_sensor_snapshot: "/sensors",
} as const;

export function buildOnboardingChecklistViewModel(
  input: OnboardingChecklistInput,
): OnboardingChecklistViewModel {
  const hasConnectedScope = input.connectedScope !== undefined;
  const scope = input.connectedScope ?? null;
  const hasGrow = hasConnectedScope ? !!scope?.growId : (input.growCount ?? 0) > 0;
  const hasTent = hasConnectedScope ? !!scope?.tentId : (input.tentCount ?? 0) > 0;
  // Persisted plant rows complete the plant step even when the connected
  // graph has not yet resolved a plantId (legacy null grow_id, empty
  // preferred grow, or plant awaiting tent assignment). Never show
  // "Add your first plant" as incomplete when plants already exist.
  const persistedPlantCount = input.plantCount ?? 0;
  const hasPlant = hasConnectedScope
    ? !!scope?.plantId || persistedPlantCount > 0
    : persistedPlantCount > 0;
  const firstLogStatus = input.firstLogEvidenceStatus ?? "ok";
  const hasFirstLog = hasConnectedScope
    ? firstLogStatus === "ok" && (input.firstLogEvidenceCount ?? 0) > 0
    : (input.diaryEntryCount ?? 0) > 0;
  const hasSensorSnapshot = (input.sensorReadingCount ?? 0) > 0;
  const connectedRoutes = buildConnectedActivationRoutes(scope ?? {});
  const quickLogPrefill = hasConnectedScope
    ? buildPlantQuickLogPrefill({
        growId: scope?.growId,
        tentId: scope?.tentId,
        plantId: scope?.plantId,
      })
    : null;
  const routes = hasConnectedScope
    ? {
        create_grow: connectedRoutes.createGrow,
        add_tent: connectedRoutes.addTent,
        add_plant: connectedRoutes.addPlant,
        first_log: connectedRoutes.quickLog,
        first_sensor_snapshot: connectedRoutes.sensors,
      }
    : ONBOARDING_ROUTES;

  const firstLogDescription =
    firstLogStatus === "loading"
      ? "Checking saved plant memory for this connected tent."
      : firstLogStatus === "unavailable"
        ? "Saved history could not be verified right now. Try again shortly."
        : hasPlant
          ? "A watering, feeding, photo, or short observation starts the timeline."
          : "Add this after your first plant is connected.";

  const steps: OnboardingStep[] = [
    {
      key: "create_grow",
      title: "Create your first grow",
      description: "Name your run and set basic targets.",
      href: routes.create_grow,
      ctaLabel: "Create grow",
      complete: hasGrow,
    },
    {
      key: "add_tent",
      title: "Add your tent",
      description: "Verdant tracks environment per tent.",
      href: routes.add_tent,
      ctaLabel: "Add tent",
      complete: hasTent,
    },
    {
      key: "add_plant",
      title: "Add your first plant",
      description: hasPlant
        ? "Plant memory is already on this grow."
        : hasTent
          ? "Plant memory starts the moment you add it."
          : "Add a tent first, then connect your first plant.",
      href: routes.add_plant,
      ctaLabel: "Add plant",
      complete: hasPlant,
    },
    {
      key: "first_log",
      title: "Log your first plant memory",
      description: firstLogDescription,
      href: quickLogPrefill ? dashboardPath(quickLogPrefill.growId) : routes.first_log,
      ctaLabel: "Open Quick Log",
      complete: hasFirstLog,
      quickLogPrefill,
    },
    {
      key: "first_sensor_snapshot",
      title: "Add your first sensor snapshot",
      description: hasTent
        ? "A manual snapshot is enough to establish sensor truth; hardware is optional."
        : "Add this after your first tent is connected.",
      href: routes.first_sensor_snapshot,
      ctaLabel: "Add snapshot",
      complete: hasSensorSnapshot,
    },
  ];

  const completeCount = steps.filter((s) => s.complete).length;
  const totalCount = steps.length;
  const isFullyActivated = completeCount === totalCount;
  // Plant memory ends first-time get-started framing. Remaining incomplete
  // steps (tent / log / sensor) stay on the progress pill and, when the tent
  // is missing, as a compact operating next-step — not the 5-step shell.
  // Invariant: never allow get-started once the plant step is complete —
  // that residual live miss (shell + crossed "Add your first plant") is the
  // abandonment frame this slice closes.
  const plantStepComplete = steps.some((s) => s.key === "add_plant" && s.complete);
  const shouldShowGetStartedShell = !isFullyActivated && !hasPlant && !plantStepComplete;
  const operatingNextStep: OnboardingOperatingNextStep | null =
    hasPlant && !hasTent
      ? {
          key: "add_tent",
          title: ONBOARDING_OPERATING_ADD_TENT_TITLE,
          description: ONBOARDING_OPERATING_ADD_TENT_DESCRIPTION,
          href: routes.add_tent,
          ctaLabel: "Add tent",
        }
      : null;

  return {
    steps,
    completeCount,
    totalCount,
    isFullyActivated,
    shouldShowChecklist: shouldShowGetStartedShell,
    shouldShowGetStartedShell,
    primaryFrame: shouldShowGetStartedShell ? "get_started" : "operating",
    operatingNextStep,
    intro: ONBOARDING_INTRO,
    honestyNote: ONBOARDING_HONESTY_NOTE,
    completedHeadline: ONBOARDING_COMPLETED_HEADLINE,
  };
}
