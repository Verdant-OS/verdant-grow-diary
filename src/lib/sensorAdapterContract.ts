/**
 * Canonical sensor-adapter contract for vendor/transport normalizers.
 *
 * This is deliberately a pre-persistence contract. It reuses Verdant's
 * canonical source, transport, and persisted metric vocabularies while
 * adding only the adapter-level fields that the existing contracts do not
 * carry (adapter identity, channel identity, normalized unit, trust,
 * validity, receive time, and a safe raw-payload reference).
 *
 * Pure and deterministic: no I/O, clocks, storage, network, or device
 * behavior. Callers inject both the clock and the freshness policy.
 */

import type {
  CanonicalSensorSource,
  SensorProvenanceTransport,
} from "@/constants/sensorIngestProvenance";
import type { CanonicalMetric } from "@/lib/sensorWebhookIngestRules";

export const SENSOR_ADAPTER_CONTRACT_VERSION = 1 as const;

export type SensorAdapterSource = Extract<CanonicalSensorSource, "live" | "stale" | "invalid">;

export type SensorAdapterMetric = Extract<
  CanonicalMetric,
  | "temperature_c"
  | "humidity_pct"
  | "vpd_kpa"
  | "co2_ppm"
  | "soil_moisture_pct"
  | "soil_temp_c"
  | "ec"
>;

export type SensorAdapterNormalizedUnit = "°C" | "%" | "kPa" | "ppm" | "mS/cm";

export type SensorAdapterValidity = "valid" | "invalid";

/**
 * `local_transport` means the value came through the configured local
 * adapter path. It is not a claim of cryptographic device identity.
 */
export type SensorAdapterTrustLevel = "local_transport" | "degraded" | "untrusted";

export type SensorAdapterValueOrigin = "observed" | "derived" | "source_reported";

export type SensorAdapterComparisonRole = "primary" | "reference";

export type SensorAdapterIngestBoundaryStatus =
  | "ready"
  | "reference_only"
  | "blocked_channel_collision"
  | "invalid";

export interface SensorAdapterFreshnessPolicy {
  /** Expected publishing cadence; late-but-not-stale readings are degraded. */
  expected_interval_ms: number;
  /** Age strictly greater than this threshold classifies stale. */
  stale_threshold_ms: number;
  /** Maximum permitted future clock skew before classification is invalid. */
  future_clock_skew_ms: number;
}

export type SensorAdapterWarning =
  | "malformed_payload"
  | "invalid_freshness_policy"
  | "missing_timestamp"
  | "malformed_timestamp"
  | "malformed_received_at"
  | "future_timestamp"
  | "reading_late"
  | "stale_reading"
  | "missing_value"
  | "non_finite_value"
  | "unit_mismatch"
  | "temperature_unit_mismatch"
  | "temperature_out_of_range"
  | "humidity_out_of_range"
  | "humidity_stuck_extreme"
  | "soil_moisture_out_of_range"
  | "soil_moisture_stuck_extreme"
  | "ec_unit_mismatch"
  | "ec_out_of_range"
  | "co2_out_of_range"
  | "vpd_out_of_range"
  | "source_reported_vpd_reference_only"
  | "vpd_inputs_invalid"
  | "vpd_pairing_ambiguous"
  | "missing_tent_mapping"
  | "invalid_plant_mapping"
  | "duplicate_raw_field"
  | "duplicate_channel_assignment"
  | "device_reference_redacted"
  | "ingest_boundary_channel_collision"
  | "no_supported_metrics";

/**
 * Opaque pointer to the redacted payload on SensorAdapterResult. Raw private
 * payload bytes never ride on individual readings.
 */
export const SENSOR_ADAPTER_REDACTED_PAYLOAD_REF = "adapter_result.redacted_payload" as const;

export interface SensorAdapterReading {
  source: SensorAdapterSource;
  provider: string;
  transport: SensorProvenanceTransport;
  adapter_id: string;
  adapter_version: string;
  origin_source: string;
  trust_level: SensorAdapterTrustLevel;
  captured_at: string | null;
  received_at: string | null;
  tent_id: string | null;
  plant_id: string | null;
  metric: SensorAdapterMetric;
  normalized_value: number | null;
  normalized_unit: SensorAdapterNormalizedUnit;
  validity: SensorAdapterValidity;
  confidence: number;
  warnings: SensorAdapterWarning[];
  raw_payload_ref: typeof SENSOR_ADAPTER_REDACTED_PAYLOAD_REF;
  channel_ref: string;
  device_ref: string | null;
  raw_field: string;
  value_origin: SensorAdapterValueOrigin;
  comparison_role: SensorAdapterComparisonRole;
  reading_id: string;
  ingest_boundary_status: SensorAdapterIngestBoundaryStatus;
}

export interface SensorAdapterResult {
  /** True only when at least one valid reading is ready for ingest. */
  ok: boolean;
  readings: SensorAdapterReading[];
  warnings: SensorAdapterWarning[];
  redacted_payload: unknown;
  ignored_field_count: number;
  omitted_control_field_count: number;
}

export interface SensorAdapterFreshnessResult {
  source: SensorAdapterSource;
  warnings: SensorAdapterWarning[];
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isValidSensorAdapterFreshnessPolicy(policy: SensorAdapterFreshnessPolicy): boolean {
  return (
    !!policy &&
    typeof policy === "object" &&
    isFiniteNonNegative(policy.expected_interval_ms) &&
    policy.expected_interval_ms > 0 &&
    isFiniteNonNegative(policy.stale_threshold_ms) &&
    policy.stale_threshold_ms >= policy.expected_interval_ms &&
    isFiniteNonNegative(policy.future_clock_skew_ms)
  );
}

/** Exact threshold remains fresh; threshold + 1 ms is stale. */
export function classifySensorAdapterFreshness(args: {
  captured_at: string | null;
  now_ms: number;
  policy: SensorAdapterFreshnessPolicy;
}): SensorAdapterFreshnessResult {
  if (!isValidSensorAdapterFreshnessPolicy(args.policy) || !Number.isFinite(args.now_ms)) {
    return { source: "invalid", warnings: ["invalid_freshness_policy"] };
  }

  if (!args.captured_at) {
    return { source: "invalid", warnings: ["missing_timestamp"] };
  }

  const capturedMs = Date.parse(args.captured_at);
  if (!Number.isFinite(capturedMs)) {
    return { source: "invalid", warnings: ["malformed_timestamp"] };
  }

  const ageMs = args.now_ms - capturedMs;
  if (ageMs < -args.policy.future_clock_skew_ms) {
    return { source: "invalid", warnings: ["future_timestamp"] };
  }
  if (ageMs > args.policy.stale_threshold_ms) {
    return { source: "stale", warnings: ["stale_reading"] };
  }
  if (ageMs > args.policy.expected_interval_ms) {
    return { source: "live", warnings: ["reading_late"] };
  }
  return { source: "live", warnings: [] };
}

function lexicalCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Deterministic ordering contract:
 * metric -> channel -> device -> captured_at -> stable reading id.
 */
export function sortSensorAdapterReadings(
  readings: readonly SensorAdapterReading[],
): SensorAdapterReading[] {
  return readings
    .map((reading, index) => ({ reading, index }))
    .sort((a, b) => {
      const fieldsA = [
        a.reading.metric,
        a.reading.channel_ref,
        a.reading.device_ref ?? "",
        a.reading.captured_at ?? "",
        a.reading.reading_id,
      ];
      const fieldsB = [
        b.reading.metric,
        b.reading.channel_ref,
        b.reading.device_ref ?? "",
        b.reading.captured_at ?? "",
        b.reading.reading_id,
      ];
      for (let i = 0; i < fieldsA.length; i += 1) {
        const compared = lexicalCompare(fieldsA[i], fieldsB[i]);
        if (compared !== 0) return compared;
      }
      return a.index - b.index;
    })
    .map(({ reading }) => reading);
}

function escapeReadingIdSegment(value: string | null): string {
  return encodeURIComponent(value ?? "");
}

export function buildSensorAdapterReadingId(args: {
  adapter_id: string;
  adapter_version: string;
  metric: SensorAdapterMetric;
  channel_ref: string;
  device_ref: string | null;
  captured_at: string | null;
  tent_id: string | null;
  raw_field: string;
  value_origin: SensorAdapterValueOrigin;
}): string {
  return [
    args.adapter_id,
    args.adapter_version,
    args.metric,
    args.channel_ref,
    args.device_ref,
    args.captured_at,
    args.tent_id,
    args.raw_field,
    args.value_origin,
  ]
    .map((segment) => escapeReadingIdSegment(segment))
    .join("|");
}

export function canonicalUnitForSensorAdapterMetric(
  metric: SensorAdapterMetric,
): SensorAdapterNormalizedUnit {
  switch (metric) {
    case "temperature_c":
    case "soil_temp_c":
      return "°C";
    case "humidity_pct":
    case "soil_moisture_pct":
      return "%";
    case "vpd_kpa":
      return "kPa";
    case "co2_ppm":
      return "ppm";
    case "ec":
      return "mS/cm";
  }
}
