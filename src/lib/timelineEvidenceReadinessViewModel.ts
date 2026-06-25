/**
 * timelineEvidenceReadinessViewModel — pure presenter helper for the
 * "AI Doctor Context Readiness" preview that runs BEFORE any AI call.
 *
 * Purpose: summarise plant/tent evidence that AI Doctor will see —
 * diary/Quick Log counts, photos, sensor snapshots, watering/feeding
 * history, alerts, and source-quality — and surface missing context
 * so growers know whether AI Doctor will have enough to work with.
 *
 * Hard constraints (tests + static safety):
 *  - Pure: no I/O, no Supabase, no React, no fetch, no timers, no
 *    automation, no device control, no model calls.
 *  - Reuses existing source/trust rules: `sensorSourceLabelRules`
 *    (label) and the existing `SensorSourceTag` contract. Demo, CSV,
 *    Manual are NEVER re-labeled "Live". Stale / invalid / demo are
 *    NEVER classified as healthy.
 *  - Never reads raw_payload, vendor metadata, tokens, private IDs.
 *    Only the canonical AiDoctorContext fields and optional caller
 *    counts are used.
 *  - Never triggers an AI call. View-model is a presentation summary
 *    only.
 */

import type { SensorSourceTag } from "@/lib/aiDoctorContextCompiler";
import type { AiDoctorContext } from "@/lib/aiDoctorEngine";
import { resolveSensorSourceLabel } from "@/lib/sensorSourceLabelRules";

/** Optional grower-supplied evidence counts the compiler doesn't track. */
export interface TimelineEvidenceReadinessExtras {
  /** Recent photo count (last 14d). Caller resolves from gallery. */
  readonly recentPhotoCount?: number | null;
  /** Open alerts already loaded for this plant/tent. */
  readonly openAlertsCount?: number | null;
  /** Whether the plant's growing medium is known (soil, coco, hydro, …). */
  readonly mediumKnown?: boolean | null;
  /** Whether the plant's pot size is recorded. */
  readonly potSizeKnown?: boolean | null;
}

export type ReadinessTone = "ready" | "limited" | "untrusted";

export interface ReadinessSourceBadge {
  readonly source: SensorSourceTag;
  /** User-facing label (e.g. "Manual", "Live", "CSV"). */
  readonly label: string;
  readonly sampleCount: number;
  /** True ONLY for live + manual with samples. Stale/invalid/demo/csv → false. */
  readonly trustworthy: boolean;
}

export interface ReadinessMissingFlag {
  readonly code:
    | "no_recent_photos"
    | "no_recent_sensor_snapshot"
    | "no_recent_watering"
    | "no_recent_feeding"
    | "unknown_stage"
    | "unknown_medium"
    | "unknown_pot_size";
  readonly message: string;
}

export interface TimelineEvidenceReadinessView {
  readonly tone: ReadinessTone;
  readonly headline: string;
  readonly counts: {
    readonly recentLogs: number;
    readonly recentPhotos: number;
    readonly recentSensorSnapshots: number;
    readonly recentWatering: number;
    readonly recentFeeding: number;
    readonly openAlerts: number;
  };
  readonly sourceBadges: ReadonlyArray<ReadinessSourceBadge>;
  readonly missing: ReadonlyArray<ReadinessMissingFlag>;
  /** True when any sensor group is csv/demo/stale/invalid. */
  readonly hasUntrustedSensorSource: boolean;
  /** True when at least one trustworthy (live/manual) source has samples. */
  readonly hasTrustworthySensorSource: boolean;
}

export const READINESS_READY_COPY =
  "AI Doctor has recent plant context to review." as const;
export const READINESS_LIMITED_COPY =
  "AI Doctor can still help, but confidence may be limited." as const;
export const READINESS_UNTRUSTED_COPY =
  "Some sensor context is not trustworthy and should be reviewed before relying on AI Doctor." as const;

const WATERING_EVENT_TYPES = new Set(["watering", "water"]);
const FEEDING_EVENT_TYPES = new Set(["feeding", "feed", "nutrient", "nutrients"]);

function clampCount(v: number | null | undefined): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return 0;
  return Math.floor(v);
}

function isTrustworthySource(s: SensorSourceTag): boolean {
  return s === "live" || s === "manual";
}

function buildSourceBadges(
  context: AiDoctorContext,
): ReadinessSourceBadge[] {
  return context.sensor_groups
    .filter((g) => g.sample_count > 0)
    .map((g) => {
      const resolved = resolveSensorSourceLabel({ source: g.source });
      return {
        source: g.source,
        label: resolved.label,
        sampleCount: g.sample_count,
        trustworthy: isTrustworthySource(g.source),
      };
    });
}

function countByEventType(
  context: AiDoctorContext,
  match: (eventType: string) => boolean,
): number {
  let n = 0;
  for (const ev of context.recent_grow_events) {
    if (typeof ev.event_type === "string" && match(ev.event_type.toLowerCase())) {
      n += 1;
    }
  }
  return n;
}

/**
 * Build a sanitized, deterministic readiness view from a compiled
 * AI Doctor context plus optional caller-side counts.
 *
 * Never invents evidence. Never re-labels sources. Never triggers AI.
 */
export function buildTimelineEvidenceReadinessView(
  context: AiDoctorContext,
  extras: TimelineEvidenceReadinessExtras = {},
): TimelineEvidenceReadinessView {
  const recentPhotos = clampCount(extras.recentPhotoCount);
  const openAlerts = clampCount(extras.openAlertsCount);

  const recentWatering = countByEventType(context, (t) =>
    WATERING_EVENT_TYPES.has(t),
  );
  const recentFeeding = countByEventType(context, (t) =>
    FEEDING_EVENT_TYPES.has(t),
  );

  const sourceBadges = buildSourceBadges(context);
  const recentSensorSnapshots = sourceBadges.reduce(
    (sum, b) => sum + b.sampleCount,
    0,
  );

  const hasUntrustedSensorSource = sourceBadges.some((b) => !b.trustworthy);
  const hasTrustworthySensorSource = sourceBadges.some((b) => b.trustworthy);

  const missing: ReadinessMissingFlag[] = [];
  if (recentPhotos === 0) {
    missing.push({
      code: "no_recent_photos",
      message: "No recent photos attached.",
    });
  }
  if (recentSensorSnapshots === 0) {
    missing.push({
      code: "no_recent_sensor_snapshot",
      message: "No recent sensor snapshot.",
    });
  }
  if (recentWatering === 0) {
    missing.push({
      code: "no_recent_watering",
      message: "No recent watering history.",
    });
  }
  if (recentFeeding === 0) {
    missing.push({
      code: "no_recent_feeding",
      message: "No recent feeding history.",
    });
  }
  if (!context.stage) {
    missing.push({ code: "unknown_stage", message: "Plant stage unknown." });
  }
  if (extras.mediumKnown === false) {
    missing.push({ code: "unknown_medium", message: "Growing medium unknown." });
  }
  if (extras.potSizeKnown === false) {
    missing.push({ code: "unknown_pot_size", message: "Pot size unknown." });
  }

  // Tone: untrusted dominates (sensor truth comes first). Otherwise:
  //  - ready when trustworthy sensors + any recent logs + a photo exists
  //  - limited otherwise
  let tone: ReadinessTone;
  if (hasUntrustedSensorSource && !hasTrustworthySensorSource) {
    tone = "untrusted";
  } else if (
    hasTrustworthySensorSource &&
    context.recent_grow_events.length > 0 &&
    recentPhotos > 0
  ) {
    tone = "ready";
  } else {
    tone = "limited";
  }

  // If ANY untrusted source exists alongside trustworthy ones, still
  // surface the caution headline — never let stale/csv/demo be passed
  // off as healthy. This keeps the headline honest while the badges and
  // missing list show the full picture.
  if (hasUntrustedSensorSource) tone = "untrusted";

  const headline =
    tone === "ready"
      ? READINESS_READY_COPY
      : tone === "untrusted"
        ? READINESS_UNTRUSTED_COPY
        : READINESS_LIMITED_COPY;

  return {
    tone,
    headline,
    counts: {
      recentLogs: context.recent_grow_events.length,
      recentPhotos,
      recentSensorSnapshots,
      recentWatering,
      recentFeeding,
      openAlerts,
    },
    sourceBadges: Object.freeze(sourceBadges),
    missing: Object.freeze(missing),
    hasUntrustedSensorSource,
    hasTrustworthySensorSource,
  };
}
