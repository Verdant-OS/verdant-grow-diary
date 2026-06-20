// Edge mirror of src/lib EcoWitt real-ingest logic.
// Keep behavior in parity with src/lib via ecowitt-real-ingest-edge-parity tests.
// Do not add persistence, Supabase writes, network calls, alerts, Action Queue writes, AI calls, automation, or device control here.

export type EcoWittRealIngestSource =
  | "live"
  | "manual"
  | "csv"
  | "demo"
  | "stale"
  | "invalid";

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
