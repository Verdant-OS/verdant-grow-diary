/**
 * Closed vocabulary for Ecowitt cloud normalization "missing metric" signals.
 *
 * These codes are emitted by `normalizeEcowittCloudReadings` at the
 * (mac, channel)-bucket level and aggregated on the verdict summary as
 * `missing_metric_codes`. The vocabulary is intentionally narrow:
 *
 *  - "captured_at_missing"       — payload had no parseable dateutc
 *  - "air_temperature_missing"   — channel mapped for air, bucket has humidity
 *                                  but no temperature
 *  - "air_humidity_missing"      — channel mapped for air, bucket has temp
 *                                  but no humidity
 *  - "soil_moisture_missing"     — channel mapped for soil, bucket exists
 *                                  but no soilmoisture
 *
 * Detection is bound to bucket existence + mapping so that unmapped channels
 * and silent mapped channels never emit codes (avoids "everything missing"
 * noise from empty payloads).
 *
 * NEVER add free-text — only literals from this enum may reach the verdict
 * summary, view-model, or export.
 */

export const ECOWITT_MISSING_METRIC_CODES = [
  "captured_at_missing",
  "air_temperature_missing",
  "air_humidity_missing",
  "soil_moisture_missing",
] as const;

export type EcowittMissingMetricCode =
  (typeof ECOWITT_MISSING_METRIC_CODES)[number];

const SET: ReadonlySet<string> = new Set(ECOWITT_MISSING_METRIC_CODES);

export function isEcowittMissingMetricCode(
  value: unknown,
): value is EcowittMissingMetricCode {
  return typeof value === "string" && SET.has(value);
}
