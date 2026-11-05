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
import { interpretCsvTimestamp } from "@/lib/csvTimestampRules";
import {
  buildCsvImportFailureMessage,
  type CsvImportFailureReason,
} from "@/lib/environmentCsvPreviewCopyRules";

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
    source_app?: "ac_infinity" | "spider_farmer" | "vivosun" | null;
    import_file_name?: string | null;
    time_provenance?: ParsedEnvironmentRow["time_provenance"];
  };
}

/** Grower copy when the write boundary refuses rows with unsettled times. */
export const CSV_TIME_UNRESOLVED_COPY =
  "Nothing was saved. Some observation times in this file aren’t settled yet. Choose the time zone the file was recorded in and try again." as const;

/**
 * Write-boundary time check, independent of the UI. A row is write-eligible
 * only when captured_at is a canonical UTC instant and, when the row carries
 * time provenance, re-reading its source text under that provenance yields
 * exactly that instant. Returns the indexes of rows that fail.
 */
export function findRowsWithUnverifiedTime(rows: readonly ParsedEnvironmentRow[]): number[] {
  const bad: number[] = [];
  rows.forEach((r, i) => {
    const ms = typeof r?.captured_at === "string" ? Date.parse(r.captured_at) : NaN;
    if (!Number.isFinite(ms) || new Date(ms).toISOString() !== r.captured_at) {
      bad.push(i);
      return;
    }
    const p = r.time_provenance;
    if (p === undefined) return;
    const zone =
      p?.basis === "source_time_zone"
        ? p.source_time_zone
        : p?.basis === "explicit_offset"
          ? null
          : undefined;
    if (zone === undefined || (p.basis === "source_time_zone" && !zone)) {
      bad.push(i);
      return;
    }
    const again = interpretCsvTimestamp(p.source_text, zone);
    if (again.kind !== "resolved" || again.basis !== p.basis || again.iso !== r.captured_at) {
      bad.push(i);
    }
  });
  return bad;
}

/**
 * Pure mapper: row → one insert per non-null canonical metric. Used directly
 * by the persistence step so tests can assert shape without DB.
 */
const insertSourceRow = new WeakMap<SensorReadingInsert, number>();

export function buildSensorReadingInserts(
  rows: readonly ParsedEnvironmentRow[],
  scope: CsvInsertScope,
): SensorReadingInsert[] {
  const out: SensorReadingInsert[] = [];
  rows.forEach((r, sourceRow) => {
    const basePayload = {
      source_tag: CSV_SOURCE_TAG,
      grow_id: scope.grow_id,
      tent_id: scope.tent_id,
      plant_id: scope.plant_id ?? null,
      raw_temperature: r.raw_temperature,
      raw_temp_unit: r.raw_temp_unit,
      raw_row: r.raw_payload,
      ...(r.source_app ? { source_app: r.source_app } : {}),
      ...(r.time_provenance ? { time_provenance: r.time_provenance } : {}),
    } as const;

    function pushMetric(
      metric: CsvSensorMetric,
      value: number | null,
      extraPayload: Partial<SensorReadingInsert["raw_payload"]> = {},
    ) {
      if (value == null || !Number.isFinite(value)) return;
      const insert: SensorReadingInsert = {
        user_id: scope.user_id,
        tent_id: scope.tent_id,
        source: CSV_SENSOR_SOURCE,
        metric,
        value,
        captured_at: r.captured_at,
        raw_payload: { ...basePayload, ...extraPayload },
      };
      insertSourceRow.set(insert, sourceRow);
      out.push(insert);
    }

    pushMetric("temperature_c", r.temperature_c);
    pushMetric("humidity_pct", r.humidity_pct);
    pushMetric("vpd_kpa", r.vpd_kpa, r.vpd_source ? { vpd_source: r.vpd_source } : {});
    pushMetric("co2_ppm", r.co2_ppm);
    pushMetric("ppfd", r.ppfd);
  });
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
  /** Sensor rows with at least one metric insert. Fully duplicate rows are excluded. */
  contributedSensorRowCount: number;
  /** Rows skipped because they duplicate another row in this file or an
   *  already-imported reading for this tent. Never crashes the import. */
  duplicateCount: number;
  /** True when earlier atomic batches committed before a later batch failed. */
  partialWrite: boolean;
  /** A dispatched batch may have committed without an acknowledged response. */
  unconfirmedWrite?: boolean;
  /** Safe classification; a duplicate conflict does not verify hidden rows. */
  failureReason?: CsvImportFailureReason;
  /** Always grower-safe copy. Raw database diagnostics never cross this boundary. */
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
 * caught and reported as an unresolved conflict unless the follow-up read
 * verifies the matching rows. The grower never sees a raw database error.
 */
export async function persistCsvEnvironmentRows(
  rows: readonly ParsedEnvironmentRow[],
  scope: CsvInsertScope,
  client: InsertClient,
  chunkSize = 500,
): Promise<PersistResult> {
  // snip:prod — fail closed at the write boundary; a UI gate alone is not enough.
  if (findRowsWithUnverifiedTime(rows).length > 0) {
    return {
      insertedCount: 0,
      duplicateCount: 0,
      contributedSensorRowCount: 0,
      partialWrite: false,
      error: CSV_TIME_UNRESOLVED_COPY,
    };
  }
  const inserts = buildSensorReadingInserts(rows, scope);
  if (inserts.length === 0) {
    return {
      insertedCount: 0,
      duplicateCount: 0,
      contributedSensorRowCount: 0,
      partialWrite: false,
      error: null,
    };
  }

  const readExistingKeys = client.fetchExistingSensorReadingKeys
    ? client.fetchExistingSensorReadingKeys.bind(client)
    : async () => new Set<string>();
  const fetchExistingKeys = async (scope: ExistingKeysQueryScope) => readExistingKeys(scope);

  const committedSourceRows = new Set<number>();
  let unconfirmedWrite = false;
  const result = await runDuplicateAwareCsvHistoryImport({
    rows: inserts,
    vendorLabel: "environment",
    batchSize: chunkSize,
    fetchExistingKeys,
    insertBatch: async (batch) => {
      try {
        const res = await client.insertSensorReadings(batch);
        // Only well-formed data/constraint/access rejections establish that
        // this atomic insert failed. Transport and unknown codes (including
        // 40003, statement_completion_unknown) never establish zero writes.
        if (res.error && !/^(22|23|42)[0-9A-Z]{3}$/.test(res.error.code ?? "")) {
          unconfirmedWrite = true;
        }
        if (!res.error) {
          for (const row of batch) {
            const sourceRow = insertSourceRow.get(row);
            if (sourceRow != null) committedSourceRows.add(sourceRow);
          }
        }
        return { error: res.error };
      } catch {
        // Return through the batch helper so earlier acknowledged counts survive.
        unconfirmedWrite = true;
        return { error: { message: "CSV insert response unavailable" } };
      }
    },
  });

  const contributedSensorRowCount = committedSourceRows.size;

  if (!result.ok) {
    const partialWrite = result.batchResult?.partialWrite === true || result.insertedRows > 0;
    if (result.error && isSensorReadingsDedupeUniqueViolation(result.error)) {
      // Safety net: Postgres still rejected a duplicate we could not
      // pre-filter (no fetchExistingSensorReadingKeys, or a race with
      // another import). Never surface the raw driver message.
      return {
        insertedCount: result.insertedRows,
        duplicateCount: result.duplicateRows,
        contributedSensorRowCount,
        partialWrite,
        failureReason: "unverified_duplicate",
        error: partialWrite
          ? buildCsvImportFailureMessage(result.insertedRows, true)
          : CSV_HISTORY_DEDUPE_CONFLICT_COPY,
      };
    }
    return {
      insertedCount: result.insertedRows,
      duplicateCount: result.duplicateRows,
      contributedSensorRowCount,
      partialWrite,
      ...(unconfirmedWrite ? { unconfirmedWrite: true } : {}),
      error: buildCsvImportFailureMessage(result.insertedRows, partialWrite, unconfirmedWrite),
    };
  }

  return {
    insertedCount: result.insertedRows,
    duplicateCount: result.duplicateRows,
    contributedSensorRowCount,
    partialWrite: false,
    error: null,
  };
}
