/**
 * dailyGrowCheckRules — pure helpers for the mobile-first Daily Grow Check
 * flow. No React, no Supabase, no side-effects.
 *
 * The flow is grower-facing only. It NEVER:
 *   - writes to sensor_readings (manual snapshots go through the existing
 *     ManualSensorReadingCard path)
 *   - mutates alerts or action_queue
 *   - executes device commands or automation
 *   - invents readings, defaults, or "live" data
 *
 * It only orchestrates which UI step is shown and what the completion
 * summary should report.
 */

export const DAILY_GROW_CHECK_STEPS = [
  "select",
  "environment",
  "manual",
  "quicklog",
  "handheld",
  "review",
  "done",
] as const;
export type DailyGrowCheckStep = (typeof DAILY_GROW_CHECK_STEPS)[number];

export type StepOutcome = "added" | "skipped" | "pending";

export interface DailyGrowCheckState {
  manual: StepOutcome;
  quicklog: StepOutcome;
  handheld: StepOutcome;
  alertsReviewed: boolean;
  tasksReviewed: boolean;
}

export const INITIAL_DAILY_GROW_CHECK_STATE: DailyGrowCheckState = {
  manual: "pending",
  quicklog: "pending",
  handheld: "pending",
  alertsReviewed: false,
  tasksReviewed: false,
};

export interface DailyGrowCheckGuard {
  ok: boolean;
  reason?:
    | "no-tents"
    | "no-plants"
    | "plant-needs-tent";
  message?: string;
}

export function evaluateDailyGrowCheckGuard(input: {
  tentsCount: number;
  plantsCount: number;
  selectedPlantTentId: string | null | undefined;
  hasSelectedPlant: boolean;
}): DailyGrowCheckGuard {
  if (input.tentsCount <= 0) {
    return { ok: false, reason: "no-tents", message: "Add a tent first." };
  }
  if (input.plantsCount <= 0) {
    return { ok: false, reason: "no-plants", message: "Add a plant first." };
  }
  if (input.hasSelectedPlant && !input.selectedPlantTentId) {
    return {
      ok: false,
      reason: "plant-needs-tent",
      message: "Assign this plant to a tent before running Daily Grow Check.",
    };
  }
  return { ok: true };
}

export function nextStep(
  current: DailyGrowCheckStep,
): DailyGrowCheckStep {
  const i = DAILY_GROW_CHECK_STEPS.indexOf(current);
  if (i < 0 || i >= DAILY_GROW_CHECK_STEPS.length - 1) return "done";
  return DAILY_GROW_CHECK_STEPS[i + 1];
}

export function previousStep(
  current: DailyGrowCheckStep,
): DailyGrowCheckStep {
  const i = DAILY_GROW_CHECK_STEPS.indexOf(current);
  if (i <= 0) return "select";
  return DAILY_GROW_CHECK_STEPS[i - 1];
}

export function stepProgress(current: DailyGrowCheckStep): {
  index: number;
  total: number;
  percent: number;
} {
  const total = DAILY_GROW_CHECK_STEPS.length - 1; // exclude "done"
  const index = Math.max(0, Math.min(total, DAILY_GROW_CHECK_STEPS.indexOf(current)));
  return { index, total, percent: Math.round((index / total) * 100) };
}

export interface DailyGrowCheckSummaryLine {
  key: string;
  label: string;
  outcome: StepOutcome | "reviewed" | "not-reviewed";
}

export function buildDailyGrowCheckSummary(
  state: DailyGrowCheckState,
): DailyGrowCheckSummaryLine[] {
  return [
    { key: "manual", label: "Manual sensor snapshot", outcome: state.manual },
    { key: "quicklog", label: "Quick Log", outcome: state.quicklog },
    { key: "handheld", label: "Handheld readings", outcome: state.handheld },
    {
      key: "alerts",
      label: "Tent alerts",
      outcome: state.alertsReviewed ? "reviewed" : "not-reviewed",
    },
    {
      key: "tasks",
      label: "Pending tasks",
      outcome: state.tasksReviewed ? "reviewed" : "not-reviewed",
    },
  ];
}

/**
 * Missing optional readings must NEVER block completion. The flow is always
 * completable from any step, so this helper just confirms intent for tests.
 */
export function canCompleteDailyGrowCheck(_state: DailyGrowCheckState): boolean {
  return true;
}
