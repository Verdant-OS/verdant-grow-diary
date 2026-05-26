/**
 * Pure helpers for QuickLog "delta markers".
 *
 * Compares the value the grower is currently typing against the previous
 * manually-logged value for the same plant + metric. Pure math only.
 *
 * Safety contract:
 *  - No AI / no recommendations / no good-or-bad judgment.
 *  - Never compares across plants. Caller scopes by plant_id.
 *  - Never compares against demo/live values. Caller scopes by source = "manual".
 *  - Never mutates inputs. Read-only.
 */
import type { ManualSensorMetric } from "./manualSensorFreshnessRules";
import { METRIC_UNITS } from "./manualSensorFreshnessRules";

export type DeltaDirection = "up" | "down" | "flat" | "first_log";

export interface ManualSensorDelta {
  metric: ManualSensorMetric;
  currentValue: number;
  previousValue: number | null;
  delta: number | null;
  direction: DeltaDirection;
  label: string;
}

const FLAT_EPSILON: Record<ManualSensorMetric, number> = {
  temp_f: 0.5,
  humidity_percent: 0.5,
  ph: 0.05,
  ec: 0.005,
};

function formatMagnitude(metric: ManualSensorMetric, n: number): string {
  switch (metric) {
    case "temp_f":
    case "humidity_percent":
      return String(Math.round(n));
    case "ph":
      return n.toFixed(1);
    case "ec":
      return n.toFixed(2);
  }
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * Compute a delta marker for a single metric.
 * Returns null when there is no usable current value (caller can hide UI).
 */
export function computeManualSensorDelta(
  metric: ManualSensorMetric,
  currentValue: number | null,
  previousValue: number | null,
): ManualSensorDelta | null {
  if (!isFiniteNumber(currentValue)) return null;

  if (!isFiniteNumber(previousValue)) {
    return {
      metric,
      currentValue,
      previousValue: null,
      delta: null,
      direction: "first_log",
      label: "first log",
    };
  }

  const diff = currentValue - previousValue;
  const eps = FLAT_EPSILON[metric];
  if (Math.abs(diff) < eps) {
    return {
      metric,
      currentValue,
      previousValue,
      delta: 0,
      direction: "flat",
      label: "no change since last log",
    };
  }

  const direction: DeltaDirection = diff > 0 ? "up" : "down";
  const sign = diff > 0 ? "+" : "-";
  const magnitude = formatMagnitude(metric, Math.abs(diff));
  const unit = METRIC_UNITS[metric];
  return {
    metric,
    currentValue,
    previousValue,
    delta: diff,
    direction,
    label: `${sign}${magnitude}${unit} since last log`,
  };
}
