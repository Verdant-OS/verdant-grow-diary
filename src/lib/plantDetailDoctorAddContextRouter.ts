/**
 * plantDetailDoctorAddContextRouter — pure decision helper that picks
 * the safest existing context-capture flow when a grower taps
 * "Add context first" on the Plant Detail Doctor launch surfaces.
 *
 * Deterministic. No React, no I/O, no AI calls, no writes, no RPC, no
 * scheduling, no calendar/notification/email side effects, no hardware
 * steering. Returns a routing decision the caller can execute against
 * existing safe surfaces:
 *
 *   - QuickLog (via the existing `verdant:open-quicklog` event)
 *   - `/sensors` (existing manual sensor flow, scoped by growId)
 *
 * Photo capture currently lives inside QuickLog, so the "photo" gap
 * also routes to QuickLog with a `suggestPhoto` hint that the existing
 * flow may consume safely (unknown hints are ignored by AppShell).
 *
 * No internal IDs, tokens, raw payloads, storage paths, or provenance
 * markers are emitted in visible labels — only the deterministic short
 * copy below.
 */
import {
  buildPlantQuickLogPrefill,
  PLANT_QUICKLOG_PREFILL_EVENT,
  type PlantQuickLogPrefill,
} from "@/lib/plantQuickLogPrefillRules";
import { buildDailyCheckEntryHref } from "@/lib/dailyCheckPostSubmitRules";
import { sensorsPath } from "@/lib/routes";

export type AddContextGap = "note" | "sensor" | "photo";

export type AddContextRouteKind = "quicklog_note" | "quicklog_photo" | "sensor_route" | "none";

export interface AddContextRouteDecision {
  kind: AddContextRouteKind;
  /** Visible button label for the affordance. */
  label: string;
  /** Short helper copy explaining what context will help AI Doctor. */
  helper: string;
  /** Ordered list of gaps detected, highest priority first. */
  gaps: AddContextGap[];
  /** Prefill payload to dispatch on `verdant:open-quicklog`. */
  quickLogEvent?: {
    type: typeof PLANT_QUICKLOG_PREFILL_EVENT;
    detail: PlantQuickLogPrefill & { suggestPhoto?: true };
  };
  /** Route target for `<Link to>` navigation. */
  to?: string;
}

export interface AddContextRouterInput {
  plantId: string | null | undefined;
  plantName?: string | null;
  growId: string | null | undefined;
  tentId: string | null | undefined;
  tentName?: string | null;
  hasTimelineOrNote: boolean;
  hasRecentSensorSnapshot: boolean;
  hasRecentPhoto: boolean;
}

/** Visible helper line for the "Add context first" affordance. */
export const ADD_CONTEXT_HELPER_COPY =
  "Add a quick note, sensor snapshot, or photo so AI Doctor has better context.";

const QUICKLOG_FALLBACK_LABEL = "Add context first";

function buildTargetPreservingQuickLogRoute(plantId: string | null | undefined): string {
  const safePlantId = plantId?.trim();
  if (!safePlantId) return "/daily-check?from=plant-detail&method=note";
  return buildDailyCheckEntryHref({
    plantId: safePlantId,
    source: "plant-detail",
    method: "note",
  });
}

function detectGaps(input: AddContextRouterInput): AddContextGap[] {
  const gaps: AddContextGap[] = [];
  if (!input.hasTimelineOrNote) gaps.push("note");
  if (!input.hasRecentSensorSnapshot) gaps.push("sensor");
  if (!input.hasRecentPhoto) gaps.push("photo");
  return gaps;
}

/**
 * Build the routing decision. Deterministic priority when multiple gaps
 * exist: note → sensor → photo. When no gap exists, returns kind
 * "none" so the caller can hide the affordance (Ask Doctor remains
 * available either way).
 */
export function buildPlantDetailDoctorAddContextRoute(
  input: AddContextRouterInput,
): AddContextRouteDecision {
  const gaps = detectGaps(input);

  if (gaps.length === 0) {
    return {
      kind: "none",
      label: QUICKLOG_FALLBACK_LABEL,
      helper: ADD_CONTEXT_HELPER_COPY,
      gaps,
    };
  }

  const primary = gaps[0];

  if (primary === "note") {
    const prefill = buildPlantQuickLogPrefill({
      plantId: input.plantId,
      plantName: input.plantName ?? null,
      growId: input.growId,
      tentId: input.tentId,
      tentName: input.tentName ?? null,
    });
    // Never dispatch a generic QuickLog event when identity is incomplete:
    // the global dialog may otherwise fall back to a different eligible
    // plant. Daily Check resolves the requested plant from current data and
    // keeps the grower in control when grow/tent context is missing.
    if (!prefill) {
      return {
        kind: "quicklog_note",
        label: "Add a quick note",
        helper: ADD_CONTEXT_HELPER_COPY,
        gaps,
        to: buildTargetPreservingQuickLogRoute(input.plantId),
      };
    }
    return {
      kind: "quicklog_note",
      label: "Add a quick note",
      helper: ADD_CONTEXT_HELPER_COPY,
      gaps,
      quickLogEvent: {
        type: PLANT_QUICKLOG_PREFILL_EVENT,
        detail: prefill,
      },
    };
  }

  if (primary === "sensor") {
    return {
      kind: "sensor_route",
      label: "Add sensor snapshot",
      helper: ADD_CONTEXT_HELPER_COPY,
      gaps,
      to: sensorsPath(input.growId ?? null),
    };
  }

  // primary === "photo"
  const prefill = buildPlantQuickLogPrefill({
    plantId: input.plantId,
    plantName: input.plantName ?? null,
    growId: input.growId,
    tentId: input.tentId,
    tentName: input.tentName ?? null,
  });
  if (!prefill) {
    return {
      kind: "quicklog_photo",
      label: "Add a photo",
      helper: ADD_CONTEXT_HELPER_COPY,
      gaps,
      to: buildTargetPreservingQuickLogRoute(input.plantId),
    };
  }
  return {
    kind: "quicklog_photo",
    label: "Add a photo",
    helper: ADD_CONTEXT_HELPER_COPY,
    gaps,
    quickLogEvent: {
      type: PLANT_QUICKLOG_PREFILL_EVENT,
      detail: { ...prefill, suggestPhoto: true as const },
    },
  };
}
