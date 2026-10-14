/**
 * Render-time gate for the Quick Log V2 sensor snapshot fields
 * (temperature / humidity / VPD) on every action that carries a snapshot.
 * Inputs are the raw typed strings; temperature is in the grower's unit.
 * Bounds mirror the server rule in quickLogV2SavePayload.ts (temperature
 * -10..60 °C, humidity 0..100 %, VPD 0..10 kPa), which stays authoritative.
 */
import type { TemperatureUnitPreference } from "./temperatureUnitPreference";
import { wateringTemperatureRangeMessage } from "./quickLogWaterSaveGateRules";

export const QUICK_LOG_SNAPSHOT_HUMIDITY_RANGE_MESSAGE =
  "Humidity must be between 0 and 100%." as const;
export const QUICK_LOG_SNAPSHOT_VPD_RANGE_MESSAGE = "VPD must be between 0 and 10 kPa." as const;

export type QuickLogSensorSnapshotGateField = "temperature" | "humidity" | "vpd";

export interface QuickLogSensorSnapshotGate {
  blocksSave: boolean;
  fields: Partial<Record<QuickLogSensorSnapshotGateField, string>>;
}

/** null = empty (not provided); NaN = present but not a number. */
function parseOptional(raw: string | null | undefined): number | null {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return null;
  return Number(trimmed);
}

function inRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

export function assessQuickLogSensorSnapshotGate(input: {
  temperatureInput: string | null | undefined;
  humidityInput: string | null | undefined;
  vpdInput: string | null | undefined;
  temperatureUnit: TemperatureUnitPreference;
}): QuickLogSensorSnapshotGate {
  const fields: QuickLogSensorSnapshotGate["fields"] = {};

  const t = parseOptional(input.temperatureInput);
  if (t !== null) {
    const celsius = input.temperatureUnit === "fahrenheit" ? ((t - 32) * 5) / 9 : t;
    if (!inRange(celsius, -10, 60)) {
      fields.temperature = wateringTemperatureRangeMessage(input.temperatureUnit);
    }
  }
  const h = parseOptional(input.humidityInput);
  if (h !== null && !inRange(h, 0, 100)) {
    fields.humidity = QUICK_LOG_SNAPSHOT_HUMIDITY_RANGE_MESSAGE;
  }
  const v = parseOptional(input.vpdInput);
  if (v !== null && !inRange(v, 0, 10)) {
    fields.vpd = QUICK_LOG_SNAPSHOT_VPD_RANGE_MESSAGE;
  }

  return { blocksSave: Object.keys(fields).length > 0, fields };
}
