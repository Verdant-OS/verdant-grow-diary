/**
 * dashboardSensorHealthViewModel — pure presenter for the Dashboard
 * "Sensor Health" summary card.
 *
 * Combines the existing snapshot loader status, source label rules, and
 * `evaluateSensorQuality` into a single read-only view-model so JSX stays
 * presentation-only. Never classifies unknown/missing telemetry as
 * healthy, never promotes manual/csv/demo/stale/invalid to "Live".
 *
 * Pure. No I/O. No React. No Supabase. No alerts written. No Action
 * Queue writes. No automation. No device control.
 */
import type { SnapshotState } from "@/hooks/useLatestSensorSnapshot";
import {
  isStale,
  type SensorSnapshot,
  type SnapshotSource,
} from "@/lib/sensorSnapshot";
import {
  evaluateSensorQuality,
  type SensorQualityResult,
} from "@/lib/sensorQuality";
import { resolveSensorSourceLabel } from "@/lib/sensorSourceLabelRules";
import type { SensorReadingSource } from "@/mock";

export type SensorHealthStatus =
  | "loading"
  | "missing"
  | "invalid"
  | "stale"
  | "watch"
  | "healthy";

export type SensorHealthTone = "ok" | "warn" | "bad" | "muted";

export interface SensorHealthSummary {
  status: SensorHealthStatus;
  tone: SensorHealthTone;
  /** Short status pill copy (e.g. "Healthy", "Stale", "Missing"). */
  statusLabel: string;
  /** One-sentence summary safe to render as the section headline. */
  headline: string;
  /** Calm grower-facing copy under the headline. Never plant-health advice. */
  body: string;
  /** Source badge label (Live/Manual/CSV/Demo/Stale/Invalid/Unknown). */
  sourceLabel: string;
  /** Whether the contributing reading is older than the stale threshold. */
  stale: boolean;
  /** Quality reasons (deduped from evaluateSensorQuality). */
  reasons: string[];
  /** Suspicious metric keys flagged by the quality helper. */
  suspiciousFields: string[];
  /** Compact safe-by-design line for placement under sensor intelligence. */
  safeByDesignNote: string;
  /** True when the view-model intentionally hides numeric values. */
  hideValues: boolean;
}

const TONE_BY_STATUS: Record<SensorHealthStatus, SensorHealthTone> = {
  loading: "muted",
  missing: "muted",
  invalid: "bad",
  stale: "warn",
  watch: "warn",
  healthy: "ok",
};

const STATUS_LABEL: Record<SensorHealthStatus, string> = {
  loading: "Checking…",
  missing: "Missing",
  invalid: "Invalid",
  stale: "Stale",
  watch: "Watch",
  healthy: "Healthy",
};

export const SENSOR_HEALTH_SAFE_BY_DESIGN_NOTE =
  "Safe by Design · Read-only sensor view. Verdant never controls devices on its own.";

const EMPTY_VALUE = "—";

function mapCanonicalSource(snapshot: SensorSnapshot): SensorReadingSource | null {
  switch (snapshot.source) {
    case "live":
      return "live";
    case "manual":
    case "diary":
      return "manual";
    case "sim":
      return "demo";
    case "unavailable":
    default:
      return null;
  }
}

/**
 * Build the Sensor Health summary for the Dashboard.
 *
 * @param state Result of `useLatestSensorSnapshot` for the scoped grow.
 * @param now   Optional clock override for deterministic tests.
 */
export function buildDashboardSensorHealthSummary(
  state: SnapshotState | null | undefined,
  now: number = Date.now(),
): SensorHealthSummary {
  if (!state || state.status === "idle" || state.status === "loading") {
    return {
      status: "loading",
      tone: "muted",
      statusLabel: STATUS_LABEL.loading,
      headline: "Checking sensor health…",
      body: "Loading the most recent sensor snapshot for this grow.",
      sourceLabel: EMPTY_VALUE,
      stale: false,
      reasons: [],
      suspiciousFields: [],
      safeByDesignNote: SENSOR_HEALTH_SAFE_BY_DESIGN_NOTE,
      hideValues: true,
    };
  }

  const snapshot = state.snapshot;
  const quality = evaluateSensorQuality(snapshot, now);

  // Missing: no snapshot or all metric values are null.
  if (
    state.status === "unavailable" ||
    snapshot.source === "unavailable" ||
    quality.quality === "unavailable"
  ) {
    return {
      status: "missing",
      tone: "muted",
      statusLabel: STATUS_LABEL.missing,
      headline: "No sensor data yet for this grow.",
      body: "Log a manual reading or connect a sensor source to start tracking health.",
      sourceLabel: "Unknown",
      stale: false,
      reasons: quality.reasons,
      suspiciousFields: [],
      safeByDesignNote: SENSOR_HEALTH_SAFE_BY_DESIGN_NOTE,
      hideValues: true,
    };
  }

  const canonical = mapCanonicalSource(snapshot);
  const resolved = resolveSensorSourceLabel({ source: canonical, vendor: null });
  let sourceLabel = resolved.label;

  const stale = isStale(snapshot.ts, now);
  const invalid = quality.suspiciousFields.length > 0;

  // Source-label truth: stale/invalid override label even if source === live.
  // Manual/csv/demo/stale/invalid never get promoted to "Live" upstream.
  if (invalid) sourceLabel = "Invalid";
  else if (stale) sourceLabel = "Stale";

  if (invalid) {
    return {
      status: "invalid",
      tone: "bad",
      statusLabel: STATUS_LABEL.invalid,
      headline: "Sensor data needs review.",
      body: "One or more readings look implausible. Check the source before acting on it.",
      sourceLabel,
      stale,
      reasons: quality.reasons,
      suspiciousFields: quality.suspiciousFields,
      safeByDesignNote: SENSOR_HEALTH_SAFE_BY_DESIGN_NOTE,
      hideValues: false,
    };
  }

  if (stale) {
    return {
      status: "stale",
      tone: "warn",
      statusLabel: STATUS_LABEL.stale,
      headline: "Latest sensor reading is stale.",
      body: "The most recent reading is older than 30 minutes. Log a manual reading or verify your sensor source.",
      sourceLabel,
      stale,
      reasons: quality.reasons,
      suspiciousFields: [],
      safeByDesignNote: SENSOR_HEALTH_SAFE_BY_DESIGN_NOTE,
      hideValues: false,
    };
  }

  if (quality.quality === "watch") {
    return {
      status: "watch",
      tone: "warn",
      statusLabel: STATUS_LABEL.watch,
      headline: "Sensor data needs review.",
      body: "The snapshot is recent but a few values look unusual.",
      sourceLabel,
      stale,
      reasons: quality.reasons,
      suspiciousFields: quality.suspiciousFields,
      safeByDesignNote: SENSOR_HEALTH_SAFE_BY_DESIGN_NOTE,
      hideValues: false,
    };
  }

  return {
    status: "healthy",
    tone: "ok",
    statusLabel: STATUS_LABEL.healthy,
    headline: "Sensor data looks usable.",
    body: "Latest snapshot is fresh and within plausible ranges.",
    sourceLabel,
    stale,
    reasons: [],
    suspiciousFields: [],
    safeByDesignNote: SENSOR_HEALTH_SAFE_BY_DESIGN_NOTE,
    hideValues: false,
  };
}

export const SENSOR_HEALTH_EMPTY_ALERTS_COPY = "No active alerts right now.";
export const SENSOR_HEALTH_EMPTY_ALERTS_GUIDANCE =
  "Log a manual reading or review your sensor setup to keep this grow's signal strong.";

/** Expose internals for tests (status-tone mapping should never drift). */
export const __TESTING__ = { TONE_BY_STATUS, STATUS_LABEL };

// Type-only re-exports to keep the public surface obvious to callers.
export type { SensorQualityResult, SnapshotSource };
