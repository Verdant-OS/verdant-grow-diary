/**
 * oneTentLoopNavigationRules — pure, deterministic helper that defines the
 * canonical Verdant One-Tent Loop order, the safe CTA copy for each step,
 * and the next-step resolution given selected ids.
 *
 * No I/O. No React. No Supabase. No AI calls. No device control.
 * No fake live data. Never claims missing/stale/invalid telemetry is healthy.
 * Action Queue copy is always approval-required.
 */

export type OneTentLoopStep =
  | "grow"
  | "tent"
  | "plant"
  | "quick-log"
  | "timeline"
  | "sensor-snapshot"
  | "ai-doctor"
  | "alert"
  | "action-queue";

export const ONE_TENT_LOOP_ORDER: readonly OneTentLoopStep[] = [
  "grow",
  "tent",
  "plant",
  "quick-log",
  "timeline",
  "sensor-snapshot",
  "ai-doctor",
  "alert",
  "action-queue",
] as const;

export const ONE_TENT_LOOP_CTA_LABEL: Record<OneTentLoopStep, string> = {
  grow: "Open tent",
  tent: "Open plant",
  plant: "Add quick log",
  "quick-log": "View timeline",
  timeline: "Review sensor snapshot",
  "sensor-snapshot": "Open AI Doctor",
  "ai-doctor": "Review alert",
  alert: "Add to Action Queue",
  "action-queue": "Review approval-required action",
};

export const ONE_TENT_LOOP_STEP_LABEL: Record<OneTentLoopStep, string> = {
  grow: "Grow",
  tent: "Tent",
  plant: "Plant",
  "quick-log": "Quick Log",
  timeline: "Timeline",
  "sensor-snapshot": "Sensor snapshot",
  "ai-doctor": "AI Doctor",
  alert: "Alert",
  "action-queue": "Action Queue",
};

/** Safe explanation shown when the next step cannot be linked yet. */
export const ONE_TENT_LOOP_DISABLED_COPY =
  "Next step unavailable until this record is selected.";

/** Sensor source labels the loop must always preserve. */
export const ONE_TENT_LOOP_SENSOR_SOURCES = [
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
] as const;

export interface OneTentLoopIds {
  growId?: string | null;
  tentId?: string | null;
  plantId?: string | null;
  alertId?: string | null;
  actionId?: string | null;
}

export interface OneTentLoopNextStep {
  current: OneTentLoopStep;
  next: OneTentLoopStep | null;
  ctaLabel: string;
  /** Internal route. Never rendered as visible copy. */
  href: string | null;
  disabled: boolean;
  disabledReason: string | null;
}

export function getNextLoopStep(current: OneTentLoopStep): OneTentLoopStep | null {
  const idx = ONE_TENT_LOOP_ORDER.indexOf(current);
  if (idx < 0) return null;
  return ONE_TENT_LOOP_ORDER[idx + 1] ?? null;
}

/**
 * Resolve the next safe CTA for a given loop step + available ids.
 * Returns a disabled state with calm copy when required ids are absent.
 * Routes are returned as internal href strings only; callers must not
 * surface internal IDs as visible copy.
 */
export function resolveOneTentLoopNextStep(
  current: OneTentLoopStep,
  ids: OneTentLoopIds = {},
): OneTentLoopNextStep {
  const next = getNextLoopStep(current);
  const base: OneTentLoopNextStep = {
    current,
    next,
    ctaLabel: ONE_TENT_LOOP_CTA_LABEL[current],
    href: null,
    disabled: true,
    disabledReason: ONE_TENT_LOOP_DISABLED_COPY,
  };
  if (!next) {
    return { ...base, ctaLabel: ONE_TENT_LOOP_CTA_LABEL[current] };
  }

  const { growId, tentId, plantId, alertId, actionId } = ids;

  switch (current) {
    case "grow":
      if (growId) return enable(base, `/grows/${growId}`);
      return base;
    case "tent":
      if (tentId) return enable(base, `/tents/${tentId}`);
      return base;
    case "plant":
      if (plantId) return enable(base, `/plants/${plantId}`);
      return base;
    case "quick-log":
      // After a Quick Log, take the grower to the Timeline.
      return enable(base, "/timeline");
    case "timeline":
      // Sensor snapshot lives on the Sensors page.
      return enable(base, "/sensors");
    case "sensor-snapshot":
      return enable(base, "/doctor");
    case "ai-doctor":
      if (alertId) return enable(base, `/alerts/${alertId}`);
      return enable(base, "/alerts");
    case "alert":
      // CTA is "Add to Action Queue" — handoff happens on the alert detail
      // page (grower-initiated). We route there when an alertId is known,
      // otherwise to the alert index. Action Queue items remain
      // approval-required.
      if (alertId) return enable(base, `/alerts/${alertId}`);
      return enable(base, "/alerts");
    case "action-queue":
      if (actionId) return enable(base, `/actions/${actionId}`);
      return enable(base, "/actions");
    default:
      return base;
  }
}

function enable(base: OneTentLoopNextStep, href: string): OneTentLoopNextStep {
  return { ...base, href, disabled: false, disabledReason: null };
}

/** Empty-state copy keyed by loop step. Never claims unknown data is healthy. */
export const ONE_TENT_LOOP_EMPTY_STATE: Record<OneTentLoopStep, string> = {
  grow: "No grow selected yet. Create or open a grow to begin.",
  tent: "No tent yet. Create or open a tent to continue.",
  plant: "No plant yet. Add or open a plant in this tent.",
  "quick-log": "No Quick Logs yet. Add a Quick Log to capture today's evidence.",
  timeline: "No timeline entries yet. Add diary evidence to build plant memory.",
  "sensor-snapshot":
    "No sensor snapshot yet. Add a manual, CSV, demo, or live snapshot — source will be labeled.",
  "ai-doctor":
    "AI Doctor needs context. Add a recent photo, log, or sensor evidence first. Missing context will be shown.",
  alert: "No active alert. Continue monitoring — telemetry status is shown by source.",
  "action-queue":
    "No pending approval-required actions. New items always require grower approval.",
};
