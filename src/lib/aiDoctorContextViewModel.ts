/**
 * aiDoctorContextViewModel — pure adapter that turns Plant + timeline
 * memory items into the deterministic `AiDoctorContextInput` consumed by
 * `evaluateAiDoctorContext`, plus presenter helpers (labels, summary).
 *
 * Hard constraints:
 *  - Pure: no React, no Supabase, no I/O.
 *  - No "live", "synced", "connected", or "imported" wording.
 *  - Never claims an AI diagnosis.
 */

import {
  AI_DOCTOR_RECENT_WINDOW_MS,
  evaluateAiDoctorContext,
  type AiDoctorContextInput,
  type AiDoctorContextEventInput,
  type AiDoctorContextManualSnapshotInput,
  type AiDoctorContextPlantInput,
  type AiDoctorContextReadiness,
  type AiDoctorContextResult,
} from "@/lib/aiDoctorContextRules";
import {
  normalizeRootZoneMetricsV1,
  type RootZoneObservationV1,
} from "@/lib/rootZoneObservationRules";
import type { TimelineMemoryItem } from "@/lib/timelineFilterRules";
import { classifyTimelineMemoryItem } from "@/lib/timelineFilterRules";

export interface AiDoctorContextPlantSource {
  id?: string | null;
  name?: string | null;
  strain?: string | null;
  stage?: string | null;
  medium?: string | null;
  photo?: string | null;
  hasPlantPhoto?: boolean;
  /** Declared plant type (autoflower / photoperiod / unknown). Never inferred. */
  plantType?: string | null;
}

/** Map a Plant record into the rules' plant input shape. */
export function plantToAiDoctorContextPlant(
  plant: AiDoctorContextPlantSource | null | undefined,
): AiDoctorContextPlantInput | null {
  if (!plant) return null;
  const hasPhoto =
    typeof plant.hasPlantPhoto === "boolean"
      ? plant.hasPlantPhoto
      : typeof plant.photo === "string" && plant.photo.trim().length > 0;
  return {
    hasProfile: true,
    strain: plant.strain ?? null,
    stage: plant.stage ?? null,
    medium: plant.medium ?? undefined,
    hasPlantPhoto: hasPhoto,
    plantType: plant.plantType ?? null,
  };
}

/** Map timeline memory items into the rules' event/snapshot inputs. */
export function timelineItemsToAiDoctorContextSources(
  items: readonly TimelineMemoryItem[] | null | undefined,
): {
  events: AiDoctorContextEventInput[];
  snapshots: AiDoctorContextManualSnapshotInput[];
} {
  const events: AiDoctorContextEventInput[] = [];
  const snapshots: AiDoctorContextManualSnapshotInput[] = [];
  if (!Array.isArray(items)) return { events, snapshots };
  for (const item of items) {
    const buckets = classifyTimelineMemoryItem(item);
    if (item.kind === "manual_sensor_snapshot") {
      snapshots.push({
        at: item.occurredAt,
        severity: item.card.severity ?? null,
      });
      events.push({ at: item.occurredAt, category: "manual_sensor_snapshot" });
      if (buckets.has("warnings")) {
        events.push({ at: item.occurredAt, category: "warnings" });
      }
      continue;
    }
    let category: AiDoctorContextEventInput["category"] = "other";
    if (buckets.has("watering")) category = "watering";
    else if (buckets.has("feeding")) category = "feeding";
    else if (buckets.has("photos")) category = "photos";
    else if (buckets.has("notes")) category = "notes";
    events.push({ at: item.occurredAt, category });
    if (buckets.has("warnings")) {
      events.push({ at: item.occurredAt, category: "warnings" });
    }
  }
  return { events, snapshots };
}

export interface AiDoctorRootZoneEventProjectionOptions {
  /** Injected clock keeps recency filtering deterministic in tests and callers. */
  now: number;
  /** Optional threshold override kept aligned with the readiness evaluator. */
  recentWindowMs?: number;
}

function normalizedEventTimestamp(at: AiDoctorContextEventInput["at"]): number | null {
  const timestamp =
    at instanceof Date
      ? at.getTime()
      : typeof at === "number"
        ? at
        : typeof at === "string"
          ? Date.parse(at)
          : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : null;
}

/**
 * Project trusted manual root-zone actions into plant-memory readiness.
 *
 * Measurements remain root-zone context and never become sensor snapshots.
 * An invalid optional metric does not erase a real manual watering/feeding
 * action, while malformed envelopes, untrusted provenance, and out-of-window
 * timestamps fail closed. Same-instant root-zone rows are treated as one
 * logical action with an explicit deterministic category tie-breaker.
 */
export function rootZoneObservationsToAiDoctorContextEvents(
  observations: readonly RootZoneObservationV1[] | null | undefined,
  options: AiDoctorRootZoneEventProjectionOptions,
): AiDoctorContextEventInput[] {
  if (!Array.isArray(observations) || !Number.isFinite(options.now)) return [];
  const recentWindowMs =
    typeof options.recentWindowMs === "number" &&
    Number.isFinite(options.recentWindowMs) &&
    options.recentWindowMs >= 0
      ? options.recentWindowMs
      : AI_DOCTOR_RECENT_WINDOW_MS;
  const candidates: Array<AiDoctorContextEventInput & { timestamp: number }> = [];
  for (const observation of observations) {
    if (!observation || typeof observation !== "object") continue;
    if (observation.source !== "manual") continue;
    if (observation.eventType !== "watering" && observation.eventType !== "feeding") continue;
    if (normalizeRootZoneMetricsV1(observation.metrics) === null) continue;

    const timestamp = Date.parse(observation.occurredAt);
    if (!Number.isFinite(timestamp)) continue;
    const ageMs = options.now - timestamp;
    if (ageMs < 0 || ageMs > recentWindowMs) continue;

    candidates.push({
      at: new Date(timestamp).toISOString(),
      category: observation.eventType,
      timestamp,
    });
  }

  candidates.sort((a, b) => {
    if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
    const aCategory = String(a.category);
    const bCategory = String(b.category);
    return aCategory < bCategory ? -1 : aCategory > bCategory ? 1 : 0;
  });
  const seenTimestamps = new Set<number>();
  const projected = candidates.filter(({ timestamp }) => {
    if (seenTimestamps.has(timestamp)) return false;
    seenTimestamps.add(timestamp);
    return true;
  });
  return projected.map(({ at, category }) => ({ at, category }));
}

export interface BuildAiDoctorContextArgs {
  plant: AiDoctorContextPlantSource | null | undefined;
  timelineItems: readonly TimelineMemoryItem[] | null | undefined;
  /** Successful, RLS-scoped root-zone read; never treated as sensor truth. */
  rootZoneObservations?: readonly RootZoneObservationV1[] | null;
  now?: number;
}

export function buildAiDoctorContextInput(args: BuildAiDoctorContextArgs): AiDoctorContextInput {
  const { events, snapshots } = timelineItemsToAiDoctorContextSources(args.timelineItems);
  const now = typeof args.now === "number" && Number.isFinite(args.now) ? args.now : Date.now();
  const rootZoneEvents = rootZoneObservationsToAiDoctorContextEvents(args.rootZoneObservations, {
    now,
  });
  // The manual Quick Log RPC can write both a typed root-zone row and a
  // same-instant diary companion. Prefer the typed watering/feeding category
  // and keep one logical event so readiness is neither inflated nor mislabeled.
  const rootZoneTimestamps = new Set(
    rootZoneEvents
      .map((event) => normalizedEventTimestamp(event.at))
      .filter((timestamp): timestamp is number => timestamp !== null),
  );
  const timelineEventsWithoutRootZoneCompanions = events.filter((event) => {
    const timestamp = normalizedEventTimestamp(event.at);
    return timestamp === null || !rootZoneTimestamps.has(timestamp);
  });
  return {
    plant: plantToAiDoctorContextPlant(args.plant),
    recentEvents: [...timelineEventsWithoutRootZoneCompanions, ...rootZoneEvents],
    recentManualSnapshots: snapshots,
    // Settled root-zone observations double as the root-zone-history signal:
    // feed guidance stays withheld until at least one exists.
    recentRootZoneObservations: rootZoneEvents.length,
    now,
  };
}

export function evaluateAiDoctorContextFromSources(
  args: BuildAiDoctorContextArgs,
): AiDoctorContextResult {
  return evaluateAiDoctorContext(buildAiDoctorContextInput(args));
}

// ---------------------------------------------------------------------------
// Presenter labels
// ---------------------------------------------------------------------------

export const AI_DOCTOR_READINESS_LABELS: Record<AiDoctorContextReadiness, string> = {
  strong: "Strong context",
  partial: "Partial context",
  insufficient: "Insufficient context",
};

export const AI_DOCTOR_MISSING_LABELS: Record<string, string> = {
  "plant-profile": "Plant profile",
  strain: "Strain",
  stage: "Stage",
  medium: "Growing medium",
  "plant-photo": "Plant photo",
  "recent-timeline-activity": "Recent timeline activity (last 7 days)",
  "recent-watering-or-feeding": "Recent watering or feeding log",
  "recent-manual-sensor-snapshot": "Recent manual sensor snapshot",
  "plant-type": "Plant type (autoflower or photoperiod)",
  "root-zone-history": "Root-zone history (dry-back, runoff, pot weight)",
};

export const AI_DOCTOR_EVIDENCE_LABELS: Record<string, string> = {
  "plant-profile": "Plant profile on file",
  strain: "Strain recorded",
  stage: "Stage recorded",
  medium: "Growing medium recorded",
  "plant-photo": "Plant photo available",
  "recent-timeline-activity": "Recent timeline activity",
  "recent-watering-or-feeding": "Recent watering or feeding logged",
  "recent-manual-sensor-snapshot": "Recent manual sensor snapshot",
  "fresh-manual-sensor-snapshot": "Manual sensor snapshot within 48 hours",
  "recent-warnings": "Recent warnings flagged",
  "plant-type": "Plant type recorded",
  "root-zone-history": "Root-zone history recorded",
};

export function labelMissing(code: string): string {
  return AI_DOCTOR_MISSING_LABELS[code] ?? code;
}

export function labelEvidence(code: string): string {
  return AI_DOCTOR_EVIDENCE_LABELS[code] ?? code;
}

// ---------------------------------------------------------------------------
// Tooltip / help copy (sourced from shared config, not duplicated in JSX)
// ---------------------------------------------------------------------------

import {
  AI_DOCTOR_CONTEXT_TOOLTIPS,
  AI_DOCTOR_CONTEXT_MISSING_TOOLTIPS,
} from "@/constants/aiDoctorContextReadiness";

/** Tooltip / help text for an evidence (present) item. */
export function tooltipForEvidence(code: string): string {
  return AI_DOCTOR_CONTEXT_TOOLTIPS[code] ?? "";
}

/** Tooltip / help text for a missing item. */
export function tooltipForMissing(code: string): string {
  return AI_DOCTOR_CONTEXT_MISSING_TOOLTIPS[code] ?? AI_DOCTOR_CONTEXT_TOOLTIPS[code] ?? "";
}

/**
 * Readiness items the panel can display with tooltips. Keeping this list
 * outside JSX prevents UI files from duplicating the readiness vocabulary.
 */
export const AI_DOCTOR_READINESS_ITEM_CODES = [
  "stage",
  "strain",
  "medium",
  "plant-photo",
  "recent-warnings",
] as const;

export type AiDoctorReadinessItemCode = (typeof AI_DOCTOR_READINESS_ITEM_CODES)[number];

export interface AiDoctorReadinessItemHelp {
  code: AiDoctorReadinessItemCode;
  label: string;
  tooltip: string;
}

export function getAiDoctorReadinessItemHelp(): AiDoctorReadinessItemHelp[] {
  return AI_DOCTOR_READINESS_ITEM_CODES.map((code) => ({
    code,
    label: labelEvidence(code),
    tooltip: tooltipForEvidence(code),
  }));
}
