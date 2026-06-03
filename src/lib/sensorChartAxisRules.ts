/**
 * Pure helpers for SensorChart Y-axis formatting (AUD-006).
 *
 * Previously the YAxis had a hard-coded `width={36}` and appended the
 * metric unit (°F / % / kPa / ppm) directly into every tick label. For
 * wide units (e.g. "1200 ppm") or negative values (e.g. "-10°F") the
 * label was clipped against the axis gutter. These helpers compute a
 * safe gutter width per metric and a compact tick formatter that keeps
 * units visible without overflowing.
 *
 * Pure rules only. No I/O, no React, no Recharts. Tooltip behavior and
 * stored data semantics are unchanged.
 */

export type SensorChartMetricKey =
  | "temp"
  | "rh"
  | "vpd"
  | "co2"
  | "soil"
  | "ppfd";

export interface SensorChartMetricMeta {
  label: string;
  /** Display unit used in legend / tooltip / CSV header (long form). */
  unit: string;
  /**
   * Compact unit used inside Y-axis tick labels where horizontal space
   * is constrained. Defaults to `unit` when omitted. PPFD uses "µmol"
   * for ticks but the long "µmol/m²/s" elsewhere.
   */
  tickUnit?: string;
  color: string;
  /** Default decimal places for tick values. */
  tickDecimals: number;
  /** Reserved YAxis gutter width in px — sized to fit the widest tick label. */
  yAxisWidth: number;
}

export const SENSOR_CHART_METRIC_META: Record<SensorChartMetricKey, SensorChartMetricMeta> = {
  temp: { label: "Temperature", unit: "°F", color: "hsl(var(--warning))", tickDecimals: 0, yAxisWidth: 48 },
  rh:   { label: "Humidity",    unit: "%",  color: "hsl(var(--info))",    tickDecimals: 0, yAxisWidth: 44 },
  vpd:  { label: "VPD",         unit: "kPa", color: "hsl(var(--primary))", tickDecimals: 2, yAxisWidth: 64 },
  co2:  { label: "CO₂",         unit: "ppm", color: "hsl(var(--leaf-glow))", tickDecimals: 0, yAxisWidth: 64 },
  soil: { label: "Soil",        unit: "%",  color: "hsl(var(--accent))",  tickDecimals: 0, yAxisWidth: 44 },
  ppfd: {
    label: "PPFD",
    // Canonical user-facing unit; matches PPFD_UNIT_LONG in ppfdRules.
    unit: "µmol/m²/s",
    // Short form for axis tick density — matches PPFD_UNIT_SHORT.
    tickUnit: "µmol",
    color: "hsl(var(--success))",
    tickDecimals: 0,
    yAxisWidth: 72,
  },
};

/** Left chart margin — small breathing room so negative ticks aren't clipped. */
export const SENSOR_CHART_LEFT_MARGIN = 4;

function tickUnitOf(meta: SensorChartMetricMeta): string {
  return meta.tickUnit ?? meta.unit;
}

/**
 * Format a numeric tick value for the Y axis. Keeps the unit visible
 * (with a thin space for kPa/ppm to aid readability) and rounds to the
 * metric's preferred decimal count. Non-finite values render as an empty
 * string so the axis just hides them rather than printing NaN.
 */
export function formatSensorChartYTick(
  value: number,
  metric: SensorChartMetricKey,
): string {
  if (!Number.isFinite(value)) return "";
  const m = SENSOR_CHART_METRIC_META[metric];
  const rounded = m.tickDecimals > 0
    ? Number(value.toFixed(m.tickDecimals))
    : Math.round(value);
  const unit = tickUnitOf(m);
  // Compound units (kPa / ppm / µmol) read better with a hair of
  // separation; attached unit symbols (°F / %) stay flush.
  const sep = /^[A-Za-zµ]/.test(unit) ? " " : "";
  return `${rounded}${sep}${unit}`;
}

/** Tooltip-side formatter — uses the long unit (legend-consistent). */
export function formatSensorChartTooltipValue(
  value: number,
  metric: SensorChartMetricKey,
): string {
  if (!Number.isFinite(value)) return "";
  const m = SENSOR_CHART_METRIC_META[metric];
  const sep = /^[A-Za-zµ]/.test(m.unit) ? " " : "";
  return `${value}${sep}${m.unit}`;
}

/**
 * Canonical unit string for a metric. Single source of truth used by
 * both the legend label and the tooltip value formatter so the unit can
 * never drift between surfaces.
 */
export function sensorChartUnit(metric: SensorChartMetricKey): string {
  return SENSOR_CHART_METRIC_META[metric].unit;
}

/**
 * Human-readable legend label for a metric, e.g. "Temperature (°F)" or
 * "VPD (kPa)". Metrics without a unit string render as the plain label.
 */
export function sensorChartLegendLabel(metric: SensorChartMetricKey): string {
  const m = SENSOR_CHART_METRIC_META[metric];
  return m.unit ? `${m.label} (${m.unit})` : m.label;
}
