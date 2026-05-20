/**
 * Pure helpers for the scoped Dashboard "Target Comparison" card.
 *
 * Compares a normalized SensorSnapshot against configured per-metric target
 * ranges. No I/O. No AI. No advisory. No plant-health claims.
 */

import type { SensorSnapshot } from "@/lib/sensorSnapshot";

export type ComparisonStatus =
  | "in_range"
  | "out_of_range"
  | "missing_targets"
  | "unavailable";

export type MetricState =
  | "in_range"
  | "low"
  | "high"
  | "missing_value"
  | "missing_target";

export const STATUS_HEADLINE: Record<ComparisonStatus, string> = {
  in_range: "Within configured targets",
  out_of_range: "Needs review",
  missing_targets: "No targets configured",
  unavailable: "Unavailable",
};

export type MetricKey =
  | "temp"
  | "rh"
  | "vpd"
  | "soil"
  | "soil_ec"
  | "soil_temp"
  | "ppfd";

export interface TargetRange {
  min: number | null;
  max: number | null;
}

export type GrowTargets = Partial<Record<MetricKey, TargetRange | null>>;

export interface MetricComparison {
  metric: MetricKey;
  label: string;
  value: number | null;
  min: number | null;
  max: number | null;
  state: MetricState;
}

export interface TargetComparisonResult {
  status: ComparisonStatus;
  headline: string;
  reasons: string[];
  metrics: MetricComparison[];
}

export const METRIC_LABELS: Record<MetricKey, string> = {
  temp: "Temperature",
  rh: "Humidity",
  vpd: "VPD",
  soil: "Soil water",
  soil_ec: "Soil EC",
  soil_temp: "Soil temp",
  ppfd: "PPFD",
};

const METRIC_ORDER: MetricKey[] = [
  "temp",
  "rh",
  "vpd",
  "soil",
  "soil_ec",
  "soil_temp",
  "ppfd",
];

function hasAnyTarget(targets: GrowTargets | null | undefined): boolean {
  if (!targets) return false;
  return METRIC_ORDER.some((k) => {
    const t = targets[k];
    return !!t && (t.min !== null || t.max !== null);
  });
}

function compareValue(
  value: number | null,
  target: TargetRange | null | undefined,
): MetricState {
  const hasTarget = !!target && (target.min !== null || target.max !== null);
  if (value === null) {
    return hasTarget ? "missing_value" : "missing_value";
  }
  if (!hasTarget) return "missing_target";
  if (target!.min !== null && value < target!.min) return "low";
  if (target!.max !== null && value > target!.max) return "high";
  return "in_range";
}

export function compareSnapshotToTargets(
  snapshot: SensorSnapshot | null | undefined,
  targets: GrowTargets | null | undefined,
): TargetComparisonResult {
  if (!snapshot || snapshot.source === "unavailable") {
    return {
      status: "unavailable",
      headline: STATUS_HEADLINE.unavailable,
      reasons: ["No sensor snapshot is available for this grow."],
      metrics: [],
    };
  }
  if (!hasAnyTarget(targets)) {
    return {
      status: "missing_targets",
      headline: STATUS_HEADLINE.missing_targets,
      reasons: ["No grow targets configured."],
      metrics: METRIC_ORDER.map((m) => ({
        metric: m,
        label: METRIC_LABELS[m],
        value: snapshot[m],
        min: null,
        max: null,
        state: snapshot[m] === null ? "missing_value" : "missing_target",
      })),
    };
  }

  const metrics: MetricComparison[] = METRIC_ORDER.map((m) => {
    const t = (targets ?? {})[m] ?? null;
    const value = snapshot[m];
    const state = compareValue(value, t);
    return {
      metric: m,
      label: METRIC_LABELS[m],
      value,
      min: t?.min ?? null,
      max: t?.max ?? null,
      state,
    };
  });

  const reasons: string[] = [];
  for (const m of metrics) {
    if (m.state === "low") {
      reasons.push(`${m.label} below target.`);
    } else if (m.state === "high") {
      reasons.push(`${m.label} above target.`);
    }
  }

  const status: ComparisonStatus = reasons.length > 0 ? "out_of_range" : "in_range";
  return {
    status,
    headline: STATUS_HEADLINE[status],
    reasons,
    metrics,
  };
}
