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
 *  - Never writes to action_queue, alerts, AI tables, or device tables.
 *  - Deterministic: same inputs → same chunking + same diagnostic text.
 */

export const CSV_HISTORY_INSERT_BATCH_SIZE = 500;

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
