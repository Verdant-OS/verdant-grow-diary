/**
 * Closed vocabulary for Ecowitt cloud normalization "missing metric" signals.
 *
 * Emitted by `normalizeEcowittCloudReadings` at the (mac, channel)-bucket
 * level, for MAPPED channels only (a channel that routed to a tent for at
 * least one metric). Unmapped channels are already represented by the
 * existing `unmapped` array — they MUST NOT also be flagged here.
 *
 * Vocabulary:
 *  - "air_temperature_absent"  — mapped air channel produced data but no temp
 *  - "air_humidity_absent"     — mapped air channel produced data but no humidity
 *  - "soil_moisture_absent"    — mapped soil channel exists but no soilmoisture
 *
 * Explicitly NOT in vocabulary (collision-free with existing signals):
 *  - payload-shape  → warnings.payload_not_object
 *  - timestamp gap  → warnings.captured_at_missing_or_unparseable
 *  - pressure       → unmapped.unsupported_metric_for_ecowitt / pressure_unmapped
 *  - no mapping     → unmapped.no_tent_mapping_for_channel / unmapped_count
 *  - empty payload  → summary.missing_metric boolean
 *
 * NEVER add free text. NEVER include MAC / channel index / tent_id in any code.
 */

export const ECOWITT_MISSING_METRIC_CODES = [
  "air_temperature_absent",
  "air_humidity_absent",
  "soil_moisture_absent",
] as const;

export type EcowittMissingMetricCode =
  (typeof ECOWITT_MISSING_METRIC_CODES)[number];

const SET: ReadonlySet<string> = new Set(ECOWITT_MISSING_METRIC_CODES);

export function isEcowittMissingMetricCode(
  value: unknown,
): value is EcowittMissingMetricCode {
  return typeof value === "string" && SET.has(value);
}
