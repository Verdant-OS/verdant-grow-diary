/**
 * plantDetailQuickActions — pure view-model for the Plant Detail Quick
 * Actions row.
 *
 * Deterministic. No React, no I/O, no Supabase, no fetch, no privileged
 * keys, Builds entries that either:
 *   - dispatch the existing `verdant:open-quicklog` event with already-known
 *     plant/tent/grow context as the event detail (PLANT_QUICKLOG_PREFILL_EVENT),
 *   - link to an existing route (`/sensors`, `/doctor`), or
 *   - scroll to an in-page section anchor (Plant Relative Timeline).
 *
 * The helper never invents context. Missing context surfaces as a disabled
 * entry with a short observational reason (kept visible — never silently
 * removed). Callers must pass what they already have.
 */
import { sensorsPath } from "@/lib/routes";

export type PlantDetailQuickActionKind =
  | "quicklog"
  | "manual_sensor_snapshot"
  | "upload_photo"
  | "ask_doctor"
  | "view_timeline";

/** Payload dispatched on the `verdant:open-quicklog` event. */
export interface PlantDetailQuickLogEventPayload {
  plantId: string;
  plantName: string | null;
  growId: string | null;
  tentId: string | null;
  tentName: string | null;
  eventType: "observation";
  suggestSnapshot: true;
}

export interface PlantDetailQuickActionEntry {
  kind: PlantDetailQuickActionKind;
  label: string;
  description: string;
  /** Defined when the entry navigates to an existing route. */
  href?: string;
  /** Defined when the entry dispatches a global event instead of navigating. */
  event?: "open-quicklog";
  /** Forwarded as CustomEvent `detail` for `event` entries. */
  eventPayload?: PlantDetailQuickLogEventPayload | null;
  /** Defined for scroll entries — DOM id to scroll/focus to. */
  scrollTargetId?: string;
  /** Stable testId for assertions. */
  testId: string;
  /** True when required context is missing. */
  disabled?: boolean;
  /** Short observational reason rendered alongside a disabled entry. */
  disabledReason?: string;
}

export interface PlantDetailQuickActionsInput {
  plantId: string | null | undefined;
  plantName?: string | null;
  growId?: string | null;
  tentId?: string | null;
  tentName?: string | null;
}

export const PLANT_RELATIVE_TIMELINE_ANCHOR_ID = "plant-relative-timeline" as const;

const LABELS: Record<
  PlantDetailQuickActionKind,
  { label: string; description: string }
> = {
  quicklog: {
    label: "Quick Log",
    description: "Record an observation or grow action.",
  },
  manual_sensor_snapshot: {
    label: "Manual Sensor Snapshot",
    description: "Add current tent readings by hand.",
  },
  upload_photo: {
    label: "Upload Photo",
    description: "Attach a plant photo to visual history.",
  },
  ask_doctor: {
    label: "Ask Doctor",
    description: "Review this plant with existing context.",
  },
  view_timeline: {
    label: "View Timeline",
    description: "Jump to this plant's history.",
  },
};

/** Deterministic Plant Detail quick-action list. */
export function buildPlantDetailQuickActions(
  input: PlantDetailQuickActionsInput,
): PlantDetailQuickActionEntry[] {
  const plantId = input.plantId ?? null;
  const plantName = input.plantName ?? null;
  const growId = input.growId ?? null;
  const tentId = input.tentId ?? null;
  const tentName = input.tentName ?? null;

  const quickLogPayload: PlantDetailQuickLogEventPayload | null = plantId
    ? {
        plantId,
        plantName,
        growId,
        tentId,
        tentName,
        eventType: "observation",
        suggestSnapshot: true,
      }
    : null;

  // Ask Doctor: route to existing /doctor; only attach plantId as a hint
  // when available. Unknown params are ignored safely by the route.
  const doctorHref = plantId
    ? `/doctor?plantId=${encodeURIComponent(plantId)}`
    : "/doctor";

  return [
    {
      kind: "quicklog",
      ...LABELS.quicklog,
      event: "open-quicklog",
      eventPayload: quickLogPayload,
      testId: "plant-detail-quick-action-quicklog",
      disabled: !plantId,
      disabledReason: plantId
        ? undefined
        : "Plant context is not loaded yet.",
    },
    {
      kind: "manual_sensor_snapshot",
      ...LABELS.manual_sensor_snapshot,
      // The /sensors route does not yet accept a `tentId` query, so we
      // safely fall back to the grow-scoped sensors view when growId is
      // known, otherwise plain `/sensors`.
      href: sensorsPath(growId),
      testId: "plant-detail-quick-action-manual-sensor-snapshot",
    },
    {
      kind: "upload_photo",
      ...LABELS.upload_photo,
      // Photo upload lives inside the existing QuickLog dialog (file picker
      // is available there). Opening QuickLog with plant/tent/grow context
      // is the safest existing entry point — no new upload route, no direct
      // storage writes from here.
      event: "open-quicklog",
      eventPayload: quickLogPayload,
      testId: "plant-detail-quick-action-upload-photo",
      disabled: !plantId,
      disabledReason: plantId
        ? undefined
        : "Plant context is not loaded yet.",
    },
    {
      kind: "ask_doctor",
      ...LABELS.ask_doctor,
      href: doctorHref,
      testId: "plant-detail-quick-action-ask-doctor",
      disabled: !plantId,
      disabledReason: plantId
        ? undefined
        : "Plant context is not loaded yet.",
    },
    {
      kind: "view_timeline",
      ...LABELS.view_timeline,
      scrollTargetId: PLANT_RELATIVE_TIMELINE_ANCHOR_ID,
      testId: "plant-detail-quick-action-view-timeline",
    },
  ];
}
