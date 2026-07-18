/**
 * timelineSensorSourceBadgeRules
 *
 * Pure helpers that canonicalize a sensor-derived timeline entry's
 * provenance into one of the allowed Verdant sources:
 *
 *   live | manual | csv | demo | stale | invalid
 *
 * Rules:
 *  - The reading's trusted source field is the primary signal.
 *  - Missing / malformed / unknown source must NEVER render as live.
 *  - If a freshness rule explicitly classifies the snapshot as stale,
 *    "stale" wins over "live".
 *  - Callers may pass a `fallback` (e.g. "manual" for Quick Log
 *    sensor_snapshot entries which are intrinsically grower-entered).
 *    The fallback is only consulted when no usable raw source string
 *    is present. If no fallback is provided, the result is "invalid".
 *  - No I/O. No randomness. Deterministic.
 */
import {
  CANONICAL_SENSOR_SOURCES,
  assertCanonicalSensorSource,
  type CanonicalSensorSource,
} from "@/constants/sensorIngestProvenance";
import { evaluateCurrentLiveSensorTruth } from "@/lib/currentLiveSensorTruthRules";

export type TimelineSensorSourceKind = CanonicalSensorSource;

export interface TimelineSensorSourceBadge {
  kind: TimelineSensorSourceKind;
  label: string;
  /** Short explainer used as `title=` on the chip. */
  description: string;
  /** Whether this provenance can support stage/health interpretation. */
  canAssessStage: boolean;
}

export interface ClassifyTimelineSensorSourceInput {
  rawSource?: string | null | undefined;
  /** Exact upstream validation state. Only `ok` can support Live. */
  quality?: unknown;
  capturedAt?: string | null | undefined;
  now?: number;
  staleMs?: number;
  /**
   * Default source kind to use when no usable rawSource is present.
   * Used by Quick Log sensor_snapshot rendering (intrinsically manual).
   * Must be one of the allowed kinds. Defaults to "invalid".
   */
  fallback?: TimelineSensorSourceKind;
  /**
   * Persisted diary snapshots cannot carry the raw row evidence needed to
   * corroborate a historical `live` claim. They therefore fail closed.
   */
  context?: "direct" | "persisted_snapshot";
}

const ALLOWED: ReadonlySet<TimelineSensorSourceKind> = new Set(CANONICAL_SENSOR_SOURCES);

const LABELS: Record<TimelineSensorSourceKind, string> = {
  live: "Source: live",
  manual: "Source: manual",
  csv: "Source: CSV",
  demo: "Source: demo",
  stale: "Source: stale",
  invalid: "Source: invalid",
};

const DESCRIPTIONS: Record<TimelineSensorSourceKind, string> = {
  live: "Reading from a connected live source.",
  manual: "Reading entered manually by the grower.",
  csv: "Historical CSV context — not live sensor data.",
  demo: "Demo data — not a real sensor reading.",
  stale: "Reading is older than the freshness window — not current telemetry.",
  invalid: "Source unknown or malformed — not treated as healthy live data.",
};

function normalize(raw: string | null | undefined): TimelineSensorSourceKind | null {
  return assertCanonicalSensorSource(raw);
}

export function classifyTimelineSensorSource(
  input: ClassifyTimelineSensorSourceInput,
): TimelineSensorSourceBadge {
  const rawNormalized = normalize(input.rawSource);
  const fallback: TimelineSensorSourceKind =
    input.fallback && ALLOWED.has(input.fallback) ? input.fallback : "invalid";

  // Freshness proof is mandatory for Live. Missing/invalid timing fails
  // closed as invalid instead of silently assuming current telemetry.
  const freshness = (() => {
    const staleMs = typeof input.staleMs === "number" && input.staleMs > 0 ? input.staleMs : null;
    if (staleMs === null || !input.capturedAt) return "unknown" as const;
    const ts = Date.parse(input.capturedAt);
    if (!Number.isFinite(ts)) return "unknown" as const;
    const now = typeof input.now === "number" ? input.now : Date.now();
    const age = now - ts;
    if (age < 0) return "unknown" as const;
    return age > staleMs ? ("stale" as const) : ("fresh" as const);
  })();

  const hasRawSource = typeof input.rawSource === "string" && input.rawSource.trim().length > 0;
  let kind: TimelineSensorSourceKind = rawNormalized ?? (hasRawSource ? "invalid" : fallback);

  if (input.context === "persisted_snapshot" && kind === "live") {
    kind = "invalid";
  }

  if (kind === "live") {
    const truth = evaluateCurrentLiveSensorTruth({
      source: kind,
      quality: input.quality,
      freshness,
    });
    if (!truth.qualityIsOk || freshness === "unknown") {
      kind = "invalid";
    } else if (freshness === "stale") {
      kind = "stale";
    } else if (!truth.isCurrentLive) {
      kind = "invalid";
    }
  }

  return {
    kind,
    label: LABELS[kind],
    description: DESCRIPTIONS[kind],
    canAssessStage: kind === "live" || kind === "manual" || kind === "csv",
  };
}

export function timelineSensorSourceBadgeTestId(kind: TimelineSensorSourceKind): string {
  return `timeline-sensor-source-badge-${kind}`;
}
