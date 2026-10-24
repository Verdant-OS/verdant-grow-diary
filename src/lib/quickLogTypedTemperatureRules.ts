/**
 * The one °F → °C conversion for a grower-typed Quick Log temperature.
 * Used by the sheet's save seam (QuickLogV2Sheet) and by the render-time
 * sensor snapshot gate, so inline validation and the authoritative payload
 * cannot disagree about what a typed value means.
 *
 * Pure: no React, no I/O.
 */
import { fahrenheitToCelsius, type TemperatureUnitPreference } from "./temperatureUnitPreference";

/** Plain-decimal grammar a Fahrenheit value must match to be converted. */
export const QUICK_LOG_PLAIN_TEMPERATURE_INPUT = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

export type TypedTemperatureCelsius =
  { kind: "empty" } | { kind: "celsius"; value: number } | { kind: "unconvertible" };

/**
 * Typed temperature (in the grower's unit) → canonical °C as the payload will
 * read it. °F is converted only from plain decimals and rounded to 2 dp; a
 * Celsius value is read as the payload reads it.
 */
export function convertTypedTemperatureToCelsius(
  raw: string | null | undefined,
  unit: TemperatureUnitPreference,
): TypedTemperatureCelsius {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return { kind: "empty" };
  if (unit !== "fahrenheit") {
    const value = Number(trimmed);
    return Number.isFinite(value) ? { kind: "celsius", value } : { kind: "unconvertible" };
  }
  if (!QUICK_LOG_PLAIN_TEMPERATURE_INPUT.test(trimmed)) return { kind: "unconvertible" };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return { kind: "unconvertible" };
  return { kind: "celsius", value: Math.round(fahrenheitToCelsius(parsed) * 100) / 100 };
}

/**
 * Save-seam form: a canonical-°C string for the payload builder. Called
 * exactly once per save attempt on the raw typed value. Celsius input, blank
 * input and text that cannot be converted pass through unchanged so the
 * payload validators keep rejecting it with their original reasons.
 */
export function typedTemperatureToCelsiusInput(
  raw: string,
  unit: TemperatureUnitPreference,
): string {
  if (unit !== "fahrenheit") return raw;
  const converted = convertTypedTemperatureToCelsius(raw, unit);
  return converted.kind === "celsius" ? String(converted.value) : raw;
}
