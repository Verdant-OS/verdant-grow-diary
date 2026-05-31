/**
 * relativeTimelineEmptyStateRules — pure helper that builds the first-log
 * empty-state view model for the Plant Relative Timeline.
 *
 * Strictly read-only:
 *  - No I/O, no React, no side effects.
 *  - Never writes diary entries, sensor readings, photos, or action_queue.
 *  - Never invokes edge functions, schedules reminders, or fires emails.
 *  - Returns descriptors only; the UI is responsible for dispatching the
 *    existing QuickLog `CustomEvent` or `<Link>`-navigating to existing
 *    routes. No new write paths are introduced.
 *  - Routes/events referenced here are all paths the app already exposes:
 *      • `verdant:open-quicklog` (PLANT_QUICKLOG_PREFILL_EVENT)
 *      • `/tents/:tentId` (existing TentDetail page with manual snapshot)
 *      • `/sensors` (existing Sensors page)
 */
import {
  buildPlantQuickLogPrefill,
  PLANT_QUICKLOG_PREFILL_EVENT,
  type PlantQuickLogPrefill,
} from "./plantQuickLogPrefillRules";

export interface RelativeTimelineEmptyStateInput {
  plantId?: string | null;
  plantName?: string | null;
  growId?: string | null;
  tentId?: string | null;
  tentName?: string | null;
}

export type RelativeTimelineCtaKind = "quicklog" | "manual-snapshot" | "photo";

export type RelativeTimelineCtaMode = "event" | "route";

export interface RelativeTimelineCtaEventDetail {
  plantId?: string;
  plantName?: string;
  growId?: string;
  tentId?: string;
  tentName?: string;
  eventType?: "observation" | "photo";
  suggestSnapshot?: boolean;
}

export interface RelativeTimelineCta {
  key: RelativeTimelineCtaKind;
  label: string;
  /** "event" dispatches a CustomEvent; "route" navigates via react-router. */
  mode: RelativeTimelineCtaMode;
  /** Present when mode === "event". */
  eventName?: string;
  /** Pure JSON-safe detail. Contains plant/tent context only — never IDs of users, tokens, or raw payloads. */
  eventDetail?: RelativeTimelineCtaEventDetail | null;
  /** Present when mode === "route". */
  route?: string;
  disabled: boolean;
  /** Human-readable reason when disabled. */
  disabledReason?: string;
}

export interface RelativeTimelineEmptyStateView {
  copy: string;
  ctas: RelativeTimelineCta[];
}

export const RELATIVE_TIMELINE_EMPTY_COPY =
  "No timeline entries yet. Start building plant memory with a quick observation, manual sensor snapshot, or photo.";

/** Generic safe fallback route for the manual sensor snapshot CTA. */
export const SENSORS_FALLBACK_ROUTE = "/sensors";

function prefillToDetail(
  p: PlantQuickLogPrefill | null,
): RelativeTimelineCtaEventDetail | null {
  if (!p) return null;
  return {
    plantId: p.plantId,
    plantName: p.plantName ?? undefined,
    growId: p.growId,
    tentId: p.tentId,
    tentName: p.tentName ?? undefined,
    eventType: p.eventType,
    suggestSnapshot: p.suggestSnapshot,
  };
}

/**
 * Build the first-log empty state. Pure and deterministic.
 *
 * Degrade rules:
 *   - QuickLog CTA is always usable. Without full context, the event
 *     opens QuickLog with no preselection (safe).
 *   - Manual sensor snapshot routes to `/tents/:tentId` when tent context
 *     is known, otherwise to the generic `/sensors` route.
 *   - Photo CTA opens QuickLog with `eventType: "photo"` and any plant
 *     context that is available. Disables with a reason only when no
 *     plant context exists *and* the generic QuickLog path also cannot
 *     be reached — currently the generic path is always safe, so the
 *     photo CTA is always usable.
 */
export function buildRelativeTimelineEmptyState(
  input: RelativeTimelineEmptyStateInput | null | undefined,
): RelativeTimelineEmptyStateView {
  const i = input ?? {};
  const fullPrefill = buildPlantQuickLogPrefill({
    plantId: i.plantId ?? null,
    plantName: i.plantName ?? null,
    growId: i.growId ?? null,
    tentId: i.tentId ?? null,
    tentName: i.tentName ?? null,
  });

  const quicklog: RelativeTimelineCta = {
    key: "quicklog",
    label: "Add Quick Log",
    mode: "event",
    eventName: PLANT_QUICKLOG_PREFILL_EVENT,
    eventDetail: prefillToDetail(fullPrefill),
    disabled: false,
  };

  const snapshot: RelativeTimelineCta = {
    key: "manual-snapshot",
    label: "Add manual sensor snapshot",
    mode: "route",
    route: i.tentId ? `/tents/${i.tentId}` : SENSORS_FALLBACK_ROUTE,
    disabled: false,
  };

  const photoDetail: RelativeTimelineCtaEventDetail = {
    eventType: "photo",
  };
  if (i.plantId) photoDetail.plantId = i.plantId;
  if (i.growId) photoDetail.growId = i.growId;
  if (i.tentId) photoDetail.tentId = i.tentId;
  if (i.plantName) photoDetail.plantName = i.plantName;
  if (i.tentName) photoDetail.tentName = i.tentName;

  const photo: RelativeTimelineCta = {
    key: "photo",
    label: "Upload photo",
    mode: "event",
    eventName: PLANT_QUICKLOG_PREFILL_EVENT,
    eventDetail: photoDetail,
    disabled: false,
  };

  return {
    copy: RELATIVE_TIMELINE_EMPTY_COPY,
    ctas: [quicklog, snapshot, photo],
  };
}
