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
 *  - Duplicate rows (same import re-run, or duplicates within one CSV)
 *    are skipped, not crashed on. The deployed unique index
 *    `sensor_readings_dedupe_uidx` is never bypassed, weakened, or
 *    written around — duplicates are filtered out client-side using the
 *    same (tent_id, source, metric, captured_at) key it enforces, via the
 *    existing `src/lib/csv-import/sensorReadingsBatchInsert.ts` helpers.
 */
import type { ParsedEnvironmentRow } from "@/lib/csvParser";
import { CSV_SOURCE_TAG } from "@/lib/csvParser";
import {
  runDuplicateAwareCsvHistoryImport,
  isSensorReadingsDedupeUniqueViolation,
  CSV_HISTORY_DEDUPE_CONFLICT_COPY,
  type ExistingKeysQueryScope,
} from "@/lib/csv-import/sensorReadingsBatchInsert";

export const CSV_SENSOR_SOURCE = "csv" as const;

type CsvSensorMetric = "temperature_c" | "humidity_pct" | "vpd_kpa" | "co2_ppm" | "ppfd";

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
  metric: CsvSensorMetric;
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

    function pushMetric(
      metric: CsvSensorMetric,
      value: number | null,
      extraPayload: Partial<SensorReadingInsert["raw_payload"]> = {},
    ) {
      if (value == null || !Number.isFinite(value)) return;
      out.push({
        user_id: scope.user_id,
        tent_id: scope.tent_id,
        source: CSV_SENSOR_SOURCE,
        metric,
        value,
        captured_at: r.captured_at,
        raw_payload: { ...basePayload, ...extraPayload },
      });
    }

    pushMetric("temperature_c", r.temperature_c);
    pushMetric("humidity_pct", r.humidity_pct);
    pushMetric("vpd_kpa", r.vpd_kpa, r.vpd_source ? { vpd_source: r.vpd_source } : {});
    pushMetric("co2_ppm", r.co2_ppm);
    pushMetric("ppfd", r.ppfd);
  }
  return out;
}

export interface InsertClient {
  /** Minimal abstraction of `supabase.from("sensor_readings").insert(rows)`. */
  insertSensorReadings(rows: SensorReadingInsert[]): Promise<{
    error: { message: string; code?: string | null; details?: string | null } | null;
    insertedCount: number;
  }>;
  /**
   * Optional pre-insert duplicate lookup, scoped to
   * (tent_id, source, metric, captured_at) — the same key the deployed
   * `sensor_readings_dedupe_uidx` enforces. When supplied, already-imported
   * readings are skipped instead of reaching the database at all. When
   * omitted, duplicates are still caught (see isSensorReadingsDedupeUniqueViolation
   * handling below) but only after a round-trip to Postgres.
   */
  fetchExistingSensorReadingKeys?: (scope: ExistingKeysQueryScope) => Promise<Set<string>>;
}

export interface PersistResult {
  insertedCount: number;
  /** Rows skipped because they duplicate another row in this file or an
   *  already-imported reading for this tent. Never crashes the import. */
  duplicateCount: number;
  error: string | null;
}

/**
 * Confirm-only persistence. Caller MUST have user confirmation before invoking.
 * Inserts in chunks; never updates or deletes anything.
 *
 * Duplicate-safe: rows are deduped within the file and (when the client
 * supports it) against already-imported rows for this tent BEFORE any
 * insert fires, using the same (tent_id, source, metric, captured_at) key
 * as the deployed `sensor_readings_dedupe_uidx`. If Postgres still rejects
 * a duplicate (race window, or no lookup supplied), the raw 23505 error is
 * caught and converted to calm, duplicate-skipped feedback — the grower
 * never sees a raw database error.
 */
export async function persistCsvEnvironmentRows(
  rows: readonly ParsedEnvironmentRow[],
  scope: CsvInsertScope,
  client: InsertClient,
  chunkSize = 500,
): Promise<PersistResult> {
  const inserts = buildSensorReadingInserts(rows, scope);
  if (inserts.length === 0) return { insertedCount: 0, duplicateCount: 0, error: null };

  const fetchExistingKeys = client.fetchExistingSensorReadingKeys
    ? client.fetchExistingSensorReadingKeys.bind(client)
    : async () => new Set<string>();

  const result = await runDuplicateAwareCsvHistoryImport({
    rows: inserts,
    vendorLabel: "environment",
    batchSize: chunkSize,
    fetchExistingKeys,
    insertBatch: async (batch) => {
      const res = await client.insertSensorReadings(batch);
      return { error: res.error };
    },
  });

  if (!result.ok) {
    if (result.error && isSensorReadingsDedupeUniqueViolation(result.error)) {
      // Safety net: Postgres still rejected a duplicate we could not
      // pre-filter (no fetchExistingSensorReadingKeys, or a race with
      // another import). Never surface the raw driver message.
      return {
        insertedCount: result.insertedRows,
        duplicateCount: result.duplicateRows,
        error: CSV_HISTORY_DEDUPE_CONFLICT_COPY,
      };
    }
    return {
      insertedCount: result.insertedRows,
      duplicateCount: result.duplicateRows,
      error: result.error?.message ?? "Import failed.",
    };
  }

  return {
    insertedCount: result.insertedRows,
    duplicateCount: result.duplicateRows,
    error: null,
  };
}
