/**
 * environmentCsvImportPersistence — confirm-only insert adapter for CSV
 * environment rows into the existing `sensor_readings` table.
 *
 * Hard contract (enforced by tests):
 *  - Insert only. No updates, no deletes. Never touches manual logs.
 *  - Every row carries source = "csv" and raw_payload.source_tag = "csv".
 *  - Never writes alerts, action_queue, or any device-control table.
 *  - Never labels rows as "live".
 *  - This function is only called by the confirm CTA path in the UI.
 */
import type { ParsedEnvironmentRow } from "@/lib/csvParser";
import { CSV_SOURCE_TAG } from "@/lib/csvParser";

export const CSV_SENSOR_SOURCE = "csv" as const;

export interface CsvInsertScope {
  user_id: string;
  grow_id: string;
  tent_id: string;
  plant_id?: string | null;
}

export interface SensorReadingInsert {
  user_id: string;
  tent_id: string;
  source: typeof CSV_SENSOR_SOURCE;
  metric: "temperature_c" | "humidity_pct" | "vpd_kpa";
  value: number;
  captured_at: string;
  raw_payload: {
    source_tag: typeof CSV_SOURCE_TAG;
    grow_id: string;
    tent_id: string;
    plant_id: string | null;
    raw_temperature: number | null;
    raw_temp_unit: ParsedEnvironmentRow["raw_temp_unit"];
    raw_row: Record<string, string>;
    vpd_source?: "derived" | "csv";
  };
}

/**
 * Pure mapper: row → one insert per non-null canonical metric. Used directly
 * by the persistence step so tests can assert shape without DB.
 */
export function buildSensorReadingInserts(
  rows: readonly ParsedEnvironmentRow[],
  scope: CsvInsertScope,
): SensorReadingInsert[] {
  const out: SensorReadingInsert[] = [];
  for (const r of rows) {
    const basePayload = {
      source_tag: CSV_SOURCE_TAG,
      grow_id: scope.grow_id,
      tent_id: scope.tent_id,
      plant_id: scope.plant_id ?? null,
      raw_temperature: r.raw_temperature,
      raw_temp_unit: r.raw_temp_unit,
      raw_row: r.raw_payload,
    } as const;

    if (r.temperature_c != null && Number.isFinite(r.temperature_c)) {
      out.push({
        user_id: scope.user_id,
        tent_id: scope.tent_id,
        source: CSV_SENSOR_SOURCE,
        metric: "temperature_c",
        value: r.temperature_c,
        captured_at: r.captured_at,
        raw_payload: { ...basePayload },
      });
    }
    if (r.humidity_pct != null && Number.isFinite(r.humidity_pct)) {
      out.push({
        user_id: scope.user_id,
        tent_id: scope.tent_id,
        source: CSV_SENSOR_SOURCE,
        metric: "humidity_pct",
        value: r.humidity_pct,
        captured_at: r.captured_at,
        raw_payload: { ...basePayload },
      });
    }
    if (r.vpd_kpa != null && Number.isFinite(r.vpd_kpa)) {
      out.push({
        user_id: scope.user_id,
        tent_id: scope.tent_id,
        source: CSV_SENSOR_SOURCE,
        metric: "vpd_kpa",
        value: r.vpd_kpa,
        captured_at: r.captured_at,
        raw_payload: { ...basePayload, vpd_source: "derived" },
      });
    }
  }
  return out;
}

export interface InsertClient {
  /** Minimal abstraction of `supabase.from("sensor_readings").insert(rows)`. */
  insertSensorReadings(rows: SensorReadingInsert[]): Promise<{
    error: { message: string } | null;
    insertedCount: number;
  }>;
}

export interface PersistResult {
  insertedCount: number;
  error: string | null;
}

/**
 * Confirm-only persistence. Caller MUST have user confirmation before invoking.
 * Inserts in chunks; never updates or deletes anything.
 */
export async function persistCsvEnvironmentRows(
  rows: readonly ParsedEnvironmentRow[],
  scope: CsvInsertScope,
  client: InsertClient,
  chunkSize = 500,
): Promise<PersistResult> {
  const inserts = buildSensorReadingInserts(rows, scope);
  if (inserts.length === 0) return { insertedCount: 0, error: null };

  let inserted = 0;
  for (let i = 0; i < inserts.length; i += chunkSize) {
    const chunk = inserts.slice(i, i + chunkSize);
    const res = await client.insertSensorReadings(chunk);
    if (res.error) {
      return { insertedCount: inserted, error: res.error.message };
    }
    inserted += res.insertedCount || chunk.length;
  }
  return { insertedCount: inserted, error: null };
}
