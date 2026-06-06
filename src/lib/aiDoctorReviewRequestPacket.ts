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
import {
  buildAiCoachSensorSnapshotContext,
  type AiCoachSnapshotSource,
  type AiCoachSnapshotTrust,
} from "@/lib/aiCoachSensorSnapshotContext";

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

export interface AiDoctorReviewRequestSnapshotAnnotation {
  line: string;
  source: AiCoachSnapshotSource;
  stale: boolean;
  trust: AiCoachSnapshotTrust;
  includesValues: boolean;
  safetyNotes: string[];
  missingInformationHints: string[];
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
  /**
   * Additive: source-aware annotation built from the same shared helper
   * used by ai-coach. Optional so older fixtures stay valid. Preserves
   * provenance (live/manual/csv/demo/stale/invalid/unknown), surfaces
   * safety notes, and never relabels.
   */
  recentSensorSnapshotAnnotation?: AiDoctorReviewRequestSnapshotAnnotation | null;
}



export interface BuildAiDoctorReviewPacketArgs {
  plant: (AiDoctorContextPlantSource & { potSize?: string | null }) | null;
  timelineItems: readonly TimelineMemoryItem[] | null | undefined;
  context: AiDoctorContextResult;
  /** Injectable clock for deterministic staleness annotation. */
  now?: Date;
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


function pickMostRecentSnapshotItem(
  items: readonly TimelineMemoryItem[],
): { card: ManualSnapshotCard; t: number } | null {
  let best: { item: TimelineMemoryItem; t: number } | null = null;
  for (const it of items) {
    if (it.kind !== "manual_sensor_snapshot") continue;
    const t = Date.parse(it.occurredAt);
    if (!Number.isFinite(t)) continue;
    if (!best || t > best.t) best = { item: it, t };
  }
  if (!best || best.item.kind !== "manual_sensor_snapshot") return null;
  return { card: best.item.card as ManualSnapshotCard, t: best.t };
}

type ManualSnapshotCard = {
  capturedAt: string;
  severity: "ok" | "warning" | "invalid";
  source?: string;
  readings?: ReadonlyArray<{ field: string; value: number; unit: string }>;
};

function buildAnnotationFromCard(
  card: ManualSnapshotCard,
  now: Date | undefined,
): AiDoctorReviewRequestSnapshotAnnotation {
  // Project the card into the shape the shared helper consumes. We map
  // severity=invalid → source=invalid so safety notes propagate, and we
  // forward numeric readings so the shared helper can format them when
  // the source is trustworthy.
  const projected: Record<string, unknown> = {
    source: card.severity === "invalid" ? "invalid" : (card.source ?? "manual"),
    captured_at: card.capturedAt,
  };
  for (const r of card.readings ?? []) {
    if (typeof r.field === "string" && typeof r.value === "number" && Number.isFinite(r.value)) {
      projected[r.field] = r.value;
    }
  }
  const ctx = buildAiCoachSensorSnapshotContext(projected, { now });
  return {
    line: ctx.line,
    source: ctx.source,
    stale: ctx.stale,
    trust: ctx.trust,
    includesValues: ctx.includesValues,
    safetyNotes: [...ctx.safetyNotes],
    missingInformationHints: [...ctx.missingInformationHints],
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

  const latest = pickMostRecentSnapshotItem(sorted);
  let recentSensorSnapshot: AiDoctorReviewRequestSnapshot | null = null;
  let recentSensorSnapshotAnnotation: AiDoctorReviewRequestSnapshotAnnotation | null = null;
  if (latest) {
    const readings: AiDoctorReviewRequestSnapshotReading[] = [];
    for (const r of latest.card.readings ?? []) {
      if (
        typeof r.field === "string" &&
        typeof r.value === "number" &&
        Number.isFinite(r.value) &&
        typeof r.unit === "string"
      ) {
        readings.push({ field: r.field, value: r.value, unit: r.unit });
      }
    }
    recentSensorSnapshot = {
      capturedAt: latest.card.capturedAt,
      severity: latest.card.severity,
      readings,
    };
    recentSensorSnapshotAnnotation = buildAnnotationFromCard(latest.card, args.now);
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
    recentSensorSnapshot,
    recentSensorSnapshotAnnotation,
  };
}

