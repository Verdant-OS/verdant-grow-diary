/**
 * Render-time gate for the Quick Log V2 sensor snapshot fields
 * (temperature / humidity / VPD) on every action that carries a snapshot.
 * Inputs are the raw typed strings; temperature is in the grower's unit.
 * Bands come from the canonical guards in sensorReadingNormalizationRules.ts
 * (the same guards quickLogV2SavePayload.ts uses, which stays authoritative),
 * applied after the same °F → °C conversion the sheet's save seam performs.
 */
import type { TemperatureUnitPreference } from "./temperatureUnitPreference";
import { isHumidityValid, isTemperatureValid, isVpdValid } from "./sensorReadingNormalizationRules";
import { celsiusToFahrenheit, fahrenheitToCelsius } from "./temperatureUnits";

/**
 * Plain-decimal grammar the Quick Log save seam (QuickLogV2Sheet
 * `typedTempToCelsiusInput`) accepts for a Fahrenheit conversion. Anything
 * else (`1e2`, `0x10`, `Infinity`) would reach the payload unconverted
 * and be read as °C, so a Fahrenheit grower's input outside this grammar is
 * rejected here rather than silently reinterpreted.
 */
export const QUICK_LOG_PLAIN_TEMPERATURE_INPUT = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

export const QUICK_LOG_SNAPSHOT_HUMIDITY_RANGE_MESSAGE =
  "Humidity must be between 0 and 100%." as const;
export const QUICK_LOG_SNAPSHOT_VPD_RANGE_MESSAGE = "VPD must be between 0 and 10 kPa." as const;
export const QUICK_LOG_SNAPSHOT_TEMPERATURE_RANGE_MESSAGE_CELSIUS =
  "Temperature must be between -10 and 60 °C." as const;

/** Snapshot temperature copy in the grower's unit (canonical band -10..60 °C). */
export function quickLogSnapshotTemperatureRangeMessage(unit: TemperatureUnitPreference): string {
  if (unit === "fahrenheit") {
    const low = formatFahrenheitBound(celsiusToFahrenheit(-10));
    const high = formatFahrenheitBound(celsiusToFahrenheit(60));
    return `Temperature must be between ${low} and ${high} °F.`;
  }
  return QUICK_LOG_SNAPSHOT_TEMPERATURE_RANGE_MESSAGE_CELSIUS;
}

function formatFahrenheitBound(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

export type QuickLogSensorSnapshotGateField = "temperature" | "humidity" | "vpd";

export interface QuickLogSensorSnapshotGate {
  blocksSave: boolean;
  fields: Partial<Record<QuickLogSensorSnapshotGateField, string>>;
  /** First field message (temperature, humidity, VPD order) for the Save helper. */
  footerMessage: string | null;
}

/** null = empty (not provided); NaN = present but not a number. */
function parseOptional(raw: string | null | undefined): number | null {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return null;
  return Number(trimmed);
}

/**
 * Typed temperature → canonical °C exactly as the save seam produces it
 * (°F converted and rounded to 2 dp). NaN when a Fahrenheit input is outside
 * the plain-decimal grammar the seam can convert.
 */
function typedTemperatureToCelsius(trimmed: string, unit: TemperatureUnitPreference): number {
  if (unit !== "fahrenheit") return Number(trimmed);
  if (!QUICK_LOG_PLAIN_TEMPERATURE_INPUT.test(trimmed)) return Number.NaN;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return Math.round(fahrenheitToCelsius(parsed) * 100) / 100;
}

/** A present value must be a finite number that the canonical guard accepts. */
function isPresentValueValid(value: number, guard: (v: number | null) => boolean): boolean {
  return Number.isFinite(value) && guard(value);
}

export function assessQuickLogSensorSnapshotGate(input: {
  temperatureInput: string | null | undefined;
  humidityInput: string | null | undefined;
  vpdInput: string | null | undefined;
  temperatureUnit: TemperatureUnitPreference;
}): QuickLogSensorSnapshotGate {
  const fields: QuickLogSensorSnapshotGate["fields"] = {};

  const rawTemperature = (input.temperatureInput ?? "").trim();
  if (rawTemperature !== "") {
    const celsius = typedTemperatureToCelsius(rawTemperature, input.temperatureUnit);
    if (!isPresentValueValid(celsius, isTemperatureValid)) {
      fields.temperature = quickLogSnapshotTemperatureRangeMessage(input.temperatureUnit);
    }
  }
  const h = parseOptional(input.humidityInput);
  if (h !== null && !isPresentValueValid(h, isHumidityValid)) {
    fields.humidity = QUICK_LOG_SNAPSHOT_HUMIDITY_RANGE_MESSAGE;
  }
  const v = parseOptional(input.vpdInput);
  if (v !== null && !isPresentValueValid(v, isVpdValid)) {
    fields.vpd = QUICK_LOG_SNAPSHOT_VPD_RANGE_MESSAGE;
  }

  const footerMessage = fields.temperature ?? fields.humidity ?? fields.vpd ?? null;
  return { blocksSave: footerMessage !== null, fields, footerMessage };
}
