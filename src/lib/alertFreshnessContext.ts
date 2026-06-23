/**
 * alertFreshnessContext — pure helpers for Alerts page operator-context
 * messaging.
 *
 * Hard rules:
 *   - Pure: no I/O, no React, no Supabase, no time, no randomness.
 *   - Single source of truth for the alert-persistence freshness window:
 *     `STALE_THRESHOLD_MS` from `src/lib/sensorSnapshot.ts`.
 *   - Never relabels demo/stale/invalid/csv/unknown telemetry as healthy.
 *   - Never claims alerts will persist for non-persistable snapshots.
 */
import {
  STALE_THRESHOLD_MS,
  isStale,
  type SensorSnapshot,
  type SnapshotSource,
} from "@/lib/sensorSnapshot";
import { METRIC_LABELS, type GrowTargets } from "@/lib/environmentTargetComparison";

/** Single shared freshness window, in minutes, for operator-facing copy. */
export const STALE_THRESHOLD_MINUTES = Math.round(STALE_THRESHOLD_MS / 60_000);

/** Short human label for the alert persistence window. */
export const FRESHNESS_WINDOW_LABEL = `${STALE_THRESHOLD_MINUTES}-minute alert window`;

export type LatestSnapshotFreshness =
  | "fresh"
  | "stale"
  | "missing"
  | "unavailable";

export interface ClassifyLatestSnapshotArgs {
  /** From useLatestSensorSnapshot — `"ok"` means data loaded successfully. */
  status: "idle" | "loading" | "ok" | "unavailable";
  snapshot: SensorSnapshot | null;
  /** Injectable for tests. */
  now?: number;
}

/**
 * Classify the latest sensor snapshot into a deterministic freshness state
 * for the Alerts page header and stale-badge copy.
 *
 * Rules:
 *   - status "unavailable" / "loading" / "idle" → "unavailable".
 *   - snapshot null OR source "unavailable" OR ts null → "missing".
 *   - source live | manual AND not stale → "fresh".
 *   - everything else (stale, sim/diary/csv, future-dated, etc.) → "stale".
 *     Stale never gets relabeled as healthy.
 */
export function classifyLatestSnapshotFreshness(
  args: ClassifyLatestSnapshotArgs,
): LatestSnapshotFreshness {
  if (args.status !== "ok") return "unavailable";
  const snap = args.snapshot;
  if (!snap || snap.source === "unavailable" || !snap.ts) return "missing";
  const now = args.now ?? Date.now();
  const stale = isStale(snap.ts, now);
  if (stale) return "stale";
  if (snap.source === "live" || snap.source === "manual") return "fresh";
  // sim / diary / csv: not eligible for persistence even when "fresh".
  return "stale";
}

/**
 * True only when the latest snapshot is a manual reading that is still
 * inside the persistable window. This is what we surface as "a recent
 * manual snapshot exists inside the N-minute alert window".
 */
export function hasRecentManualSnapshot(
  args: ClassifyLatestSnapshotArgs,
): boolean {
  if (args.status !== "ok") return false;
  const snap = args.snapshot;
  if (!snap || snap.source !== "manual" || !snap.ts) return false;
  const now = args.now ?? Date.now();
  return !isStale(snap.ts, now);
}

/**
 * Build the operator-facing stale-latest snapshot message. Returns null
 * when the freshness state has no special copy to surface (e.g. unknown /
 * still loading).
 */
export function describeLatestSnapshotForAlerts(
  args: ClassifyLatestSnapshotArgs,
): string | null {
  const cls = classifyLatestSnapshotFreshness(args);
  if (cls === "unavailable") return null;
  if (cls === "fresh") return "Latest snapshot is fresh enough for alert evaluation.";
  if (cls === "missing") {
    return `No recent manual or live snapshot is saved inside the ${FRESHNESS_WINDOW_LABEL}.`;
  }
  // stale
  if (hasRecentManualSnapshot(args)) {
    return `Latest displayed snapshot is stale, but a recent manual snapshot exists inside the ${FRESHNESS_WINDOW_LABEL}.`;
  }
  return `Latest snapshot is stale. No recent manual snapshot is saved inside the ${FRESHNESS_WINDOW_LABEL}.`;
}

/* -------------------------------------------------------------------------- */
/* Alerts header context view-model                                            */
/* -------------------------------------------------------------------------- */

export interface AlertsHeaderRange {
  metricLabel: string;
  min: number | null;
  max: number | null;
  unit: string;
}

export interface AlertsHeaderContextViewModel {
  growName: string | null;
  stageLabel: string | null;
  ranges: {
    temp: AlertsHeaderRange | null;
    rh: AlertsHeaderRange | null;
    vpd: AlertsHeaderRange | null;
  };
  freshnessWindowLabel: string;
  latestFreshness: LatestSnapshotFreshness;
  latestSource: SnapshotSource | null;
  /** True only when the latest snapshot is persistable per the same rules
   * the alert pipeline uses. Presentation must never claim persistence
   * when this is false. */
  alertsCanPersist: boolean;
}

const TEMP_UNIT = "°C";
const RH_UNIT = "%";
const VPD_UNIT = "kPa";

function buildRange(
  key: "temp" | "rh" | "vpd",
  targets: GrowTargets | null,
  unit: string,
): AlertsHeaderRange | null {
  if (!targets) return null;
  const t = targets[key];
  if (!t) return null;
  if (t.min === null && t.max === null) return null;
  return { metricLabel: METRIC_LABELS[key], min: t.min, max: t.max, unit };
}

export interface BuildAlertsHeaderContextArgs {
  growName: string | null;
  stage: string | null;
  targets: GrowTargets | null;
  snapshot: SensorSnapshot | null;
  status: "idle" | "loading" | "ok" | "unavailable";
  now?: number;
}

export function buildAlertsHeaderContext(
  args: BuildAlertsHeaderContextArgs,
): AlertsHeaderContextViewModel {
  const latestFreshness = classifyLatestSnapshotFreshness({
    snapshot: args.snapshot,
    status: args.status,
    now: args.now,
  });
  const latestSource: SnapshotSource | null =
    args.status === "ok" && args.snapshot ? args.snapshot.source : null;
  const alertsCanPersist =
    latestFreshness === "fresh" &&
    (latestSource === "live" || latestSource === "manual");
  return {
    growName: args.growName ?? null,
    stageLabel: args.stage ? formatStageLabel(args.stage) : null,
    ranges: {
      temp: buildRange("temp", args.targets, TEMP_UNIT),
      rh: buildRange("rh", args.targets, RH_UNIT),
      vpd: buildRange("vpd", args.targets, VPD_UNIT),
    },
    freshnessWindowLabel: FRESHNESS_WINDOW_LABEL,
    latestFreshness,
    latestSource,
    alertsCanPersist,
  };
}

function formatStageLabel(stage: string): string {
  const s = stage.trim();
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
