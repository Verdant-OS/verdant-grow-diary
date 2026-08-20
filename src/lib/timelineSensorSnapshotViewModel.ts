/**
 * timelineSensorSnapshotViewModel — pure view-model that projects an
 * arbitrary sensor-snapshot-shaped object (e.g. `diary.details.sensor`)
 * into compact chip data for a Timeline row.
 *
 * Hard constraints:
 *  - Pure function. No I/O. No React. No timers. No automation.
 *  - Never fabricates values: only finite numeric fields become chips.
 *  - Never promotes manual / csv / demo / stale / invalid / unknown
 *    sources to "Live."
 *  - Malformed input → safe "unavailable" state, not fake chips.
 *  - Source label is resolved via `sensorSourceLabelRules`, the single
 *    source of truth for source-label display.
 */
import type { SensorReadingSource } from "@/mock";
import { validateManualSnapshot } from "@/lib/manualSensorSnapshotRules";
import { resolveSensorSourceLabel, type ResolvedSourceLabel } from "@/lib/sensorSourceLabelRules";
import { tempFFromC } from "@/lib/temperatureUnits";

export type TimelineSensorChipMetric =
  "temp_f" | "temp_c" | "rh" | "ph" | "ec" | "vpd" | "soil_moisture" | "co2";

export interface TimelineSensorChip {
  metric: TimelineSensorChipMetric;
  /** Short display label, e.g. "Temp", "RH", "VPD", "Soil", "CO₂". */
  label: string;
  /** Formatted numeric value with unit appended, e.g. "75°F". */
  display: string;
  /** Bare numeric (rounded for display). */
  value: number;
  /** Unit symbol/suffix, e.g. "°F", "%", "kPa", "ppm". */
  unit: string;
}

export type TimelineSensorSnapshotViewModel =
  | { kind: "none" }
  | { kind: "invalid"; message: string; errors?: string[]; warnings?: string[] }
  | {
      kind: "chips";
      chips: TimelineSensorChip[];
      /** Existing manual-snapshot validation findings, when requested. */
      errors: string[];
      warnings: string[];
      /** Resolved source label; null when no source was provided. */
      sourceLabel: string | null;
      /** Resolved source details, for data-attr / styling hooks. */
      source: ResolvedSourceLabel | null;
      /** True only when source resolves to canonical "Live". */
      isLive: boolean;
    };

const UNAVAILABLE_MESSAGE = "Sensor snapshot unavailable";
const MANUAL_REVIEW_MESSAGE = "Review manual snapshot — invalid readings were not shown.";

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (k in obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function readSource(raw: unknown): SensorReadingSource | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (
    v === "live" ||
    v === "manual" ||
    v === "csv" ||
    v === "demo" ||
    v === "stale" ||
    v === "invalid"
  ) {
    return v;
  }
  return null;
}

/**
 * Build a Timeline sensor-chip view-model from an unknown input.
 *
 * Accepted shapes (all optional, only finite values rendered):
 *   { temp_f|temperature_f|temp_c|temperature_c|temp|temperature,
 *     rh|humidity|humidity_percent, ph, ec, vpd|vpd_kpa,
 *     soil|soil_moisture|soil_water_content|swc,
 *     co2|co2_ppm,
 *     source, vendor, metadata: { vendor } }
 *
 * Temperature display convention on this branch: explicit Fahrenheit fields
 * render as-is; explicit Celsius fields convert once to Fahrenheit at the
 * chip build layer. Generic temperature fields keep the caller-provided unit
 * via `preferUnit` because their source unit is not knowable here.
 */
export function buildTimelineSensorSnapshotViewModel(
  input: unknown,
  options: { preferUnit?: "F" | "C"; validateManualCompatibility?: boolean } = {},
): TimelineSensorSnapshotViewModel {
  if (input === null || input === undefined) return { kind: "none" };
  if (typeof input !== "object") {
    return { kind: "invalid", message: UNAVAILABLE_MESSAGE };
  }

  const obj = input as Record<string, unknown>;

  // Temperature
  const tempF = pick(obj, "temp_f", "temperature_f", "tempF", "temperatureF");
  const tempC = pick(obj, "temp_c", "temperature_c", "tempC", "temperatureC");
  const tempGeneric = pick(obj, "temp", "temperature");
  const rh = pick(
    obj,
    "rh",
    "humidity",
    "humidity_percent",
    "relative_humidity",
    "relativeHumidity",
  );
  const ph = pick(obj, "ph");
  const ec = pick(obj, "ec", "ec_ms_cm", "ecMsCm");
  const vpd = pick(obj, "vpd", "vpd_kpa", "vpdKpa");
  const soil = pick(
    obj,
    "soil",
    "soil_moisture",
    "soilMoisture",
    "soil_water_content",
    "soilWaterContent",
    "swc",
  );
  const co2 = pick(obj, "co2", "co2_ppm", "co2Ppm");

  const manualValidation = options.validateManualCompatibility
    ? validateManualSnapshot({
        airTemp: isFiniteNumber(tempF) ? tempF : isFiniteNumber(tempC) ? tempC : null,
        airTempUnit: isFiniteNumber(tempF) ? "F" : "C",
        humidityPct: isFiniteNumber(rh) ? rh : null,
        vpdKpa: isFiniteNumber(vpd) ? vpd : null,
        co2Ppm: isFiniteNumber(co2) ? co2 : null,
        soilMoisturePct: isFiniteNumber(soil) ? soil : null,
        reservoirPh: isFiniteNumber(ph) ? ph : null,
        reservoirEc: isFiniteNumber(ec) ? ec : null,
        reservoirEcUnit: "mS/cm",
      })
    : null;
  const allowedManualFields = new Set(manualValidation?.metrics.map((metric) => metric.field));
  const allows = (field: Parameters<typeof allowedManualFields.has>[0]): boolean =>
    manualValidation === null || allowedManualFields.has(field);

  const chips: TimelineSensorChip[] = [];

  // Temperature chip — never double-convert explicit Fahrenheit values.
  if (isFiniteNumber(tempF) && allows("air_temp_c")) {
    const v = roundTo(tempF, 1);
    chips.push({
      metric: "temp_f",
      label: "Temp",
      value: v,
      unit: "°F",
      display: `${v}°F`,
    });
  } else if (isFiniteNumber(tempC) && allows("air_temp_c")) {
    if (options.preferUnit === "C") {
      const v = roundTo(tempC, 1);
      chips.push({
        metric: "temp_c",
        label: "Temp",
        value: v,
        unit: "°C",
        display: `${v}°C`,
      });
    } else {
      const converted = tempFFromC(tempC);
      if (isFiniteNumber(converted)) {
        const v = roundTo(converted, 1);
        chips.push({
          metric: "temp_f",
          label: "Temp",
          value: v,
          unit: "°F",
          display: `${v}°F`,
        });
      }
    }
  } else if (isFiniteNumber(tempGeneric)) {
    const v = roundTo(tempGeneric, 1);
    const unit = options.preferUnit === "C" ? "°C" : "°F";
    const metric: TimelineSensorChipMetric = options.preferUnit === "C" ? "temp_c" : "temp_f";
    chips.push({ metric, label: "Temp", value: v, unit, display: `${v}${unit}` });
  }

  if (isFiniteNumber(rh) && allows("humidity_pct")) {
    const v = roundTo(rh, 1);
    chips.push({
      metric: "rh",
      label: "RH",
      value: v,
      unit: "%",
      display: `${v}%`,
    });
  }

  if (isFiniteNumber(ph) && allows("reservoir_ph")) {
    const v = roundTo(ph, 2);
    chips.push({ metric: "ph", label: "pH", value: v, unit: "pH", display: `${v} pH` });
  }

  if (isFiniteNumber(ec) && allows("reservoir_ec_mscm")) {
    const v = roundTo(ec, 2);
    chips.push({
      metric: "ec",
      label: "EC",
      value: v,
      unit: "mS/cm",
      display: `${v} mS/cm`,
    });
  }

  if (isFiniteNumber(vpd) && allows("vpd_kpa")) {
    const v = roundTo(vpd, 2);
    chips.push({
      metric: "vpd",
      label: "VPD",
      value: v,
      unit: "kPa",
      display: `${v} kPa`,
    });
  }

  if (isFiniteNumber(soil) && allows("soil_moisture_pct")) {
    const v = roundTo(soil, 1);
    chips.push({
      metric: "soil_moisture",
      label: "Soil",
      value: v,
      unit: "%",
      display: `${v}%`,
    });
  }

  if (isFiniteNumber(co2) && allows("co2_ppm")) {
    const v = Math.round(co2);
    chips.push({
      metric: "co2",
      label: "CO₂",
      value: v,
      unit: "ppm",
      display: `${v} ppm`,
    });
  }

  if (chips.length === 0) {
    return {
      kind: "invalid",
      message: manualValidation?.errors.length ? MANUAL_REVIEW_MESSAGE : UNAVAILABLE_MESSAGE,
      errors: manualValidation?.errors ?? [],
      warnings: manualValidation?.warnings ?? [],
    };
  }

  const sourceRaw =
    pick(obj, "source") ??
    (typeof obj.metadata === "object" && obj.metadata !== null
      ? (obj.metadata as { source?: unknown }).source
      : undefined);
  const source = readSource(sourceRaw);

  const vendorRaw =
    pick(obj, "vendor") ??
    (typeof obj.metadata === "object" && obj.metadata !== null
      ? (obj.metadata as { vendor?: unknown }).vendor
      : undefined);

  let resolved: ResolvedSourceLabel | null = null;
  if (source) {
    resolved = resolveSensorSourceLabel({
      source,
      vendor: typeof vendorRaw === "string" ? vendorRaw : null,
    });
  }

  return {
    kind: "chips",
    chips,
    errors: manualValidation?.errors ?? [],
    warnings: manualValidation?.warnings ?? [],
    sourceLabel: resolved ? resolved.label : null,
    source: resolved,
    isLive: source === "live",
  };
}
