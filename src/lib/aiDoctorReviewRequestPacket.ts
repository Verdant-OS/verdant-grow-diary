/**
 * aiDoctorReviewRequestPacket — pure builder for the compact, bounded
 * context packet sent to the server-side AI Doctor review endpoint.
 *
 * Hard constraints:
 *  - Pure: no React, no Supabase, no I/O, no model calls.
 *  - Never includes raw_payload, secrets, tokens, service_role, env values,
 *    or unbounded history.
 *  - Recent events capped to 20; only the most recent sensor snapshot.
 *  - Never claims a diagnosis. No banned words: confirmed, certain, cured,
 *    guaranteed, live, synced, connected, imported.
 */
import type { AiDoctorContextResult } from "@/lib/aiDoctorContextRules";
import type { TimelineMemoryItem } from "@/lib/timelineFilterRules";
import { classifyTimelineMemoryItem } from "@/lib/timelineFilterRules";
import type { AiDoctorContextPlantSource } from "@/lib/aiDoctorContextViewModel";

export const AI_DOCTOR_REVIEW_PACKET_EVENT_CAP = 20;
export const AI_DOCTOR_REVIEW_PACKET_SCHEMA_VERSION = 1 as const;

export interface AiDoctorReviewRequestPlantProfile {
  strain: string | null;
  stage: string | null;
  medium: string | null;
  potSize: string | null;
}

export interface AiDoctorReviewRequestEvent {
  at: string;
  category: string;
}

export interface AiDoctorReviewRequestSnapshotReading {
  field: string;
  value: number;
  unit: string;
}

export interface AiDoctorReviewRequestSnapshot {
  capturedAt: string;
  severity: "ok" | "warning" | "invalid";
  readings: AiDoctorReviewRequestSnapshotReading[];
}

export interface AiDoctorReviewRequestPacket {
  schemaVersion: typeof AI_DOCTOR_REVIEW_PACKET_SCHEMA_VERSION;
  plant: AiDoctorReviewRequestPlantProfile;
  readiness: {
    state: AiDoctorContextResult["readiness"];
    evidence: string[];
    missing: string[];
  };
  recentEvents: AiDoctorReviewRequestEvent[];
  recentSensorSnapshot: AiDoctorReviewRequestSnapshot | null;
}

export interface BuildAiDoctorReviewPacketArgs {
  plant: (AiDoctorContextPlantSource & { potSize?: string | null }) | null;
  timelineItems: readonly TimelineMemoryItem[] | null | undefined;
  context: AiDoctorContextResult;
}

function cleanStringOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function pickEventCategory(item: TimelineMemoryItem): string {
  if (item.kind === "manual_sensor_snapshot") return "manual_sensor_snapshot";
  const buckets = classifyTimelineMemoryItem(item);
  for (const k of ["watering", "feeding", "photos", "notes", "warnings"] as const) {
    if (buckets.has(k)) return k;
  }
  return "other";
}

function pickMostRecentSnapshot(
  items: readonly TimelineMemoryItem[],
): AiDoctorReviewRequestSnapshot | null {
  let best: { item: TimelineMemoryItem; t: number } | null = null;
  for (const it of items) {
    if (it.kind !== "manual_sensor_snapshot") continue;
    const t = Date.parse(it.occurredAt);
    if (!Number.isFinite(t)) continue;
    if (!best || t > best.t) best = { item: it, t };
  }
  if (!best || best.item.kind !== "manual_sensor_snapshot") return null;
  const card = best.item.card;
  const readings: AiDoctorReviewRequestSnapshotReading[] = [];
  for (const r of card.readings ?? []) {
    if (
      typeof r.field === "string" &&
      typeof r.value === "number" &&
      Number.isFinite(r.value) &&
      typeof r.unit === "string"
    ) {
      readings.push({ field: r.field, value: r.value, unit: r.unit });
    }
  }
  return {
    capturedAt: card.capturedAt,
    severity: card.severity,
    readings,
  };
}

/**
 * Build a compact, bounded packet for the server-side review request.
 * The returned object is JSON-safe and contains no sensitive keys.
 */
export function buildAiDoctorReviewRequestPacket(
  args: BuildAiDoctorReviewPacketArgs,
): AiDoctorReviewRequestPacket {
  const items = Array.isArray(args.timelineItems) ? args.timelineItems : [];

  const sorted = [...items].sort((a, b) => {
    const ta = Date.parse(a.occurredAt) || 0;
    const tb = Date.parse(b.occurredAt) || 0;
    return tb - ta;
  });

  const recentEvents: AiDoctorReviewRequestEvent[] = [];
  for (const it of sorted) {
    if (recentEvents.length >= AI_DOCTOR_REVIEW_PACKET_EVENT_CAP) break;
    const at = cleanStringOrNull(it.occurredAt);
    if (!at) continue;
    recentEvents.push({ at, category: pickEventCategory(it) });
  }

  return {
    schemaVersion: AI_DOCTOR_REVIEW_PACKET_SCHEMA_VERSION,
    plant: {
      strain: cleanStringOrNull(args.plant?.strain),
      stage: cleanStringOrNull(args.plant?.stage),
      medium: cleanStringOrNull(args.plant?.medium),
      potSize: cleanStringOrNull(args.plant?.potSize),
    },
    readiness: {
      state: args.context.readiness,
      evidence: [...args.context.evidence],
      missing: [...args.context.missing],
    },
    recentEvents,
    recentSensorSnapshot: pickMostRecentSnapshot(sorted),
  };
}
