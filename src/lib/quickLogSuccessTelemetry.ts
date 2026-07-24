/**
 * Privacy-safe Quick Log success telemetry.
 *
 * Only a closed, non-content event type reaches the funnel tracker. Runtime
 * callers are guarded as well as typed so untrusted strings cannot widen the
 * payload. Idempotent backend replays are successful reads of an existing
 * write, not new Quick Logs, and therefore are not counted again.
 */
import { trackFunnelEvent } from "@/lib/funnelAnalytics";

export const QUICK_LOG_SUCCESS_INPUTS = [
  "note",
  "observation",
  "water",
  "watering",
  "feed",
  "feeding",
  "photo",
  "environment",
  "environment_check",
  "training",
  "defoliation",
  "issue_observation",
  "harvest",
  "plant_quick_log",
] as const;

export type QuickLogSuccessInput = (typeof QUICK_LOG_SUCCESS_INPUTS)[number];

export const QUICK_LOG_SUCCESS_EVENT_TYPES = [
  "note",
  "water",
  "feed",
  "photo",
  "environment",
  "training",
  "defoliation",
  "observation",
  "harvest",
  "plant_check",
] as const;

export type QuickLogSuccessEventType = (typeof QUICK_LOG_SUCCESS_EVENT_TYPES)[number];

const EVENT_TYPE_BY_INPUT: Readonly<Record<QuickLogSuccessInput, QuickLogSuccessEventType>> =
  Object.freeze({
    note: "note",
    observation: "observation",
    water: "water",
    watering: "water",
    feed: "feed",
    feeding: "feed",
    photo: "photo",
    environment: "environment",
    environment_check: "environment",
    training: "training",
    defoliation: "defoliation",
    issue_observation: "observation",
    harvest: "harvest",
    plant_quick_log: "plant_check",
  });

export function isQuickLogSuccessInput(input: unknown): input is QuickLogSuccessInput {
  return (
    typeof input === "string" && Object.prototype.hasOwnProperty.call(EVENT_TYPE_BY_INPUT, input)
  );
}

export function resolveQuickLogSuccessEventType(input: unknown): QuickLogSuccessEventType | null {
  if (!isQuickLogSuccessInput(input)) return null;
  return EVENT_TYPE_BY_INPUT[input];
}

export interface TrackQuickLogSuccessOptions {
  /** True when the backend returned an existing idempotent write. */
  reused?: boolean;
}

/**
 * Emit one live `quick_log_saved` funnel event for a newly confirmed write.
 * Returns false when the input is outside the closed map or is a replay.
 */
export function trackQuickLogSuccess(
  input: unknown,
  options: TrackQuickLogSuccessOptions = {},
): boolean {
  if (options.reused === true) return false;
  const eventType = resolveQuickLogSuccessEventType(input);
  if (!eventType) return false;
  trackFunnelEvent("quick_log_saved", { event_type: eventType });
  return true;
}
