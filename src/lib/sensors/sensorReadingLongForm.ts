/**
 * sensorReadingLongForm — pure converter from NormalizedSensorReading
 * to one-row-per-metric long-form rows.
 *
 * Hard rules:
 *  - No I/O, no Supabase, no fetch.
 *  - Never produces rows for invalid/no-metric readings.
 *  - Never produces rows when tent_id or captured_at is missing.
 *  - Preserves source truth, identity, transport, confidence,
 *    warnings, and raw_payload.
 */
import type {
  NormalizedSensorReading,
  SensorSourceIdentity,
  SensorTransport,
  SensorTruthSource,
} from "./normalizeSensorReading";

export interface NormalizedSensorLongFormRow {
  tent_id: string;
  plant_id: string | null;
  metric: string;
  value: number;
  captured_at: string;
  source: SensorTruthSource;
  source_identity: SensorSourceIdentity;
  transport: SensorTransport;
  confidence: number;
  is_stale: boolean;
  warnings: string[];
  raw_payload: unknown;
}

export function normalizedReadingToLongFormRows(
  reading: NormalizedSensorReading,
): NormalizedSensorLongFormRow[] {
  if (!reading) return [];
  if (reading.source === "invalid") return [];
  if (!reading.tent_id || !reading.captured_at) return [];

  const rows: NormalizedSensorLongFormRow[] = [];
  const m = reading.metrics;
  const entries: Array<[string, number | null]> = [
    ["temperature_c", m.temperature_c],
    ["temperature_f", m.temperature_f],
    ["humidity_pct", m.humidity_pct],
    ["vpd_kpa", m.vpd_kpa],
    ["co2_ppm", m.co2_ppm],
    ["soil_moisture_pct", m.soil_moisture_pct],
    ["soil_temperature_c", m.soil_temperature_c],
    ["soil_temperature_f", m.soil_temperature_f],
    ["soil_ec_ms_cm", m.soil_ec_ms_cm],
    ["reservoir_ec_ms_cm", m.reservoir_ec_ms_cm],
    ["reservoir_ph", m.reservoir_ph],
    ["ppfd_umol_m2_s", m.ppfd_umol_m2_s],
  ];

  for (const [metric, value] of entries) {
    if (value === null || !Number.isFinite(value)) continue;
    rows.push({
      tent_id: reading.tent_id,
      plant_id: reading.plant_id,
      metric,
      value,
      captured_at: reading.captured_at,
      source: reading.source,
      source_identity: reading.source_identity,
      transport: reading.transport,
      confidence: reading.confidence,
      is_stale: reading.is_stale,
      warnings: reading.warnings,
      raw_payload: reading.raw_payload,
    });
  }

  if (rows.length === 0) return [];
  return rows;
}
