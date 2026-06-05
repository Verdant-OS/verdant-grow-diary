/**
 * Closed enum vocabulary for Ecowitt cloud-canary suspicious-flag codes.
 *
 * Mirrors `EcowittSuspicionCode` from `src/lib/ecowittSuspiciousReadingRules.ts`
 * (slice-1's authoritative source). View-model + UI MUST only surface codes
 * from this set — never free text, never runtime-assembled strings, never
 * values that could carry a MAC, channel key, tent_id, or any identifier.
 */

import type { EcowittSuspicionCode } from "@/lib/ecowittSuspiciousReadingRules";

export type EcowittSuspiciousFlagCode = EcowittSuspicionCode;

export const ECOWITT_SUSPICIOUS_FLAG_CODES = [
  "rh_out_of_range_invalid",
  "temperature_implausible_invalid",
  "humidity_stuck_extreme",
  "soil_moisture_stuck_extreme",
  "celsius_looking_fahrenheit",
  "impossible_temp_rh_combo",
] as const satisfies ReadonlyArray<EcowittSuspiciousFlagCode>;

const SET: ReadonlySet<string> = new Set(ECOWITT_SUSPICIOUS_FLAG_CODES);

export function isEcowittSuspiciousFlagCode(
  v: unknown,
): v is EcowittSuspiciousFlagCode {
  return typeof v === "string" && SET.has(v);
}

/**
 * Short, data-classification labels for display. NEVER connection/health
 * state. Lowercase, neutral phrasing only.
 */
export const ECOWITT_SUSPICIOUS_FLAG_LABELS: Record<
  EcowittSuspiciousFlagCode,
  string
> = {
  rh_out_of_range_invalid: "humidity out of range",
  temperature_implausible_invalid: "temperature out of range",
  humidity_stuck_extreme: "humidity stuck at extreme",
  soil_moisture_stuck_extreme: "soil moisture stuck at extreme",
  celsius_looking_fahrenheit: "celsius-looking fahrenheit",
  impossible_temp_rh_combo: "impossible temp/humidity combo",
};
