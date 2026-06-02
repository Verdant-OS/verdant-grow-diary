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
  evaluateAiDoctorContext,
  type AiDoctorContextInput,
  type AiDoctorContextEventInput,
  type AiDoctorContextManualSnapshotInput,
  type AiDoctorContextPlantInput,
  type AiDoctorContextReadiness,
  type AiDoctorContextResult,
} from "@/lib/aiDoctorContextRules";
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

export interface BuildAiDoctorContextArgs {
  plant: AiDoctorContextPlantSource | null | undefined;
  timelineItems: readonly TimelineMemoryItem[] | null | undefined;
  now?: number;
}

export function buildAiDoctorContextInput(
  args: BuildAiDoctorContextArgs,
): AiDoctorContextInput {
  const { events, snapshots } = timelineItemsToAiDoctorContextSources(
    args.timelineItems,
  );
  return {
    plant: plantToAiDoctorContextPlant(args.plant),
    recentEvents: events,
    recentManualSnapshots: snapshots,
    now: args.now,
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

export const AI_DOCTOR_READINESS_LABELS: Record<
  AiDoctorContextReadiness,
  string
> = {
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
};

export function labelMissing(code: string): string {
  return AI_DOCTOR_MISSING_LABELS[code] ?? code;
}

export function labelEvidence(code: string): string {
  return AI_DOCTOR_EVIDENCE_LABELS[code] ?? code;
}
