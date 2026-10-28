/**
 * Render-time gate for the Quick Log V2 sensor snapshot fields
 * (temperature / humidity / VPD) on every action that carries a snapshot.
 * Inputs are the raw typed strings; temperature is in the grower's unit.
 * Humidity/VPD bands come from the canonical guards in
 * sensorReadingNormalizationRules.ts; temperature uses the manual air band
 * (manualAirTemperatureRules, -10..50 °C). quickLogV2SavePayload.ts uses the
 * same guards and stays authoritative. Applied after the shared °F → °C
 * conversion (quickLogTypedTemperatureRules) that the sheet's save seam uses.
 */
import type { TemperatureUnitPreference } from "./temperatureUnitPreference";
import { isHumidityValid, isVpdValid } from "./sensorReadingNormalizationRules";
import {
  isManualAirTemperatureValid,
  MANUAL_AIR_TEMPERATURE_RANGE_MESSAGE_CELSIUS,
  manualAirTemperatureRangeMessage,
} from "./manualAirTemperatureRules";
import { convertTypedTemperatureToCelsius } from "./quickLogTypedTemperatureRules";

export const QUICK_LOG_SNAPSHOT_HUMIDITY_RANGE_MESSAGE =
  "Humidity must be between 0 and 100%." as const;
export const QUICK_LOG_SNAPSHOT_VPD_RANGE_MESSAGE = "VPD must be between 0 and 10 kPa." as const;
export const QUICK_LOG_SNAPSHOT_TEMPERATURE_RANGE_MESSAGE_CELSIUS =
  MANUAL_AIR_TEMPERATURE_RANGE_MESSAGE_CELSIUS;

/** Snapshot temperature copy in the grower's unit (manual air band -10..50 °C). */
export function quickLogSnapshotTemperatureRangeMessage(unit: TemperatureUnitPreference): string {
  return manualAirTemperatureRangeMessage(unit);
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

  const temperature = convertTypedTemperatureToCelsius(
    input.temperatureInput,
    input.temperatureUnit,
  );
  if (
    temperature.kind === "unconvertible" ||
    (temperature.kind === "celsius" && !isManualAirTemperatureValid(temperature.value))
  ) {
    fields.temperature = quickLogSnapshotTemperatureRangeMessage(input.temperatureUnit);
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
