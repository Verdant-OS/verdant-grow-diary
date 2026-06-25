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

/**
 * Detects a Postgres unique-violation (23505) on the deployed
 * tenant/tent-scoped sensor_readings dedupe index. Used both for the
 * operator failure copy and for the short race-window retry path.
 *
 * Conservative: requires both the explicit `23505` code AND a reference
 * to the index name somewhere in the error payload, so unrelated
 * unique-violations never get reclassified as safe duplicates.
 */
export function isSensorReadingsDedupeUniqueViolation(
  error: BatchInsertError | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code !== "23505") return false;
  const haystack = `${error.message ?? ""} ${error.details ?? ""}`;
  return /sensor_readings_dedupe_uidx/i.test(haystack);
}

export interface BatchInsertResult<TRow> {
  ok: boolean;
  totalRows: number;
  totalBatches: number;
  insertedRows: number;
  /**
   * Rows that the short race-window recovery proved were already present
   * in the DB (re-queried after a 23505) and reclassified as skipped
   * duplicates instead of a hard batch failure. Zero when no recovery
   * fired. Never includes rows whose duplicate status could not be
   * confirmed — those preserve the original failure path.
   */
  recoveredDuplicateRows: number;
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

/**
 * Result of the short race-window recovery callback. When the orchestrator
 * sees a 23505 unique-violation on the deployed dedupe index it calls
 * `onDedupeConflict` to re-confirm which rows of the failed batch are
 * provably already present in the DB.
 *
 * - `retryRows` is the subset of the failed batch the recoverer believes
 *   are still genuinely new and should be re-inserted ONCE.
 * - `confirmedDuplicateRows` is how many rows the recoverer proved are
 *   already present and can be safely reclassified as skipped duplicates.
 *
 * Returning `null` means the recoverer could not prove the conflict was a
 * benign duplicate (e.g. some rows have un-computable keys or the
 * re-query failed). In that case the orchestrator MUST preserve the
 * original failure path — we never silently swallow unknown DB errors.
 */
export interface DedupeConflictResolution<TRow> {
  confirmedDuplicateRows: number;
  retryRows: TRow[];
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
  /**
   * Optional short race-window recovery. Only consulted when a batch
   * fails with the deployed sensor_readings dedupe unique-violation
   * (code 23505 + `sensor_readings_dedupe_uidx`). Recovery is best-effort
   * and at most one retry per failed batch. Returning `null` keeps the
   * original failure semantics intact.
   */
  onDedupeConflict?: (
    failedBatch: TRow[],
    error: BatchInsertError,
    batchIndex: number,
  ) => Promise<DedupeConflictResolution<TRow> | null>;
}

export async function insertSensorReadingsInBatches<TRow>(
  args: InsertSensorReadingsInBatchesArgs<TRow>,
): Promise<BatchInsertResult<TRow>> {
  const batchSize = args.batchSize ?? CSV_HISTORY_INSERT_BATCH_SIZE;
  const batches = chunkRows(args.rows, batchSize);
  const totalBatches = batches.length;
  const totalRows = args.rows.length;
  let inserted = 0;
  let recoveredDuplicateRows = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    let result = await args.insertBatch(batch, i + 1);

    // Short race-window recovery for the deployed dedupe unique-violation.
    // Only fires when the caller supplied a recoverer AND the error
    // matches the audited (user_id, tent_id, source, metric, captured_at)
    // index. Unknown DB errors fall straight through to the failure path.
    if (
      result.error &&
      args.onDedupeConflict &&
      isSensorReadingsDedupeUniqueViolation(result.error)
    ) {
      let resolution: DedupeConflictResolution<TRow> | null = null;
      try {
        resolution = await args.onDedupeConflict(batch, result.error, i + 1);
      } catch {
        resolution = null;
      }
      if (resolution) {
        if (resolution.retryRows.length === 0) {
          // Whole batch reclassified as already-present duplicates.
          recoveredDuplicateRows += resolution.confirmedDuplicateRows;
          continue;
        }
        // Some rows confirmed duplicates, some still need writing.
        // One retry only — if it fails we surface the original semantics.
        const retryResult = await args.insertBatch(resolution.retryRows, i + 1);
        if (!retryResult.error) {
          inserted += resolution.retryRows.length;
          recoveredDuplicateRows += resolution.confirmedDuplicateRows;
          continue;
        }
        result = retryResult;
      }
    }

    if (result.error) {
      return {
        ok: false,
        totalRows,
        totalBatches,
        insertedRows: inserted,
        recoveredDuplicateRows,
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
    recoveredDuplicateRows,
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
//   - No upsert. No ON CONFLICT. No elevated-role keys. No bridge-issued tokens.

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
  captured_at: string | null | undefined;
}

/**
 * Canonical captured_at normalizer used on BOTH sides of CSV history
 * dedupe (locally-built rows and DB-returned rows). Rules:
 *   - Returns a UTC ISO-8601 string (YYYY-MM-DDTHH:mm:ss.sssZ) when
 *     parseable. Whitespace is trimmed first.
 *   - Returns null for null, undefined, empty, or unparseable input —
 *     never the literal string "Invalid Date" and never NaN.
 *   - Pure: ignores caller timezone/locale. `Date.parse` on an explicit
 *     ISO-with-offset or trailing `Z` is timezone-stable; we re-emit via
 *     `toISOString()` so two valid inputs that name the same instant
 *     always produce the same key (e.g. "...+00:00" vs "...Z").
 *   - Milliseconds are preserved when present (toISOString always emits
 *     `.sss`). Postgres `timestamptz` round-trips milliseconds, so DB
 *     rows and client rows normalize to the same precision.
 *   - Never throws.
 */
export function normalizeCapturedAtForDedupe(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed.length === 0) return null;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  const iso = d.toISOString();
  // Defense in depth: toISOString throws on invalid Date, but guard the
  // sentinel string anyway so a broken polyfill can never poison a key.
  if (iso === "Invalid Date") return null;
  return iso;
}

/**
 * Build the canonical dedupe key matching the deployed partial unique
 * index `sensor_readings_dedupe_uidx (user_id, tent_id, source, metric,
 * captured_at)`. user_id is supplied by RLS, not the client.
 *
 * Returns null when any required part is missing or when captured_at
 * cannot be normalized. Callers must treat a null key as "not a known
 * duplicate" so invalid rows are never silently merged.
 */
export function dedupeKeyOf(row: DedupeKeyParts): string | null {
  if (!row.tent_id || !row.source || !row.metric) return null;
  const captured = normalizeCapturedAtForDedupe(row.captured_at);
  if (captured === null) return null;
  return `${row.tent_id}|${row.source}|${row.metric}|${captured}`;
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
 * rows. Rows with missing/invalid captured_at are ignored when computing
 * the [min, max] range so a single bad row can never trigger an unbounded
 * preflight query. Returns null when the import has no usable scope
 * (empty input, no tent_id, no source, no metric, or zero valid
 * timestamps) so callers skip the read safely. Boundary timestamps (min
 * and max) are included exactly via gte/lte on the consumer side.
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
    const iso = normalizeCapturedAtForDedupe(r.captured_at);
    if (iso === null) continue;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) continue;
    if (min === null || t < min) min = t;
    if (max === null || t > max) max = t;
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

/**
 * Skip rows whose dedupe key matches an existing DB row OR an earlier
 * row in the same batch. Rows whose key cannot be computed (invalid
 * captured_at, missing tent/source/metric) are NEVER classified as
 * duplicates — they pass through so the upstream preflight or DB
 * validation surfaces the real problem. This is deliberate: silently
 * merging invalid rows would violate the "no fake live data" rule.
 */
export function filterDuplicateRows<TRow extends DedupeKeyParts>(args: {
  rows: readonly TRow[];
  existingKeys: ReadonlySet<string>;
}): FilterDuplicateRowsResult<TRow> {
  const seenInBatch = new Set<string>();
  const newRows: TRow[] = [];
  let duplicateCount = 0;
  for (const r of args.rows) {
    const key = dedupeKeyOf(r);
    if (key === null) {
      newRows.push(r);
      continue;
    }
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

export const CSV_HISTORY_NO_ROWS_SAFE_FALLBACK_COPY =
  "No CSV history readings were imported. No live sensor data was created." as const;

export function buildDuplicateAwareSuccessMessage(
  input: DuplicateAwareSuccessCopyInput,
): string {
  const { vendorLabel, inserted, duplicates, totalBatches } = input;
  // Safe fallback: orchestration should prevent this state via empty-row
  // preflight, but the helper must never emit "Imported 0 new ...".
  if (inserted <= 0 && duplicates <= 0) {
    return CSV_HISTORY_NO_ROWS_SAFE_FALLBACK_COPY;
  }
  if (inserted <= 0 && duplicates > 0) {
    return `No new CSV history readings were imported. ${duplicates} reading${duplicates === 1 ? "" : "s"} already exist for this tent. No live sensor data was created.`;
  }
  if (duplicates > 0) {
    return `Imported ${inserted} new ${vendorLabel} CSV history readings for this tent. Skipped ${duplicates} duplicate reading${duplicates === 1 ? "" : "s"} already present for this tent. No live sensor data was created.`;
  }
  const batchPhrase =
    totalBatches <= 1 ? "in 1 batch" : `across ${totalBatches} batches`;
  return `Imported ${inserted} new ${vendorLabel} CSV history readings for this tent ${batchPhrase}. No live sensor data was created.`;
}

/**
 * Compact secondary metadata line for operator transparency. Names the
 * dedupe-key shape so operators understand why a retry skipped rows,
 * without exposing raw Postgres internals as the headline.
 */
export const CSV_HISTORY_IMPORT_SCOPE_LINE =
  "Scope: selected tent \u00B7 source: csv \u00B7 duplicates checked by tent + source + metric + captured timestamp" as const;

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
    // Short race-window recovery: when a batch hits the dedupe
    // unique-violation, re-query the same scope and reclassify rows that
    // are now provably present as skipped duplicates. Rows still missing
    // from the re-query are returned for a single retry insert. Anything
    // we cannot prove falls back to the original failure semantics.
    onDedupeConflict: async (failedBatch) => {
      const failedScope = summarizeDedupeScope(failedBatch);
      if (!failedScope) return null;
      let refreshedKeys: Set<string>;
      try {
        refreshedKeys = await args.fetchExistingKeys(failedScope);
      } catch {
        return null;
      }
      let confirmedDuplicateRows = 0;
      const retryRows: TRow[] = [];
      for (const row of failedBatch) {
        const key = dedupeKeyOf(row);
        if (key === null) {
          // Cannot prove this row is a benign duplicate — refuse to
          // recover the batch. Caller preserves failure path.
          return null;
        }
        if (refreshedKeys.has(key)) {
          confirmedDuplicateRows += 1;
        } else {
          retryRows.push(row);
        }
      }
      return { confirmedDuplicateRows, retryRows };
    },
  });

  const recoveredDuplicates = batchResult.recoveredDuplicateRows ?? 0;
  const totalDuplicates = duplicateCount + recoveredDuplicates;

  if (!batchResult.ok) {
    return {
      ok: false,
      insertedRows: batchResult.insertedRows,
      duplicateRows: totalDuplicates,
      totalRows,
      totalBatches: batchResult.totalBatches,
      allDuplicates: false,
      batchResult,
      error: batchResult.error,
      diagnostic: batchResult.diagnostic,
    };
  }

  // If the only inserts were race-window recoveries that fully resolved
  // to duplicates, treat the run as a duplicate-only no-op.
  const allResolvedToDuplicates =
    batchResult.insertedRows === 0 && totalDuplicates > 0;

  return {
    ok: true,
    insertedRows: batchResult.insertedRows,
    duplicateRows: totalDuplicates,
    totalRows,
    totalBatches: batchResult.totalBatches,
    allDuplicates: allResolvedToDuplicates,
    batchResult,
    error: null,
    diagnostic: buildDuplicateAwareSuccessMessage({
      vendorLabel: args.vendorLabel,
      inserted: batchResult.insertedRows,
      duplicates: totalDuplicates,
      totalBatches: batchResult.totalBatches,
    }),
  };
}
