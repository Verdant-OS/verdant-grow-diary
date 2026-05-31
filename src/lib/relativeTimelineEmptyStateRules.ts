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

/** Human-readable disabled reasons. Never leak IDs/tokens — copy only. */
export const QUICKLOG_DISABLED_REASON =
  "Open a plant to add a Quick Log to its timeline.";
export const PHOTO_DISABLED_REASON =
  "Open a plant to attach a photo to its timeline.";

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

function nonBlank(v: string | null | undefined): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/**
 * Build the first-log empty state. Pure and deterministic.
 *
 * Degrade rules:
 *   - QuickLog CTA requires a plantId; without it, the CTA is disabled
 *     with an inline reason so users aren't sent into a broken flow.
 *   - Manual sensor snapshot routes to `/tents/:tentId` when tent context
 *     is known, otherwise to the generic `/sensors` route — always usable.
 *   - Photo CTA opens QuickLog with `eventType: "photo"` and the plant
 *     context. Disabled with an inline reason when no plantId exists.
 */
export function buildRelativeTimelineEmptyState(
  input: RelativeTimelineEmptyStateInput | null | undefined,
): RelativeTimelineEmptyStateView {
  const i = input ?? {};
  const plantId = nonBlank(i.plantId ?? null);
  const tentId = nonBlank(i.tentId ?? null);
  const growId = nonBlank(i.growId ?? null);
  const plantName = nonBlank(i.plantName ?? null);
  const tentName = nonBlank(i.tentName ?? null);

  const fullPrefill = buildPlantQuickLogPrefill({
    plantId,
    plantName,
    growId,
    tentId,
    tentName,
  });

  const quicklog: RelativeTimelineCta = plantId
    ? {
        key: "quicklog",
        label: "Add Quick Log",
        mode: "event",
        eventName: PLANT_QUICKLOG_PREFILL_EVENT,
        eventDetail: prefillToDetail(fullPrefill),
        disabled: false,
      }
    : {
        key: "quicklog",
        label: "Add Quick Log",
        mode: "event",
        eventName: PLANT_QUICKLOG_PREFILL_EVENT,
        eventDetail: null,
        disabled: true,
        disabledReason: QUICKLOG_DISABLED_REASON,
      };

  const snapshot: RelativeTimelineCta = {
    key: "manual-snapshot",
    label: "Add manual sensor snapshot",
    mode: "route",
    route: tentId ? `/tents/${tentId}` : SENSORS_FALLBACK_ROUTE,
    disabled: false,
  };

  let photo: RelativeTimelineCta;
  if (plantId) {
    const photoDetail: RelativeTimelineCtaEventDetail = {
      eventType: "photo",
      plantId,
    };
    if (growId) photoDetail.growId = growId;
    if (tentId) photoDetail.tentId = tentId;
    if (plantName) photoDetail.plantName = plantName;
    if (tentName) photoDetail.tentName = tentName;
    photo = {
      key: "photo",
      label: "Upload photo",
      mode: "event",
      eventName: PLANT_QUICKLOG_PREFILL_EVENT,
      eventDetail: photoDetail,
      disabled: false,
    };
  } else {
    photo = {
      key: "photo",
      label: "Upload photo",
      mode: "event",
      eventName: PLANT_QUICKLOG_PREFILL_EVENT,
      eventDetail: { eventType: "photo" },
      disabled: true,
      disabledReason: PHOTO_DISABLED_REASON,
    };
  }

  return {
    copy: RELATIVE_TIMELINE_EMPTY_COPY,
    ctas: [quicklog, snapshot, photo],
  };
}

