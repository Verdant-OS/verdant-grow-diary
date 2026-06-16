/**
 * sensorReadingsBatchInsert — pure helpers for splitting large CSV
 * history imports into safe Supabase insert batches with operator-grade
 * failure diagnostics.
 *
 * Hard rules:
 *  - No React. No fetch logic of its own — accepts an `insertBatch`
 *    callback so callers retain full Supabase ownership.
 *  - Never promotes imported rows to live: callers must already build
 *    rows with `source = "csv"` and vendor lineage in raw_payload.
 *  - Never writes to approval-queue, alert, AI, or device tables.
 *  - Deterministic: same inputs → same chunking + same diagnostic text.
 */

export const CSV_HISTORY_INSERT_BATCH_SIZE = 500;

/**
 * Allow-list mirrors public.sensor_readings.Insert in
 * src/integrations/supabase/types.ts. Update both together if the schema
 * ever adds a column. Provenance like grow_id / plant_id / source_app must
 * live inside raw_payload — never as a top-level key.
 */
export const SENSOR_READINGS_INSERT_ALLOWED_KEYS = Object.freeze([
  "captured_at",
  "created_at",
  "device_id",
  "id",
  "metric",
  "quality",
  "raw_payload",
  "source",
  "tent_id",
  "ts",
  "user_id",
  "value",
] as const);

const ALLOWED_KEYS_SET: ReadonlySet<string> = new Set(
  SENSOR_READINGS_INSERT_ALLOWED_KEYS,
);

export interface ValidateInsertRowsResult {
  ok: boolean;
  unknownKeys: string[];
  rowIndexes: number[];
  message: string | null;
}

/**
 * Pure preflight validator for CSV history insert payloads. Catches
 * unknown top-level keys (e.g. grow_id, plant_id, source_app) BEFORE any
 * Supabase write fires, so PGRST204 surfaces as a clear operator message
 * with zero rows written. Nested provenance inside raw_payload is allowed.
 */
export function validateSensorReadingInsertRows(
  rows: ReadonlyArray<Record<string, unknown>>,
): ValidateInsertRowsResult {
  if (rows.length === 0) {
    return { ok: true, unknownKeys: [], rowIndexes: [], message: null };
  }
  const unknown = new Set<string>();
  const affected: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || typeof row !== "object") continue;
    let rowHasUnknown = false;
    for (const key of Object.keys(row)) {
      if (!ALLOWED_KEYS_SET.has(key)) {
        unknown.add(key);
        rowHasUnknown = true;
      }
    }
    if (rowHasUnknown) affected.push(i);
  }
  if (unknown.size === 0) {
    return { ok: true, unknownKeys: [], rowIndexes: [], message: null };
  }
  const sortedKeys = Array.from(unknown).sort();
  const sampleIndexes = affected.slice(0, 3);
  const overflow = affected.length - sampleIndexes.length;
  const indexHint =
    affected.length > 0
      ? ` Affected rows: ${sampleIndexes.join(", ")}${overflow > 0 ? ` (+${overflow} more)` : ""}.`
      : "";
  const message =
    `Import blocked before writing rows. Unsupported sensor_readings field(s): ${sortedKeys.join(", ")}.${indexHint} No rows were written. No live sensor data was created.`;
  return {
    ok: false,
    unknownKeys: sortedKeys,
    rowIndexes: affected,
    message,
  };
}

export const CSV_HISTORY_EMPTY_ROWS_COPY =
  "Import blocked before writing rows. No importable sensor readings were found. Check the CSV mapping, units, and timestamp columns. No rows were written. No live sensor data was created.";

export interface PreflightCsvHistoryImportResult {
  ok: boolean;
  reason: "empty" | "unsupported_fields" | null;
  message: string | null;
  unknownKeys: string[];
  rowIndexes: number[];
}

/**
 * Composite preflight that callers use to abort BEFORE invoking
 * `insertSensorReadingsInBatches`. Guarantees that:
 *   - empty / parsed-to-zero CSVs never touch Supabase
 *   - any row with an unsupported top-level sensor_readings key
 *     aborts the entire import (no partial writes)
 *   - operator copy ends with "No rows were written. No live sensor
 *     data was created." for every block reason
 */
export function preflightCsvHistoryImport(
  rows: ReadonlyArray<Record<string, unknown>>,
): PreflightCsvHistoryImportResult {
  if (rows.length === 0) {
    return {
      ok: false,
      reason: "empty",
      message: CSV_HISTORY_EMPTY_ROWS_COPY,
      unknownKeys: [],
      rowIndexes: [],
    };
  }
  const v = validateSensorReadingInsertRows(rows);
  if (!v.ok) {
    return {
      ok: false,
      reason: "unsupported_fields",
      message: v.message,
      unknownKeys: v.unknownKeys,
      rowIndexes: v.rowIndexes,
    };
  }
  return { ok: true, reason: null, message: null, unknownKeys: [], rowIndexes: [] };
}

export interface BatchInsertError {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
}

export interface BatchInsertResult<TRow> {
  ok: boolean;
  totalRows: number;
  totalBatches: number;
  insertedRows: number;
  /** 1-based index of the first batch that failed, when ok = false. */
  failedBatchIndex: number | null;
  failedBatchSize: number;
  /** True when at least one earlier batch succeeded before the failure. */
  partialWrite: boolean;
  error: BatchInsertError | null;
  /** Echoed for tests/diagnostics; never includes payload contents. */
  batchSize: number;
  /** Pure diagnostic copy ready for toast/inline display. */
  diagnostic: string;
  __rowsRef?: TRow[];
}

export function chunkRows<T>(rows: readonly T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += n) {
    out.push(rows.slice(i, i + n) as T[]);
  }
  return out;
}

export interface SuccessDiagnosticInput {
  totalRows: number;
  totalBatches: number;
  vendorLabel: string;
}

export function buildBatchSuccessMessage(input: SuccessDiagnosticInput): string {
  const { totalRows, totalBatches, vendorLabel } = input;
  if (totalBatches <= 1) {
    return `Imported ${totalRows} ${vendorLabel} CSV history readings.`;
  }
  return `Imported ${totalRows} ${vendorLabel} CSV history readings across ${totalBatches} batches.`;
}

export interface FailureDiagnosticInput {
  batchIndex: number;
  totalBatches: number;
  failedBatchSize: number;
  insertedRows: number;
  error: BatchInsertError;
  vendorLabel: string;
}

export function buildBatchFailureMessage(input: FailureDiagnosticInput): string {
  const {
    batchIndex,
    totalBatches,
    failedBatchSize,
    insertedRows,
    error,
    vendorLabel,
  } = input;
  const parts: string[] = [];
  parts.push(
    `Import failed on batch ${batchIndex} of ${totalBatches} (${failedBatchSize} ${vendorLabel} rows in this batch).`,
  );
  const codeSuffix = error.code ? ` [code: ${error.code}]` : "";
  parts.push(`Database returned: ${error.message}${codeSuffix}.`);
  if (error.hint) parts.push(`Hint: ${error.hint}.`);
  parts.push("No live sensor data was created.");
  if (insertedRows > 0) {
    parts.push(
      `${insertedRows} reading${insertedRows === 1 ? "" : "s"} from earlier batches may already have been written. Review imported history before retrying.`,
    );
  }
  return parts.join(" ");
}

export interface InsertSensorReadingsInBatchesArgs<TRow> {
  rows: readonly TRow[];
  vendorLabel: string;
  batchSize?: number;
  /**
   * Caller-owned insert. Receives a batch slice and the 1-based batch
   * index. Must resolve to `{ error }` shaped like the Supabase
   * PostgrestError contract (or `{ error: null }` on success).
   */
  insertBatch: (
    batch: TRow[],
    batchIndex: number,
  ) => Promise<{ error: BatchInsertError | null }>;
}

export async function insertSensorReadingsInBatches<TRow>(
  args: InsertSensorReadingsInBatchesArgs<TRow>,
): Promise<BatchInsertResult<TRow>> {
  const batchSize = args.batchSize ?? CSV_HISTORY_INSERT_BATCH_SIZE;
  const batches = chunkRows(args.rows, batchSize);
  const totalBatches = batches.length;
  const totalRows = args.rows.length;
  let inserted = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const result = await args.insertBatch(batch, i + 1);
    if (result.error) {
      return {
        ok: false,
        totalRows,
        totalBatches,
        insertedRows: inserted,
        failedBatchIndex: i + 1,
        failedBatchSize: batch.length,
        partialWrite: inserted > 0,
        error: result.error,
        batchSize,
        diagnostic: buildBatchFailureMessage({
          batchIndex: i + 1,
          totalBatches,
          failedBatchSize: batch.length,
          insertedRows: inserted,
          error: result.error,
          vendorLabel: args.vendorLabel,
        }),
      };
    }
    inserted += batch.length;
  }

  return {
    ok: true,
    totalRows,
    totalBatches,
    insertedRows: inserted,
    failedBatchIndex: null,
    failedBatchSize: 0,
    partialWrite: false,
    error: null,
    batchSize,
    diagnostic: buildBatchSuccessMessage({
      totalRows,
      totalBatches,
      vendorLabel: args.vendorLabel,
    }),
  };
}
