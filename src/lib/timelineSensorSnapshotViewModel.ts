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
import { resolveSensorSourceLabel, type ResolvedSourceLabel } from "@/lib/sensorSourceLabelRules";
import { fahrenheitToCelsius, tempFFromC } from "@/lib/temperatureUnits";

export type TimelineSensorChipMetric = "temp_f" | "temp_c" | "rh" | "vpd" | "soil_moisture" | "co2";

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
  | { kind: "invalid"; message: string }
  | {
      kind: "chips";
      chips: TimelineSensorChip[];
      /** Resolved source label; null when no source was provided. */
      sourceLabel: string | null;
      /** Resolved source details, for data-attr / styling hooks. */
      source: ResolvedSourceLabel | null;
      /** True only when source resolves to canonical "Live". */
      isLive: boolean;
    };

const UNAVAILABLE_MESSAGE = "Sensor snapshot unavailable";

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
 *   { temp_f|temperature_f|temp_c|temperature_c,
 *     rh|humidity, vpd|vpd_kpa,
 *     soil_moisture|soil_water_content|swc,
 *     co2|co2_ppm,
 *     source, vendor, metadata: { vendor } }
 *
 * Explicit Fahrenheit/Celsius fields convert once at the chip-build boundary
 * when the requested display unit differs. Ambiguous generic `temp` /
 * `temperature` fields are deliberately ignored because their source unit is
 * unknowable here; relabeling their magnitude would manufacture a false unit.
 * Callers that omit `displayUnit` retain the Fahrenheit display default.
 */
export function buildTimelineSensorSnapshotViewModel(
  input: unknown,
  options: { displayUnit?: "F" | "C" } = {},
): TimelineSensorSnapshotViewModel {
  if (input === null || input === undefined) return { kind: "none" };
  if (typeof input !== "object") {
    return { kind: "invalid", message: UNAVAILABLE_MESSAGE };
  }

  const obj = input as Record<string, unknown>;

  // Temperature
  const tempF = pick(obj, "temp_f", "temperature_f", "tempF", "temperatureF");
  const tempC = pick(obj, "temp_c", "temperature_c", "tempC", "temperatureC");
  const rh = pick(obj, "rh", "humidity", "relative_humidity", "relativeHumidity");
  const vpd = pick(obj, "vpd", "vpd_kpa", "vpdKpa");
  const soil = pick(
    obj,
    "soil_moisture",
    "soilMoisture",
    "soil_water_content",
    "soilWaterContent",
    "swc",
  );
  const co2 = pick(obj, "co2", "co2_ppm", "co2Ppm");

  const chips: TimelineSensorChip[] = [];

  // Temperature chip — explicit fields convert exactly once for display.
  if (isFiniteNumber(tempF)) {
    const displayCelsius = options.displayUnit === "C";
    const v = roundTo(displayCelsius ? fahrenheitToCelsius(tempF) : tempF, 1);
    const metric: TimelineSensorChipMetric = displayCelsius ? "temp_c" : "temp_f";
    const unit = displayCelsius ? "°C" : "°F";
    chips.push({
      metric,
      label: "Temp",
      value: v,
      unit,
      display: `${v}${unit}`,
    });
  } else if (isFiniteNumber(tempC)) {
    if (options.displayUnit === "C") {
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
  }

  if (isFiniteNumber(rh)) {
    const v = roundTo(rh, 1);
    chips.push({
      metric: "rh",
      label: "RH",
      value: v,
      unit: "%",
      display: `${v}%`,
    });
  }

  if (isFiniteNumber(vpd)) {
    const v = roundTo(vpd, 2);
    chips.push({
      metric: "vpd",
      label: "VPD",
      value: v,
      unit: "kPa",
      display: `${v} kPa`,
    });
  }

  if (isFiniteNumber(soil)) {
    const v = roundTo(soil, 1);
    chips.push({
      metric: "soil_moisture",
      label: "Soil",
      value: v,
      unit: "%",
      display: `${v}%`,
    });
  }

  if (isFiniteNumber(co2)) {
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
    return { kind: "invalid", message: UNAVAILABLE_MESSAGE };
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
    sourceLabel: resolved ? resolved.label : null,
    source: resolved,
    isLive: source === "live",
  };
}
