/**
 * Sensor metric unit metadata — single source of truth shared by
 * SensorChart's legend, tooltip, and any value formatter that needs to
 * present a metric to the user.
 *
 * Extends the canonical chart meta in `sensorChartAxisRules.ts` with
 * additional metric keys (soil moisture, soil EC, reservoir EC,
 * reservoir pH, generic pH) used by other surfaces. Keeping the unit
 * strings in one table prevents drift between the chart legend, tooltip
 * value, and any future labels.
 *
 * Pure rules only. No React, no Recharts, no I/O.
 */

import {
  SENSOR_CHART_METRIC_META,
  type SensorChartMetricKey,
} from "./sensorChartAxisRules";

/** Extended metric keys supported by the unit helper. */
export type SensorMetricKey =
  | SensorChartMetricKey
  | "soil_moisture"
  | "soil_ec"
  | "res_ec"
  | "res_ph"
  | "ph";

interface SensorMetricUnitMeta {
  label: string;
  unit: string;
}

/**
 * Metrics not already covered by SENSOR_CHART_METRIC_META. The chart
 * meta is the source of truth for the five charted metrics; this map
 * only extends it for non-charted surfaces.
 */
const EXTRA_SENSOR_METRIC_META: Record<
  Exclude<SensorMetricKey, SensorChartMetricKey>,
  SensorMetricUnitMeta
> = {
  soil_moisture: { label: "Soil moisture", unit: "%" },
  soil_ec:       { label: "Soil EC",       unit: "mS/cm" },
  res_ec:        { label: "Reservoir EC",  unit: "mS/cm" },
  res_ph:        { label: "Reservoir pH",  unit: "" },
  ph:            { label: "pH",            unit: "" },
};

function resolveMeta(metric: SensorMetricKey): SensorMetricUnitMeta {
  if (metric in SENSOR_CHART_METRIC_META) {
    const m = SENSOR_CHART_METRIC_META[metric as SensorChartMetricKey];
    return { label: m.label, unit: m.unit };
  }
  return EXTRA_SENSOR_METRIC_META[metric as Exclude<SensorMetricKey, SensorChartMetricKey>];
}

/** Canonical unit string for a metric. Empty string for unit-less metrics (pH). */
export function getSensorMetricUnit(metric: SensorMetricKey): string {
  return resolveMeta(metric).unit;
}

/**
 * Human-readable label for a metric, e.g. "Temperature (°F)" or
 * "Reservoir pH". Metrics without a unit render as the plain label.
 */
export function formatSensorMetricLabel(metric: SensorMetricKey): string {
  const m = resolveMeta(metric);
  return m.unit ? `${m.label} (${m.unit})` : m.label;
}

/**
 * Format a numeric reading with the metric's unit. Returns an empty
 * string for null / undefined / NaN / non-finite values so callers
 * never render "NaN °F". Compound alphabetic units (kPa, ppm, mS/cm)
 * get a hair of separation; attached symbols (°F, %) stay flush.
 */
export function formatSensorMetricValue(
  metric: SensorMetricKey,
  value: number | null | undefined,
): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  const unit = getSensorMetricUnit(metric);
  if (!unit) return `${value}`;
  const sep = /^[a-z]/i.test(unit) ? " " : "";
  return `${value}${sep}${unit}`;
}
