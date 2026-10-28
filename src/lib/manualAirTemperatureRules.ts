/**
 * manualAirTemperatureRules — the save-time air-temperature band for readings
 * a grower types by hand (Quick Log v1/v2 snapshots, the Water form snapshot,
 * the Sensors / Daily Check manual reading card).
 *
 * Owner decision (Matthew, 2026-10-28): manual air temperature is accepted
 * only within -10..50 °C (14–122 °F), the same AIR_TEMP_C_RANGE the manual
 * insert validator, the snapshot quality badge and the correction RPC already
 * use. Readers of stored rows and device/webhook ingest keep the wider
 * -10..60 °C plausibility band in sensorReadingNormalizationRules, so older
 * entries still display.
 *
 * Pure: no I/O, no React, no clock.
 */
import { AIR_TEMP_C_RANGE } from "@/constants/csvValidationRanges";
import { celsiusToFahrenheit } from "./temperatureUnits";
import type { TemperatureUnitPreference } from "./temperatureUnitPreference";

export const MANUAL_AIR_TEMP_MIN_C = AIR_TEMP_C_RANGE.min;
export const MANUAL_AIR_TEMP_MAX_C = AIR_TEMP_C_RANGE.max;

/** null = not provided (not invalid); otherwise finite and inside -10..50 °C. */
export function isManualAirTemperatureValid(celsius: number | null): boolean {
  if (celsius === null) return true;
  return (
    Number.isFinite(celsius) && celsius >= MANUAL_AIR_TEMP_MIN_C && celsius <= MANUAL_AIR_TEMP_MAX_C
  );
}

function formatBound(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

const MIN_F = formatBound(celsiusToFahrenheit(MANUAL_AIR_TEMP_MIN_C));
const MAX_F = formatBound(celsiusToFahrenheit(MANUAL_AIR_TEMP_MAX_C));

export const MANUAL_AIR_TEMPERATURE_RANGE_MESSAGE_CELSIUS = `Temperature must be between ${MANUAL_AIR_TEMP_MIN_C} and ${MANUAL_AIR_TEMP_MAX_C} °C.`;

/** For surfaces that do not know the grower's unit: names both. */
export const MANUAL_AIR_TEMPERATURE_RANGE_MESSAGE_BOTH_UNITS = `Temperature must be between ${MANUAL_AIR_TEMP_MIN_C} and ${MANUAL_AIR_TEMP_MAX_C} °C (${MIN_F}–${MAX_F} °F).`;

/** Refusal copy in the grower's unit. */
export function manualAirTemperatureRangeMessage(unit: TemperatureUnitPreference): string {
  if (unit === "fahrenheit") return `Temperature must be between ${MIN_F} and ${MAX_F} °F.`;
  return MANUAL_AIR_TEMPERATURE_RANGE_MESSAGE_CELSIUS;
}
