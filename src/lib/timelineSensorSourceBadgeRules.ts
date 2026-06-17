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
  type CanonicalSensorSource,
} from "@/constants/sensorIngestProvenance";

export type TimelineSensorSourceKind = CanonicalSensorSource;

export interface TimelineSensorSourceBadge {
  kind: TimelineSensorSourceKind;
  label: string;
  /** Short explainer used as `title=` on the chip. */
  description: string;
}

export interface ClassifyTimelineSensorSourceInput {
  rawSource?: string | null | undefined;
  capturedAt?: string | null | undefined;
  now?: number;
  staleMs?: number;
  /**
   * Default source kind to use when no usable rawSource is present.
   * Used by Quick Log sensor_snapshot rendering (intrinsically manual).
   * Must be one of the allowed kinds. Defaults to "invalid".
   */
  fallback?: TimelineSensorSourceKind;
}

const ALLOWED: ReadonlySet<TimelineSensorSourceKind> = new Set(
  CANONICAL_SENSOR_SOURCES,
);

const LABELS: Record<TimelineSensorSourceKind, string> = {
  live: "Source: live",
  manual: "Source: manual",
  csv: "Source: CSV",
  demo: "Source: demo",
  stale: "Source: stale",
  invalid: "Source: invalid",
};

const DESCRIPTIONS: Record<TimelineSensorSourceKind, string> = {
  live: "Reading from a connected live ingest source.",
  manual: "Reading entered manually by the grower.",
  csv: "Historical CSV context — not live sensor data.",
  demo: "Demo data — not a real sensor reading.",
  stale: "Reading is older than the freshness window — not current telemetry.",
  invalid: "Source unknown or malformed — not treated as healthy live data.",
};

function normalize(raw: string | null | undefined): TimelineSensorSourceKind | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v.length === 0) return null;
  if (v === "live" || v === "ingest" || v === "sensor" || v === "supabase") return "live";
  if (v === "manual" || v === "user" || v === "entry" || v === "log") return "manual";
  if (v === "csv" || v === "import" || v === "imported") return "csv";
  if (v === "demo" || v === "mock" || v === "fake" || v === "sample" || v === "fixture") return "demo";
  if (v === "stale") return "stale";
  if (v === "invalid") return "invalid";
  return null;
}

export function classifyTimelineSensorSource(
  input: ClassifyTimelineSensorSourceInput,
): TimelineSensorSourceBadge {
  const rawNormalized = normalize(input.rawSource);
  const fallback: TimelineSensorSourceKind =
    input.fallback && ALLOWED.has(input.fallback) ? input.fallback : "invalid";

  // Freshness check (only applied when we'd otherwise call it live).
  const isStale = (() => {
    const staleMs = typeof input.staleMs === "number" && input.staleMs > 0 ? input.staleMs : null;
    if (staleMs === null) return false;
    if (!input.capturedAt) return true;
    const ts = Date.parse(input.capturedAt);
    if (!Number.isFinite(ts)) return true;
    const now = typeof input.now === "number" ? input.now : Date.now();
    return now - ts > staleMs;
  })();

  let kind: TimelineSensorSourceKind = rawNormalized ?? fallback;

  // Stale freshness rule only downgrades live readings — manual / csv / demo
  // remain explicitly labeled.
  if (kind === "live" && isStale) {
    kind = "stale";
  }

  return {
    kind,
    label: LABELS[kind],
    description: DESCRIPTIONS[kind],
  };
}

export function timelineSensorSourceBadgeTestId(kind: TimelineSensorSourceKind): string {
  return `timeline-sensor-source-badge-${kind}`;
}
