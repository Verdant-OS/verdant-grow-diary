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

/**
 * Operator-facing copy for the partial unique index
 * `sensor_readings_dedupe_uidx`, which is scoped to
 * `(user_id, tent_id, source, metric, captured_at)`. Because the index is
 * tenant-AND-tent scoped (audited 2026-06; see migration
 * 20260604021425), a 23505 hit can only originate from rows the current
 * authenticated user already saved for the selected tent — never from
 * another tenant's data.
 */
export const CSV_HISTORY_DEDUPE_CONFLICT_COPY =
  "Import stopped because matching CSV history readings already exist for this tent under Verdant\u2019s dedupe key: user + tent + source + metric + captured timestamp. No live sensor data was created." as const;

export function buildBatchFailureMessage(input: FailureDiagnosticInput): string {
  const {
    batchIndex,
    totalBatches,
    failedBatchSize,
    insertedRows,
    error,
    vendorLabel,
  } = input;

  // Friendly dedupe-conflict copy when Postgres reports a unique-violation
  // on the audited tenant/tent-scoped index. Never claims another tenant's
  // rows caused the collision.
  const isDedupeConflict =
    error.code === "23505" &&
    /sensor_readings_dedupe_uidx/i.test(
      `${error.message ?? ""} ${error.details ?? ""}`,
    );
  if (isDedupeConflict) {
    const parts: string[] = [
      `Import stopped on batch ${batchIndex} of ${totalBatches} (${failedBatchSize} ${vendorLabel} rows).`,
      CSV_HISTORY_DEDUPE_CONFLICT_COPY,
    ];
    if (insertedRows > 0) {
      parts.push(
        `${insertedRows} reading${insertedRows === 1 ? "" : "s"} from earlier batches may already have been written. Review imported history before retrying.`,
      );
    }
    return parts.join(" ");
  }

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

// ---------------------------------------------------------------------------
// Duplicate-aware CSV history retry
// ---------------------------------------------------------------------------
//
// Strategy: BEFORE inserting, read existing visible sensor_readings rows
// scoped to the selected tent_id, source label set, metric set, and the
// captured_at date range present in the import. Build a local dedupe key
// matching the deployed `sensor_readings_dedupe_uidx`
// (user_id, tent_id, source, metric, captured_at). Skip rows whose key
// already exists; insert only the genuinely new rows.
//
// Hard rules:
//   - The existing-rows query selects only safe presence fields
//     (tent_id, source, metric, captured_at). It NEVER selects
//     raw_payload, user_id, value, device_id, id, or any other column.
//   - Scope is always (tent_id, source-in, metric-in, captured_at between
//     [min, max]). RLS already restricts visible rows to the current
//     authenticated user; this client filter never crosses tents.
//   - No upsert. No ON CONFLICT. No service_role. No bridge tokens.

/**
 * Allow-list of columns the duplicate-aware preflight query is permitted to
 * SELECT. Used as a compile-time + test-time guard so we never accidentally
 * pull raw_payload, value, device_id, or any other sensitive column into
 * the dedupe code path.
 */
export const SENSOR_READINGS_DEDUPE_SELECT_COLUMNS = Object.freeze([
  "tent_id",
  "source",
  "metric",
  "captured_at",
] as const);

export const SENSOR_READINGS_DEDUPE_SELECT_CLAUSE =
  SENSOR_READINGS_DEDUPE_SELECT_COLUMNS.join(",");

export interface DedupeKeyParts {
  tent_id: string | null;
  source: string;
  metric: string;
  captured_at: string;
}

/**
 * Normalize captured_at to a canonical ISO instant so client-built rows
 * and Postgres-returned timestamps produce the same key. Falls back to
 * the raw string if parsing fails (the row will then only match an exact
 * string equal — safer than silently merging rows).
 */
function normalizeCapturedAt(raw: string): string {
  if (!raw) return raw;
  const t = Date.parse(raw);
  if (Number.isFinite(t)) return new Date(t).toISOString();
  return raw;
}

export function dedupeKeyOf(row: DedupeKeyParts): string {
  return [
    row.tent_id ?? "",
    row.source ?? "",
    row.metric ?? "",
    normalizeCapturedAt(row.captured_at ?? ""),
  ].join("|");
}

export interface ExistingKeysQueryScope {
  tentIds: string[];
  sources: string[];
  metrics: string[];
  minCapturedAt: string;
  maxCapturedAt: string;
}

/**
 * Pure summarization of the scope needed to fetch potentially-conflicting
 * rows. Returns null when the import has no usable scope (no tent_id, no
 * captured_at, etc.) so callers can skip the preflight read safely.
 */
export function summarizeDedupeScope(
  rows: ReadonlyArray<DedupeKeyParts>,
): ExistingKeysQueryScope | null {
  if (rows.length === 0) return null;
  const tentIds = new Set<string>();
  const sources = new Set<string>();
  const metrics = new Set<string>();
  let min: number | null = null;
  let max: number | null = null;
  for (const r of rows) {
    if (r.tent_id) tentIds.add(r.tent_id);
    if (r.source) sources.add(r.source);
    if (r.metric) metrics.add(r.metric);
    const t = Date.parse(r.captured_at ?? "");
    if (Number.isFinite(t)) {
      if (min === null || t < min) min = t;
      if (max === null || t > max) max = t;
    }
  }
  if (
    tentIds.size === 0 ||
    sources.size === 0 ||
    metrics.size === 0 ||
    min === null ||
    max === null
  ) {
    return null;
  }
  return {
    tentIds: Array.from(tentIds).sort(),
    sources: Array.from(sources).sort(),
    metrics: Array.from(metrics).sort(),
    minCapturedAt: new Date(min).toISOString(),
    maxCapturedAt: new Date(max).toISOString(),
  };
}

export interface FilterDuplicateRowsResult<TRow> {
  newRows: TRow[];
  duplicateCount: number;
}

export function filterDuplicateRows<TRow extends DedupeKeyParts>(args: {
  rows: readonly TRow[];
  existingKeys: ReadonlySet<string>;
}): FilterDuplicateRowsResult<TRow> {
  const seenInBatch = new Set<string>();
  const newRows: TRow[] = [];
  let duplicateCount = 0;
  for (const r of args.rows) {
    const key = dedupeKeyOf(r);
    if (args.existingKeys.has(key) || seenInBatch.has(key)) {
      duplicateCount += 1;
      continue;
    }
    seenInBatch.add(key);
    newRows.push(r);
  }
  return { newRows, duplicateCount };
}

export interface DuplicateAwareSuccessCopyInput {
  vendorLabel: string;
  inserted: number;
  duplicates: number;
  totalBatches: number;
}

export function buildDuplicateAwareSuccessMessage(
  input: DuplicateAwareSuccessCopyInput,
): string {
  const { vendorLabel, inserted, duplicates, totalBatches } = input;
  if (inserted === 0 && duplicates > 0) {
    return `No new CSV history readings were imported. ${duplicates} reading${duplicates === 1 ? "" : "s"} already exist for this tent. No live sensor data was created.`;
  }
  if (duplicates > 0) {
    return `Imported ${inserted} new ${vendorLabel} CSV history readings. Skipped ${duplicates} duplicate reading${duplicates === 1 ? "" : "s"} already present for this tent. No live sensor data was created.`;
  }
  if (totalBatches <= 1) {
    return `Imported ${inserted} ${vendorLabel} CSV history readings. No live sensor data was created.`;
  }
  return `Imported ${inserted} ${vendorLabel} CSV history readings across ${totalBatches} batches. No live sensor data was created.`;
}

export interface DuplicateAwareImportArgs<TRow extends DedupeKeyParts> {
  rows: readonly TRow[];
  vendorLabel: string;
  batchSize?: number;
  /**
   * Caller-owned query for existing rows. MUST select only the columns
   * in SENSOR_READINGS_DEDUPE_SELECT_COLUMNS and MUST scope by the
   * provided tentIds/sources/metrics/captured_at range. The caller is
   * responsible for tenant isolation via RLS — this helper never sees
   * user_id.
   */
  fetchExistingKeys: (scope: ExistingKeysQueryScope) => Promise<Set<string>>;
  insertBatch: (
    batch: TRow[],
    batchIndex: number,
  ) => Promise<{ error: BatchInsertError | null }>;
}

export interface DuplicateAwareImportResult<TRow> {
  ok: boolean;
  insertedRows: number;
  duplicateRows: number;
  totalRows: number;
  totalBatches: number;
  /** True when every row was already present for this tent. No insert ran. */
  allDuplicates: boolean;
  /** Null when no insert ran (all duplicates or empty input). */
  batchResult: BatchInsertResult<TRow> | null;
  error: BatchInsertError | null;
  diagnostic: string;
}

/**
 * Orchestrates: scope → fetch existing keys → filter duplicates →
 * batch insert only new rows → build the duplicate-aware operator copy.
 * No Supabase types are imported here; callers provide the two thin
 * adapters so tests stay pure.
 */
export async function runDuplicateAwareCsvHistoryImport<
  TRow extends DedupeKeyParts,
>(
  args: DuplicateAwareImportArgs<TRow>,
): Promise<DuplicateAwareImportResult<TRow>> {
  const totalRows = args.rows.length;
  const scope = summarizeDedupeScope(args.rows);
  const existingKeys = scope
    ? await args.fetchExistingKeys(scope)
    : new Set<string>();
  const { newRows, duplicateCount } = filterDuplicateRows({
    rows: args.rows,
    existingKeys,
  });

  if (newRows.length === 0) {
    return {
      ok: true,
      insertedRows: 0,
      duplicateRows: duplicateCount,
      totalRows,
      totalBatches: 0,
      allDuplicates: duplicateCount > 0,
      batchResult: null,
      error: null,
      diagnostic: buildDuplicateAwareSuccessMessage({
        vendorLabel: args.vendorLabel,
        inserted: 0,
        duplicates: duplicateCount,
        totalBatches: 0,
      }),
    };
  }

  const batchResult = await insertSensorReadingsInBatches({
    rows: newRows,
    vendorLabel: args.vendorLabel,
    batchSize: args.batchSize,
    insertBatch: args.insertBatch,
  });

  if (!batchResult.ok) {
    return {
      ok: false,
      insertedRows: batchResult.insertedRows,
      duplicateRows: duplicateCount,
      totalRows,
      totalBatches: batchResult.totalBatches,
      allDuplicates: false,
      batchResult,
      error: batchResult.error,
      diagnostic: batchResult.diagnostic,
    };
  }

  return {
    ok: true,
    insertedRows: batchResult.insertedRows,
    duplicateRows: duplicateCount,
    totalRows,
    totalBatches: batchResult.totalBatches,
    allDuplicates: false,
    batchResult,
    error: null,
    diagnostic: buildDuplicateAwareSuccessMessage({
      vendorLabel: args.vendorLabel,
      inserted: batchResult.insertedRows,
      duplicates: duplicateCount,
      totalBatches: batchResult.totalBatches,
    }),
  };
}
