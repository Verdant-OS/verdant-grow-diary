/**
 * firstRunChecklistViewModel — pure view-model for the guided
 * First-Run One-Tent Checklist.
 *
 * Closes the audit gap where new growers had no guided funnel
 * connecting Grow → Tent → Plant → Quick Log → Sensor Snapshot.
 *
 * Pure: no React, no Supabase, no side effects. The caller passes
 * counts derived from data the Dashboard already loads. Quick Log
 * and Sensor Snapshot counts are optional — when omitted (or null),
 * those steps remain incomplete and are marked as "recommended"
 * rather than required, with calmer copy that does not block the
 * grower or imply hardware is required.
 *
 * Safety:
 *  - Sensor snapshot copy never implies live data is required —
 *    manual snapshots are first-class.
 *  - No automation / device-control / AI claims.
 *  - Routes are existing routes only.
 *  - Zero grows always forces the checklist visible, overriding any
 *    local dismiss preference (a grower with no grow must not be
 *    silently stranded).
 */

export type FirstRunStepKey =
  | "create_grow"
  | "add_tent"
  | "add_plant"
  | "first_quick_log"
  | "first_sensor_snapshot";

export interface FirstRunStep {
  key: FirstRunStepKey;
  label: string;
  description: string;
  ctaLabel: string;
  href: string;
  required: boolean;
  /** "complete" | "incomplete" | "recommended" (incomplete + recommended-only). */
  state: "complete" | "incomplete" | "recommended";
}

export interface FirstRunChecklistInput {
  growCount: number;
  tentCount: number;
  plantCount: number;
  /** Pass null/undefined when not yet wired — step is shown as recommended. */
  quickLogCount?: number | null;
  /** Pass null/undefined when not yet wired — step is shown as recommended. */
  sensorSnapshotCount?: number | null;
  /** Local dismiss preference (from localStorage wrapper). */
  isDismissed?: boolean;
}

export interface FirstRunChecklistViewModel {
  steps: readonly FirstRunStep[];
  completeCount: number;
  totalCount: number;
  requiredCompleteCount: number;
  requiredTotalCount: number;
  isFullyActivated: boolean;
  /** Effective visibility — accounts for dismiss + zero-grows override. */
  isVisible: boolean;
  /** True when dismissed AND setup is still partially incomplete — used to render a restore CTA. */
  showRestoreCta: boolean;
  intro: string;
  safetyNote: string;
  completedHeadline: string;
}

export const FIRST_RUN_ROUTES = {
  create_grow: "/grows",
  add_tent: "/tents",
  add_plant: "/plants",
  // Dashboard surfaces the Quick Log FAB once a plant exists.
  first_quick_log: "/",
  // /sensors is the existing manual sensor snapshot surface.
  first_sensor_snapshot: "/sensors",
} as const;

export const FIRST_RUN_INTRO =
  "Five short steps to close your first One-Tent Loop in Verdant.";

export const FIRST_RUN_SAFETY_NOTE =
  "Sensor snapshots can be manual first — no hardware required.";

export const FIRST_RUN_COMPLETED_HEADLINE =
  "Your One-Tent Loop is set up — Verdant is listening.";

export const FIRST_RUN_DISMISS_STORAGE_KEY =
  "verdant:first-run-checklist-dismissed";

function resolveState(
  complete: boolean,
  countersAvailable: boolean,
): FirstRunStep["state"] {
  if (complete) return "complete";
  return countersAvailable ? "incomplete" : "recommended";
}

export function buildFirstRunChecklistViewModel(
  input: FirstRunChecklistInput,
): FirstRunChecklistViewModel {
  const growCount = input.growCount ?? 0;
  const tentCount = input.tentCount ?? 0;
  const plantCount = input.plantCount ?? 0;

  const quickLogAvailable =
    input.quickLogCount !== null && input.quickLogCount !== undefined;
  const sensorAvailable =
    input.sensorSnapshotCount !== null &&
    input.sensorSnapshotCount !== undefined;

  const hasGrow = growCount > 0;
  const hasTent = tentCount > 0;
  const hasPlant = plantCount > 0;
  const hasQuickLog = quickLogAvailable && (input.quickLogCount ?? 0) > 0;
  const hasSensorSnapshot =
    sensorAvailable && (input.sensorSnapshotCount ?? 0) > 0;

  const steps: FirstRunStep[] = [
    {
      key: "create_grow",
      label: "Set up your first grow",
      description: "Name your run and set basic targets.",
      ctaLabel: "Create grow",
      href: FIRST_RUN_ROUTES.create_grow,
      required: true,
      state: resolveState(hasGrow, true),
    },
    {
      key: "add_tent",
      label: "Add a tent",
      description: "Verdant tracks environment per tent.",
      ctaLabel: "Add tent",
      href: FIRST_RUN_ROUTES.add_tent,
      required: true,
      state: resolveState(hasTent, true),
    },
    {
      key: "add_plant",
      label: "Add a plant",
      description: "Plant memory starts with your first real log.",
      ctaLabel: "Add plant",
      href: FIRST_RUN_ROUTES.add_plant,
      required: true,
      state: resolveState(hasPlant, true),
    },
    {
      key: "first_quick_log",
      label: "Log your first observation",
      description: hasPlant
        ? "A short Quick Log captures what you saw today."
        : "Add this once your first plant is created.",
      ctaLabel: "Open Quick Log",
      href: FIRST_RUN_ROUTES.first_quick_log,
      required: false,
      state: resolveState(hasQuickLog, quickLogAvailable),
    },
    {
      key: "first_sensor_snapshot",
      label: "Add a manual sensor snapshot",
      description: hasPlant
        ? "Sensor snapshots can be manual first — no hardware required."
        : "Add this once your first plant is created.",
      ctaLabel: "Add sensor snapshot",
      href: FIRST_RUN_ROUTES.first_sensor_snapshot,
      required: false,
      state: resolveState(hasSensorSnapshot, sensorAvailable),
    },
  ];

  const completeCount = steps.filter((s) => s.state === "complete").length;
  const totalCount = steps.length;
  const requiredSteps = steps.filter((s) => s.required);
  const requiredCompleteCount = requiredSteps.filter(
    (s) => s.state === "complete",
  ).length;
  const requiredTotalCount = requiredSteps.length;
  const isFullyActivated = completeCount === totalCount;

  const isDismissed = !!input.isDismissed;
  // Zero-grow override: never hide critical setup if the grower has no grow.
  const zeroGrowOverride = growCount === 0;
  const isVisible =
    !isFullyActivated && (zeroGrowOverride || !isDismissed);
  const showRestoreCta = !isFullyActivated && isDismissed && !zeroGrowOverride;

  return {
    steps,
    completeCount,
    totalCount,
    requiredCompleteCount,
    requiredTotalCount,
    isFullyActivated,
    isVisible,
    showRestoreCta,
    intro: FIRST_RUN_INTRO,
    safetyNote: FIRST_RUN_SAFETY_NOTE,
    completedHeadline: FIRST_RUN_COMPLETED_HEADLINE,
  };
}
