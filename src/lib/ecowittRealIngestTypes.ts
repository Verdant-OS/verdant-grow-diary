/**
 * EcoWitt Real Ingest — Phase 0 contract types.
 *
 * Phase 0 is server-contract + pure validator ONLY. It does not enable an
 * endpoint, an Edge Function, Supabase writes, alerts, AI calls, Action
 * Queue writes, automation, or device control.
 *
 * Source labels are the canonical sensor-truth vocabulary. Only "live"
 * candidates can be accepted; everything else is rejected for real ingest
 * and never upgraded.
 */

export type EcoWittRealIngestSource =
  | "live"
  | "manual"
  | "csv"
  | "demo"
  | "stale"
  | "invalid";

/** Shape of an inbound real-ingest candidate (untrusted until validated). */
export interface EcoWittRealIngestCandidate {
  tent_id: string;
  plant_id?: string | null;
  source: EcoWittRealIngestSource | string;
  captured_at: string;
  device_identity: string;
  source_identity: string;
  confidence?: "low" | "medium" | "high";
  readings: {
    air_temp_f?: number | null;
    humidity_pct?: number | null;
    vpd_kpa?: number | null;
    soil_water_content_pct?: number | null;
    soil_temp_f?: number | null;
    soil_ec?: number | null;
    co2_ppm?: number | null;
    ppfd?: number | null;
  };
  raw_payload?: unknown;
}

export interface EcoWittNormalizedReadings {
  air_temp_f: number | null;
  humidity_pct: number | null;
  vpd_kpa: number | null;
  soil_water_content_pct: number | null;
  soil_temp_f: number | null;
  soil_ec: number | null;
  co2_ppm: number | null;
  ppfd: number | null;
}

/** Validator output. `accepted` / `can_persist_later` are gated by every rule. */
export interface EcoWittRealIngestValidationResult {
  accepted: boolean;
  can_persist_later: boolean;
  source: EcoWittRealIngestSource | "unknown";
  tent_id: string | null;
  plant_id: string | null;
  captured_at: string | null;
  normalized_readings: EcoWittNormalizedReadings;
  blocked_reasons: string[];
  warnings: string[];
  redacted_payload: unknown;
  dedupe_key: string | null;
}

/** Closed vocabulary of blocked-reason codes used by the validator. */
export const ECOWITT_REAL_INGEST_BLOCKED_REASONS = [
  "missing_tent_id",
  "non_uuid_tent_id",
  "non_uuid_plant_id",
  "missing_captured_at",
  "invalid_captured_at",
  "stale_snapshot",
  "source_not_live",
  "source_unknown",
  "missing_device_identity",
  "placeholder_device_identity",
  "missing_source_identity",
  "missing_required_metric:air_temp_f",
  "missing_required_metric:humidity_pct",
  "invalid_metric:air_temp_f",
  "invalid_metric:humidity_pct",
  "invalid_metric:vpd_kpa",
  "invalid_metric:soil_water_content_pct",
  "invalid_metric:soil_temp_f",
  "invalid_metric:soil_ec",
  "invalid_metric:co2_ppm",
  "invalid_metric:ppfd",
  "suspicious_unit:temperature_c_as_f",
  "suspicious_unit:soil_ec_us_cm_as_ms_cm",
  "suspicious_value:humidity_stuck_0_or_100",
  "suspicious_value:soil_moisture_stuck_0_or_100",
] as const;

export type EcoWittRealIngestBlockedReason =
  (typeof ECOWITT_REAL_INGEST_BLOCKED_REASONS)[number];

/** Closed vocabulary of warning codes used by the validator. */
export const ECOWITT_REAL_INGEST_WARNINGS = [
  "optional_metric_missing:vpd_kpa",
  "optional_metric_missing:soil_water_content_pct",
  "optional_metric_missing:soil_temp_f",
  "optional_metric_missing:soil_ec",
  "optional_metric_missing:co2_ppm",
  "optional_metric_missing:ppfd",
  "raw_payload_redacted",
  "plant_id_missing",
  "confidence_defaulted",
] as const;

export type EcoWittRealIngestWarning =
  (typeof ECOWITT_REAL_INGEST_WARNINGS)[number];
