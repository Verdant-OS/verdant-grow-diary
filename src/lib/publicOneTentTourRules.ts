/**
 * Pure, deterministic content model for the public One-Tent product tour.
 *
 * This is an illustrative explanation of Verdant's workflow. It never reads
 * account data and must never be presented as live telemetry or a diagnosis.
 */

export type PublicOneTentTourStepId = "home" | "quick_log" | "memory" | "doctor" | "action_queue";

export interface PublicOneTentTourDetail {
  label: string;
  value: string;
}

export interface PublicOneTentTourStep {
  id: PublicOneTentTourStepId;
  order: number;
  navLabel: string;
  journey: readonly string[];
  title: string;
  body: string;
  details: readonly PublicOneTentTourDetail[];
  safetyNote: string;
}

export const PUBLIC_ONE_TENT_TOUR_STEPS: readonly PublicOneTentTourStep[] = Object.freeze([
  Object.freeze({
    id: "home",
    order: 1,
    navLabel: "Set the context",
    journey: Object.freeze(["Grow", "Tent", "Plant"]),
    title: "Give every observation a home.",
    body: "Start with one grow, one tent, and the plants inside it. Stage, strain, medium, pot size, targets, and plant history stay attached to the decisions they inform.",
    details: Object.freeze([
      Object.freeze({ label: "Grow", value: "One active cycle" }),
      Object.freeze({ label: "Tent", value: "Environment and sensor context" }),
      Object.freeze({ label: "Plant", value: "Stage, medium, targets, and history" }),
    ]),
    safetyNote:
      "Missing optional context stays visibly missing; Verdant does not fill gaps by guessing.",
  }),
  Object.freeze({
    id: "quick_log",
    order: 2,
    navLabel: "Log the moment",
    journey: Object.freeze(["Quick Log"]),
    title: "Capture the grow-room moment in seconds.",
    body: "Start with Better, Same, or Worse, then add only the note, care event, photo, or manual reading that matters. The fast path stays diary-first.",
    details: Object.freeze([
      Object.freeze({ label: "Status", value: "Better · Same · Worse" }),
      Object.freeze({ label: "Flow", value: "Chip first, note second" }),
      Object.freeze({ label: "Optional context", value: "Care, photo, or manual reading" }),
    ]),
    safetyNote: "Blank fields remain unknown; a short log is never padded with invented detail.",
  }),
  Object.freeze({
    id: "memory",
    order: 3,
    navLabel: "See what changed",
    journey: Object.freeze(["Timeline", "Sensor Snapshot"]),
    title: "See plant memory beside sensor truth.",
    body: "The timeline keeps logs, photos, care, and alerts in order. Sensor snapshots keep source, captured time, and freshness visible before a reading influences advice.",
    details: Object.freeze([
      Object.freeze({ label: "Timeline", value: "Logs, photos, care, and alerts in time order" }),
      Object.freeze({
        label: "Source labels",
        value: "Live · Manual · CSV · Demo · Stale · Invalid",
      }),
      Object.freeze({ label: "Freshness", value: "Captured time stays visible" }),
    ]),
    safetyNote:
      "Illustrative walkthrough only — not live telemetry. Unknown, demo, stale, or invalid readings never appear healthy.",
  }),
  Object.freeze({
    id: "doctor",
    order: 4,
    navLabel: "Review the evidence",
    journey: Object.freeze(["AI Doctor", "Alert"]),
    title: "Get a cautious read that shows its work.",
    body: "AI Doctor separates evidence from missing information, caps confidence when context is thin, and keeps relevant alerts visible without turning one photo or reading into certainty.",
    details: Object.freeze([
      Object.freeze({ label: "Confidence", value: "Partial" }),
      Object.freeze({ label: "Evidence", value: "Recent log + source-labeled snapshot" }),
      Object.freeze({ label: "Missing information", value: "Recent photo · root-zone trend" }),
      Object.freeze({
        label: "What not to do",
        value: "Avoid aggressive nutrient or irrigation changes",
      }),
    ]),
    safetyNote: "Weak evidence produces conservative guidance, not an aggressive diagnosis.",
  }),
  Object.freeze({
    id: "action_queue",
    order: 5,
    navLabel: "Choose the next step",
    journey: Object.freeze(["Action Queue"]),
    title: "Turn advice into a grower-approved next step.",
    body: "A suggestion can be reviewed, approved, rejected, or left alone. Recording the outcome closes the loop so the next decision has better plant memory.",
    details: Object.freeze([
      Object.freeze({ label: "Suggestion", value: "Review before acting" }),
      Object.freeze({ label: "Status", value: "Approval required" }),
      Object.freeze({ label: "Device control", value: "Unavailable" }),
      Object.freeze({
        label: "Follow-up",
        value: "Record the outcome before deciding what worked",
      }),
    ]),
    safetyNote: "Verdant does not auto-create queue items or execute device commands.",
  }),
]);

const STEP_IDS = new Set<PublicOneTentTourStepId>(
  PUBLIC_ONE_TENT_TOUR_STEPS.map((step) => step.id),
);

export function isPublicOneTentTourStepId(value: unknown): value is PublicOneTentTourStepId {
  return typeof value === "string" && STEP_IDS.has(value as PublicOneTentTourStepId);
}

/** Unknown or malformed navigation always returns to the safe first step. */
export function resolvePublicOneTentTourStep(value: unknown): Readonly<PublicOneTentTourStep> {
  const step = isPublicOneTentTourStepId(value)
    ? PUBLIC_ONE_TENT_TOUR_STEPS.find((candidate) => candidate.id === value)
    : undefined;
  return step ?? PUBLIC_ONE_TENT_TOUR_STEPS[0];
}

export function getNextPublicOneTentTourStepId(value: unknown): PublicOneTentTourStepId | null {
  const active = resolvePublicOneTentTourStep(value);
  const next = PUBLIC_ONE_TENT_TOUR_STEPS[active.order];
  return next?.id ?? null;
}
